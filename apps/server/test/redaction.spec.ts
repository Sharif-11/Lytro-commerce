import { describe, expect, it } from 'vitest';
import { redactText, redactValue } from '../src/common/logging/redaction';

// LOG-02, D9-20, OBS-03 (Slice 9.6): what a log line or a reported error may never carry.
describe('the redaction list', () => {
  it('masks named secrets, codes and payment details in free text, keeping the names', () => {
    expect(redactText('login failed password=hunter2 for shop')).toBe(
      'login failed password=[masked] for shop',
    );
    expect(redactText('{"otpCode":"482913","shop":"x"}')).toBe('{"otpCode":"[masked]","shop":"x"}');
    expect(redactText("x-api-key: 'abc123' sent")).toBe("x-api-key: '[masked]' sent");
    expect(redactText('verified trxId=BFT7XYZ12A amount=500')).toBe(
      'verified trxId=[masked] amount=500',
    );
    expect(redactText('Authorization: Bearer eyJhbGciOi.payload.sig')).toBe(
      'Authorization: [masked]',
    );
    expect(redactText('authorization=Token abc def, next')).toBe('authorization=[masked], next');
    expect(redactText('sent with Bearer eyJhbGciOi.payload.sig')).toBe('sent with Bearer [masked]');
  });

  it('keeps what logs need: an error code, a status code, an ID, an amount', () => {
    const line =
      'code=23505 status_code=500 tenant=6f1c2b7e-1d2a-4c3b-9e8f-0a1b2c3d4e5f amount=1500.00';
    expect(redactText(line)).toBe(line);
  });

  it('shows a phone’s last 4 digits only, with or without the country code', () => {
    expect(redactText('sms to 01712345678 sent')).toBe('sms to *******5678 sent');
    expect(redactText('from +8801812345678.')).toBe('from *******5678.');
    expect(redactText('order 2611130042 placed')).toBe('order 2611130042 placed');
  });

  it('masks a public key, a card number and any long random token', () => {
    expect(redactText('key lytro_pk_AbCdEfGhIjKlMnOpQrStUvWxYz012345 refused')).toBe(
      'key lytro_pk_[masked] refused',
    );
    expect(redactText('card 4111 1111 1111 1111 declined')).toBe('card [masked] declined');
    expect(
      redactText('hash 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'),
    ).toBe('hash [masked]');
  });

  it('walks a value: a secret field masked whole, every string masked as text, the original untouched', () => {
    const original = {
      phone: '01712345678',
      nested: { apiKey: { any: 'shape' }, note: 'password=x', list: ['01912345678'] },
      count: 3,
      empty: null,
    };
    expect(redactValue(original)).toEqual({
      phone: '*******5678',
      nested: { apiKey: '[masked]', note: 'password=[masked]', list: ['*******5678'] },
      count: 3,
      empty: null,
    });
    expect(original.phone).toBe('01712345678');
  });
});
