import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '@lytronix/validators';

// AUTH-11 on the client: the address suggested from the shop name, and what typing turns into. Whether an address is
// free -- taken, reserved, or open -- is the server's alone (GET /shops/address-check, TEN-26), asked as the owner
// types; this only keeps the field to the address's own letters and spares the server a malformed question.
export class ShopSlug {
  /** The address suggested from a shop name: Latin letters and digits, lowercased, other runs as one hyphen,
      cut at a word boundary (AUTH-11). Empty when the name has no Latin letters. */
  suggest(shopName: string): string {
    const folded = shopName.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const hyphenated = folded.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return this.truncateAtWord(hyphenated, SLUG_MAX_LENGTH);
  }

  /** What a typed value becomes while typing: lowercase, nothing but a–z, 0–9 and hyphens. */
  normaliseTyping(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .slice(0, SLUG_MAX_LENGTH);
  }

  /** Whether the address has the server's own shape (AUTH-11), so it is worth asking whether it is free. */
  isWellFormed(slug: string): boolean {
    return SLUG_PATTERN.test(slug);
  }

  private truncateAtWord(value: string, max: number): string {
    if (value.length <= max) return value;
    const cut = value.slice(0, max);
    const boundary = cut.lastIndexOf('-');
    return (boundary > 0 ? cut.slice(0, boundary) : cut).replace(/-+$/, '');
  }
}

export const shopSlug = new ShopSlug();
