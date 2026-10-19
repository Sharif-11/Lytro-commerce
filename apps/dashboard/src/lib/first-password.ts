import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@lytronix/validators';

/**
 * The first password an owner reads out to a new staff member (STF-01): the shop's slug and four digits, so
 * it is sayable over the phone, within the platform's length rule. Changed at the first sign-in (AUTH-19).
 */
export class FirstPassword {
  constructor(private readonly random: () => number = Math.random) {}

  suggest(slug: string): string {
    const digits = String(Math.floor(this.random() * 9000) + 1000);
    const base = `${slug.slice(0, PASSWORD_MAX_LENGTH - 5)}-${digits}`;
    return base.length >= PASSWORD_MIN_LENGTH
      ? base
      : `${base}-${digits}`.slice(0, PASSWORD_MAX_LENGTH);
  }
}

export const firstPassword = new FirstPassword();
