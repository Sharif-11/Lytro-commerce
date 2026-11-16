// The load test's operator (DAT-18: Lytro's reports must not slow order creation), signed in to the console's API as a
// person signs in: password, then the two-factor code (ADM-01). A fresh account enrolls on its first sign-in, so the code
// is worked out here from the secret the server shows once, as an authenticator app works it out (RFC 6238).
import crypto from 'k6/crypto';
import { call, dataOf, hosts } from './target.js';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function bytesOf(base32) {
  const bits = base32
    .replace(/=+$/, '')
    .toUpperCase()
    .split('')
    .map((char) => BASE32.indexOf(char).toString(2).padStart(5, '0'))
    .join('');
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = parseInt(bits.slice(index * 8, index * 8 + 8), 2);
  }
  return bytes.buffer;
}

/** The six-digit code a 30-second authenticator shows now for `secret`. */
export function totp(secret, at = Date.now()) {
  let counter = Math.floor(at / 1000 / 30);
  const message = new Uint8Array(8);
  for (let index = 7; index >= 0; index -= 1) {
    message[index] = counter & 0xff;
    counter = Math.floor(counter / 256);
  }
  const hex = crypto.hmac('sha1', bytesOf(secret), message.buffer, 'hex');
  const digest = hex.match(/../g).map((pair) => parseInt(pair, 16));
  const offset = digest[19] & 0x0f;
  const value =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(value % 1_000_000).padStart(6, '0');
}

function sessionCookieOf(response) {
  for (const [name, values] of Object.entries(response.cookies)) {
    if (name.includes('operator') && values.length > 0) return `${name}=${values[0].value}`;
  }
  return null;
}

/** A session for the seeded operator (seed.sh made it), or why there is none. */
export function signInOperator({ email, password }) {
  const signedIn = call('POST', hosts.admin, '/api/v1/auth/operator/signin', { email, password });
  const first = dataOf(signedIn);
  if (signedIn.status !== 200 || !first)
    return { failed: `the sign-in: ${String(signedIn.status)}` };
  // `enroll-2fa` for an account with no second factor yet, `verify-2fa` after.
  const step = String(first.next).startsWith('enroll') ? 'enroll' : 'verify';
  if (step === 'enroll' && !first.secret) return { failed: 'enrolment showed no secret' };
  const code = totp(first.secret ?? '');
  const done = call('POST', hosts.admin, `/api/v1/auth/operator/${step}`, {
    email,
    password,
    code,
  });
  const cookie = sessionCookieOf(done);
  if (done.status !== 200 || !cookie) return { failed: `the ${step}: ${String(done.status)}` };
  return { session: { cookie, csrfToken: dataOf(done)?.csrfToken } };
}

/** One look at a report, as the console's reports page reads it. */
export function readReport(session, path) {
  return call('GET', hosts.admin, `/api/v1/operator/${path}`, null, {
    headers: { cookie: session.cookie },
    tags: { kind: 'report' },
  });
}
