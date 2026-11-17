import { describe, expect, it } from 'vitest';
import { limitPartsOf, shopLimitsOf, type PlanLimits } from '../src/db/plans/plan-limits';

// PLN-11, PLN-13: the operator's shop page shows how a limit came to be, so its parts must agree with shopLimitsOf.
describe('limitPartsOf', () => {
  const snapshot = { products: 100, staff: 2, storage_mb: null };

  it('raises the plan by its add-ons', () => {
    expect(limitPartsOf(snapshot, null, { products: 500 })).toContainEqual({
      key: 'products',
      plan: 100,
      overridden: false,
      override: null,
      addons: 500,
      effective: 600,
    });
  });

  it("replaces the plan's value with an override, and raises that", () => {
    expect(limitPartsOf(snapshot, { products: 250 }, { products: 500 })).toContainEqual({
      key: 'products',
      plan: 100,
      overridden: true,
      override: 250,
      addons: 500,
      effective: 750,
    });
  });

  it('tells an unlimited override from no override, and add-ons do not lift unlimited', () => {
    expect(limitPartsOf(snapshot, { staff: null }, { staff: 3 })).toContainEqual({
      key: 'staff',
      plan: 2,
      overridden: true,
      override: null,
      addons: 3,
      effective: null,
    });
    expect(limitPartsOf(snapshot, null, null)).toContainEqual({
      key: 'storage_mb',
      plan: null,
      overridden: false,
      override: null,
      addons: 0,
      effective: null,
    });
  });

  it('lists a limit only an override names', () => {
    expect(limitPartsOf(snapshot, { new_limit: 7 }, null)).toContainEqual({
      key: 'new_limit',
      plan: null,
      overridden: true,
      override: 7,
      addons: 0,
      effective: 7,
    });
  });

  it("leaves out a retired limit a shop's snapshot or override still names (D9-31)", () => {
    const stored = { ...snapshot, bandwidth_gb: 10 } as PlanLimits;
    const parts = limitPartsOf(stored, { bandwidth_gb: 20 }, null);
    expect(parts.map((part) => part.key)).not.toContain('bandwidth_gb');
  });

  it('has no parts for a shop with no plan', () => {
    expect(limitPartsOf(null, null, null)).toEqual([]);
  });

  it("agrees with shopLimitsOf on every limit's effective value", () => {
    const overrides = { staff: 9 };
    const addons = { products: 500, staff: 1 };
    const held = shopLimitsOf(
      snapshot,
      [{ limitKey: 'staff', value: 9 }],
      [
        { limitKey: 'products', units: 500 },
        { limitKey: 'staff', units: 1 },
      ],
    ) as Record<string, unknown>;
    for (const part of limitPartsOf(snapshot, overrides, addons)) {
      expect(part.effective, part.key).toEqual(held[part.key] ?? null);
    }
  });
});
