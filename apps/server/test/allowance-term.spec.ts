import { describe, expect, it } from 'vitest';
import { AddonKind, AddonRenewal } from '@lytronix/validators';
import { allowanceUnitUses } from '../src/modules/billing/services/addon-price';
import { carriedUnitSize, renewalBar } from '../src/modules/billing/services/addon-renewal.service';

// PLN-20, D7-64 (KNOWN-GAPS §131, the owner's answers 2026-11-07): an allowance gives its monthly uses for each month
// paid for, prorated exactly as its price, in one pool; and it renews with the plan.
const PLAN = { limits: { products: 100 }, features: {} };
const READS = {
  kind: AddonKind.Allowance,
  key: 'address_reads_200',
  limitKey: 'address_reads',
  retiredAt: null,
};

describe('the uses an allowance gives (D7-64)', () => {
  it('gives its monthly uses for each month paid for', () => {
    expect(allowanceUnitUses(200, '20', 1, '20.00')).toBe(200);
    expect(allowanceUnitUses(200, '20', 1, '120.00')).toBe(1_200);
  });

  it('prorates the uses exactly as the price, never more than was paid for', () => {
    expect(allowanceUnitUses(200, '20', 1, '10.00')).toBe(100);
    expect(allowanceUnitUses(200, '20', 1, '13.00')).toBe(130);
  });

  it('counts one unit of several bought together', () => {
    expect(allowanceUnitUses(200, '20', 2, '40.00')).toBe(200);
    expect(allowanceUnitUses(200, '20', 3, '360.00')).toBe(1_200);
  });

  it("keeps the month's uses for an allowance given free", () => {
    expect(allowanceUnitUses(200, '0', 1, '0.00')).toBe(200);
  });
});

describe('renewing an allowance (PLN-20, D7-64)', () => {
  it('renews with the plan, though it raises no limit', () => {
    expect(renewalBar(READS, PLAN)).toBeNull();
    expect(renewalBar({ ...READS, retiredAt: new Date() }, PLAN)).toBe(AddonRenewal.Retired);
  });

  it("counts a carried allowance's uses for the new period from the catalogue's monthly uses", () => {
    const carried = {
      kind: AddonKind.Allowance,
      unitSize: 130,
      monthlyUnitSize: 200,
      price: '20',
      quantity: 1,
    };
    expect(carriedUnitSize(carried, '120.00')).toBe(1_200);
    expect(carriedUnitSize(carried, '20.00')).toBe(200);
  });

  it("keeps a limit's size as it was bought", () => {
    const limit = {
      kind: AddonKind.Limit,
      unitSize: 500,
      monthlyUnitSize: 1_000,
      price: '149',
      quantity: 2,
    };
    expect(carriedUnitSize(limit, '1788.00')).toBe(500);
  });
});
