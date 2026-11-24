import { describe, expect, it } from 'vitest';
import { PAYG_NEW_DAYS, paygStillNew } from '../src/lib/payg-new';
import type { PlatformSetting } from '../src/types/operator';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-12-24T06:00:00Z');

const fairUse = (value: string, changedDaysAgo: number): PlatformSetting[] => [
  {
    key: 'payg_fair_use',
    value,
    description: 'Pay-as-you-go fair use',
    updatedBy: null,
    updatedByEmail: null,
    updatedAt: new Date(NOW - changedDaysAgo * DAY_MS).toISOString(),
  },
];

// The sketch's "New" (lytro-payg.html `pf-console`): what fair use brings is marked new while the switch is off, and
// for 30 days after it is turned on.
describe('the fair-use rows marked New', () => {
  it('reads New while fair use is off, however long ago it last changed', () => {
    expect(paygStillNew(fairUse('off', 400), NOW)).toBe(true);
  });

  it('reads New for 30 days after fair use is turned on, then not', () => {
    expect(paygStillNew(fairUse('on', 0), NOW)).toBe(true);
    expect(paygStillNew(fairUse('on', PAYG_NEW_DAYS - 1), NOW)).toBe(true);
    expect(paygStillNew(fairUse('on', PAYG_NEW_DAYS), NOW)).toBe(false);
  });

  it('marks nothing before the settings load, or without the switch', () => {
    expect(paygStillNew(undefined, NOW)).toBe(false);
    expect(paygStillNew([], NOW)).toBe(false);
  });
});
