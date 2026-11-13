import { describe, expect, it } from 'vitest';
import type { CapacityFigures } from '@lytronix/db';
import { CapacityCheck } from '../src/modules/monitoring/services/capacity-check';

// DAT-55 (Slice 9.6): when paying shops or the plans' revenue say the second server is due, and how often it's told.
interface Sent {
  subject: string;
  body: string;
}

function checkOf(figures: CapacityFigures, cost?: number, claimed = new Set<string>()) {
  const sent: Sent[] = [];
  const check = new CapacityCheck(
    { capacityFigures: () => Promise.resolve(figures) },
    {
      alert: (subject, body) => {
        sent.push({ subject, body });
        return Promise.resolve(1);
      },
    },
    {
      // A lease taken once stays taken: the same reason within 30 days isn't told again.
      once: (key) => {
        if (claimed.has(key)) return Promise.resolve(false);
        claimed.add(key);
        return Promise.resolve(true);
      },
    },
    { SECOND_SERVER_MONTHLY_TAKA: cost },
    () => new Date('2026-11-13T03:10:00Z'),
  );
  return { check, sent };
}

describe('the second server check (DAT-55)', () => {
  it('says nothing below 30 paying shops, with no server cost set', async () => {
    const { check, sent } = checkOf({ payingShops: 29, monthlyRevenue: 1_000_000 });
    expect((await check.run()).told).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('tells the operators at 30 paying shops', async () => {
    const { check, sent } = checkOf({ payingShops: 30, monthlyRevenue: 0 });
    expect((await check.run()).told).toEqual(['capacity:paying-shops']);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).toContain('30 shops pay for a plan');
  });

  it('tells them when revenue passes 4 times the second server’s cost, and not at it', async () => {
    expect(
      (await checkOf({ payingShops: 5, monthlyRevenue: 4000 }, 1000).check.run()).told,
    ).toEqual([]);
    const { check, sent } = checkOf({ payingShops: 5, monthlyRevenue: 4000.5 }, 1000);
    expect((await check.run()).told).toEqual(['capacity:revenue']);
    expect(sent[0]?.body).toContain('4000.50 TK a month');
  });

  it('tells both reasons in one email, then neither again while they were told lately', async () => {
    const claimed = new Set<string>();
    const first = checkOf({ payingShops: 31, monthlyRevenue: 50_000 }, 3000, claimed);
    expect((await first.check.run()).told).toEqual(['capacity:paying-shops', 'capacity:revenue']);
    expect(first.sent).toHaveLength(1);
    const again = checkOf({ payingShops: 32, monthlyRevenue: 60_000 }, 3000, claimed);
    expect((await again.check.run()).told).toEqual([]);
    expect(again.sent).toEqual([]);
  });
});
