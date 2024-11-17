// import Cache from 'file-system-cache';

const fs = require('node:fs');
const path = require('node:path');
const cacheDirectory = path.join(__dirname, '..', 'cache');
const util = require('../lib/util');

if (!fs.existsSync(cacheDirectory)) {
  fs.mkdirSync(cacheDirectory);
}

function getCacheFilePath(url) {
  const sanitizedUrl = url.replace(/[^a-zA-Z0-9]/g, '_');
  return path.join(cacheDirectory, `${sanitizedUrl}.json`);
}

function isCacheValid(cache) {
  const now = Math.floor(Date.now() / 1000);
  const cacheTime = cache.timestamp;
  return now - cacheTime < process.env.CACHE_TTL;
}

module.exports = {
  requestReceived: function (req, res, next) {
    const cacheFilePath = getCacheFilePath(req.prerender.url);

    if (fs.existsSync(cacheFilePath)) {
      const cacheData = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
      if (isCacheValid(cacheData)) {
        util.log(`Serving from cache: ${req.prerender.url}`);
        req.prerender.cacheHit = true;
        res.send(200, cacheData.content);
        return;
      }
    }
    next();
  },

  beforeSend: function (req, res, next) {
    if (!req.prerender.cacheHit && req.prerender.statusCode == 200) {
      const cacheFilePath = getCacheFilePath(req.prerender.url);

      const cacheData = {
        timestamp: Math.floor(Date.now() / 1000),
        content: req.prerender.content,
      };
      fs.writeFileSync(cacheFilePath, JSON.stringify(cacheData), 'utf8');
      util.log(`Saved cache for: ${req.prerender.url}`);
    }
    next();
  },
};
