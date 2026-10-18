import type { ErrorCode } from '@lytronix/shared-types';
import type { FieldProblemCode, ServerFieldProblemCode } from '@lytronix/validators';
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

/** The limit a field broke, when it has one. */
interface FieldLimits {
  min?: number;
  max?: number;
  length?: number;
  exclusive?: boolean;
}

/**
 * API-16: a field problem the shared catalogue words (@lytronix/validators). `messageKey` replaces that wording
 * where the server can say more; `wordedAs` words it as another field would be (a `value` holding a phone number
 * is worded as `phone`, with its example of the right format).
 */
interface SharedInvalidField extends FieldLimits {
  field: string;
  problem: FieldProblemCode;
  messageKey?: MessageKey;
  params?: MessageParams;
  wordedAs?: string;
}

/** API-16: a problem only the server can find (an address already taken); it always brings its own wording. */
interface ServerInvalidField extends FieldLimits {
  field: string;
  problem: ServerFieldProblemCode;
  messageKey: MessageKey;
  params?: MessageParams;
}

export type InvalidField = SharedInvalidField | ServerInvalidField;

/**
 * API-16: a request refused because of specific fields. ApiErrorFilter words each one in the request's language
 * into `details.fields`; the response's message is that field's own message when there is one, or a count.
 */
export class FieldsError extends ApiError {
  constructor(
    readonly fields: readonly InvalidField[],
    code: ErrorCode = 'validation_error',
    details: Record<string, unknown> = {},
  ) {
    const [only] = fields;
    super(
      code,
      fields.length === 1 && only?.messageKey ? only.messageKey : 'CheckHighlightedFields',
      details,
    );
    this.name = 'FieldsError';
  }
}
