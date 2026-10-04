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
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details: Record<string, unknown>;
  };
}
