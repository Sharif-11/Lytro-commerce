import { describe, expect, it } from 'vitest';
import bn from '../src/i18n/locales/bn.json';
import en from '../src/i18n/locales/en.json';

function keysOf(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keysOf(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('dictionaries', () => {
  it('carry the same keys in both languages', () => {
    expect(keysOf(bn).sort()).toEqual(keysOf(en).sort());
  });
});
