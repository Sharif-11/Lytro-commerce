// API-14: the public API's own host, which takes the shop from the key, never the host.
export const API_LABEL = 'api';

/**
 * R1, R2: a shop's own address on the platform, `<slug>.<PLATFORM_DOMAIN>`, over HTTPS on real servers and plain HTTP
 * in development. One place, so the address a new shop is sent and the one its media may be read from (MED-13) agree.
 */
export function shopOrigin(
  env: { NODE_ENV: string; PLATFORM_DOMAIN: string },
  slug: string,
): string {
  return `${env.NODE_ENV === 'production' ? 'https' : 'http'}://${slug}.${env.PLATFORM_DOMAIN}`;
}

/** API-14: the public API's own address, `api.<PLATFORM_DOMAIN>`, the same way (a catalog feed's link, FED-01). */
export function apiOrigin(env: { NODE_ENV: string; PLATFORM_DOMAIN: string }): string {
  return shopOrigin(env, API_LABEL);
}
