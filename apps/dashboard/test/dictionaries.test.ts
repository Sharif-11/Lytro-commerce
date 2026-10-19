import { describe, expect, it } from 'vitest';
import { ERROR_MESSAGE_KEYS } from '@lytronix/api-client';
import { UI_DICTIONARY_KEYS } from '@lytronix/ui';
import bn from '../src/i18n/locales/bn.json';
import en from '../src/i18n/locales/en.json';

function keysOf(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keysOf(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('dictionaries', () => {
  it('carry every key the shared components and error fallbacks read', () => {
    for (const dictionary of [bn, en]) {
      expect(keysOf(dictionary)).toEqual(
        expect.arrayContaining([...ERROR_MESSAGE_KEYS, ...UI_DICTIONARY_KEYS]),
      );
    }
  });
});
