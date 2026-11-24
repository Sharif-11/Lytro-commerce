import { describe, expect, it } from 'vitest';
import { LedgerEntryType, listLedgerSchema } from '@lytronix/validators';
import { ledgerPageSchema } from '../src/modules/team/dto/balance-response.dto';
import { revenueReportSchema } from '../src/modules/team/dto/operator-reports.dto';

// ENGINEERING-STANDARDS §5, recipe 6: this release runs beside the next one while it deploys, and is what a rollback
// of it goes back to. A ledger kind the next release adds (pay-as-you-go's `order_unlock` and `api_requests`) must
// not fail the statement or the revenue report here: CI's previous-release job found GET /balance/ledger answering
// 500 for them.
const LATER_KINDS = ['order_unlock', 'api_requests'];

const row = (type: string): Record<string, unknown> => ({
  id: 1,
  type,
  amount: '-7.00',
  units: null,
  rateUsed: null,
  reference: { orderId: 'order-1', step: 'phone' },
  balanceAfter: '93.00',
  createdAt: new Date('2026-11-24T06:00:00Z'),
});

const figures = (balance: Record<string, string>): Record<string, unknown> => ({
  wallet: { purchase: '0.00', renewal: '0.00', upgrade: '0.00', addon: '0.00' },
  balance,
  givenBack: '0.00',
  manual: { plans: '0.00', plansReversed: '0.00', topUps: '0.00', topUpsReversed: '0.00' },
  earned: '0.00',
});

describe('ledger kinds a later release adds (ENGINEERING-STANDARDS §5, recipe 6)', () => {
  it("answers the statement's rows of a kind this release doesn't name, as they are", () => {
    const page = ledgerPageSchema.parse({
      entries: [row(LedgerEntryType.Sms), ...LATER_KINDS.map(row)],
      nextCursor: null,
    });
    expect(page.entries.map((entry) => entry.type)).toEqual([LedgerEntryType.Sms, ...LATER_KINDS]);
  });

  it('answers the revenue report with a later kind in its balance figures', () => {
    const balance = {
      [LedgerEntryType.Sms]: '-1.10',
      order_unlock: '-10.00',
      api_requests: '-1.00',
    };
    const report = revenueReportSchema.parse({
      dateFrom: '2026-11-01',
      dateTo: '2026-11-24',
      buckets: [{ ...figures(balance), from: '2026-11-01', to: '2026-11-24' }],
      total: figures(balance),
      recordedSince: null,
    });
    expect(report.total.balance).toEqual(balance);
  });

  it('still refuses a row with no type', () => {
    expect(ledgerPageSchema.safeParse({ entries: [row('')], nextCursor: null }).success).toBe(
      false,
    );
  });

  it('filters only by the kinds this release names', () => {
    expect(listLedgerSchema.safeParse({ type: 'sms' }).success).toBe(true);
    for (const kind of LATER_KINDS) {
      expect(listLedgerSchema.safeParse({ type: kind }).success).toBe(false);
    }
  });
});
