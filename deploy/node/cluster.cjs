'use strict';
// Runs one Node app as WORKERS processes sharing its port (node:cluster), so one container uses that many cores (Phase 9
// Slice 9.10: one Node process uses about one core, so on staging's recheck one storefront would have capped an 8-core
// server at about 1.3x the peak, however many cores it had). The server image runs the API through it, the storefront
// image the storefront:
//
//   WORKERS=3 node cluster.cjs apps/storefront/server.js
//
// WORKERS is 1 unless set, and then the app runs in this process exactly as it did before. With more, this process only
// starts them, hands each its share of the connections, starts another in place of one that ends (stopping the container
// if they keep ending: more than 5 in a minute), and passes the stop signal Docker sends on to each, so each finishes the
// requests it holds before the container stops.
const cluster = require('node:cluster');
const console = require('node:console');
const path = require('node:path');
const process = require('node:process');
const { setTimeout } = require('node:timers');

const MOST_WORKERS = 32;
const RESTART_AFTER_MS = 1_000;
const MOST_ENDINGS = 5;
const ENDINGS_WINDOW_MS = 60_000;

const entry = process.argv[2];
const workers = Number(process.env.WORKERS ?? '1');

if (!entry) {
  console.error('usage: node cluster.cjs <the app to run>');
  process.exit(2);
}
if (!Number.isInteger(workers) || workers < 1 || workers > MOST_WORKERS) {
  console.error(`WORKERS must be a whole number from 1 to ${String(MOST_WORKERS)}`);
  process.exit(2);
}

const app = path.resolve(entry);

if (workers === 1 || !cluster.isPrimary) {
  require(app);
} else {
  // Each new connection to the next process in turn (Linux's default, set so every platform does the same).
  cluster.schedulingPolicy = cluster.SCHED_RR;
  let stopping = false;
  let live = 0;
  const endings = [];
  const start = () => {
    live += 1;
    cluster.fork();
  };
  cluster.on('exit', (worker, code, signal) => {
    live -= 1;
    if (stopping) {
      if (live === 0) process.exit(0);
      return;
    }
    const now = Date.now();
    endings.push(now);
    while (endings.length > 0 && endings[0] < now - ENDINGS_WINDOW_MS) endings.shift();
    console.error(
      `[cluster] process ${String(worker.process.pid)} ended (${String(signal ?? code)}); starting another`,
    );
    if (endings.length > MOST_ENDINGS) {
      console.error('[cluster] its processes keep ending; stopping, so the container restarts');
      process.exit(1);
    }
    setTimeout(start, RESTART_AFTER_MS);
  });
  for (const name of ['SIGTERM', 'SIGINT']) {
    process.on(name, () => {
      if (stopping) return;
      stopping = true;
      for (const worker of Object.values(cluster.workers ?? {})) worker?.process.kill(name);
      if (live === 0) process.exit(0);
    });
  }
  console.log(`[cluster] ${entry} as ${String(workers)} processes`);
  for (let index = 0; index < workers; index += 1) start();
}
