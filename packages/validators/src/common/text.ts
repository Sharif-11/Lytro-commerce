import { z } from 'zod';

// SEC-13: the control characters free text may not hold -- every one but a tab, a line feed and a carriage return.
// eslint-disable-next-line no-control-regex -- the control characters are what it looks for
const NO_CONTROL_CHARACTERS = /^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/;

/**
 * SEC-12, SEC-13 (Phase 9 Slice 9.7): free text a person types: trimmed, not blank, at most `max` characters, no control
 * character but a tab or a line break. Kept as typed and escaped where it is shown, never stripped.
 */
export function textField(max: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(NO_CONTROL_CHARACTERS, { message: 'No control characters.' });
}
