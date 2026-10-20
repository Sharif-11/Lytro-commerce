import { describe, expect, it } from 'vitest';
import { isValidImei, normalizeSerial, SerialFormat, serialProblem } from '@lytronix/validators';
import { readSerials } from '../src/common/serial-entry';

describe('serial numbers (INV-14, INV-23)', () => {
  it('checks an IMEI for 15 digits and its Luhn check digit', () => {
    expect(isValidImei('490154203237518')).toBe(true);
    expect(isValidImei('352099001761481')).toBe(true);
    expect(isValidImei('490154203237519')).toBe(false); // the check digit off by one
    expect(isValidImei('49015420323751')).toBe(false); // 14 digits
    expect(isValidImei('49015420323751X')).toBe(false);
  });

  it('stores an IMEI as its digits, and any other serial trimmed and upper-cased', () => {
    expect(normalizeSerial('35 209900 176148 1', SerialFormat.Imei)).toBe('352099001761481');
    expect(normalizeSerial('35-209900-176148-1', SerialFormat.Imei)).toBe('352099001761481');
    expect(normalizeSerial('  abc-1 ', SerialFormat.Any)).toBe('ABC-1');
  });

  it('names what is wrong with a serial for its format', () => {
    expect(serialProblem('490154203237518', SerialFormat.Imei)).toBeNull();
    expect(serialProblem('490154203237519', SerialFormat.Imei)).toBe('bad_check_digit');
    expect(serialProblem('4901542032', SerialFormat.Imei)).toBe('not_imei');
    expect(serialProblem('SN-77', SerialFormat.Any)).toBeNull();
    expect(serialProblem('SN_77', SerialFormat.Any)).toBe('bad_characters');
    expect(serialProblem('   ', SerialFormat.Any)).toBe('empty');
    expect(serialProblem('A'.repeat(65), SerialFormat.Any)).toBe('too_long');
  });

  it('reads an entry line by line, flagging each bad or repeated line by its place', () => {
    const read = readSerials(
      ['490154203237518', '490154203237519', '4901 5420 3237 518', 'short'],
      SerialFormat.Imei,
      'serials',
    );
    expect(read.serials).toEqual(['490154203237518']);
    expect(read.problems.map((problem) => [problem.field, problem.problem])).toEqual([
      ['serials.1', 'invalid_format'],
      ['serials.2', 'not_allowed'],
      ['serials.3', 'invalid_format'],
    ]);
  });
});
