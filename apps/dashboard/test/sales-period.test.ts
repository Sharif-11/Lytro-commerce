import { describe, expect, it } from 'vitest';
import { SalesBucket } from '@lytronix/validators';
import {
  bucketFor,
  datesProblem,
  daysIn,
  longestPeriod,
  periodOf,
  trendPeriod,
} from '@/lib/sales-period';

describe('the periods Sales offers (§7.34)', () => {
  it('reads each named period from today', () => {
    expect(periodOf('thisMonth', '2026-11-03')).toEqual({
      key: 'thisMonth',
      from: '2026-11-01',
      to: '2026-11-03',
    });
    expect(periodOf('lastMonth', '2026-11-03')).toEqual({
      key: 'lastMonth',
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(periodOf('last3', '2026-11-03')).toEqual({
      key: 'last3',
      from: '2026-09-01',
      to: '2026-11-03',
    });
    expect(periodOf('thisYear', '2026-11-03')).toEqual({
      key: 'thisYear',
      from: '2026-01-01',
      to: '2026-11-03',
    });
  });

  it('crosses the turn of a year, and a leap February', () => {
    expect(periodOf('lastMonth', '2027-01-15')).toMatchObject({
      from: '2026-12-01',
      to: '2026-12-31',
    });
    expect(periodOf('last3', '2027-01-15')).toMatchObject({ from: '2026-11-01' });
    expect(periodOf('lastMonth', '2028-03-01')).toMatchObject({
      from: '2028-02-01',
      to: '2028-02-29',
    });
  });

  it('gives a trend this month and the eleven before it', () => {
    expect(trendPeriod('2026-10-31')).toEqual({ from: '2025-11-01', to: '2026-10-31' });
    expect(trendPeriod('2026-01-05')).toEqual({ from: '2025-02-01', to: '2026-01-05' });
  });

  it('never asks for longer than the server reads', () => {
    const { from, to } = longestPeriod('2026-11-03');
    expect(daysIn(from, to)).toBe(1830);
    expect(datesProblem(from, to)).toBeNull();
  });
});

describe('the split a period opens with (agreed 2026-11-03)', () => {
  const custom = (from: string, to: string) => ({ key: 'custom' as const, from, to });

  it('follows the named periods', () => {
    expect(bucketFor(periodOf('thisMonth', '2026-11-03'))).toBe(SalesBucket.Week);
    expect(bucketFor(periodOf('lastMonth', '2026-11-03'))).toBe(SalesBucket.Week);
    expect(bucketFor(periodOf('last3', '2026-11-03'))).toBe(SalesBucket.Month);
    expect(bucketFor(periodOf('thisYear', '2026-11-03'))).toBe(SalesBucket.Month);
    // Early in a year, this year is still by month, and the last 3 months never fall back to weeks.
    expect(bucketFor(periodOf('thisYear', '2026-01-05'))).toBe(SalesBucket.Month);
    expect(bucketFor(periodOf('last3', '2026-03-01'))).toBe(SalesBucket.Month);
  });

  it('goes by length for picked dates', () => {
    expect(bucketFor(custom('2026-10-01', '2026-10-05'))).toBe(SalesBucket.Week);
    expect(bucketFor(custom('2026-09-01', '2026-11-01'))).toBe(SalesBucket.Week);
    expect(bucketFor(custom('2026-09-01', '2026-11-02'))).toBe(SalesBucket.Month);
    expect(bucketFor(custom('2024-11-03', '2026-11-03'))).toBe(SalesBucket.Month);
    expect(bucketFor(custom('2024-11-01', '2026-11-03'))).toBe(SalesBucket.Quarter);
  });
});

describe('dates as picked', () => {
  it('refuses an end before the start, and past five years', () => {
    expect(datesProblem('2026-10-10', '2026-10-01')).toBe('order');
    expect(datesProblem('2026-10-10', '2026-10-10')).toBeNull();
    expect(datesProblem('2020-01-01', '2026-10-31')).toBe('long');
  });
});
