import type { ErrorCode } from '@lytronix/shared-types';
import type { MessageKey } from './i18n/message-key';
import { translate, type MessageParams } from './i18n/messages';

// SRS-detailed §2.6/I18N-01: every failure has a stable code and a message key, resolved to bn/en text per
// request by ApiErrorFilter -- never a raw string. `message` (from Error) carries the English text, for logs
// and stack traces only; it is never what a client sees.
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly messageKey: MessageKey,
    readonly details: Record<string, unknown> = {},
    readonly retryAfterSeconds?: number,
    readonly params: MessageParams = {},
  ) {
    super(translate(messageKey, 'en', params));
    this.name = 'ApiError';
  }
}

export const HTTP_STATUS: Record<ErrorCode, number> = {
  validation_error: 400,
  unauthenticated: 401,
  forbidden: 403,
  plan_limit_reached: 402,
  plan_feature_unavailable: 402,
  tenant_offline: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  quota_exceeded: 429,
  service_unavailable: 503,
  internal_error: 500,
  idempotency_conflict: 422,
};
