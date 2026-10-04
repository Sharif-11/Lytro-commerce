import type { ErrorCode } from '@lytronix/shared-types';

// SRS-detailed §2.6: every failure has a stable code, a human message, and optional details.
// The message is never a raw library error, and codes are never translated.
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const HTTP_STATUS: Record<ErrorCode, number> = {
  validation_error: 400,
  unauthenticated: 401,
  forbidden: 403,
  plan_limit_reached: 402,
  plan_feature_unavailable: 402,
  tenant_offline: 503,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  quota_exceeded: 429,
  service_unavailable: 503,
};
