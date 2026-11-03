import { describe, expect, it } from 'vitest';
import { dayMonthTime, dayMonthYear } from '../src/lib/i18n/dates';

describe('a date as the prototype writes it', () => {
  it("reads on Dhaka's clock, whatever the machine's", () => {
    expect(dayMonthTime('2026-10-31T05:42:00.000Z')).toBe('31 Oct, 11:42');
    expect(dayMonthYear('2026-10-31T20:00:00.000Z')).toBe('1 Nov 2026');
  });

  it('says September as Sep, and midnight as 00', () => {
    expect(dayMonthYear('2026-09-14T05:42:00.000Z')).toBe('14 Sep 2026');
    expect(dayMonthTime('2026-09-13T18:05:00.000Z')).toBe('14 Sep, 00:05');
  });
});
