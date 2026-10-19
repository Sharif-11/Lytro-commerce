import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '@lytronix/validators';

// AUTH-11 and TEN-26 on the client: the live preview while typing mirrors the server's SlugFormat so what the
// owner sees is what the server would accept. The server stays the source of truth at submit time
// (availability, the full reserved list); this only keeps the form honest before the round trip.
const RESERVED = new Set([
  'admin',
  'api',
  'www',
  'media',
  'pay',
  'status',
  'app',
  'dashboard',
  'lytro',
  'lytronix',
  'mail',
  'help',
  'support',
  'shops',
  'sign-in',
  'sign-up',
  'checkout',
  'set-up',
]);

export type SlugVerdict = 'empty' | 'invalid' | 'reserved' | 'ok';

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

  verdict(slug: string): SlugVerdict {
    if (slug.length === 0) return 'empty';
    if (!SLUG_PATTERN.test(slug)) return 'invalid';
    if (RESERVED.has(slug)) return 'reserved';
    return 'ok';
  }

  /** The next free suggestion the server offers is preferred; this is the client's own `name-2` fallback. */
  nextSuggestion(slug: string): string {
    const base = slug.replace(/-\d+$/, '');
    const match = /-(\d+)$/.exec(slug);
    const next = match ? Number(match[1]) + 1 : 2;
    const suffix = `-${String(next)}`;
    const head = base.slice(0, SLUG_MAX_LENGTH - suffix.length).replace(/-+$/, '');
    return `${head}${suffix}`;
  }

  private truncateAtWord(value: string, max: number): string {
    if (value.length <= max) return value;
    const cut = value.slice(0, max);
    const boundary = cut.lastIndexOf('-');
    return (boundary > 0 ? cut.slice(0, boundary) : cut).replace(/-+$/, '');
  }
}

export const shopSlug = new ShopSlug();
