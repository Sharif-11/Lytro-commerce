import { describe, expect, it } from 'vitest';
import { code128 } from '../src/lib/code128';

// A label's barcode of the order number (Slice 4.8a, ORD-19 amended): Code 128 in set B.

describe('code128', () => {
  it('starts in set B, ends with its checksum and the stop', () => {
    // The standard's worked example: "PJJ123C" in set B has checksum 55.
    const modules = code128('PJJ123C');
    expect(modules).toHaveLength(11 * 9 + 13);
    expect(modules.slice(0, 11)).toBe('11010010000');
    expect(modules.slice(-24, -13)).toBe('11101000110');
    expect(modules.slice(-13)).toBe('1100011101011');
  });

  it('writes each character as three bars and three spaces in eleven modules', () => {
    const modules = code128('261031-0047');
    expect(modules).toHaveLength(11 * 13 + 13);
    for (let at = 0; at < modules.length - 13; at += 11) {
      const symbol = modules.slice(at, at + 11);
      expect(symbol.startsWith('1') && symbol.endsWith('0'), symbol).toBe(true);
      expect(symbol.match(/1+/g)).toHaveLength(3);
    }
  });

  it('refuses a character outside set B', () => {
    expect(() => code128('৳')).toThrow();
  });
});
