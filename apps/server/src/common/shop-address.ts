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
