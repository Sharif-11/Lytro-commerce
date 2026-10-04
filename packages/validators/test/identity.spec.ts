import { describe, expect, it } from 'vitest';
import { completeSignupSchema, requestCodeSchema } from '../src/index';

describe('sign-up request shapes (AUTH-01, AUTH-05)', () => {
  it('requires a six-digit code', () => {
    const valid = { phone: '01711111111', code: '012345', ownerName: 'Rahim', shopName: 'Shop' };
    expect(completeSignupSchema.safeParse(valid).success).toBe(true);
    expect(completeSignupSchema.safeParse({ ...valid, code: '12345' }).success).toBe(false);
    expect(completeSignupSchema.safeParse({ ...valid, code: 'abcdef' }).success).toBe(false);
  });

  it('trims names and refuses blank or over-long ones (AUTH-01, 60 characters)', () => {
    const base = { phone: '01711111111', code: '012345', ownerName: 'Rahim' };
    const trimmed = completeSignupSchema.parse({ ...base, shopName: '  Shop  ' });
    expect(trimmed.shopName).toBe('Shop');
    expect(completeSignupSchema.safeParse({ ...base, shopName: '   ' }).success).toBe(false);
    expect(completeSignupSchema.safeParse({ ...base, shopName: 'a'.repeat(61) }).success).toBe(
      false,
    );
    expect(completeSignupSchema.safeParse({ ...base, shopName: 'a'.repeat(60) }).success).toBe(
      true,
    );
  });

  it('accepts a phone to request a code, and refuses a missing one', () => {
    expect(requestCodeSchema.safeParse({ phone: '01711111111' }).success).toBe(true);
    expect(requestCodeSchema.safeParse({}).success).toBe(false);
  });
});
