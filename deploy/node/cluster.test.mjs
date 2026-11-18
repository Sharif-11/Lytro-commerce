// deploy/node/cluster.cjs (Phase 9 Slice 9.10): one app as WORKERS processes on one port, or in-process with one, and a
// stop signal passed on to each. Run from the repo root: node --test deploy/node/
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { get } from 'node:http';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const launcher = join(here, 'cluster.cjs');
const app = join(here, 'test-app.cjs');

/** A port nothing listens on. */
function freePort() {
  return new Promise((resolve) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** One request on a connection of its own (each new connection goes to the next process), and its answer. */
function request(port) {
  return new Promise((resolve, reject) => {
    get({ host: '127.0.0.1', port, path: '/', agent: false }, (answer) => {
      let body = '';
      answer.setEncoding('utf8');
      answer.on('data', (chunk) => (body += chunk));
      answer.on('end', () => resolve({ status: answer.statusCode, body }));
    }).on('error', reject);
  });
}

/** The launcher running the stand-in app, and the process IDs answering on its port. */
async function launch(workers, extra = {}) {
  const port = await freePort();
  const child = spawn(process.execPath, [launcher, app], {
    env: { ...process.env, WORKERS: String(workers), PORT: String(port), ...extra },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const ask = async () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        return Number((await request(port)).body);
      } catch {
        await sleep(100);
      }
    }
    throw new Error('nothing answered');
  };
  return { child, port, ask };
}

const exited = (child) =>
  new Promise((resolve) => {
    if (child.exitCode !== null) resolve(child.exitCode);
    else child.once('exit', (code) => resolve(code));
  });

test('with one worker, the app runs in the launcher itself, as before', async () => {
  const { child, ask } = await launch(1);
  try {
    assert.equal(await ask(), child.pid);
  } finally {
    child.kill();
    await exited(child);
  }
});

test('with three, three processes other than the launcher share the port', async () => {
  const { child, ask } = await launch(3);
  try {
    const seen = new Set();
    // The processes start one by one; each takes its turn once it listens.
    for (let index = 0; index < 100 && seen.size < 3; index += 1) {
      seen.add(await ask());
      await sleep(50);
    }
    assert.equal(seen.size, 3);
    assert.ok(!seen.has(child.pid));
  } finally {
    child.kill();
    await exited(child);
  }
});

test('refuses a worker count it cannot run', async () => {
  for (const workers of ['0', '33', 'two']) {
    const child = spawn(process.execPath, [launcher, app], {
      env: { ...process.env, WORKERS: workers, PORT: '0' },
      stdio: 'ignore',
    });
    assert.equal(await exited(child), 2);
  }
});

test(
  'a stop signal reaches every process, each finishes what it holds, and the launcher ends cleanly',
  { skip: process.platform === 'win32' ? 'no stop signals on Windows; CI runs it' : false },
  async () => {
    const { child, port, ask } = await launch(2, { ANSWER_AFTER_MS: '500' });
    await ask();
    const held = request(port).then((answer) => answer.status);
    await sleep(100);
    child.kill('SIGTERM');
    assert.equal(await held, 200);
    assert.equal(await exited(child), 0);
  },
);
