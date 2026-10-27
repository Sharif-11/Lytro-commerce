// Letters and digits that cannot be taken for one another when read out or copied: no 0 or o, no 1, l or i.
export const PASSWORD_LETTERS = 'abcdefghjkmnpqrstuvwxyz23456789';

/** A random whole number below `below`, from the browser's cryptographic source. */
function secureBelow(below: number): number {
  const [value = 0] = crypto.getRandomValues(new Uint32Array(1));
  return value % below;
}

/**
 * The first password an owner reads out to a new staff member (STF-01, STF-13; the prototype's Part 11): two random
 * groups of four, `k7m4-p9qx`, sayable over the phone and inside the platform's length rule. Never the shop's name.
 * Changed at the first sign-in (AUTH-19).
 */
export class FirstPassword {
  constructor(private readonly randomBelow: (below: number) => number = secureBelow) {}

  suggest(): string {
    const group = (): string =>
      Array.from({ length: 4 }, () =>
        PASSWORD_LETTERS.charAt(this.randomBelow(PASSWORD_LETTERS.length)),
      ).join('');
    return `${group()}-${group()}`;
  }
}

export const firstPassword = new FirstPassword();
