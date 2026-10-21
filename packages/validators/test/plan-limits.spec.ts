import { describe, expect, it } from 'vitest';
import { LIMIT_WHEN_UNSET, limitOf, withOverrides } from '../src';

// PLN-11, PLN-19: a shop's limits are its snapshot with its overrides laid over it, and one table says what a limit
// means when they set none.
describe("a shop's limits", () => {
  it('reads a number as a cap, null as unlimited, and a missing key from the one table', () => {
    const limits = { products: 100, storage_mb: null };
    expect(limitOf(limits, 'products')).toBe(100);
    expect(limitOf(limits, 'storage_mb')).toBeNull();
    expect(limitOf(limits, 'staff')).toBe(1);
    expect(limitOf(limits, 'requests_monthly')).toBe(20_000);
    expect(limitOf(null, 'bandwidth_gb')).toBe(LIMIT_WHEN_UNSET.bandwidth_gb);
  });

  it('lets an override win over the snapshot, unlimited included', () => {
    const limits = withOverrides({ products: 100, staff: 2 }, [
      { limitKey: 'products', value: 500 },
      { limitKey: 'staff', value: null },
    ]);
    expect(limitOf(limits, 'products')).toBe(500);
    expect(limitOf(limits, 'staff')).toBeNull();
  });
});
