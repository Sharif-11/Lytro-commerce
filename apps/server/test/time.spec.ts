import { describe, expect, it } from 'vitest';
import { addMonths } from '../src/common/time';

// TRM-09: calendar months in Asia/Dhaka, clamped to the last day of a shorter target month -- never an
// overflow into the month after. Bug found 2026-10-16: addMonths used setUTCMonth with no clamp at all, so
// 31 Jan + 1 month landed on 3 Mar, not 28 Feb, and never accounted for Asia/Dhaka (UTC+6) at all.
describe('addMonths (TRM-09)', () => {
  it("SRS's own example: 31 Jan + 1 month ends 28 Feb in a non-leap year", () => {
    const result = addMonths(new Date('2026-01-31T10:00:00Z'), 1);
    expect(result.toISOString()).toBe('2026-02-28T10:00:00.000Z');
  });

  it('31 Jan + 1 month ends 29 Feb in a leap year', () => {
    const result = addMonths(new Date('2024-01-31T10:00:00Z'), 1);
    expect(result.toISOString()).toBe('2024-02-29T10:00:00.000Z');
  });

  it("SRS's own example: 15 Mar + 3 months ends 15 Jun", () => {
    const result = addMonths(new Date('2026-03-15T10:00:00Z'), 3);
    expect(result.toISOString()).toBe('2026-06-15T10:00:00.000Z');
  });

  it('never overflows into the month after the clamp (the exact bug: 3 Mar instead of 28 Feb)', () => {
    const result = addMonths(new Date('2026-01-31T10:00:00Z'), 1);
    expect(result.getUTCMonth()).toBe(1); // February, not March
  });

  it('counts the calendar month on the Asia/Dhaka (UTC+6) day, not the UTC day', () => {
    // 2025-02-28T19:00:00Z is 2025-03-01T01:00+06:00 in Dhaka -- the Dhaka calendar day is already 1 March,
    // not 28 February. +1 month from 1 Mar (Dhaka) is 1 Apr (Dhaka), no clamp needed at all, landing on
    // 2025-03-31T19:00:00Z. A UTC-only implementation would instead start from the UTC day (28 Feb), add a
    // month to land on 28 Mar, then wrongly clamp to the 28th -- three days off from the correct answer.
    const result = addMonths(new Date('2025-02-28T19:00:00Z'), 1);
    expect(result.toISOString()).toBe('2025-03-31T19:00:00.000Z');
  });

  it('preserves the exact time of day', () => {
    const result = addMonths(new Date('2026-05-10T14:23:45.678Z'), 2);
    expect(result.toISOString()).toBe('2026-07-10T14:23:45.678Z');
  });

  it('a non-clamped addition is unaffected by the Dhaka offset', () => {
    const result = addMonths(new Date('2026-06-10T08:00:00Z'), 6);
    expect(result.toISOString()).toBe('2026-12-10T08:00:00.000Z');
  });
});
