import { Inject, Injectable } from '@nestjs/common';
import { isValidSlug } from './host';
import { stripNumericSuffix, suffixCandidates, suggestBase } from './slug-rules';
import { SLUG_AVAILABILITY } from './tokens';

// Which of a batch of candidate slugs are held by a shop or reserved. Implemented over the database.
export interface SlugAvailability {
  findUnavailable(slugs: string[]): Promise<Set<string>>;
}

export type AddressCheck =
  | { ok: true; address: string }
  | { ok: false; reason: 'format' | 'unavailable'; suggestion: string | null };

/**
 * AUTH-11: suggests and checks shop addresses. The database unique constraint is still the final
 * check when a shop is created, so two sign-ups racing for the same address cannot both succeed.
 */
@Injectable()
export class SlugService {
  constructor(@Inject(SLUG_AVAILABILITY) private readonly availability: SlugAvailability) {}

  /** Pre-fills the address field. Null when the name has no Latin letters, or when no candidate is free. */
  async suggest(shopName: string): Promise<string | null> {
    const base = suggestBase(shopName);
    return base ? this.firstAvailable(base) : null;
  }

  /** Checks an address the owner typed or accepted. A taken or reserved address gets the next free suggestion. */
  async checkAddress(address: string): Promise<AddressCheck> {
    if (!isValidSlug(address)) return { ok: false, reason: 'format', suggestion: null };

    const unavailable = await this.availability.findUnavailable([address]);
    if (!unavailable.has(address)) return { ok: true, address };

    const suggestion = await this.firstAvailable(stripNumericSuffix(address));
    return { ok: false, reason: 'unavailable', suggestion };
  }

  /** One batch query for the base and all its suffixes; the first candidate nobody holds wins. */
  private async firstAvailable(base: string): Promise<string | null> {
    const candidates = [base, ...suffixCandidates(base)];
    const unavailable = await this.availability.findUnavailable(candidates);
    return candidates.find((candidate) => !unavailable.has(candidate)) ?? null;
  }
}
