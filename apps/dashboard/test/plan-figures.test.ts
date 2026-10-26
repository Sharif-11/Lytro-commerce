import { describe, expect, it } from 'vitest';
import type { PlanLimits } from '@lytronix/validators';
import { formatDayMonth, formatDayMonthYear, formatLongDate, formatMonth } from '../src/lib/dates';
import { fileSize, limitFigure, megabytes, sentenceCase } from '../src/lib/limits';
import {
  lapseDays,
  limitMoves,
  overLimits,
  PAYG_LIMITS,
  termLabel,
  UPGRADE_LIMITS,
} from '../src/views/plan/figures';

const STARTER = {
  products: 100,
  orders_handled_monthly: 300,
  staff: 2,
  storage_mb: 2048,
  bandwidth_gb: 30,
} as PlanLimits;
const GROWTH = {
  products: 1000,
  orders_handled_monthly: 1500,
  staff: 5,
  storage_mb: 4096,
  bandwidth_gb: 60,
} as PlanLimits;
const PAYG = {
  products: 25,
  orders_handled_monthly: 300,
  staff: 1,
  storage_mb: 250,
  bandwidth_gb: 10,
} as PlanLimits;

describe('the plan figures (TENANT-DASHBOARD-DESIGN §7.12)', () => {
  it("dates a lapse's steps from the stages the shop's own schedule sets (LIF-04, LIF-26)", () => {
    expect(lapseDays({ grace: 3, readOnly: 4, locked: 8, archived: 45 })).toEqual({
      grace: 3,
      viewOnly: 3,
      locked: 7,
      deleted: 60,
    });
    expect(lapseDays({ grace: 1, readOnly: 2, locked: 3, archived: 4 }).deleted).toBe(10);
  });

  it('names the limits an upgrade raises, in the sketch order, and leaves out the unchanged', () => {
    expect(limitMoves(UPGRADE_LIMITS, STARTER, GROWTH)).toEqual([
      { key: 'products', from: '100', to: '1,000' },
      { key: 'staff', from: '2', to: '5' },
      { key: 'orders_handled_monthly', from: '300', to: '1,500' },
    ]);
    expect(limitMoves(PAYG_LIMITS, STARTER, PAYG)).toEqual([
      { key: 'products', from: '100', to: '25' },
      { key: 'staff', from: '2', to: '1' },
      { key: 'storage_mb', from: '2 GB', to: '250 MB' },
      { key: 'bandwidth_gb', from: '30 GB', to: '10 GB' },
    ]);
  });

  it('lists what a move down leaves over: products, then storage, then seats, each in its unit', () => {
    const over = overLimits([
      { key: 'staff', used: 4, limit: 2 },
      { key: 'storage_mb', used: 2970, limit: 2048 },
      { key: 'products', used: 340, limit: 100 },
    ]);
    expect(over.map((item) => [item.key, item.usedText, item.limitText])).toEqual([
      ['products', '340', '100'],
      ['storage_mb', '2.9 GB', '2 GB'],
      ['staff', '4', '2'],
    ]);
  });

  it('writes a term in the language shown', () => {
    const term = { labelBn: '1 মাস', labelEn: '1 month' };
    expect(termLabel(term, 'bn')).toBe('1 মাস');
    expect(termLabel(term, 'en')).toBe('1 month');
  });
});

describe('limits and sizes as a seller reads them', () => {
  it('writes a limit, unlimited, or nothing when the plan does not set it', () => {
    expect(limitFigure('products', 5000)).toBe('5,000');
    expect(limitFigure('products', null)).toBe('∞');
    expect(limitFigure('products', undefined)).toBeNull();
    expect(limitFigure('storage_mb', 250)).toBe('250 MB');
    expect(limitFigure('bandwidth_gb', 10)).toBe('10 GB');
    expect(megabytes(8192)).toBe('8 GB');
  });

  it("writes an export's size and an English list's first word", () => {
    expect(fileSize(18 * 1024 * 1024)).toBe('18 MB');
    expect(fileSize(300)).toBe('1 KB');
    expect(sentenceCase('products 100 → 25')).toBe('Products 100 → 25');
    expect(sentenceCase('প্রোডাক্ট 100 → 25')).toBe('প্রোডাক্ট 100 → 25');
  });
});

describe('dates in sentences (BRAND-IDENTITY §5)', () => {
  // 7 Dec 2026, 02:00 in Dhaka.
  const iso = '2026-12-06T20:00:00.000Z';

  it("writes a day with its year as the sketch's toasts do, in Dhaka's calendar", () => {
    expect(formatDayMonthYear(iso)).toBe('7 Dec 2026');
    // September is "Sep", as the sketch writes it, not en-GB's "Sept".
    expect(formatDayMonthYear('2026-09-10T06:00:00.000Z')).toBe('10 Sep 2026');
    expect(formatDayMonth('2026-09-10T06:00:00.000Z')).toBe('10 Sep');
  });

  it('names the month in Bangla with Western digits', () => {
    expect(formatLongDate(iso, 'bn')).toBe('7 ডিসেম্বর 2026');
    expect(formatLongDate(iso, 'en')).toBe('7 Dec 2026');
    expect(formatMonth(iso, 'en')).toBe('December');
    expect(formatMonth(iso, 'bn')).toBe('ডিসেম্বর');
  });
});
