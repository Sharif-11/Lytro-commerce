import {
  FieldProblemCode,
  normalizeSerial,
  serialProblem,
  type SerialFormat,
  type SerialProblem,
} from '@lytronix/validators';
import type { MessageKey } from './i18n/message-key';
import type { InvalidField } from './api-error';

const PROBLEM_MESSAGE: Record<SerialProblem, MessageKey> = {
  empty: 'SerialInvalid',
  too_long: 'SerialInvalid',
  bad_characters: 'SerialInvalid',
  not_imei: 'NotAnImei',
  bad_check_digit: 'ImeiCheckDigitWrong',
};

/**
 * INV-14, INV-23: serials as entered (scanned, pasted or typed), as stored, with every line that cannot be: wrong for
 * the product's format, or listed twice in the same entry. Each problem names its line, `<field>.<index>`, so the
 * dashboard can flag it before anything is saved.
 */
export function readSerials(
  entered: readonly string[],
  format: SerialFormat,
  field: string,
): { serials: string[]; problems: InvalidField[] } {
  const seen = new Set<string>();
  const serials: string[] = [];
  const problems: InvalidField[] = [];
  entered.forEach((raw, index) => {
    const at = `${field}.${String(index)}`;
    const problem = serialProblem(raw, format);
    if (problem !== null) {
      problems.push({
        field: at,
        problem: FieldProblemCode.InvalidFormat,
        messageKey: PROBLEM_MESSAGE[problem],
      });
      return;
    }
    const serial = normalizeSerial(raw, format);
    if (seen.has(serial)) {
      problems.push({
        field: at,
        problem: FieldProblemCode.NotAllowed,
        messageKey: 'SerialRepeated',
      });
      return;
    }
    seen.add(serial);
    serials.push(serial);
  });
  return { serials, problems };
}
