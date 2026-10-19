import { describe, expect, it } from 'vitest';
import { daysUntil, formatTaka, formatTakaExact } from '../src';

describe('formatTaka', () => {
  it('rounds to whole taka with grouping and the sign first', () => {
    expect(formatTaka('4741.00')).toBe('৳4,741');
    expect(formatTaka(449.6)).toBe('৳450');
    expect(formatTaka('nope')).toBe('৳0');
  });
});

describe('formatTakaExact', () => {
  it('keeps paisa only when the amount has any', () => {
    expect(formatTakaExact('500.00')).toBe('৳500');
    expect(formatTakaExact('-0.50')).toBe('৳-0.50');
    expect(formatTakaExact('612.5')).toBe('৳612.50');
    expect(formatTakaExact('1234.567')).toBe('৳1,234.57');
  });
});

describe('daysUntil', () => {
  it('counts whole days ahead and never goes negative', () => {
    const now = Date.UTC(2026, 9, 19);
    expect(daysUntil(new Date(now + 2.5 * 864e5).toISOString(), now)).toBe(3);
    expect(daysUntil(new Date(now - 864e5).toISOString(), now)).toBe(0);
    expect(daysUntil(null, now)).toBeNull();
  });
});
