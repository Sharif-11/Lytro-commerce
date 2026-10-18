import { describe, expect, it } from 'vitest';
import { countSmsParts } from '../src/modules/shared/messaging/sms-parts';

describe('countSmsParts (AUTH-21)', () => {
  it('plain ASCII up to 160 characters is one GSM-7 part', () => {
    const body = 'Your shop is ready: http://example.lytro.app';
    expect(countSmsParts(body)).toMatchObject({ encoding: 'gsm7', parts: 1 });
  });

  it('plain ASCII over 160 characters splits into concatenated 153-character parts', () => {
    const body = 'A'.repeat(200);
    const result = countSmsParts(body);
    expect(result.encoding).toBe('gsm7');
    expect(result.units).toBe(200);
    expect(result.parts).toBe(Math.ceil(200 / 153));
  });

  it('an extended-table character (e.g. "{") costs two septets, not one', () => {
    const body = 'A'.repeat(159) + '{'; // 159 + 2 = 161 units -- just over the 160 single-part limit
    const result = countSmsParts(body);
    expect(result.units).toBe(161);
    expect(result.parts).toBe(2);
  });

  it('Bangla text forces UCS-2 encoding, 70 characters per single part', () => {
    const body = 'ক'.repeat(70);
    expect(countSmsParts(body)).toMatchObject({ encoding: 'ucs2', units: 70, parts: 1 });
  });

  it('Bangla text over 70 characters splits into concatenated 67-character parts', () => {
    const body = 'ক'.repeat(71);
    const result = countSmsParts(body);
    expect(result.encoding).toBe('ucs2');
    expect(result.parts).toBe(2);
  });

  it('a single non-GSM-7 character anywhere in an otherwise-plain body forces UCS-2 for the whole thing', () => {
    const body = 'Apnar dokan ready. ধন্যবাদ';
    expect(countSmsParts(body).encoding).toBe('ucs2');
  });
});
