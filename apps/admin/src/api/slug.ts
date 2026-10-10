import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '@lytronix/validators';

// Mirrors apps/server/src/modules/tenancy/services/slug-format.ts's suggestBase() exactly, so the live
// preview while typing a shop name matches what the server would actually accept. The server stays the
// source of truth at submit time (availability, reserved words) — this is purely for the live prefill.
export function suggestSlug(shopName: string): string {
  const folded = shopName.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const hyphenated = folded.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return truncateAtWord(hyphenated, SLUG_MAX_LENGTH);
}

export function isValidSlug(candidate: string): boolean {
  return SLUG_PATTERN.test(candidate);
}

function truncateAtWord(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const boundary = cut.lastIndexOf('-');
  return (boundary > 0 ? cut.slice(0, boundary) : cut).replace(/-+$/, '');
}
