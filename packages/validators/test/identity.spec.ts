import { describe, expect, it } from 'vitest';
import { createShopSchema, requestSigninCodeSchema, verifySigninCodeSchema } from '../src/index';

describe('sign-in request shapes (AUTH-05, AUTH-12)', () => {
  it('requires a six-digit code to verify', () => {
    const valid = { phone: '01711111111', code: '012345' };
    expect(verifySigninCodeSchema.safeParse(valid).success).toBe(true);
    expect(verifySigninCodeSchema.safeParse({ ...valid, code: '12345' }).success).toBe(false);
    expect(verifySigninCodeSchema.safeParse({ ...valid, code: 'abcdef' }).success).toBe(false);
  });

  it('accepts a phone to request a code, and refuses a missing one', () => {
    expect(requestSigninCodeSchema.safeParse({ phone: '01711111111' }).success).toBe(true);
    expect(requestSigninCodeSchema.safeParse({}).success).toBe(false);
  });
});

describe('create-shop request shape (AUTH-01, AUTH-10)', () => {
  const base = { ownerName: 'Rahim' };

  it('trims names and refuses blank or over-long ones (60 characters)', () => {
    const trimmed = createShopSchema.parse({ ...base, shopName: '  Shop  ' });
    expect(trimmed.shopName).toBe('Shop');
    expect(createShopSchema.safeParse({ ...base, shopName: '   ' }).success).toBe(false);
    expect(createShopSchema.safeParse({ ...base, shopName: 'a'.repeat(61) }).success).toBe(false);
    expect(createShopSchema.safeParse({ ...base, shopName: 'a'.repeat(60) }).success).toBe(true);
  });

  it('does not take a phone or code, since the session already proves the identity', () => {
    const parsed = createShopSchema.parse({ ...base, shopName: 'Shop', phone: '01711111111' });
    expect(parsed).not.toHaveProperty('phone');
  });
});
