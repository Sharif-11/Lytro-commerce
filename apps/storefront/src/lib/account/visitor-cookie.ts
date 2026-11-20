// RTE-06 as amended (load fix 2, the owner, 2026-11-20): the shopper's own mark, so the per-minute limits count each
// shopper alone rather than every phone behind one mobile network's address together. A random value, set in the
// browser by the page's script (VisitorCookie), so a page Cloudflare or the page cache keeps never carries a
// Set-Cookie; the storefront's server reads it and vouches for it to the API with its own secret (StorefrontApi).
export const VISITOR_COOKIE = 'lytro-visitor';
// The header the storefront's server names the shopper in, beside its secret (`x-lytro-storefront`).
export const VISITOR_HEADER = 'x-lytro-visitor';
// 400 days: the longest a browser keeps a cookie.
export const VISITOR_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

// 128 random bits as base64url without padding: 22 characters.
const VISITOR_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/** The shopper's mark as a cookie or header carried it, or null for anything else. */
export function parseVisitor(value: string | null | undefined): string | null {
  return typeof value === 'string' && VISITOR_PATTERN.test(value) ? value : null;
}

/** A new mark: 128 random bits, base64url. Web Crypto, so the browser and the server make it alike. */
export function newVisitorId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The mark as a cookie the browser sets: the whole shop, 400 days, secure wherever the page came over https. */
export function visitorCookieValue(visitor: string, secure: boolean): string {
  return `${VISITOR_COOKIE}=${visitor}; Path=/; Max-Age=${String(VISITOR_COOKIE_MAX_AGE)}; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/** The mark among a browser's cookies (`document.cookie`), if one is there and well formed. */
export function visitorFromCookies(cookies: string): string | null {
  const prefix = `${VISITOR_COOKIE}=`;
  const found = cookies
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return parseVisitor(found?.slice(prefix.length));
}
