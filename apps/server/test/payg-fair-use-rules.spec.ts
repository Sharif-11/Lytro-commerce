import { describe, expect, it } from 'vitest';
import { OrderAccess, OrderSource, TenantState } from '@lytronix/validators';
import {
  accessForNewOrder,
  contactHidden,
  storefrontPaused,
  trackingShowsShopPhone,
} from '../src/modules/fair-use/services/fair-use-rules';
import {
  admitsNext,
  CHARGE_WARNED,
  chargeWarning,
  dueBlocks,
  type ChargeFigures,
} from '../src/modules/public-api/services/api-charge-rules';

// PAYG-FAIR-USE-PLAN PF-1, PF-13, PF-14, PF-15, PF-20, PF-36: the rules that need no database.
describe('which orders lock (PF-1, PF-20, PF-33)', () => {
  it('locks a pay-as-you-go shop’s order from the storefront, a landing page or its key, with fair use on', () => {
    for (const source of [OrderSource.Storefront, OrderSource.LandingPage, OrderSource.Api]) {
      expect(accessForNewOrder(true, TenantState.PayAsYouGo, source)).toBe(OrderAccess.Locked);
    }
  });

  it('never locks a dashboard order, a plan’s or a trial’s, or any with fair use off', () => {
    expect(accessForNewOrder(true, TenantState.PayAsYouGo, OrderSource.Dashboard)).toBe(
      OrderAccess.Open,
    );
    expect(accessForNewOrder(true, TenantState.Active, OrderSource.Storefront)).toBe(
      OrderAccess.Open,
    );
    expect(accessForNewOrder(true, TenantState.Trial, OrderSource.Storefront)).toBe(
      OrderAccess.Open,
    );
    expect(accessForNewOrder(false, TenantState.PayAsYouGo, OrderSource.Storefront)).toBe(
      OrderAccess.Open,
    );
  });
});

describe('the paused storefront and hidden contact (PF-13, PF-15)', () => {
  it('pauses a pay-as-you-go shop that never paid, only with fair use on', () => {
    expect(
      storefrontPaused(true, { state: TenantState.PayAsYouGo, storefrontActivatedAt: null }),
    ).toBe(true);
    expect(
      storefrontPaused(true, { state: TenantState.PayAsYouGo, storefrontActivatedAt: new Date() }),
    ).toBe(false);
    expect(storefrontPaused(true, { state: TenantState.Trial, storefrontActivatedAt: null })).toBe(
      false,
    );
    expect(
      storefrontPaused(false, { state: TenantState.PayAsYouGo, storefrontActivatedAt: null }),
    ).toBe(false);
  });

  it('hides contact on pay-as-you-go only', () => {
    expect(contactHidden(true, TenantState.PayAsYouGo)).toBe(true);
    expect(contactHidden(true, TenantState.Active)).toBe(false);
    expect(contactHidden(false, TenantState.PayAsYouGo)).toBe(false);
  });

  it("shows a hidden shop's phone on tracking once the order is past step 1 (PFQ-5)", () => {
    expect(trackingShowsShopPhone(true, OrderAccess.Locked)).toBe(false);
    for (const access of [OrderAccess.Phone, OrderAccess.Confirmed, OrderAccess.Open]) {
      expect(trackingShowsShopPhone(true, access)).toBe(true);
    }
    // A shop that shows its contact shows it on every page; tracking adds none.
    expect(trackingShowsShopPhone(false, OrderAccess.Open)).toBe(false);
  });
});

/** ৳1 per 1,000, a ৳200 cap and ৳100 in the balance, 10,000 free; `billable` and `billedBlocks` as given. */
function figures(
  billable: number,
  billedBlocks = 0,
  extra: Partial<ChargeFigures> = {},
): ChargeFigures {
  return {
    billable,
    billedBlocks,
    free: 10_000,
    ratePaisa: 100n,
    capPaisa: 20_000n,
    balancePaisa: 10_000n,
    ...extra,
  };
}

describe('the API charge (PF-14, PF-36)', () => {
  it('answers free up to the allowance, then while the balance covers the 1,000s not yet charged', () => {
    expect(admitsNext(figures(9_999))).toBe(true);
    expect(admitsNext(figures(10_000, 0, { balancePaisa: 0n }))).toBe(false);
    expect(admitsNext(figures(10_000, 0, { balancePaisa: 100n }))).toBe(true);
  });

  it('stops at the cap, and at a cap of ৳0 right after the free allowance', () => {
    // ৳200 at ৳1 per 1,000: 200,000 paid requests.
    expect(admitsNext(figures(210_000 - 1, 199, { balancePaisa: 1_000_000n }))).toBe(true);
    expect(admitsNext(figures(210_000, 200, { balancePaisa: 1_000_000n }))).toBe(false);
    expect(admitsNext(figures(10_000, 0, { capPaisa: 0n }))).toBe(false);
  });

  it('charges whole 1,000s only, within the cap and the balance, never twice', () => {
    expect(dueBlocks(figures(12_500))).toBe(2);
    expect(dueBlocks(figures(12_500, 2))).toBe(0);
    expect(dueBlocks(figures(500_000))).toBe(100);
    expect(dueBlocks(figures(500_000, 0, { balancePaisa: 1_000_000n }))).toBe(200);
    expect(dueBlocks(figures(12_500, 0, { ratePaisa: 0n }))).toBe(0);
  });

  it('warns at the free allowance, at four fifths of the cap, and when stopped', () => {
    expect(chargeWarning(figures(9_000), 0n)).toBe(CHARGE_WARNED.none);
    expect(chargeWarning(figures(10_000), 0n)).toBe(CHARGE_WARNED.freeUsed);
    expect(chargeWarning(figures(170_000, 160), 16_000n)).toBe(CHARGE_WARNED.nearCap);
    expect(chargeWarning(figures(10_000, 0, { capPaisa: 0n }), 0n)).toBe(CHARGE_WARNED.stopped);
  });
});
