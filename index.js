import Prerenderer from "puppeteer-prerender";
import {Cache} from "file-system-cache";
import express from "express";

const app = express();

const cache = new Cache({
    basePath: "./.cache", // (optional) Path where cache files are stored (default).
    ns: "sites",   // (optional) A grouping namespace for items.
    hash: "sha1",          // (optional) A hashing algorithm used within the cache key.
    ttl: process.env.CACHE_TTL || 3600               // (optional) A time-to-live (in secs) on how long an item remains cached.
});

require('dotenv').config()

const HTTP_PORT = process.env.HTTP_PORT || 3000;

const log = function () {
    console.log.apply(console.log, [new Date().toISOString()].concat(Array.prototype.slice.call(arguments, 0)));
};

async function fetchPage(url) {
    const prerender = new Prerenderer()

    const data = cache.getSync(url);
    if (data)
        return {status: data.status, html: data.html};

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

    app.listen(HTTP_PORT, () => {
        console.log(`Example app listening on port ${HTTP_PORT}`)
    })
})();
