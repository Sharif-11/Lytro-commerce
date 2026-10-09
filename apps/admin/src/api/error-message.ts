import type { TFunction } from 'i18next';
import { ApiClientError } from './client';

function formatRetryAfter(seconds: number, t: TFunction): string {
  if (seconds >= 60) return t('errors.rateLimitedMinutes', { minutes: Math.ceil(seconds / 60) });
  return t('errors.rateLimitedSeconds', { seconds });
}

/**
 * Maps an ApiClientError's code to translated copy. Exhaustive over ErrorCode (no default) so a new code
 * added to @lytronix/shared-types without a translation here is a compile error, not a silent "something
 * went wrong" for a case that deserved better copy.
 */
export function errorMessage(error: unknown, t: TFunction): string {
  if (!(error instanceof ApiClientError)) return t('common.somethingWentWrong');

  switch (error.code) {
    case 'rate_limited':
      return error.retryAfterSeconds === undefined
        ? t('errors.rateLimited')
        : formatRetryAfter(error.retryAfterSeconds, t);
    case 'conflict':
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
      return t('common.somethingWentWrong');
  }
}
