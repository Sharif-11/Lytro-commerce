import { describe, expect, it } from 'vitest';
import { setPasswordSchema } from '../src/index';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../src/common/limits';

describe('password length rules (AUTH-03, D2, P1-E15)', () => {
  it('refuses seven characters, one below the minimum', () => {
    const result = setPasswordSchema.safeParse({
      newPassword: 'a'.repeat(PASSWORD_MIN_LENGTH - 1),
    });
    expect(result.success).toBe(false);
  });

  it('accepts eight characters, the minimum', () => {
    const result = setPasswordSchema.safeParse({ newPassword: 'a'.repeat(PASSWORD_MIN_LENGTH) });
    expect(result.success).toBe(true);
  });

  it('accepts twenty characters, the maximum', () => {
    const result = setPasswordSchema.safeParse({ newPassword: 'a'.repeat(PASSWORD_MAX_LENGTH) });
    expect(result.success).toBe(true);
  });

  it('refuses twenty-one characters, one past the maximum', () => {
    const result = setPasswordSchema.safeParse({
      newPassword: 'a'.repeat(PASSWORD_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });
});
