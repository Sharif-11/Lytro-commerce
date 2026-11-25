import type { DocRoute, Pair, RouteError } from './content';
import { DOC_BASE, DOC_KEY, DOC_SITE, DOC_TOKEN } from './content';

export type DocLanguage = 'bn' | 'en';

/** The refusals every keyed route can answer, in the order they are checked. */
export const DOC_COMMON_ERRORS: readonly RouteError[] = [
  [
    401,
    'unauthenticated',
    'ApiKeyMissing',
    'আপনার API কী "Authorization: Bearer <key>" হিসেবে পাঠান।',
    'Send your API key as "Authorization: Bearer <key>".',
  ],
  [
    401,
    'unauthenticated',
    'ApiKeyInvalid',
    'এই API কী সঠিক নয়। কী-টি দেখে নিন, অথবা ড্যাশবোর্ড থেকে নতুন একটি তৈরি করুন।',
    'This API key is not valid. Check it, or make a new one in the dashboard.',
  ],
  [
    401,
    'unauthenticated',
    'ApiKeyWasRevoked',
    'এই API কী ক্যানসেল করা হয়েছে। অন্য কী ব্যবহার করুন, অথবা ড্যাশবোর্ড থেকে নতুন একটি তৈরি করুন।',
    'This API key was revoked. Use another key, or make a new one in the dashboard.',
  ],
  [
    401,
    'unauthenticated',
    'ApiKeyExpired',
    'এই API কী-র মেয়াদ শেষ হয়ে গেছে। ড্যাশবোর্ড থেকে নতুন একটি তৈরি করুন।',
    'This API key has expired. Make a new one in the dashboard.',
  ],
  [
    403,
    'forbidden',
    'WebsiteNotRegistered',
    'এই ওয়েবসাইট এই API কী-র ওয়েবসাইট তালিকায় নেই। ড্যাশবোর্ডে কী-টিতে এটি যোগ করুন।',
    "This website is not one of this API key's website addresses. Add it to the key in the dashboard.",
  ],
  [
    403,
    'tenant_offline',
    'ShopUnavailable',
    'এই শপটি এখন উপলব্ধ নয়।',
    'This shop is not available right now.',
  ],
  [
    403,
    'tenant_offline',
    'StorefrontPaused',
    'শপটি শিগগিরই আবার চালু হচ্ছে।',
    'This shop is coming back soon.',
  ],
  [
    429,
    'rate_limited',
    'TooManyRequests',
    'অনেক বেশি রিকোয়েস্ট এসেছে। একটু অপেক্ষা করে আবার ট্রাই করুন।',
    'Too many requests. Please wait a moment and try again.',
  ],
  [
    429,
    'quota_exceeded',
    'RequestsUsedUp',
    'এই শপ এই বিলিং পিরিয়ডের সব API রিকোয়েস্ট ব্যবহার করে ফেলেছে। পরের পিরিয়ডে আবার শুরু হবে।',
    'This shop has used all its API requests for this billing period. They start again with the next one.',
  ],
  [
    429,
    'quota_exceeded',
    'ApiCapReached',
    'এই শপের এ মাসের API খরচের লিমিট শেষ।',
    "This shop's API spending limit for the month is reached.",
  ],
  [
    503,
    'service_unavailable',
    'ServerBusy',
    'সার্ভার এই মুহূর্তে খুব ব্যস্ত। একটু পরে আবার চেষ্টা করুন।',
    'The server is very busy right now. Please try again in a moment.',
  ],
  [
    500,
    'internal_error',
    'SomethingWentWrong',
    'কিছু একটা সমস্যা হয়েছে। অনুগ্রহ করে আবার ট্রাই করুন।',
    'Something went wrong. Please try again.',
  ],
];

/* errors.code, each once (api-error.ts's HTTP_STATUS, the ones a public route answers). */
export const DOC_ERROR_CODES: readonly (readonly [status: number, code: string, what: Pair])[] = [
  [
    400,
    'validation_error',
    [
      'কোনো ফিল্ড ঠিক নেই; details.fields-এ কোনটা আর কেন।',
      'A field is wrong; details.fields says which and why.',
    ],
  ],
  [
    400,
    'idempotency_key_required',
    ['POST /v1/orders-এ Idempotency-Key নেই।', 'POST /v1/orders without an Idempotency-Key.'],
  ],
  [
    401,
    'unauthenticated',
    [
      'কী নেই, ভুল, ক্যানসেলড বা মেয়াদ শেষ; কাস্টমার রুটে লগইন নেই।',
      'The key is missing, wrong, revoked or expired; on shopper routes, no sign-in.',
    ],
  ],
  [
    403,
    'forbidden',
    [
      'রিকোয়েস্টটা কী-টির কোনো ওয়েবসাইট থেকে আসেনি।',
      "The request didn't come from one of the key's websites.",
    ],
  ],
  [
    403,
    'tenant_offline',
    [
      'শপ বন্ধ বা সাসপেন্ডেড, অথবা পে-অ্যাজ-ইউ-গো শপ প্রথম টপ-আপের অপেক্ষায়।',
      'The shop is closed or suspended, or a pay-as-you-go shop waits for its first top-up.',
    ],
  ],
  [
    404,
    'not_found',
    ['প্রোডাক্ট, অফার, অর্ডার বা অ্যাড্রেস নেই।', 'No such product, offer, order or address.'],
  ],
  [
    409,
    'conflict',
    [
      'এখন করা যায় না, যেমন এই থানায় ডেলিভারি নেই।',
      "Can't be done now, such as no delivery to this thana.",
    ],
  ],
  [
    422,
    'idempotency_conflict',
    ['একই Idempotency-Key, কিন্তু ভিন্ন ডেটা।', 'The same Idempotency-Key with different data.'],
  ],
  [
    429,
    'rate_limited',
    [
      'এক মিনিটে অনেক বেশি; Retry-After সেকেন্ড পরে আবার।',
      'Too many in a minute; try again after Retry-After seconds.',
    ],
  ],
  [
    429,
    'quota_exceeded',
    [
      'এই বিলিং সাইকেলের রিকোয়েস্ট শেষ; পে-অ্যাজ-ইউ-গো শপে মাসের API খরচের লিমিট শেষ বা ব্যালেন্স খালি।',
      "This billing cycle's requests are used up; on pay-as-you-go, the month's API spending limit is reached or the balance is empty.",
    ],
  ],
  [
    500,
    'internal_error',
    [
      'আমাদের দিকে সমস্যা; X-Request-Id সহ সাপোর্টে জানান।',
      'A fault on our side; tell support the X-Request-Id.',
    ],
  ],
  [
    503,
    'service_unavailable',
    [
      'সার্ভার ব্যস্ত; Retry-After সেকেন্ড পরে আবার।',
      'The server is busy; try again after Retry-After seconds.',
    ],
  ],
];

/** Getting started's first call. */
export const DOC_FIRST_CALL: DocRoute = {
  id: 'first-call',
  g: 'version',
  m: 'GET',
  p: '/catalogue/version',
  what: ['', ''],
  params: [],
  ok: ['ক্যাটালগ ভার্সন পাওয়া গেছে।', 'Catalogue version retrieved.'],
  data: { version: '184.7' },
};

const pick = (pair: Pair, lang: DocLanguage): string => (lang === 'bn' ? pair[0] : pair[1]);

/** Every JSON answer's envelope (API-CONTRACT §2). */
export function docEnvelope(r: DocRoute, lang: DocLanguage): Record<string, unknown> {
  return {
    success: true,
    statusCode: r.st ?? 200,
    message: r.ok ? pick(r.ok, lang) : '',
    data: r.data,
  };
}

/** A refusal's envelope: the second common error, a key that is wrong. */
export function docFailed(lang: DocLanguage): Record<string, unknown> {
  const wrong = DOC_COMMON_ERRORS[1];
  return {
    success: false,
    statusCode: 401,
    message: wrong ? (lang === 'bn' ? wrong[3] : wrong[4]) : '',
    errors: { code: 'unauthenticated', details: {} },
  };
}

/** A field refusal, with details.fields. */
export function docInvalid(lang: DocLanguage): Record<string, unknown> {
  const message =
    lang === 'bn'
      ? 'একটি বাংলাদেশি মোবাইল নম্বর দিন, যেমন 017XXXXXXXX।'
      : 'Enter a Bangladeshi mobile number, such as 017XXXXXXXX.';
  return {
    success: false,
    statusCode: 400,
    message,
    errors: {
      code: 'validation_error',
      details: { fields: [{ field: 'phone', problem: 'invalid_format', message }] },
    },
  };
}

const urlOf = (r: DocRoute): string => DOC_BASE + (r.ex ?? r.p) + (r.q ?? '');
const indent = (text: string, by: string): string => text.split('\n').join('\n' + by);

/** The request as curl. */
export function docCurl(r: DocRoute, lang: DocLanguage): string {
  const lines = ['curl ' + (r.m === 'GET' ? '' : '-X ' + r.m + ' ') + '"' + urlOf(r) + '"'];
  if (!r.nokey) {
    lines.push('  -H "Authorization: Bearer ' + DOC_KEY + '"');
    lines.push('  -H "Origin: ' + DOC_SITE + '"');
    lines.push('  -H "Accept-Language: ' + lang + '"');
  }
  if (r.auth) lines.push('  -H "X-Shopper-Token: ' + DOC_TOKEN + '"');
  for (const h of r.hd ?? []) lines.push('  -H "' + h[0] + ': ' + h[1] + '"');
  if (r.body !== undefined) {
    lines.push('  -H "Content-Type: application/json"');
    lines.push("  -d '" + indent(JSON.stringify(r.body, null, 2), '  ') + "'");
  }
  return lines.join(' \\\n');
}

/** The request as a browser's fetch. */
export function docFetch(r: DocRoute, lang: DocLanguage): string {
  if (r.nokey) {
    return (
      "// Meta's own fetcher reads this address; a test from your computer:\nconst res = await fetch('" +
      urlOf(r) +
      "');\nconst csv = await res.text();"
    );
  }
  const h = [
    "    Authorization: 'Bearer " + DOC_KEY + "',",
    "    'Accept-Language': '" + lang + "',",
  ];
  if (r.auth) h.push("    'X-Shopper-Token': shopperToken,");
  for (const x of r.hd ?? []) h.push("    '" + x[0] + "': " + x[2] + ',');
  if (r.body !== undefined) h.push("    'Content-Type': 'application/json',");
  const out: string[] = [];
  if (r.pre) out.push(...r.pre);
  if (r.auth) out.push('// shopperToken: the token sign-in gave you.');
  out.push(
    '// The browser sends Origin itself: call from a page on one of the key\u2019s websites.',
  );
  out.push("const res = await fetch('" + urlOf(r) + "', {");
  if (r.m !== 'GET') out.push("  method: '" + r.m + "',");
  out.push('  headers: {', ...h, '  },');
  if (r.body !== undefined)
    out.push('  body: JSON.stringify(' + indent(JSON.stringify(r.body, null, 2), '  ') + '),');
  out.push('});', 'const { success, data, message } = await res.json();');
  return out.join('\n');
}

/** The answer, as the docs show it. */
export function docResponse(r: DocRoute, lang: DocLanguage): string {
  return r.csv ? (r.csvHead ?? '') + '\n…' : JSON.stringify(docEnvelope(r, lang), null, 2);
}

/** A piece of highlighted code: k a JSON key, s a string, b true/false/null, n a number, c a comment. */
export interface CodeToken {
  text: string;
  kind?: 'k' | 's' | 'b' | 'n' | 'c';
}

const JSON_TOKENS = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\b\d+(?:\.\d+)?\b)/g;
const CODE_TOKENS = /(\/\/[^\n]*)|('(?:\\.|[^'\\\n])*')|("(?:\\.|[^"\\\n])*")/g;

/** A light colouring (the sketch's hl): keys, strings, numbers and literals in JSON; comments and strings in code. */
export function docHighlight(text: string, kind: 'json' | 'code'): CodeToken[] {
  const tokens: CodeToken[] = [];
  let at = 0;
  for (const m of text.matchAll(kind === 'json' ? JSON_TOKENS : CODE_TOKENS)) {
    const start = m.index;
    if (start > at) tokens.push({ text: text.slice(at, start) });
    if (kind === 'json') {
      const [, str, colon, literal, num] = m;
      if (str !== undefined) {
        tokens.push({ text: str, kind: colon !== undefined ? 'k' : 's' });
        if (colon !== undefined) tokens.push({ text: colon });
      } else if (literal !== undefined) tokens.push({ text: literal, kind: 'b' });
      else if (num !== undefined) tokens.push({ text: num, kind: 'n' });
    } else {
      const [, comment, single, double] = m;
      if (comment !== undefined) tokens.push({ text: comment, kind: 'c' });
      else tokens.push({ text: single ?? double ?? '', kind: 's' });
    }
    at = start + m[0].length;
  }
  if (at < text.length) tokens.push({ text: text.slice(at) });
  return tokens;
}
