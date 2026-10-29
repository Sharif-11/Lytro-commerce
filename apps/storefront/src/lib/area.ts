// SFT-20: the thana a shopper picked, remembered per device so every product page and the cart price delivery to it.
// A cookie, so the server's first render already shows the exact charge rather than the range.
export const AREA_COOKIE = 'lytro-area';
const AREA_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

export function parseArea(value: string | undefined): number | null {
  if (value === undefined || !/^\d{1,9}$/.test(value)) return null;
  const id = Number(value);
  return id > 0 ? id : null;
}

export function areaCookieValue(locationId: number): string {
  return `${AREA_COOKIE}=${String(locationId)}; Path=/; Max-Age=${String(AREA_COOKIE_MAX_AGE)}; SameSite=Lax`;
}
