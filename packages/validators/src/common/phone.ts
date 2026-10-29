// AUTH-02, ORD-01: a Bangladeshi mobile number is 01[3-9] followed by 8 digits. +88 or 88 is normalised away.
const LOCAL_MOBILE = /^01[3-9]\d{8}$/;

/** The local form (01XXXXXXXXX) of a Bangladeshi mobile number, or null when the input is not one. */
export function bdMobileNumber(input: string): string | null {
  const compact = input.replace(/[\s-]/g, '');
  const local = compact.startsWith('+88')
    ? compact.slice(3)
    : compact.startsWith('88')
      ? compact.slice(2)
      : compact;
  return LOCAL_MOBILE.test(local) ? local : null;
}
