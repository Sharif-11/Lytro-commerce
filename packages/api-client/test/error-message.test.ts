import { ERROR_CODES } from '@lytronix/shared-types';
import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { ApiClientError, ERROR_MESSAGE_KEYS, errorMessage } from '../src';

// A dictionary stand-in that answers with the key and its values, so each case shows which copy it chose.
const t = ((key: string, values?: Record<string, unknown>) =>
  values ? `${key} ${JSON.stringify(values)}` : key) as unknown as TFunction;

const refusal = (code: ApiClientError['code'], message = '', retryAfterSeconds?: number) =>
  new ApiClientError(code, message, {}, 400, retryAfterSeconds);

describe('errorMessage', () => {
  it("shows the server's own localized message first", () => {
    expect(errorMessage(refusal('conflict', 'That address is taken.'), t)).toBe(
      'That address is taken.',
    );
  });

  it('falls back to the dictionary when the server sent none', () => {
    expect(errorMessage(refusal('not_found'), t)).toBe('errors.notFound');
    expect(errorMessage(refusal('forbidden'), t)).toBe('errors.unauthenticated');
    expect(errorMessage(refusal('quota_exceeded'), t)).toBe('errors.planLimited');
    expect(errorMessage(new Error('network'), t)).toBe('common.somethingWentWrong');
  });

  it('says how long to wait, in seconds or rounded-up minutes', () => {
    expect(errorMessage(refusal('rate_limited', '', 30), t)).toBe(
      'errors.rateLimitedSeconds {"seconds":30}',
    );
    expect(errorMessage(refusal('rate_limited', '', 61), t)).toBe(
      'errors.rateLimitedMinutes {"minutes":2}',
    );
    expect(errorMessage(refusal('rate_limited'), t)).toBe('errors.rateLimited');
  });

  it('lists every key it can fall back to', () => {
    const used = new Set<string>();
    const record = ((key: string) => {
      used.add(key);
      return '';
    }) as unknown as TFunction;
    for (const code of ERROR_CODES) errorMessage(refusal(code), record);
    errorMessage(refusal('rate_limited', '', 5), record);
    errorMessage(refusal('rate_limited', '', 120), record);
    expect([...used].sort()).toEqual([...ERROR_MESSAGE_KEYS].sort());
  });
});
