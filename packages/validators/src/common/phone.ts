// AUTH-02, ORD-01: a Bangladeshi mobile number is 01[3-9] followed by 8 digits. +88 or 88 is normalised away.
const LOCAL_MOBILE = /^01[3-9]\d{8}$/;
// WAL-01: a wallet number starts as a mobile number does; its length is the wallet's (PAYMENT_METHOD_TYPES).
const LOCAL_WALLET = /^01[3-9]\d+$/;

/** The input with spaces and dashes taken out and a leading +88 or 88 removed. */
function localForm(input: string): string {
  const compact = input.replace(/[\s-]/g, '');
  return compact.startsWith('+88')
    ? compact.slice(3)
    : compact.startsWith('88')
      ? compact.slice(2)
      : compact;
}

/** The local form (01XXXXXXXXX) of a Bangladeshi mobile number, or null when the input is not one. */
export function bdMobileNumber(input: string): string | null {
  const local = localForm(input);
  return LOCAL_MOBILE.test(local) ? local : null;
}

/** WAL-01: the local form of a wallet number of one of these lengths (Rocket's may be 12 digits), or null. */
export function walletNumber(input: string, lengths: readonly number[]): string | null {
  const local = localForm(input);
  return LOCAL_WALLET.test(local) && lengths.includes(local.length) ? local : null;
}
