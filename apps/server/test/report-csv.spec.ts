import { describe, expect, it } from 'vitest';
import { ConsumerMetric, TenantState } from '@lytronix/validators';
import { consumersCsv, shopsCsv } from '../src/modules/reports/services/report-csv';
import type { ConsumersReport, ShopsReport } from '../src/modules/reports/services/reports';

// ADM-09, D8-41, D8-46 (Phase 8 close-out review C, F2): the shops CSV carries today's counts by state and by plan, as
// the JSON's `now` does, pay-as-you-go its own line; the top consumers CSV ends with a total.
const shops: ShopsReport = {
  dateFrom: '2026-10-01',
  dateTo: '2026-10-31',
  now: {
    total: 9,
    byState: [
      { state: TenantState.Active, count: 5 },
      { state: TenantState.PayAsYouGo, count: 2 },
      { state: TenantState.Trial, count: 2 },
    ],
    byPlan: [
      { planId: 'plan-basic', planName: 'Basic', payAsYouGo: false, count: 5 },
      { planId: null, planName: null, payAsYouGo: true, count: 2 },
      { planId: 'plan-trial', planName: 'Trial', payAsYouGo: false, count: 1 },
      { planId: null, planName: null, payAsYouGo: false, count: 1 },
    ],
  },
  buckets: [
    { from: '2026-10-01', to: '2026-10-15', opened: 3, becamePaying: 1, lapsed: 0 },
    { from: '2026-10-16', to: '2026-10-31', opened: 1, becamePaying: 0, lapsed: 2 },
  ],
  total: { opened: 4, becamePaying: 1, lapsed: 2 },
};

describe('the shops CSV (D8-41, D8-46)', () => {
  it("keeps each period's row and the total, then today's counts by state and by plan", () => {
    const csv = shopsCsv(shops);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.slice(1).split('\n')).toEqual([
      'from,to,opened,became_paying,lapsed',
      '2026-10-01,2026-10-15,3,1,0',
      '2026-10-16,2026-10-31,1,0,2',
      '2026-10-01,2026-10-31,4,1,2',
      '',
      'state,shops',
      'active,5',
      'pay_as_you_go,2',
      'trial,2',
      '',
      'plan,shops',
      'Basic,5',
      // ADM-09, PYG-13: pay-as-you-go is its own line, whatever plan its shops still point at.
      'pay_as_you_go,2',
      'Trial,1',
      'none,1',
    ]);
  });
});

describe('the top consumers CSV (D8-42, D8-46)', () => {
  it("lists each shop with its owner's phone, then a total", () => {
    const report: ConsumersReport = {
      dateFrom: '2026-10-01',
      dateTo: '2026-10-31',
      metric: ConsumerMetric.Sms,
      shops: [
        { id: 'a', name: 'Joy Pharmacy', slug: 'joy', ownerPhone: '01711000001', value: 30 },
        { id: 'b', name: 'Keya Boutique', slug: 'keya', ownerPhone: null, value: 12 },
      ],
    };
    expect(consumersCsv(report).slice(1).split('\n')).toEqual([
      'shop,address,owner_phone,sms_units',
      'Joy Pharmacy,joy,01711000001,30',
      'Keya Boutique,keya,,12',
      'total,,,42',
    ]);
    expect(
      consumersCsv({ ...report, metric: ConsumerMetric.Storage, shops: [] })
        .slice(1)
        .split('\n'),
    ).toEqual(['shop,address,owner_phone,bytes', 'total,,,0']);
  });
});
