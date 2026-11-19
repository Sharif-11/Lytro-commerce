// D9-34 (Phase 9 Slice 9.10): load reaches a server only while it is armed -- every outside service answered by the
// stand-in (deploy/load/outside), so no SMS, courier, bKash, email or AI call leaves it. Before the real providers come
// back, disarm.sh and every deploy stand the test down (run/stand-down.sh): the stand-in tells every run to stop, answers
// what the test queued, and only then goes. So a run checks the stand-in, and stops itself once it is gone or says stop.
// Staging's live run (2026-11-19) went on placing orders for ten minutes after its disarm, and 49 order SMS went to the
// real BulkSMSBD, refused only because its balance had run out.
//
// Each check is a GET of the stand-in's /load/ping (through the load machine's tunnel, or inside the server's network),
// which also tells the stand-in a run is going, so disarm.sh refuses to bring the real providers back under it; it
// answers 410 once the test is standing down.
import { sleep } from 'k6';
import exec from 'k6/execution';
import http from 'k6/http';
import { OUTSIDE } from './target.js';

/** How often the guard scenario checks. disarm.sh waits 30 s without a check before it counts a run as gone. */
export const GUARD_SECONDS = 10;
// One failed check is tried again after this long, so a dropped packet doesn't end a run; two in a row do.
const RETRY_SECONDS = 2;

function standInAnswers() {
  const answer = http.get(`${OUTSIDE}/load/ping`, {
    timeout: '5s',
    tags: { host: 'outside', guard: 'armed' },
  });
  return answer.status === 200;
}

/**
 * Stops the whole run (k6 exits 108) unless the stand-in answers, now or a moment later. Called by the guard scenario,
 * and before each sign-up by the seeder, whose sign-ups all happen in setup.
 */
export function assertArmed() {
  if (standInAnswers()) return;
  sleep(RETRY_SECONDS);
  if (standInAnswers()) return;
  exec.test.abort(
    `the outside services' stand-in at ${OUTSIDE} is gone, or the test is standing down (disarm.sh or a deploy): ` +
      'the load stops before anything it does can reach a real provider',
  );
}

/**
 * The guard scenario: one VU checking every GUARD_SECONDS for `duration`, the run's whole length. A script adds it
 * under the name `armed`, after any it leaves out, and exports `armed` (below) for it.
 */
export function guardScenario(duration) {
  return { executor: 'constant-vus', exec: 'armed', vus: 1, duration, gracefulStop: '0s' };
}

/** The guard scenario's iteration. */
export function armed() {
  assertArmed();
  sleep(GUARD_SECONDS);
}
