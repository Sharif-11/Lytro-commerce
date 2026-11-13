import { describe, expect, it } from 'vitest';
import { textField } from '../src/common/text';
import { fieldProblemsOf } from '../src/validation/field-problems';
import { FieldProblemCode } from '../src/validation/field-problem';

// SEC-12, SEC-13 (Phase 9 Slice 9.7): free text a person types is trimmed, not blank, bounded, and holds no control
// character but a tab or a line break.
describe('textField', () => {
  const field = textField(60);

  function problemOf(value: string): FieldProblemCode | undefined {
    const result = field.safeParse(value);
    return result.success ? undefined : fieldProblemsOf(result.error)[0]?.problem;
  }

  it('takes Bangla and English text, with a line break and a tab', () => {
    const text = 'বাড়ি ১২, রোড ৪\nHouse 12,\tRoad 4\r\nধানমন্ডি';
    expect(field.parse(text)).toBe(text);
  });

  it('refuses a control character', () => {
    for (const control of ['\u0000', '\u001b', '\u007f']) {
      expect(problemOf(`Road${control}4`), JSON.stringify(control)).toBe(
        FieldProblemCode.InvalidFormat,
      );
    }
  });

  it('trims', () => {
    expect(field.parse('  রোড ৪ \n')).toBe('রোড ৪');
  });

  it('refuses blank text', () => {
    expect(problemOf('')).toBe(FieldProblemCode.Required);
    expect(problemOf(' \n\t ')).toBe(FieldProblemCode.Required);
  });

  it('refuses text over its longest', () => {
    expect(field.safeParse('a'.repeat(60)).success).toBe(true);
    expect(problemOf('a'.repeat(61))).toBe(FieldProblemCode.TooLong);
  });
});
