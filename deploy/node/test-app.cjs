'use strict';
// A stand-in app for cluster.test.mjs: answers each request with its own process ID, and on a stop signal finishes the
// request it holds before it ends, as the API and the storefront do.
const http = require('node:http');
const process = require('node:process');
const { setTimeout } = require('node:timers');

const server = http.createServer((_request, response) => {
  setTimeout(
    () => {
      response.end(String(process.pid));
    },
    Number(process.env.ANSWER_AFTER_MS ?? '0'),
  );
});
server.listen(Number(process.env.PORT), '127.0.0.1');
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
