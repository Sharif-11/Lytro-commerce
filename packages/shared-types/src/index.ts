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
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

// Every response is one of these two shapes (decided 2026-10-14) -- `success` tells a client which one it got
// without inspecting the status code. `message` is a short, human sentence in both; `errors`/`data` hold the
// payload each shape actually needs, never both on the same response.
export interface ApiSuccessBody<T = unknown> {
  success: true;
  statusCode: number;
  message: string;
  data: T;
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
