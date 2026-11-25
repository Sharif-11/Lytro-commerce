import type { Pair } from './content';
import { DOC_SITE } from './content';

// The developer docs' guide parts both pages share (TENANT-DASHBOARD-DESIGN §7.48, SITE-PAGES-DESIGN §7), from the
// approved sketch: the four parts before the routes, the lines that open a group, the headers, the website-address
// examples and the minute limits. Each page writes its own paragraphs around them.

export type DocPart = 'start' | 'auth' | 'limits' | 'errors';

export const DOC_PARTS: readonly (readonly [id: DocPart, title: Pair])[] = [
  ['start', ['শুরু করুন', 'Getting started']],
  ['auth', ['অথেন্টিকেশন ও হেডার', 'Authentication and headers']],
  ['limits', ['লিমিট', 'Limits']],
  ['errors', ['এরর', 'Errors']],
];

/** The line that opens a group, where one helps. */
export const DOC_GROUP_INTROS: Readonly<Record<string, Pair>> = {
  catalogue: [
    'প্রোডাক্ট আর ক্যাটাগরি। ব্রাউজার এই উত্তরগুলো কিছুক্ষণ রেখে দেয়; বদল সাথে সাথে দেখাতে Version-এর v যোগ করুন।',
    'Products and categories. A browser keeps these answers a short while; add the v from Version to show a change at once.',
  ],
  delivery: [
    'চেকআউটের আগে: কাস্টমার থানা সিলেক্ট করে, আপনি চার্জসহ মোট দেখান।',
    'Before checkout: the shopper selects a thana, and you show the total with its charge.',
  ],
  orders: [
    'অর্ডার নেওয়ার ধাপ: /locations থেকে থানা → /delivery-estimate দিয়ে মোট → /orders। তারপর ট্র্যাকিং আইডি দিয়ে /track।',
    'Taking an order: a thana from /locations → the total from /delivery-estimate → /orders. Then /track by the tracking ID.',
  ],
  shopper: [
    'অ্যাকাউন্ট খুললে কাস্টমারের অ্যাড্রেস সেভ থাকে আর আগের অর্ডার দেখা যায়। লগইনের পরের রুটে X-Shopper-Token হেডার লাগে। অ্যাকাউন্ট ছাড়াও অর্ডার দেওয়া যায়।',
    'With an account a shopper keeps saved addresses and sees past orders. Routes after sign-in need the X-Shopper-Token header. Ordering needs no account.',
  ],
};

export interface DocHeader {
  name: string;
  /** A sample value, or nothing. */
  eg: string;
  what: Pair;
}

const HEADERS: readonly DocHeader[] = [
  {
    name: 'Authorization',
    eg: 'Bearer lytro_pk_…',
    what: [
      'প্রতিটি রুটে লাগবেই, শুধু Meta ফিড ছাড়া।',
      'Required on every route but the Meta feed.',
    ],
  },
  {
    name: 'Origin',
    eg: DOC_SITE,
    what: [
      'কী-তে দেওয়া একটি ওয়েবসাইট। ব্রাউজার নিজেই পাঠায়; curl বা সার্ভার থেকে নিজে যোগ করুন। না থাকলে বা অন্য সাইট হলে 403।',
      "One of the key's websites. A browser sends it itself; from curl or a server, add it yourself. Missing, or another site: 403.",
    ],
  },
  {
    name: 'Accept-Language',
    eg: 'bn | en',
    what: [
      'message কোন ভাষায় আসবে। না দিলে বাংলা।',
      'The language message comes in; Bangla if left out.',
    ],
  },
  {
    name: 'Content-Type',
    eg: 'application/json',
    what: ['POST আর PATCH-এর body-র সাথে।', 'With a POST or PATCH body.'],
  },
  {
    name: 'Idempotency-Key',
    eg: 'crypto.randomUUID()',
    what: [
      'শুধু POST /v1/orders-এ, লাগবেই। প্রতি অর্ডারে নতুন; আবার পাঠালে একই।',
      'POST /v1/orders only, required. New per order; the same on a retry.',
    ],
  },
  {
    name: 'X-Shopper-Token',
    eg: '',
    what: [
      'লগইনের পরের কাস্টমার রুটে: লগইনে পাওয়া token।',
      'Shopper routes after sign-in: the token sign-in gave.',
    ],
  },
  {
    name: 'X-RateLimit-Limit · -Remaining · -Reset',
    eg: '',
    what: [
      'এই ভিজিটরের মিনিটের লিমিট, কতটা বাকি, আর কত সেকেন্ড পরে আবার ভরবে।',
      "This visitor's limit a minute, how much is left, and the seconds until it refills.",
    ],
  },
  {
    name: 'Retry-After',
    eg: '',
    what: [
      '429 বা 503-এ: কত সেকেন্ড পরে আবার পাঠাবেন।',
      'On a 429 or 503: the seconds to wait before trying again.',
    ],
  },
  {
    name: 'X-Request-Id',
    eg: '',
    what: [
      'প্রতিটি রিকোয়েস্টের আইডি; সমস্যা হলে সাপোর্টে এটা দিন।',
      "Each request's ID; give it to support when something goes wrong.",
    ],
  },
  {
    name: 'Idempotent-Replay',
    eg: 'true',
    what: [
      'একই Idempotency-Key-এর প্রথম উত্তরটাই আবার এসেছে; নতুন অর্ডার হয়নি।',
      'The first answer to the same Idempotency-Key came back; no new order was made.',
    ],
  },
  {
    name: 'ETag · Cache-Control',
    eg: '',
    what: [
      'ক্যাটালগের রুটে। If-None-Match পাঠালে, না বদলালে 304 আসে, body ছাড়া।',
      'On catalogue routes. Send If-None-Match and an unchanged answer is 304, with no body.',
    ],
  },
];

export const DOC_REQUEST_HEADERS: readonly DocHeader[] = HEADERS.slice(0, 6);
export const DOC_RESPONSE_HEADERS: readonly DocHeader[] = HEADERS.slice(6);

/** Getting started's step 2: five website addresses, accepted or not, and why. */
export const DOC_ADDRESS_EXAMPLES: readonly (readonly [
  ok: 'ok' | 'bad',
  address: string,
  why: Pair | null,
])[] = [
  ['ok', 'https://meghfashion.com', null],
  [
    'ok',
    'https://www.meghfashion.com',
    ['www আলাদা ঠিকানা, তাই এটাও দিন', 'www is another address, so add it too'],
  ],
  [
    'ok',
    'http://localhost:3000',
    ['নিজের কম্পিউটারে টেস্টের জন্য', 'for testing on your own computer'],
  ],
  ['bad', 'https://meghfashion.com/shop', ['পরে পাথ দেওয়া যাবে না', 'no path after it']],
  ['bad', 'http://meghfashion.com', ['https লাগবে', 'https only']],
];

/**
 * The public API's limits a minute (the server's own constants, which apps/server/test/developer-api-samples.spec.ts
 * holds these to): a visitor's requests, a visitor's and a shop's orders, tracking reads, sign-up codes and sign-ins.
 */
export const DOC_MINUTE_LIMIT_FIGURES = {
  requestsPerVisitor: 120,
  ordersPerVisitor: 10,
  ordersPerShop: 180,
  trackingPerVisitor: 60,
  codesPerVisitor: 5,
  signinsPerVisitor: 10,
} as const;

export const DOC_MINUTE_LIMITS: readonly (readonly [figure: string, what: Pair])[] = [
  [
    String(DOC_MINUTE_LIMIT_FIGURES.requestsPerVisitor),
    [
      'রিকোয়েস্ট প্রতি মিনিটে, প্রতিটি ভিজিটর (ইন্টারনেট ঠিকানা)',
      'requests a minute, each visitor (internet address)',
    ],
  ],
  [
    String(DOC_MINUTE_LIMIT_FIGURES.ordersPerVisitor),
    ['অর্ডার প্রতি মিনিটে, প্রতিটি ভিজিটর', 'orders a minute, each visitor'],
  ],
  [
    String(DOC_MINUTE_LIMIT_FIGURES.ordersPerShop),
    [
      'অর্ডার প্রতি মিনিটে, পুরো শপে সব কাস্টমার মিলে',
      'orders a minute, the whole shop, every shopper together',
    ],
  ],
  [
    String(DOC_MINUTE_LIMIT_FIGURES.trackingPerVisitor),
    ['ট্র্যাকিং প্রতি মিনিটে, প্রতিটি ভিজিটর', 'tracking reads a minute, each visitor'],
  ],
  [
    `${String(DOC_MINUTE_LIMIT_FIGURES.codesPerVisitor)} · ${String(DOC_MINUTE_LIMIT_FIGURES.signinsPerVisitor)}`,
    [
      'সাইন আপ কোড · লগইন চেষ্টা প্রতি মিনিটে, প্রতিটি ভিজিটর',
      'sign-up codes · sign-in tries a minute, each visitor',
    ],
  ],
];
