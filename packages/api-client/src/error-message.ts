import type { TFunction } from 'i18next';
import { ApiClientError } from './api-client';

/**
 * The dictionary keys errorMessage() falls back to. Each app words them its own way (the console is terser),
 * so they live in each app's dictionaries; every app's tests check its dictionaries carry all of them.
 */
export const ERROR_MESSAGE_KEYS = [
  'common.somethingWentWrong',
  'errors.rateLimited',
  'errors.rateLimitedSeconds',
  'errors.rateLimitedMinutes',
  'errors.conflict',
  'errors.validation',
  'errors.unauthenticated',
  'errors.tenantOffline',
  'errors.notFound',
  'errors.planLimited',
] as const;

function formatRetryAfter(seconds: number, t: TFunction): string {
  if (seconds >= 60) return t('errors.rateLimitedMinutes', { minutes: Math.ceil(seconds / 60) });
  return t('errors.rateLimitedSeconds', { seconds });
}

/**
 * The server already sends a descriptive, localized message (bn/en per Accept-Language, I18N-01) for every
 * route; that's the primary copy. The switch below is the fallback for when it couldn't (body didn't parse),
 * kept exhaustive over ErrorCode (no default) so a new code without a translation here is a compile error.
 */
export function errorMessage(error: unknown, t: TFunction): string {
  if (!(error instanceof ApiClientError)) return t('common.somethingWentWrong');
  if (error.message.length > 0) return error.message;

  switch (error.code) {
    case 'rate_limited':
      return error.retryAfterSeconds === undefined
        ? t('errors.rateLimited')
        : formatRetryAfter(error.retryAfterSeconds, t);
    case 'conflict':
    case 'idempotency_conflict':
      return t('errors.conflict');
    case 'validation_error':
      return t('errors.validation');
    case 'unauthenticated':
    case 'forbidden':
      return t('errors.unauthenticated');
    case 'tenant_offline':
      return t('errors.tenantOffline');
    case 'not_found':
      return t('errors.notFound');
    case 'plan_limit_reached':
    case 'plan_feature_unavailable':
    case 'quota_exceeded':
      return t('errors.planLimited');
    case 'service_unavailable':
    case 'internal_error':
      return t('common.somethingWentWrong');
  }
}
