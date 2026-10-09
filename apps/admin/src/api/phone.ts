// AUTH-02's format, checked client-side for fast feedback before a network round trip. The server is the
// source of truth (apps/server/src/modules/identity/services/phone-number-format.ts) — this mirrors it, it
// doesn't replace it. @lytronix/validators' phoneField only caps length (max 30), it doesn't encode the
// BD-mobile shape, so there's no shared schema to import here.
const BD_MOBILE_PATTERN = /^(?:\+?880|0)1[3-9]\d{8}$/;

export function isValidBdPhone(value: string): boolean {
  return BD_MOBILE_PATTERN.test(value.trim());
}
