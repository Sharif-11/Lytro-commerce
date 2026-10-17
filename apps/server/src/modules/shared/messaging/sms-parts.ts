// AUTH-21: an SMS's cost is measured in "parts" (segments), not characters -- GSM-7 (the default alphabet)
// fits 160 characters in one part or 153 per part once concatenated across more than one; any character
// outside GSM-7 (e.g. Bangla) forces UCS-2 encoding, which fits only 70 per part, 67 once concatenated.
// Reasonable-effort implementation: a practical subset of 3GPP TS 23.038's default alphabet and its escape
// extension table, not validated byte-for-byte against the full spec -- correct for plain ASCII/English and
// Bangla text, which is everything this codebase's own SMS templates send today.
export interface SmsParts {
  encoding: 'gsm7' | 'ucs2';
  units: number;
  parts: number;
}

const GSM7_BASIC = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
    'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
);
// Reachable only via the 0x1B escape code -- each one costs 2 septets, not 1.
const GSM7_EXTENDED = new Set('^{}\\[~]|€\f');

export function countSmsParts(body: string): SmsParts {
  const chars = Array.from(body);
  const isGsm7 = chars.every((ch) => GSM7_BASIC.has(ch) || GSM7_EXTENDED.has(ch));
  if (isGsm7) {
    const units = chars.reduce((n, ch) => n + (GSM7_EXTENDED.has(ch) ? 2 : 1), 0);
    return { encoding: 'gsm7', units, parts: units <= 160 ? 1 : Math.ceil(units / 153) };
  }
  const units = chars.length; // UTF-16 code units -- a surrogate-pair emoji correctly counts as 2 here
  return { encoding: 'ucs2', units, parts: units <= 70 ? 1 : Math.ceil(units / 67) };
}
