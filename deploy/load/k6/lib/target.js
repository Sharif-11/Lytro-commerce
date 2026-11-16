// Where the load goes, from the settings each run is given (deploy/load/README.md). Phase 9 Slice 9.10.
//
// DOMAIN       the target's PLATFORM_DOMAIN: lytro.app, staging.lytro.app, or localhost on a developer's machine.
// TARGET_IP    the target server's address, for runs from another machine before DNS points at it (k6's `hosts`).
// EDGE         unset for the load itself, which goes to https://<host> through Caddy as a browser's does. The seeder
//              sets it to the internal listener (http://edge:8080), where each request names its own visitor.
// EDGE_SECRET  the edge's secret (server.env's TRUSTED_EDGE_SECRET), sent only with EDGE: the server trusts a forwarded
//              visitor address from the edge alone. Read from the server's settings by the run script, never printed.
// OUTSIDE      the outside services' stand-in's codes listener (deploy/load/outside), where the sign-in codes it
//              received are read.
import http from 'k6/http';

export const DOMAIN = __ENV.DOMAIN || 'localhost';
export const EDGE = __ENV.EDGE || '';
const EDGE_SECRET = __ENV.EDGE_SECRET || '';
const SCHEME = __ENV.SCHEME || 'https';
// Plain HTTP: the stand-in's codes listener, inside the target's network or through a tunnel to it.
export const OUTSIDE = __ENV.OUTSIDE || 'http://outside:8081';

export const hosts = {
  app: `app.${DOMAIN}`,
  api: `api.${DOMAIN}`,
  pay: `pay.${DOMAIN}`,
  admin: `admin.${DOMAIN}`,
  shop: (slug) => `${slug}.${DOMAIN}`,
};

/** k6's `hosts` option: every host the run calls, at the target's address, when one is given. */
export function hostsOption(slugs = []) {
  const ip = __ENV.TARGET_IP;
  if (!ip) return {};
  const names = [hosts.app, hosts.api, hosts.pay, hosts.admin, ...slugs.map(hosts.shop)];
  return Object.fromEntries(names.map((name) => [name, ip]));
}

// One tag value per kind of host, not per shop: a hundred storefront hosts would make a hundred series of each metric.
function hostTag(host) {
  const first = host.split('.')[0];
  return ['app', 'api', 'pay', 'admin'].includes(first) ? first : 'storefront';
}

/** A visitor address of its own for each made-up person, so per-visitor limits count people, not this machine. */
export function visitorAddress(index) {
  return `10.${(index >> 16) & 255}.${(index >> 8) & 255}.${index & 255}`;
}

/**
 * One request to a host, as the load or the seeder sends it. Every call gets a cookie jar of its own: one script calls
 * as many shops, and k6's shared jar would mix their sessions. `visitor` names the visitor's address, through the edge
 * only.
 */
export function call(method, host, path, body, options = {}) {
  const [verb, address, payload, params] = requestOf(method, host, path, body, options);
  return http.request(verb, address, payload, params);
}

/** Several requests at once (k6's http.batch), each as `call` takes it: [method, host, path, body, options]. */
export function callAll(requests) {
  return http.batch(requests.map((each) => requestOf(...each)));
}

function requestOf(method, host, path, body, { headers = {}, visitor, tags = {} } = {}) {
  const sent = { ...headers };
  if (body !== undefined && body !== null && typeof body !== 'string') {
    sent['Content-Type'] = 'application/json';
  }
  let address = `${SCHEME}://${host}${path}`;
  if (EDGE) {
    address = `${EDGE}${path}`;
    sent.Host = host;
    if (EDGE_SECRET) sent['x-lytronix-edge-secret'] = EDGE_SECRET;
    if (visitor !== undefined) sent['X-Forwarded-For'] = visitor;
  }
  const payload =
    body === undefined || body === null
      ? null
      : typeof body === 'string'
        ? body
        : JSON.stringify(body);
  return [
    method,
    address,
    payload,
    {
      headers: sent,
      jar: new http.CookieJar(),
      tags: { host: hostTag(host), ...tags },
      redirects: 0,
    },
  ];
}

/** The value of the server's envelope, `{ success, data }`, or null. */
export function dataOf(response) {
  try {
    return response.json('data');
  } catch {
    return null;
  }
}
