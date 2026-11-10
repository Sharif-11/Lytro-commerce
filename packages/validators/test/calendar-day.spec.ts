import { describe, expect, it } from 'vitest';
import { calendarDayField } from '../src/common/dates';

// A day written YYYY-MM-DD: a real one passes, and one no calendar has is refused, never thrown on (Slice 8.6 found a
// thirteenth month answered 500 instead of 400).
describe('calendarDayField', () => {
  it('takes a real day', () => {
    expect(calendarDayField.safeParse('2031-02-28').success).toBe(true);
    expect(calendarDayField.safeParse('2032-02-29').success).toBe(true);
  });

  it('refuses a day no calendar has, without throwing', () => {
    for (const day of ['2031-13-01', '2031-00-10', '2031-02-29', '2031-04-31', '2031-01-32']) {
      expect(() => calendarDayField.safeParse(day)).not.toThrow();
      expect(calendarDayField.safeParse(day).success, day).toBe(false);
    }
  });
});
