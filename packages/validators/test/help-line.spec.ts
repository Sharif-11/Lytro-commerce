import { describe, expect, it } from 'vitest';
import { dhakaHourOf, helpLineOpenAt } from '../src';

// D8-68, D8-77 (Slice 8.8): the help line is open from its opening hour up to its closing hour, every day, by Dhaka's
// clock (UTC+6), whatever the browser's own clock says.
describe("the help line's hours", () => {
  const hours = { opensHour: 9, closesHour: 22 };
  const dhaka = (time: string) => new Date(`2026-11-11T${time}+06:00`);

  it("reads the hour in Dhaka, not the computer's", () => {
    expect(dhakaHourOf(new Date('2026-11-11T03:30:00Z'))).toBe(9);
    expect(dhakaHourOf(new Date('2026-11-11T18:00:00Z'))).toBe(0);
  });

  it('is open from the opening hour, and closed from the closing hour', () => {
    expect(helpLineOpenAt(hours, dhaka('08:59:59'))).toBe(false);
    expect(helpLineOpenAt(hours, dhaka('09:00:00'))).toBe(true);
    expect(helpLineOpenAt(hours, dhaka('21:59:59'))).toBe(true);
    expect(helpLineOpenAt(hours, dhaka('22:00:00'))).toBe(false);
    expect(helpLineOpenAt(hours, dhaka('00:30:00'))).toBe(false);
  });

  it('holds for any hours the console allows, the whole day included', () => {
    expect(helpLineOpenAt({ opensHour: 0, closesHour: 23 }, dhaka('00:00:00'))).toBe(true);
    expect(helpLineOpenAt({ opensHour: 0, closesHour: 23 }, dhaka('23:10:00'))).toBe(false);
  });
});
