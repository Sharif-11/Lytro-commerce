// D9-14, DAT-23, DAT-42 (Slice 9.2): one definition of a lost database connection, for the error filter's retry hint
// and the read pool's one retry; and of a pool too busy to give one, which is neither.

// The codes and words a lost or refused database connection comes with: the driver's own, and PostgreSQL's class 08
// (connection exception) and 57P0x (the server shutting down or not yet up).
const LOST_CONNECTION_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  '57P01',
  '57P02',
  '57P03',
]);
const LOST_CONNECTION_WORDS = /Connection terminated|Client has encountered a connection error/i;
// The pool's own words when every connection stayed in use for its whole wait (pg-pool's pending queue): the database
// is there and the server is busy. A new connection that can't be made says "Connection terminated due to connection
// timeout" instead, which is lost. Small fixes, 2026-11-17: 9.10's shakedown read a busy pool as a lost database.
const POOL_BUSY_WORDS = /timeout exceeded when trying to connect/i;

/** Whether this error, or one it wraps, answers the test. */
function anyCause(exception: unknown, test: (error: unknown) => boolean): boolean {
  for (let error: unknown = exception, depth = 0; error && depth < 5; depth += 1) {
    if (test(error)) return true;
    error = Reflect.get(Object(error), 'cause');
  }
  return false;
}

/** D9-14, DAT-42: whether the database was lost under this request, looking through the errors that wrap it. */
export function isLostConnection(exception: unknown): boolean {
  return anyCause(exception, (error) => {
    const code: unknown = Reflect.get(Object(error), 'code');
    if (typeof code === 'string' && (LOST_CONNECTION_CODES.has(code) || code.startsWith('08')))
      return true;
    return error instanceof Error && LOST_CONNECTION_WORDS.test(error.message);
  });
}

// PostgreSQL's code when a transaction waited for a lock longer than it allows (`lock_timeout`): a shop's catalogue
// change whose turn didn't come soon (Slice 9.10, CatalogueWrites). Nothing else in the app limits a lock wait.
const LOCK_WAIT_OVER = '55P03';

/**
 * Whether the database was there but too busy for this request: every pooled connection stayed in use while it waited
 * for one, or a lock it needed stayed held past its wait. Busy, not lost: the answer is to try again shortly.
 */
export function isDatabaseBusy(exception: unknown): boolean {
  return anyCause(
    exception,
    (error) =>
      Reflect.get(Object(error), 'code') === LOCK_WAIT_OVER ||
      (error instanceof Error && POOL_BUSY_WORDS.test(error.message)),
  );
}
