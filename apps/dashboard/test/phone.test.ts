import { describe, expect, it } from 'vitest';
import { BangladeshiPhone } from '../src/lib/phone';

const phone = new BangladeshiPhone();

describe('BangladeshiPhone', () => {
  it('joins the fixed +880 prefix with whatever the person typed', () => {
    expect(phone.fromLocalPart('1712-345678')).toBe('+8801712345678');
    expect(phone.fromLocalPart('01712345678')).toBe('+8801712345678');
    expect(phone.fromLocalPart('8801712345678')).toBe('+8801712345678');
  });

  it('accepts only Bangladeshi mobile numbers', () => {
    expect(phone.isValid('+8801712345678')).toBe(true);
    expect(phone.isValid('+8801212345678')).toBe(false);
    expect(phone.isValid('+88017123')).toBe(false);
  });

  it('shows the local form with a hyphen', () => {
    expect(phone.display('+8801712345678')).toBe('01712-345678');
  });
});
