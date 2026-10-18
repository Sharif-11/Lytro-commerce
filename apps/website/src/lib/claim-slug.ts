import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '@lytronix/validators/common';

export interface SlugRule {
  pattern: RegExp;
  maxLength: number;
}

/** The claim box turns whatever a seller types into the shape a shop address must have (AUTH-11): lowercase
    a–z, 0–9 and hyphens, no leading or trailing hyphen. The dashboard's create-shop step re-checks it
    against the same shared rule and against availability; this only keeps the two in step before the hand-off. */
export class ClaimSlug {
  constructor(
    private readonly rule: SlugRule = { pattern: SLUG_PATTERN, maxLength: SLUG_MAX_LENGTH },
  ) {}

  normalise(input: string): string {
    return input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, this.rule.maxLength)
      .replace(/-+$/g, '');
  }

  isValid(slug: string): boolean {
    return this.rule.pattern.test(slug);
  }
}
