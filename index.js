import Prerenderer from "puppeteer-prerender";
import {Cache} from "file-system-cache";
import express from "express";
import https from "https";
import http from "http";
import fs from "node:fs";
import configDotenv from "dotenv";

const app = express();

const cache = new Cache({
    basePath: "./.cache", // (optional) Path where cache files are stored (default).
    ns: "sites",   // (optional) A grouping namespace for items.
    hash: "sha1",          // (optional) A hashing algorithm used within the cache key.
    ttl: process.env.CACHE_TTL || 3600               // (optional) A time-to-live (in secs) on how long an item remains cached.
});

configDotenv.config()

/**
 * The HTTP_PORT variable represents the port number for the HTTP server.
 * It is used to determine the port the server will listen on.
 *
 * If the environment variable HTTP_PORT is defined, the value will be used;
 * otherwise, the default value of 3000 will be used.
 *
 * @type {number}
 * @example
 * // Usage:
 * const port = HTTP_PORT;
 * console.log(port); // Output: 3000 (if HTTP_PORT is undefined in the environment)
 * console.log(port); // Output: 8080 (if HTTP_PORT is defined in the environment as 8080)
 */
const HTTP_PORT = process.env.HTTP_PORT || 3000;

/**
 * Represents the SSL certificate value.
 *
 * @type {string}
 */
const SSL_CERT = process.env.SSL_CERT;

/**
 * @description Represents the SSL key used for secure connections.
 * @type {string}
 */
const SSL_KEY = process.env.SSL_KEY;

/**
 * Logs messages with timestamps to the console.
 * @function
 * @param {...any} arguments - The messages to be logged.
 */
const log = function () {
    console.log.apply(console.log, [new Date().toISOString()].concat(Array.prototype.slice.call(arguments, 0)));
};

/**
 * Fetches the content of a web page from a given URL using Prerenderer and caches the result.
 *
 * @param {string} url - The URL of the web page to fetch.
 * @returns {Promise<{html: string, status: number}|{html: string, status}|boolean>} - A promise that resolves to an object containing the fetched HTML and status code, or a boolean
 * value indicating whether the fetching was successful or not.
 */
async function fetchPage(url) {
    const prerender = new Prerenderer({
        debug: process.env.DEBUG,
        timeout: 10000,
        puppeteerLaunchOptions: {
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    })

    const data = cache.getSync(url);
    if (data) return {status: data.status, html: data.html};

    try {
        const {status, redirect, meta, openGraph, links, html, staticHTML} = await prerender.render(url)

        await prerender.close();

        cache.set(url, {status: status, html: staticHTML})

        return {status: status, html: staticHTML};
    } catch (e) {
        await prerender.close();
        console.error(e)
        return false;
    }
}

(async () => {
    app.get(/\/(.*)$/, async (req, res) => {
        let startDate = new Date();
        let url = req.params[0];
        url = new URL(url)
        url.hash = ''
        url.search = ''
        url = url.toString();

        if (!url)
            return res.send();

        log('request', url, req.headers['user-agent']);

        let page = await fetchPage(url)
        if (page) {
            res.status(page.status)
            // res.headers = page.headers;
            res.send(page.html)

            let ms = new Date().getTime() - startDate.getTime();
            log('got', page.status, 'in', ms + 'ms', 'for', url);

        } else {
            res.status(404);
            res.send();
        }
    })

    if (SSL_KEY) {
        const privateKey = fs.readFileSync(SSL_KEY);
        const certificate = fs.readFileSync(SSL_CERT);

        https.createServer({
            key: privateKey, cert: certificate
        }, app).listen(HTTP_PORT, () => {
            console.log(`HTTPS app listening on port ${HTTP_PORT}`)
        });
    } else {
        http.createServer(app).listen(HTTP_PORT, () => {
            console.log(`HTTP app listening on port ${HTTP_PORT}`)
        });
    }
})();
