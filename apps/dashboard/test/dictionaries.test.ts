import { describe, expect, it } from 'vitest';
import { ERROR_MESSAGE_KEYS } from '@lytronix/api-client';
import { UI_DICTIONARY_KEYS } from '@lytronix/ui';
import bn from '../src/i18n/locales/bn.json';
import en from '../src/i18n/locales/en.json';
import homeBn from '../src/i18n/locales/home/bn.json';
import homeEn from '../src/i18n/locales/home/en.json';
import onboardingBn from '../src/i18n/locales/onboarding/bn.json';
import onboardingEn from '../src/i18n/locales/onboarding/en.json';
import shellBn from '../src/i18n/locales/shell/bn.json';
import shellEn from '../src/i18n/locales/shell/en.json';
import walletBn from '../src/i18n/locales/wallet/bn.json';
import walletEn from '../src/i18n/locales/wallet/en.json';

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

  it('say everything in both languages, in each rebuilt namespace (I18N-01)', () => {
    for (const [bangla, english] of [
      [shellBn, shellEn],
      [homeBn, homeEn],
      [onboardingBn, onboardingEn],
      [walletBn, walletEn],
    ]) {
      expect(keysOf(english).sort()).toEqual(keysOf(bangla).sort());
    }
  });
});
