import { describe, expect, it } from 'vitest';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@lytronix/validators';
import { customerName, generatedPassword } from '@/views/customers/customer-words';

describe('a new password for a shopper (CUS-14)', () => {
  it('is always two words and four digits, within what the server takes', () => {
    for (let round = 0; round < 2000; round += 1) {
      const password = generatedPassword();
      expect(password).toMatch(/^[a-z]+-\d{4}-[a-z]+$/);
      expect(password.length).toBeGreaterThanOrEqual(PASSWORD_MIN_LENGTH);
      expect(password.length).toBeLessThanOrEqual(PASSWORD_MAX_LENGTH);
    }
  });

  it('is not the same each time', () => {
    const made = new Set(Array.from({ length: 50 }, generatedPassword));
    expect(made.size).toBeGreaterThan(40);
  });
});

describe('a customer as a row names them', () => {
  it('by their name, or their phone where a table left none', () => {
    expect(customerName({ name: 'Nusrat Jahan', phone: '01711234567' })).toBe('Nusrat Jahan');
    expect(customerName({ name: null, phone: '01711234567' })).toBe('01711 234 567');
    expect(customerName({ name: null, phone: null })).toBe('');
  });
});
