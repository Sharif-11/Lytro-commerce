import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime } from '../src';

// 2026-10-19 20:30 UTC is already the 20th in Dhaka (UTC+6): dates are always shown in Dhaka time.
const LATE_EVENING_UTC = '2026-10-19T20:30:00.000Z';

describe('formatDate and formatDateTime', () => {
  it('show the Dhaka date, whatever the device clock says', () => {
    expect(formatDate(LATE_EVENING_UTC, 'en')).toBe('20 Oct 2026');
    expect(formatDateTime(LATE_EVENING_UTC, 'en')).toBe('20 Oct 2026, 02:30');
  });

  it('use Bangla month names in Bangla', () => {
    expect(formatDate(LATE_EVENING_UTC, 'bn')).toContain('অক্টো');
  });
});
