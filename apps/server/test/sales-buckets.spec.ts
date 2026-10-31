import { describe, expect, it } from 'vitest';
import { SalesBucket } from '@lytronix/validators';
import { bucketsOf } from '../src/modules/orders/services/sales-buckets';

// STA-01 (Phase 4 Slice 4.7): a period split into weeks from Saturday (agreed 2026-10-30), months, quarters or years,
// the first and last cut to the period, checked without a database.

const october = { from: '2026-10-01', to: '2026-10-31' };

describe('splitting a period (STA-01)', () => {
  it('starts each week on a Saturday, cutting the first and last to the period', () => {
    expect(bucketsOf(october, SalesBucket.Week)).toEqual([
      { from: '2026-10-01', to: '2026-10-02' },
      { from: '2026-10-03', to: '2026-10-09' },
      { from: '2026-10-10', to: '2026-10-16' },
      { from: '2026-10-17', to: '2026-10-23' },
      { from: '2026-10-24', to: '2026-10-30' },
      { from: '2026-10-31', to: '2026-10-31' },
    ]);
  });

  it('gives a period inside one week a single bucket', () => {
    expect(bucketsOf({ from: '2026-10-05', to: '2026-10-07' }, SalesBucket.Week)).toEqual([
      { from: '2026-10-05', to: '2026-10-07' },
    ]);
  });

  it('splits by month, quarter and year across a year end', () => {
    const period = { from: '2025-11-15', to: '2026-02-10' };
    expect(bucketsOf(period, SalesBucket.Month)).toEqual([
      { from: '2025-11-15', to: '2025-11-30' },
      { from: '2025-12-01', to: '2025-12-31' },
      { from: '2026-01-01', to: '2026-01-31' },
      { from: '2026-02-01', to: '2026-02-10' },
    ]);
    expect(bucketsOf(period, SalesBucket.Quarter)).toEqual([
      { from: '2025-11-15', to: '2025-12-31' },
      { from: '2026-01-01', to: '2026-02-10' },
    ]);
    expect(bucketsOf(period, SalesBucket.Year)).toEqual([
      { from: '2025-11-15', to: '2025-12-31' },
      { from: '2026-01-01', to: '2026-02-10' },
    ]);
  });

  it('gives a one-day period one bucket of that day, whatever the split', () => {
    for (const bucket of Object.values(SalesBucket)) {
      expect(bucketsOf({ from: '2026-02-28', to: '2026-02-28' }, bucket)).toEqual([
        { from: '2026-02-28', to: '2026-02-28' },
      ]);
    }
  });

  it('runs a leap February to its 29th', () => {
    expect(bucketsOf({ from: '2028-02-01', to: '2028-03-01' }, SalesBucket.Month)).toEqual([
      { from: '2028-02-01', to: '2028-02-29' },
      { from: '2028-03-01', to: '2028-03-01' },
    ]);
  });
});
