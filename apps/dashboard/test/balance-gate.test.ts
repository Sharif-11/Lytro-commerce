import { describe, expect, it } from 'vitest';
import { orderFeeOf, shortOf } from '../src/lib/balance-gate';

// The owner, 2026-11-19: an action the balance can't cover is greyed out, with what it needs and what the balance holds.

describe('the balance gates', () => {
  it("works an order's fee out as the server does: the greater of the minimum and the percentage, to the paisa", () => {
    // 1.5% of ৳1,000 is ৳15, under the ৳20 minimum.
    expect(orderFeeOf('1000.00', '20.0000', '1.5000')).toBe(20);
    // 1.5% of ৳3,470 is ৳52.05.
    expect(orderFeeOf('3470.00', '20.0000', '1.5000')).toBe(52.05);
    // 1.5% of ৳1,333.33 is ৳19.99995, rounded half away from zero to ৳20.00; and 2.5% of ৳1,001 is ৳25.025 → ৳25.03.
    expect(orderFeeOf('1333.33', '0.0000', '1.5000')).toBe(20);
    expect(orderFeeOf('1001.00', '0.0000', '2.5000')).toBe(25.03);
    expect(orderFeeOf('500.00', '0.0000', '0.0000')).toBe(0);
  });

  it('is short only when something is needed and the balance holds less, to the paisa', () => {
    expect(shortOf(10, 0.5)).toEqual({ need: 10, have: 0.5 });
    expect(shortOf(10, 10)).toBeNull();
    expect(shortOf(0.1, 0.1 + 0.2 - 0.2)).toBeNull();
    expect(shortOf(0, 0)).toBeNull();
    expect(shortOf(null, 0)).toBeNull();
    expect(shortOf(10, null)).toBeNull();
    expect(shortOf(20, -3)).toEqual({ need: 20, have: -3 });
  });
});
