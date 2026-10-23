import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@lytronix/validators';

// A Bangladeshi mobile number however it is written: 1XXXXXXXXX, 01XXXXXXXXX, 8801XXXXXXXXX or +8801XXXXXXXXX.
const MOBILE_NUMBER = /^(?:\+?88)?0?1[3-9]\d{8}$/;

export interface PasswordRuleCheck {
  /** AUTH-03: [8] to [20] characters. */
  length: boolean;
  /** At least one digit. */
  digit: boolean;
  /** Not a phone number -- the person's own included. */
  notPhone: boolean;
}

/**
 * The password step's three rules (ONBOARDING-FLOW-DESIGN §2 step 3, the prototype's `rules`), checked as the person
 * types. Decided 2026-10-23: the screens hold Save until all three pass; the server keeps AUTH-03's length rule.
 */
export function checkPassword(password: string): PasswordRuleCheck {
  return {
    length: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
    digit: /\d/.test(password),
    notPhone: password.length > 0 && !MOBILE_NUMBER.test(password.replace(/[\s-]/g, '')),
  };
}

export function passesEveryRule(check: PasswordRuleCheck): boolean {
  return check.length && check.digit && check.notPhone;
}
