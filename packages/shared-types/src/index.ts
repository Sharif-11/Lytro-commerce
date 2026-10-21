/**
 * Shared API types. Error codes follow docs/SRS-detailed.md §2.6 and are never translated.
 */
export const ERROR_CODES = [
  'validation_error',
  'unauthenticated',
  'forbidden',
  'plan_limit_reached',
  'plan_feature_unavailable',
  'tenant_offline',
  'not_found',
  'conflict',
  'rate_limited',
  'quota_exceeded',
  'service_unavailable',
  'internal_error',
  // API-11: a replayed Idempotency-Key whose body doesn't match the original request.
  'idempotency_conflict',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * TEN-31: the dashboard runs at app.lytro.app/<shop slug>/..., but its API calls go to /api/v1/... and so carry no
 * path of their own. Every call from a shop's page names that shop in this header; the server checks that the
 * signed-in person belongs to it.
 */
export const SHOP_HEADER = 'x-lytro-shop';

// Every response is one of these two shapes (decided 2026-10-14) -- `success` tells a client which one it got
// without inspecting the status code. `message` is a short, human sentence in both; `errors`/`data` hold the
// payload each shape actually needs, never both on the same response.
export interface ApiSuccessBody<T = unknown> {
  success: true;
  statusCode: number;
  message: string;
  data: T;
}

/**
 * API-16: one field a request got wrong, in `errors.details.fields` -- its path, a stable problem code (see
 * FieldProblemCode and ServerFieldProblemCode in @lytronix/validators), the limit it broke, and the message to
 * show next to it, in the request's language.
 */
export interface ApiFieldError {
  field: string;
  problem: string;
  message: string;
  min?: number;
  max?: number;
  length?: number;
  exclusive?: boolean;
}

export interface ApiErrorBody {
  success: false;
  statusCode: number;
  message: string;
  errors: {
    code: ErrorCode;
    details: Record<string, unknown>;
  };
}

export type ApiResponseBody<T = unknown> = ApiSuccessBody<T> | ApiErrorBody;

// MED-01, MED-02, MED-08, MED-10, MED-13, BND-01, BND-07: the media Worker's contract with the server.
export * from './media-edge.js';
