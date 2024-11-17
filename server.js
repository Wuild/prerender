#!/usr/bin/env node
const dotenv = require('dotenv').config();
const prerender = require('./lib');
const util = require('./lib/util');

chromeFlags = process.env.CHROME_FLAGS && process.env.CHROME_FLAGS.split(',');

chromeFlags = chromeFlags || [
  '--no-sandbox',
  '--headless',
  '--disable-gpu',
  '--remote-debugging-port=9222',
  '--hide-scrollbars',
];

const server = prerender({
  port: process.env.PORT || 3000,
  host: process.env.HOST || '0.0.0.0',
  pageDoneCheckInterval: process.env.PAGE_DONE_CHECK_INTERVAL || 100,
  pageLoadTimeout: process.env.PAGE_LOAD_TIMEOUT || 10000,
  logRequests: process.env.LOG_REQUESTS || false,
  headless: process.env.HEADLESS || true,
  chromeFlags: chromeFlags,
  chromeLocation: process.env.CHROME_LOCATION,
  followRedirects: false,
});

server.use(prerender.sendPrerenderHeader());
server.use(prerender.browserForceRestart());
server.use(prerender.blockResources());
server.use(prerender.addMetaTags());
server.use(prerender.removeScriptTags());
server.use(prerender.httpHeaders());

if (process.env.CACHE_STORAGE === 'memory') {
  util.log('Using memory cache');
  server.use(require('prerender-memory-cache'));
} else if (process.env.CACHE_STORAGE === 'redis') {
  util.log('Using redis cache');
  server.use(require('prerender-redis-cache'));
} else if (process.env.CACHE_STORAGE === 'file') {
  server.use(require('./plugins/prerender-file-cache'));
}

server.start();
