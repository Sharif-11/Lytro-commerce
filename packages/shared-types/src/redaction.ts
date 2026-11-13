/**
 * LOG-02, D9-20, OBS-03 (Slice 9.6): the one list of what never reaches a log line or the error tracker: secrets,
 * credentials, keys, tokens, sign-in codes and payment details are masked, and a phone shows its last 4 digits only.
 * Both the log lines and every error sent out pass through it.
 */

const MASK = '[masked]';

/**
 * A field whose name ends in one of these holds a secret, a code or a payment detail (`password`, `otpCode`,
 * `x-api-key`, `trxId`): its value is masked, whatever it looks like. An error's `code` or a record's ID is not.
 */
const SECRET_NAMES = [
  'pass(?:word|wd)?',
  'secret',
  'token',
  'api_?key',
  'access_?key',
  'private_?key',
  'secret_?key',
  'encryption_?key',
  'authori[sz]ation',
  'cookie',
  'otp',
  'otp_?code',
  'one_?time_?code',
  'sign_?in_?code',
  'verification_?code',
  'pairing_?code',
  'pin',
  'signature',
  'credentials?',
  'trx_?id',
  'transaction_?id',
  'card_?number',
  'cvv',
  'account_?number',
]
  .join('|')
  // `api_key`, `api-key`, `apiKey` alike.
  .replaceAll('_?', '[_-]?');

const SECRET_FIELD = new RegExp(`(?:${SECRET_NAMES})$`, 'i');

// `name=value`, `name: value` and `"name": "value"` in free text, for the names above.
const NAMED_VALUE = new RegExp(
  `(["']?)\\b([\\w-]*?(?:${SECRET_NAMES}))(?![\\w-])\\1(\\s*[:=]\\s*)(?!\\[masked\\])("(?:[^"\\\\]|\\\\.)*"|'[^']*'|[^\\s,;&}\\])]+)`,
  'gi',
);
// An authorization's whole value, its scheme and all (`Bearer x`, `Token x`), to the end of the field.
const AUTHORIZATION = /\b(authori[sz]ation["']?\s*[:=]\s*)[^\n,;}]+/gi;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/g;
const PUBLIC_KEY = /\blytro_pk_[A-Za-z0-9]{4,}/g;
// A Bangladeshi mobile number, with or without the country code: everything but its last 4 digits.
const PHONE = /(?<!\d)(?:\+?880|0)1[3-9]\d{4}(\d{4})(?!\d)/g;
// A card's 13 to 19 digits, spaced or not.
const CARD = /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g;
// A long random token (a key, a hash, a signed value) no rule above named; never a UUID, which logs need.
const LONG_TOKEN =
  /(?<![\w-])(?![0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![\w-]))[\w-]{32,}/gi;

/** One line of free text with every secret, code, payment detail and phone masked. */
export function redactText(text: string): string {
  return text
    .replace(AUTHORIZATION, (_all, name: string) => `${name}${MASK}`)
    .replace(NAMED_VALUE, (_all, quote: string, name: string, separator: string, value: string) => {
      // A quoted value keeps its quotes, so a JSON line stays JSON.
      const around = value.startsWith('"') || value.startsWith("'") ? value.charAt(0) : '';
      return `${quote}${name}${quote}${separator}${around}${MASK}${around}`;
    })
    .replace(BEARER, (_all, scheme: string) => `${scheme} ${MASK}`)
    .replace(PUBLIC_KEY, `lytro_pk_${MASK}`)
    .replace(PHONE, (_all, last: string) => `*******${last}`)
    .replace(CARD, MASK)
    .replace(LONG_TOKEN, MASK);
}

/**
 * Any value, walked: a field named like a secret is masked whole, every string in it masked as text. A copy; the value
 * itself is never changed. Past 8 levels it's cut off rather than walked.
 */
export function redactValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return redactText(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= 8) return '[cut]';
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1));
  const copy: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    copy[key] =
      SECRET_FIELD.test(key) && field !== null && field !== undefined
        ? MASK
        : redactValue(field, depth + 1);
  }
  return copy;
}
