import { describe, expect, it } from 'vitest';
import { dayLabel, formatTime, groupByDay } from '../src/lib/dates';

describe('formatTime', () => {
  it('writes Bangla times with Western digits and the period word', () => {
    // 05:42 UTC is 11:42 in Dhaka (UTC+6).
    expect(formatTime('2026-10-19T05:42:00Z', 'bn')).toBe('সকাল 11:42');
    expect(formatTime('2026-10-19T08:05:00Z', 'bn')).toBe('দুপুর 2:05');
    expect(formatTime('2026-10-19T17:30:00Z', 'bn')).toBe('রাত 11:30');
  });

  it('writes English times in 12-hour form', () => {
    expect(formatTime('2026-10-19T05:42:00Z', 'en')).toMatch(/11:42/);
  });
});

describe('dayLabel and groupByDay', () => {
  const now = '2026-10-19T06:00:00Z';

  it('names today and yesterday by Dhaka day, everything else by date', () => {
    expect(dayLabel('2026-10-19T01:00:00Z', now)).toEqual({ kind: 'today' });
    expect(dayLabel('2026-10-18T17:30:00Z', now)).toEqual({ kind: 'yesterday' });
    expect(dayLabel('2026-10-01T10:00:00Z', now)).toEqual({
      kind: 'date',
      iso: '2026-10-01T10:00:00Z',
    });
  });

  it('groups newest-first rows under their day without reordering them', () => {
    const rows = [
      { id: 1, at: '2026-10-19T05:00:00Z' },
      { id: 2, at: '2026-10-19T01:00:00Z' },
      { id: 3, at: '2026-10-18T05:00:00Z' },
    ];
    const groups = groupByDay(rows, (row) => row.at);
    expect(groups.map((group) => group.items.map((row) => row.id))).toEqual([[1, 2], [3]]);
    expect(groups[0]?.key).toBe('2026-10-19');
  });
});
