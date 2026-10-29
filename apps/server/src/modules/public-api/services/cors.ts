import type { HttpResponse } from '../../../common/http';

// API-23: what a browser on a registered website may send, and read back, on a public key request.
const ALLOWED_METHODS = 'GET, POST, PATCH, DELETE';
const ALLOWED_HEADERS = 'Authorization, Content-Type, Idempotency-Key, Accept-Language';
// API-11: a replayed order says so, for a shop's own site to read.
const EXPOSED_HEADERS =
  'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After, Idempotent-Replay';
const PREFLIGHT_MAX_AGE_SECONDS = 600;

/** API-23: lets a registered website read the answer, error or not. */
export function allowOrigin(response: HttpResponse, origin: string): void {
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Expose-Headers', EXPOSED_HEADERS);
}

/** API-23: the answer to a registered website's preflight. */
export function allowPreflight(response: HttpResponse, origin: string): void {
  allowOrigin(response, origin);
  response.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
  response.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
  response.setHeader('Access-Control-Max-Age', String(PREFLIGHT_MAX_AGE_SECONDS));
}
