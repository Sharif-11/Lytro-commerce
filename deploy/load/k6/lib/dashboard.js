// A shop's owner signed in to the dashboard, calling its API as apps/dashboard does: on the app host, under /api/v1,
// with the session's cookie, its CSRF token on every change (SEC-14), and the shop named by x-lytro-shop (TEN-31).
import { sleep } from 'k6';
import http from 'k6/http';
import { call, dataOf, hosts, OUTSIDE } from './target.js';

/** The session cookie a sign-in set: `lytronix_session`, or `__Host-lytronix_session` over HTTPS (TEN-29). */
function sessionCookieOf(response) {
  for (const [name, values] of Object.entries(response.cookies)) {
    if (name.endsWith('lytronix_session') && values.length > 0) return `${name}=${values[0].value}`;
  }
  return null;
}

export class Seller {
  constructor({ slug, cookie, csrfToken, tenantId }) {
    this.slug = slug;
    this.cookie = cookie;
    this.csrfToken = csrfToken;
    this.tenantId = tenantId;
  }

  headers(changes) {
    return {
      cookie: this.cookie,
      'x-lytro-shop': this.slug,
      ...(changes ? { 'x-csrf-token': this.csrfToken } : {}),
    };
  }

  get(path, tags) {
    return call('GET', hosts.app, `/api/v1${path}`, null, { headers: this.headers(false), tags });
  }

  send(method, path, body, tags) {
    return call(method, hosts.app, `/api/v1${path}`, body ?? {}, {
      headers: this.headers(true),
      tags,
    });
  }

  toJSON() {
    return {
      slug: this.slug,
      cookie: this.cookie,
      csrfToken: this.csrfToken,
      tenantId: this.tenantId,
    };
  }
}

/** The newest code the outside services' stand-in received for a phone, waiting for the SMS queue to send it. */
export function codeFor(phone, waitSeconds = 60) {
  for (let waited = 0; waited < waitSeconds; waited += 1) {
    const answer = http.get(`${OUTSIDE}/codes?phone=${phone}`, { tags: { host: 'outside' } });
    if (answer.status === 200) {
      const code = answer.json('code');
      if (code) return code;
    }
    sleep(1);
  }
  return null;
}

/**
 * AUTH-28's first steps, as a new seller takes them: a phone code, its check, then a shop at its own address. Returns
 * the signed-in seller, or the step that failed.
 */
export function signUp({ phone, ownerName, shopName, slug, visitor }) {
  const asked = call(
    'POST',
    hosts.app,
    '/api/v1/auth/phone/code',
    { phone },
    { visitor, tags: { step: 'code' } },
  );
  if (asked.status !== 200) return { failed: `the code: ${asked.status}` };
  const code = codeFor(phone);
  if (!code) return { failed: 'the code never reached the stand-in' };
  const entered = call(
    'POST',
    hosts.app,
    '/api/v1/auth/phone/verify',
    { phone, code },
    {
      visitor,
      tags: { step: 'verify' },
    },
  );
  const cookie = sessionCookieOf(entered);
  if (entered.status !== 200 || !cookie) return { failed: `the check: ${entered.status}` };
  const csrfToken = dataOf(entered)?.csrfToken;
  const opened = call(
    'POST',
    hosts.app,
    '/api/v1/shops',
    { ownerName, shopName, address: slug },
    {
      headers: { cookie, 'x-csrf-token': csrfToken },
      visitor,
      tags: { step: 'shop' },
    },
  );
  if (opened.status !== 201) return { failed: `the shop: ${opened.status} ${opened.body}` };
  const seller = new Seller({ slug, cookie, csrfToken, tenantId: null });
  const me = seller.get('/me', { step: 'me' });
  seller.tenantId = dataOf(me)?.tenant?.id ?? null;
  return { seller };
}
