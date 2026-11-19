// D9-34 (Phase 9 Slice 9.10): the load test's guards on the server's side -- armed.sh (is every outside service the
// stand-in?), stand-down.sh (the stand-in first, then the per-visitor setting back) and disarm.sh (not while a run is
// still going) -- run against a fake `docker` and `curl` that answer as the test says and write down what was asked.
// Staging's live run (2026-11-19) went on placing orders for ten minutes after its disarm; 49 order SMS went to the real
// BulkSMSBD, refused only because its balance had run out.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import process from 'node:process';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const loadDir = join(here, '..');
// Git for Windows' own bash, before any other on PATH there (WSL's would run the scripts in another file system).
const GIT_BASH = 'C:/Program Files/Git/usr/bin/bash.exe';

function bashOf() {
  const candidates = process.platform === 'win32' ? [GIT_BASH, 'bash'] : ['bash'];
  for (const candidate of candidates) {
    const tried = spawnSync(candidate, ['-c', 'exit 0'], { stdio: 'ignore' });
    if (!tried.error && tried.status === 0) return candidate;
  }
  return null;
}
const bash = bashOf();
const forward = (path) => path.replace(/\\/g, '/');

// What compose.load.yml sets for the stand-in: every provider address, and a key that isn't one.
const ARMED_SETTINGS = [
  'BULKSMSBD_BASE_URL=https://outside:8443/bulksmsbd/api',
  'BULKSMSBD_API_KEY=load-test-not-a-key',
  'STEADFAST_API_URL=https://outside:8443/steadfast/api/v1',
  'PATHAO_API_URL=https://outside:8443/pathao/aladdin/api/v1',
  'REDX_API_URL=https://outside:8443/redx/v1.0.0-beta',
  'BKASH_SANDBOX_URL=https://outside:8443/bkash/v2',
  'BKASH_PRODUCTION_URL=https://outside:8443/bkash/v2',
  'RESEND_BASE_URL=https://outside:8443/resend',
  'GEMINI_BASE_URL=https://outside:8443/gemini/v1beta',
];
const REAL_KEY = 'BULKSMSBD_API_KEY=real-secret-key-0042';

// The fakes. `docker` answers `ps` from running/<service>, `inspect` from env/<id> (or the stand-in's creation time),
// takes `rm` and `compose ... up`, keeps what `exec` and `compose ... exec` read, and answers an `exec` with queued (0
// unless a test writes it); `curl` answers from curl/<url's last part>, or fails as a closed port does. Each writes its
// arguments, a line a call, to calls.log.
const FAKE_DOCKER = `#!/usr/bin/env bash
printf 'docker %s\\n' "$*" >> "$FAKE/calls.log"
case "$1" in
  ps)
    for arg in "$@"; do
      case "$arg" in label=com.docker.compose.service=*) cat "$FAKE/running/\${arg#*service=}" 2> /dev/null ;; esac
    done ;;
  inspect)
    case "$*" in
      *.Created*) cat "$FAKE/created" 2> /dev/null || echo 2026-11-19T16:06:20.123456789Z ;;
      *) cat "$FAKE/env/\${@: -1}" ;;
    esac ;;
  exec)
    cat >> "$FAKE/sql.log"
    cat "$FAKE/queued" 2> /dev/null || echo 0 ;;
  compose)
    case " $* " in
      *' exec '*) cat >> "$FAKE/sql.log" ;;
    esac ;;
esac
exit 0
`;
const FAKE_CURL = `#!/usr/bin/env bash
printf 'curl %s\\n' "$*" >> "$FAKE/calls.log"
url="\${@: -1}"
answer="$FAKE/curl/\${url##*/}"
[ -f "$answer" ] || exit 7
cat "$answer"
`;

describe('the load test guards (D9-34)', { skip: bash ? false : 'no bash to run them' }, () => {
  let fake;

  beforeEach(() => {
    fake = mkdtempSync(join(tmpdir(), 'p87-guards-'));
    for (const folder of ['bin', 'running', 'env', 'curl', 'home/state', 'home/env']) {
      mkdirSync(join(fake, folder), { recursive: true });
    }
    writeFileSync(join(fake, 'bin', 'docker'), FAKE_DOCKER);
    writeFileSync(join(fake, 'bin', 'curl'), FAKE_CURL);
    chmodSync(join(fake, 'bin', 'docker'), 0o755);
    chmodSync(join(fake, 'bin', 'curl'), 0o755);
    writeFileSync(join(fake, 'calls.log'), '');
    // disarm.sh's live release: this checkout's load folder, as the server's state/current holds its own.
    cpSync(loadDir, join(fake, 'home', 'state', 'current', 'load'), {
      recursive: true,
      filter: (path) => !path.endsWith('.test.mjs'),
    });
    writeFileSync(join(fake, 'home', 'state', 'release.env'), 'RELEASE=test\n');
  });

  afterEach(() => {
    rmSync(fake, { recursive: true, force: true });
  });

  const running = (service, id) => writeFileSync(join(fake, 'running', service), `${id}\n`);
  const settings = (id, lines) => writeFileSync(join(fake, 'env', id), `${lines.join('\n')}\n`);
  const answers = (path, body) => writeFileSync(join(fake, 'curl', path), body);
  const calls = () => readFileSync(join(fake, 'calls.log'), 'utf8');
  const sql = () =>
    existsSync(join(fake, 'sql.log')) ? readFileSync(join(fake, 'sql.log'), 'utf8') : '';

  function run(script, args = [], env = {}) {
    const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH';
    const result = spawnSync(bash, [forward(script), ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        [pathKey]: `${join(fake, 'bin')}${delimiter}${process.env[pathKey] ?? ''}`,
        FAKE: forward(fake),
        LYTRO_HOME: forward(join(fake, 'home')),
        LOAD_STOP_SECONDS: '0',
        ...env,
      },
    });
    return { status: result.status, out: `${result.stdout}${result.stderr}` };
  }

  /** A server armed as arm.sh leaves it: the stand-in up and answering, and every process pointed at it. */
  function armed() {
    running('outside', 'c-outside');
    answers('health', '{"ok":true}');
    answers('stop', '{"ok":true}');
    for (const service of ['api-1', 'api-2', 'worker']) {
      running(service, `c-${service}`);
      settings(`c-${service}`, ['NODE_ENV=production', ...ARMED_SETTINGS]);
    }
  }

  const armedScript = join(loadDir, 'run', 'armed.sh');
  const standDown = join(loadDir, 'run', 'stand-down.sh');
  // disarm.sh from the fake server's live release, which beforeEach makes.
  const disarm = () => join(fake, 'home', 'state', 'current', 'load', 'run', 'disarm.sh');

  test('armed.sh: armed when the stand-in answers and every process names it for every provider', () => {
    armed();
    const result = run(armedScript);
    assert.equal(result.status, 0, result.out);
    assert.match(result.out, /armed: every outside service answers from the stand-in/);
  });

  test('armed.sh: not armed without the stand-in, or when it does not answer', () => {
    armed();
    rmSync(join(fake, 'running', 'outside'));
    let result = run(armedScript);
    assert.equal(result.status, 1);
    assert.match(result.out, /the outside services' stand-in isn't running/);

    armed();
    rmSync(join(fake, 'curl', 'health'));
    result = run(armedScript);
    assert.equal(result.status, 1);
    assert.match(result.out, /the stand-in doesn't answer/);
  });

  test("armed.sh: not armed once one process has a real provider back, and it never prints a setting's value", () => {
    armed();
    // api-2 as a deploy leaves it: the real SMS provider, with its real key.
    settings('c-api-2', [
      'BULKSMSBD_BASE_URL=https://bulksmsbd.net/api',
      REAL_KEY,
      ...ARMED_SETTINGS.slice(2),
    ]);
    const result = run(armedScript);
    assert.equal(result.status, 1);
    assert.match(result.out, /api-2's BULKSMSBD_BASE_URL isn't the stand-in/);
    assert.doesNotMatch(result.out, /bulksmsbd\.net|real-secret-key/);
  });

  test("armed.sh: checks every provider compose.load.yml names, Gemini's last among them", () => {
    armed();
    settings(
      'c-worker',
      ARMED_SETTINGS.filter((line) => !line.startsWith('GEMINI_BASE_URL=')),
    );
    const result = run(armedScript);
    assert.equal(result.status, 1);
    assert.match(result.out, /worker's GEMINI_BASE_URL isn't the stand-in/);
  });

  test('stand-down.sh: with no load test armed, nothing is touched', () => {
    const result = run(standDown);
    assert.equal(result.status, 0, result.out);
    assert.doesNotMatch(calls(), /docker (rm|exec)/);
    assert.equal(sql(), '');
  });

  test('stand-down.sh: runs told to stop, the queues found empty, the stand-in removed, the setting back', () => {
    armed();
    running('postgres', 'c-postgres');
    writeFileSync(join(fake, 'home', 'state', 'load-visitor-limit.json'), '120\n');
    const result = run(standDown);
    assert.equal(result.status, 0, result.out);
    const log = calls();
    const stopped = log.indexOf('-X POST -o /dev/null http://127.0.0.1:18081/load/stop');
    const removed = log.indexOf('docker rm --force c-outside');
    assert.ok(stopped >= 0 && removed > stopped, log);
    // The queues counted while the stand-in still answered; the setting put back after it went.
    assert.ok(
      log.indexOf('docker exec') < removed && log.lastIndexOf('docker exec') > removed,
      log,
    );
    assert.match(sql(), /FROM pgboss\.job WHERE name IN \('order_sms','otp_retry'/);
    assert.doesNotMatch(sql(), /cancelled/);
    assert.match(
      sql(),
      /SET value = '120'::jsonb, .* WHERE key = 'public_requests_per_visitor_per_minute'/,
    );
    assert.equal(existsSync(join(fake, 'home', 'state', 'load-visitor-limit.json')), false);
    assert.match(result.out, /public_requests_per_visitor_per_minute back to 120/);
  });

  test('stand-down.sh: a run still going is told to stop and given the time to', () => {
    armed();
    answers('load', '{"running":true,"stopping":false,"secondsAgo":3}');
    const result = run(standDown);
    assert.equal(result.status, 0, result.out);
    assert.match(result.out, /a load run is still going: it stops at its next check; waiting 0s/);
  });

  test('stand-down.sh: still queued after DRAIN_SECONDS is cancelled from the arming on, before the stand-in goes', () => {
    armed();
    running('postgres', 'c-postgres');
    writeFileSync(join(fake, 'queued'), '24\n');
    const result = run(standDown, [], { DRAIN_SECONDS: '0' });
    assert.equal(result.status, 0, result.out);
    assert.match(
      result.out,
      /24 still queued after 0s: cancelling what was queued since the test was armed/,
    );
    const statements = sql();
    assert.match(
      statements,
      /UPDATE pgboss\.job SET state = 'cancelled', completed_on = now\(\)\s+WHERE name IN \('order_sms','otp_retry','usage_notice','order_fraud_check','meta_purchase'\) AND state IN \('created', 'retry'\) AND created_on >= '2026-11-19T16:06:20\.123456789Z'/,
    );
    assert.match(statements, /DELETE FROM control\.job_outbox\s+WHERE status = 'pending'/);
    assert.match(statements, /UPDATE control\.sms_outbox SET status = 'failed'/);
    assert.match(statements, /UPDATE control\.mail_outbox SET status = 'failed'/);
    const log = calls();
    assert.ok(log.lastIndexOf('docker exec') < log.indexOf('docker rm --force c-outside'), log);
  });

  test("stand-down.sh: a stand-in creation time that isn't a time stops it before anything changes", () => {
    armed();
    running('postgres', 'c-postgres');
    writeFileSync(join(fake, 'created'), "2026-11-19'; DROP TABLE x; --\n");
    const result = run(standDown);
    assert.equal(result.status, 1);
    assert.doesNotMatch(calls(), /docker (rm|exec)|load\/stop/);
  });

  test("stand-down.sh: every queue it waits for is one of the server's own (QueueName)", () => {
    const enums = readFileSync(
      join(loadDir, '..', '..', 'packages', 'validators', 'src', 'db', 'enums.ts'),
      'utf8',
    );
    const block = /export enum QueueName \{([\s\S]*?)\n\}/.exec(enums)?.[1] ?? '';
    const names = new Set([...block.matchAll(/= '([a-z_]+)'/g)].map((match) => match[1]));
    const script = readFileSync(standDown, 'utf8');
    const listed = /^OUTSIDE_QUEUES='([^']+)'/m.exec(script)?.[1].split(' ') ?? [];
    assert.ok(listed.length >= 5, script);
    for (const queue of listed) assert.ok(names.has(queue), `${queue} isn't a QueueName`);
  });

  test('stand-down.sh: a setting file that is not a whole number never reaches the database', () => {
    running('postgres', 'c-postgres');
    writeFileSync(
      join(fake, 'home', 'state', 'load-visitor-limit.json'),
      "120'::jsonb; DROP TABLE x; --\n",
    );
    const result = run(standDown);
    assert.equal(result.status, 1);
    assert.equal(sql(), '');
  });

  test('stand-down.sh: without the database, the setting waits for disarm.sh', () => {
    writeFileSync(join(fake, 'home', 'state', 'load-visitor-limit.json'), '120\n');
    const result = run(standDown);
    assert.equal(result.status, 0, result.out);
    assert.equal(existsSync(join(fake, 'home', 'state', 'load-visitor-limit.json')), true);
  });

  test('disarm.sh: refuses while a load run checked in lately, and touches nothing', () => {
    armed();
    answers('load', '{"running":true,"lastSeen":"2026-11-19T15:27:00.000Z","secondsAgo":4}');
    const result = run(disarm());
    assert.equal(result.status, 1);
    assert.match(result.out, /a load run checked in 4 s ago and is still going: stop it first/);
    assert.doesNotMatch(calls(), /docker (rm|exec|compose)/);
  });

  test('disarm.sh: once the run is gone, the stand-in goes before the API and the worker come back', () => {
    armed();
    answers('load', '{"running":false,"lastSeen":"2026-11-19T15:27:00.000Z","secondsAgo":95}');
    const result = run(disarm());
    assert.equal(result.status, 0, result.out);
    const log = calls();
    const removed = log.indexOf('docker rm --force c-outside');
    const restarted = log.search(/docker compose .* up -d --no-deps --wait api-1 api-2 worker/);
    assert.ok(removed >= 0 && restarted > removed, log);
    assert.match(result.out, /disarmed: the outside services are real again/);
  });

  test('disarm.sh --force: disarms under a run still going (which then stops itself)', () => {
    armed();
    answers('load', '{"running":true,"lastSeen":"2026-11-19T15:27:00.000Z","secondsAgo":4}');
    const result = run(disarm(), ['--force']);
    assert.equal(result.status, 0, result.out);
    assert.match(calls(), /docker rm --force c-outside/);
  });
});
