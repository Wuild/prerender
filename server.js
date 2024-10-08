import puppeteer from "puppeteer";
import redis from 'redis';
import express from "express";
import winston from 'winston';
import dotenv from 'dotenv';
import {promisify} from 'util';

dotenv.config();

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({timestamp, level, message}) => `${timestamp} [${level.toUpperCase()}] ${message}`)
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({filename: 'prerender-service.log'})
    ]
});


const app = express();

let redisAvailable = false;

// Set up Redis client
const redisClient = redis.createClient({
    url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
});

redisClient.on('error', (err) => {
    if (err.code === 'ECONNREFUSED') {
        logger.error(`Redis connection failed: ${err.message}. Falling back to Memcached.`);
        redisAvailable = false;
    } else {
        logger.error(`Redis error: ${err.message}`);
    }
});

redisClient.on('connect', () => {
    logger.info('Connected to Redis.');
    redisAvailable = true;
});

app.get('/', (req, res) => {
    res.send('Prerender Service');
});

app.get('/*', async (req, res) => {
    let targetUrl = req.params[0];

    if (!targetUrl) {
        console.error('URL is missing.');
        return res.status(400).send('URL is required');
    }

    // Ensure the URL is valid and has a protocol
    try {
        // Parse the target URL
        const urlObj = new URL(targetUrl);
        // Remove the _escaped_fragment_ parameter
        urlObj.searchParams.delete('_escaped_fragment_');
        // Update the target URL
        targetUrl = urlObj.toString();
    } catch (err) {
        logger.error('Invalid URL provided.');
        return res.status(400).send('Invalid URL');
    }


    logger.info(`Prerendering URL: ${targetUrl}`);

    const cacheKey = `prerender:${targetUrl}`;

    const getCachedContent = async (key) => {
        return await redisClient.get(key)
    };

    const setCachedContent = (key, value) => {
        redisClient.set(key, value, 'EX', process.env.CACHE_TTL, (err) => {
            if (err) {
                logger.error('Redis set error:', err);
            }
        });
    };

    const cachedContent = await getCachedContent(cacheKey);

    if (cachedContent) {
        logger.info(`Serving cached content for URL: ${targetUrl}`);
        return res.send(cachedContent);
    }

    try {
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();

        // Enable request interception
        await page.setRequestInterception(true);

        page.on('request', request => {
            if (['image', 'stylesheet', 'font'].includes(request.resourceType())) {
                request.abort();
            } else {
                request.continue();
            }
        });

        page.on('response', async response => {
            if ([301, 302, 303, 307, 308].includes(response.status())) {
                const redirectionUrl = response.headers().location;
                if (redirectionUrl) {
                    logger.info(`Redirection detected: ${targetUrl} -> ${redirectionUrl}`);
                    targetUrl = redirectionUrl;  // Update target URL to the redirection URL
                    await page.goto(targetUrl, { waitUntil: 'networkidle0' });
                }
            }
        });

        await page.goto(targetUrl, { waitUntil: 'networkidle0' });

        const content = await page.content();
        await browser.close();

        // Cache the rendered content
        setCachedContent(cacheKey, content);

        logger.info(`Successfully prerendered URL: ${targetUrl}`);
        res.send(content);
    } catch (error) {
        logger.error(`Error rendering the page: ${error.message}`);
        if (error.message.includes('net::ERR_NAME_NOT_RESOLVED')) {
            res.status(400).send('Invalid URL');
        } else {
            res.status(500).send('Error rendering the page');
        }
    }
});

redisClient.connect().then(() => {
    app.listen(3000, () => {
        console.log("Listening on 3000...");
    });
})

