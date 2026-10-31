// API-14: the public API's own host, which takes the shop from the key, never the host.
export const API_LABEL = 'api';
// PAY-01 (Phase 5 Slice 5.2): the payment page's own host, which takes the shop from the session (TEN-29); a reserved
// shop address since migration 0002.
export const PAY_LABEL = 'pay';

/**
 * R1, R2: a shop's own address on the platform, `<slug>.<PLATFORM_DOMAIN>`, over HTTPS on real servers and plain HTTP
 * in development. One place, so the address a new shop is sent and the one its media may be read from (MED-13) agree.
 */
export function shopOrigin(
  env: { NODE_ENV: string; PLATFORM_DOMAIN: string },
  slug: string,
): string {
  return hostOrigin(env, `${slug}.${env.PLATFORM_DOMAIN}`);
}

/**
 * Slice 13: the shop's main address -- its own domain while that serves (TEN-09), else its address on the platform.
 * What a shop's links and previews point to, so a shopper never goes through a redirect to reach it.
 */
export function mainOrigin(
  env: { NODE_ENV: string; PLATFORM_DOMAIN: string },
  slug: string,
  ownDomain: string | null,
): string {
  return ownDomain === null ? shopOrigin(env, slug) : hostOrigin(env, ownDomain);
}

function hostOrigin(env: { NODE_ENV: string }, host: string): string {
  return `${env.NODE_ENV === 'production' ? 'https' : 'http'}://${host}`;
}

/** API-14: the public API's own address, `api.<PLATFORM_DOMAIN>`, the same way (a catalog feed's link, FED-01). */
export function apiOrigin(env: { NODE_ENV: string; PLATFORM_DOMAIN: string }): string {
  return shopOrigin(env, API_LABEL);
}

/** PAY-01: the payment page's own address, `pay.<PLATFORM_DOMAIN>`, the same way. */
export function payOrigin(env: { NODE_ENV: string; PLATFORM_DOMAIN: string }): string {
  return shopOrigin(env, PAY_LABEL);
}
