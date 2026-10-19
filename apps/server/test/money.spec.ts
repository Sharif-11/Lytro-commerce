import { describe, expect, it } from 'vitest';
import {
  divideRounded,
  fromPaisa,
  percentOf,
  rateToPaisa,
  toPaisa,
  unitsTimesRate,
} from '../src/modules/balance/services/money';

describe('money (DAT-05, BAL-16)', () => {
  it('parses taka into paisa and back, refusing more than two decimals', () => {
    expect(toPaisa('12.5')).toBe(1250n);
    expect(toPaisa('-0.05')).toBe(-5n);
    expect(fromPaisa(-1250n)).toBe('-12.50');
    expect(() => toPaisa('0.5500')).toThrow('not a decimal amount');
    expect(() => toPaisa('--5.00')).toThrow('not a decimal amount');
  });

  it('rounds half away from zero', () => {
    expect(divideRounded(825n, 10n)).toBe(83n);
    expect(divideRounded(824n, 10n)).toBe(82n);
    expect(divideRounded(-825n, 10n)).toBe(-83n);
  });

  it('BAL-16: units x rate is exact and rounded to the paisa, for a rate of up to four decimals', () => {
    expect(unitsTimesRate('2', '0.55')).toBe(110n);
    expect(unitsTimesRate('2', '0.5500')).toBe(110n);
    expect(unitsTimesRate('1.5', '0.55')).toBe(83n); // 0.825
    expect(unitsTimesRate('3', '0.5525')).toBe(166n); // 1.6575
    expect(() => unitsTimesRate('1', '0.55251')).toThrow('not a decimal amount');
  });

  it('turns a flat rate and a percentage into paisa, rounded', () => {
    expect(rateToPaisa('20.0000')).toBe(2000n);
    expect(rateToPaisa('0.0050')).toBe(1n);
    expect(percentOf(toPaisa('5000.00'), '1.5000')).toBe(7500n);
    expect(percentOf(toPaisa('1234.56'), '1.5')).toBe(1852n); // 18.5184
  });
});
