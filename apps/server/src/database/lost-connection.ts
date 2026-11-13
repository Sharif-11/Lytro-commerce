// D9-14, DAT-23, DAT-42 (Slice 9.2): one definition of a lost database connection, for the error filter's retry hint
// and the read pool's one retry.

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
const LOST_CONNECTION_WORDS =
  /Connection terminated|timeout exceeded when trying to connect|Client has encountered a connection error/i;

/** D9-14, DAT-42: whether the database was lost under this request, looking through the errors that wrap it. */
export function isLostConnection(exception: unknown): boolean {
  for (let error: unknown = exception, depth = 0; error && depth < 5; depth += 1) {
    const code: unknown = Reflect.get(Object(error), 'code');
    if (typeof code === 'string' && (LOST_CONNECTION_CODES.has(code) || code.startsWith('08')))
      return true;
    if (error instanceof Error && LOST_CONNECTION_WORDS.test(error.message)) return true;
    error = Reflect.get(Object(error), 'cause');
  }
  return false;
}
