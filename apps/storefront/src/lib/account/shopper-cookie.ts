// CUS-03 (Slice 4.8e, part 2): the shopper's sign-in, kept where no script in a browser can read it: an http-only cookie on
// the shop's own host, which only the storefront's server reads, as it alone holds the shop's key (SFT-11).
export const SHOPPER_COOKIE = 'lytro-shopper';

/** The cookie's settings for a token that runs out at `expiresAt`. A secure cookie everywhere but a machine's own host. */
export function shopperCookieOptions(host: string, expiresAt: string) {
  const local = host === 'localhost' || host.endsWith('.localhost');
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: !local,
    path: '/',
    expires: new Date(expiresAt),
  } as const;
}

/** Where to go after signing in: a path on this shop, never another site's. */
export function safeNext(
  next: string | string[] | undefined | null,
  fallback = '/account',
): string {
  if (typeof next !== 'string') return fallback;
  return next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')
    ? next
    : fallback;
}

/** CUS-14: a shop's phone as WhatsApp's address takes it: the country's code and the digits. */
export function whatsAppLink(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits.startsWith('880') ? digits : `88${digits}`}`;
}
