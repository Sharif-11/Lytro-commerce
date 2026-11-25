// The Lytro public API's documentation (TENANT-DASHBOARD-DESIGN §7.48, SITE-PAGES-DESIGN §7): every /v1 route a
// shop's own website or app may call, what it is for, its parameters, and a sample request and answer. Ported from the
// approved sketch's DEVAPI (docs/brand/lytro-dashboard.html); the dashboard's Developers screen and lytro.app/developers
// both read it, and apps/server/test/developer-api-samples.spec.ts parses every sample with the real request and
// response schemas, and every message with the server's own words, so the docs can't drift from the API.

/** Bangla first, then English. */
export type Pair = readonly [bn: string, en: string];

export type ParamPlace = 'query' | 'path' | 'header' | 'body';

export interface DocParam {
  n: string;
  at: ParamPlace;
  ty: string;
  req: boolean;
  d: Pair;
}

/** [status, errors.code, the server's message key, Bangla, English]. */
export type RouteError = readonly [
  status: number,
  code: string,
  key: string,
  bn: string,
  en: string,
];

export interface DocGroup {
  id: string;
  t: Pair;
}

export type DocMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface DocRoute {
  id: string;
  /** The group it is listed under. */
  g: string;
  m: DocMethod;
  /** The path as documented, under /v1. */
  p: string;
  /** The sample's own path, when the documented one has a {placeholder}. */
  ex?: string;
  /** The sample's query string. */
  q?: string;
  what: Pair;
  params: readonly DocParam[];
  body?: unknown;
  /** Extra request headers: [name, curl's value, the fetch sample's expression]. */
  hd?: readonly (readonly [string, string, string])[];
  /** Lines the fetch sample runs before the call. */
  pre?: readonly string[];
  /** The answer's status; 200 when unset. */
  st?: number;
  /** The answer's message. */
  ok?: Pair;
  data?: unknown;
  errs?: readonly RouteError[];
  note?: Pair;
  /** Still answers past the cycle's requests: an order can't be placed without it. */
  sell?: boolean;
  /** Needs a signed-in shopper (X-Shopper-Token). */
  auth?: boolean;
  /** No API key: the Meta feed. */
  nokey?: boolean;
  /** Answers CSV, of which csvHead is the first line. */
  csv?: boolean;
  csvHead?: string;
}

interface Media {
  id: string;
  urls: { main: string; thumbnail: string };
}

export const DOC_BASE = 'https://api.lytro.app/v1';
export const DOC_SITE = 'https://meghfashion.com';
export const DOC_KEY = 'lytro_pk_YOUR_KEY';
const T = '7c2e9a41-5b3d-4f8e-a1c6-0d9b2e4f7a35';
const P1 = '0b8f3c52-1e6a-4d7b-9c2f-8a5e3d1b6c40';
const P2 = '4e1a7d93-6c2b-4f5e-b8a0-3d9c1e7f2a68';
const V1 = 'a3d5e7f9-2b4c-4d6e-8f1a-3c5e7a9b1d24';
const V2 = 'b4e6f8a1-3c5d-4e7f-9a2b-4d6f8b1c3e35';
const V3 = 'c5f7a9b2-4d6e-4f8a-ab3c-5e7a9c2d4f46';
const OV1 = 'e7b9c2d4-6f8a-4b1c-8d5e-7a9c2e4f6b68';
const OV2 = 'f8c1d3e5-7a9b-4c2d-9e6f-8b1d3f5a7c79';
const COLOR = '19d2e4f6-8b1c-4d3e-af7a-9c2e4a6b8d80';
const C_WOMEN = '4ca5b7c9-be4f-4a6b-93ad-cf5b7d9eb013';
const C_SAREE = '2ae3f5a7-9c2d-4e4f-b18b-ad3f5b7c9e91';
const C_3PC = '3bf4a6b8-ad3e-4f5a-829c-be4a6c8daf02';
const Z_HOME = '9bfa0c1e-0d9e-4fb0-a8fc-1eaf02d45068';
const Z_OUT = 'ac0b1d2f-1eaf-4ac1-b90d-2fb013e56179';
const SH = 'bd1c2e3a-2fb0-4bd2-8a1e-3ac124f6728a';
const AD1 = 'ce2d3f4b-3ac1-4ce3-9b2f-4bd235a7839b';
const AD2 = 'df3e4a5c-4bd2-4df4-ac3a-5ce346b894ac';
export const DOC_TOKEN = 'mQ3vT9xK2pL7wR4nB8cZ1fH6jD5sG0aEyU2iO7kVtAq';
export const DOC_IDEMPOTENCY_KEY = '9b1d3c7e-2f4a-4d8b-a6c1-5e0f7a2b8c90';
const media = (id: string, hash: string): Media => ({
  id,
  urls: {
    main: 'https://media.lytro.app/tenants/' + T + '/' + id + '/' + hash + '.webp',
    thumbnail: 'https://media.lytro.app/tenants/' + T + '/' + id + '/' + hash + '.thumb.webp',
  },
});
const IMG1 = media('6ec7d9eb-da6b-4c8d-b5cf-eb7d9fa12d35', '3f9a1c7e2b5d8a04');
const IMG2 = media('8ae9fb0d-fc8d-4eaf-97eb-0d9fb1c34f57', 'b81e4d0a6c2f9375');
const LOGO = media('5db6c8da-cf5a-4b7c-a4be-da6c8eaf1c24', '0c7d2e9b4a1f6385');
const swatches = [
  { id: OV1, value: 'মেরুন', swatchColor: '#7b1e2b', swatchImage: null },
  { id: OV2, value: 'নীল', swatchColor: '#1f4e8c', swatchImage: null },
];
const zoneHome = {
  id: Z_HOME,
  name: { en: 'Inside Dhaka city', bn: 'ঢাকা সিটির ভেতরে' },
  charge: '70.00',
  noDelivery: false,
};
const shopper = {
  id: SH,
  name: 'নুসরাত জাহান',
  phone: '01711234567',
  createdAt: '2026-11-21T06:10:00.000Z',
};
const signedIn = { token: DOC_TOKEN, expiresAt: '2026-12-21T06:10:00.000Z', shopper };
const mirpur = { id: 162, nameEn: 'Mirpur', nameBn: 'মিরপুর', cityCode: 'dhaka', zillaId: 14 };
const addrHome = {
  id: AD1,
  label: 'বাসা',
  location: mirpur,
  deliveryAddress: 'বাড়ি 12, রোড 7, সেকশন 10, মিরপুর',
  isDefault: true,
};
const addrOffice = {
  id: AD2,
  label: 'অফিস',
  location: { id: 146, nameEn: 'Dhanmondi', nameBn: 'ধানমন্ডি', cityCode: 'dhaka', zillaId: 14 },
  deliveryAddress: 'লেভেল 5, বাড়ি 27, রোড 9/A, ধানমন্ডি',
  isDefault: false,
};
const color = (value: string) => [
  { name: 'রং', value, dataType: 'enum_single', unitKind: null, variantDefining: true },
];
const lineSaree = {
  variantId: V1,
  productName: 'জামদানি শাড়ি',
  attributes: color('মেরুন'),
  thumbnail: IMG1.urls.thumbnail,
  quantity: '1.000',
  stockUnit: 'piece',
  unitPrice: '3200.00',
  itemTotal: '3200.00',
  modifiers: [],
};
const lineThreePiece = {
  variantId: V3,
  productName: 'সুতি থ্রি-পিস',
  attributes: [
    { name: 'সাইজ', value: 'M', dataType: 'enum_single', unitKind: null, variantDefining: true },
  ],
  thumbnail: IMG2.urls.thumbnail,
  quantity: '1.000',
  stockUnit: 'piece',
  unitPrice: '1450.00',
  itemTotal: '1450.00',
  modifiers: [],
  captured: [],
  components: [],
};

/* Each parameter: [name, where, type, required, [bn, en]]. */
const P = (
  n: string,
  at: ParamPlace,
  ty: string,
  req: boolean,
  bn: string,
  en: string,
): DocParam => ({ n, at, ty, req, d: [bn, en] });
const TOKEN_PARAM = P(
  'X-Shopper-Token',
  'header',
  'string',
  true,
  'লগইনে পাওয়া টোকেন।',
  'The token sign-in gave you.',
);
const SIGNIN: RouteError = [
  401,
  'unauthenticated',
  'SignInToContinue',
  'চালিয়ে যেতে লগইন করুন।',
  'Sign in to continue.',
];
const ADDR_404: RouteError = [
  404,
  'not_found',
  'ShopperAddressNotFound',
  'অ্যাড্রেস পাওয়া যায়নি।',
  'Address not found.',
];
const THANA_400: RouteError = [
  400,
  'validation_error',
  'LocationNotFound',
  'থানাটি পাওয়া যায়নি।',
  'This thana was not found.',
];

export const DOC_GROUPS: readonly DocGroup[] = [
  { id: 'shop', t: ['শপ', 'Shop'] },
  { id: 'catalogue', t: ['ক্যাটালগ', 'Catalogue'] },
  { id: 'offers', t: ['অফার', 'Offers'] },
  { id: 'delivery', t: ['ডেলিভারি', 'Delivery'] },
  { id: 'orders', t: ['অর্ডার ও ট্র্যাকিং', 'Orders and tracking'] },
  { id: 'shopper', t: ['কাস্টমার অ্যাকাউন্ট', 'Shopper accounts'] },
  { id: 'feeds', t: ['ফিড', 'Feeds'] },
  { id: 'payments', t: ['পেমেন্ট মেথড', 'Payment methods'] },
  { id: 'version', t: ['ভার্সন', 'Version'] },
];

/* Each route: m, p (as documented), ex (the sample's path), q (the sample's query), what, params, body, hd (extra
   headers: [name, curl value, fetch expression]), pre (fetch lines before the call), st (the status), ok (the
   message), data, errs ([status, errors.code, message key, bn, en]), note, sell (still answers past the cycle's
   requests: an order can't be placed without it), nokey (no API key: the feed). */
export const DOC_ROUTES: readonly DocRoute[] = [
  {
    id: 'shop',
    g: 'shop',
    m: 'GET',
    p: '/shop',
    what: [
      'কী-টি যে শপের, সেই শপের নাম, লোগো, যোগাযোগ, ডেলিভারি এরিয়া ও চার্জ। আপনার সাইটের হেডার আর ফুটার এখান থেকে বানান।',
      "The shop this key belongs to: its name, logo, contact details, delivery zones and charges. Build your site's header and footer from it.",
    ],
    params: [
      P(
        'preview',
        'query',
        'string',
        false,
        'শুধু ড্যাশবোর্ডের প্রিভিউ লিংক এটা পাঠায়। আপনার সাইটে বাদ দিন।',
        "Only the dashboard's preview link sends it. Leave it out on your site.",
      ),
    ],
    ok: ['শপের তথ্য পাওয়া গেছে।', 'Shop retrieved.'],
    data: {
      name: 'Megh Fashion',
      slug: 'megh',
      // PAYG fair use (PF-13): true while a pay-as-you-go shop waits for its first top-up.
      paused: false,
      metaPixelId: null,
      brand: null,
      logo: LOGO,
      icon: null,
      design: {
        theme: 'soft',
        palette: 0,
        sections: [],
        images: {},
        categories: [],
        products: [],
        offers: [],
        preview: false,
        designCards: false,
      },
      sale: { products: 3, bestDiscount: 20 },
      contact: {
        phone: '01711234567',
        email: 'hello@meghfashion.com',
        address: 'বাড়ি 12, রোড 7, সেকশন 10, মিরপুর, ঢাকা',
        whatsapp: '01711234567',
        messenger: 'meghfashion',
        facebookPage: 'https://www.facebook.com/meghfashion',
      },
      deliveryZones: [
        { ...zoneHome, kind: 'home' },
        {
          id: Z_OUT,
          name: { en: 'Outside Dhaka', bn: 'ঢাকার বাইরে' },
          charge: '130.00',
          noDelivery: false,
          kind: 'fallback',
        },
      ],
      extraDeliveryChargePerKg: '20.00',
    },
    note: [
      'brand আর design হলো Lytro স্টোরফ্রন্টের ডিজাইন; নিজের সাইটে এগুলো বাদ দিতে পারেন।',
      "brand and design are the Lytro storefront's own look; your own site can ignore them.",
    ],
  },
  {
    id: 'products',
    g: 'catalogue',
    m: 'GET',
    p: '/catalogue/products',
    q: '?category=women&inStock=true&limit=2',
    what: [
      'শপের অ্যাক্টিভ প্রোডাক্টের এক পেজ: ক্যাটাগরি, সার্চ আর সাজানো অনুযায়ী। যেকোনো সাজানোয় স্টকে থাকা প্রোডাক্ট আগে, স্টক শেষ হওয়াগুলো পরে। পরের পেজের জন্য nextCursor পাঠান।',
      "A page of the shop's active products, by category, search and order. In every order the products in stock come first, the sold-out ones after. Send nextCursor for the next page.",
    ],
    params: [
      P(
        'category',
        'query',
        'string',
        false,
        'ক্যাটাগরির slug; এর সাব-ক্যাটাগরিও আসবে।',
        "A category's slug; its subcategories come too.",
      ),
      P(
        'search',
        'query',
        'string',
        false,
        'প্রোডাক্টের নামে খোঁজার শব্দ।',
        'Words to look for in product names.',
      ),
      P(
        'sort',
        'query',
        'featured | newest | price_low | price_high | relevance | discount | best_selling',
        false,
        'সাজানোর নিয়ম। না দিলে featured, সার্চ থাকলে relevance।',
        'How to order them. featured if left out; relevance with a search.',
      ),
      P(
        'inStock',
        'query',
        'true | false',
        false,
        'true দিলে শুধু স্টকে থাকা প্রোডাক্ট।',
        'true for products in stock only.',
      ),
      P(
        'onSale',
        'query',
        'true | false',
        false,
        'true দিলে শুধু ছাড়ে থাকা প্রোডাক্ট।',
        'true for products on sale only.',
      ),
      P(
        'productIds',
        'query',
        'string',
        false,
        'কমা দিয়ে আলাদা করা প্রোডাক্ট ID, সর্বোচ্চ 12টি।',
        'Product IDs separated by commas, up to 12.',
      ),
      P(
        'designs',
        'query',
        'true | false',
        false,
        'true দিলে একটি প্রোডাক্টের প্রতিটি ডিজাইন আলাদা কার্ড।',
        'true makes each design of a product its own card.',
      ),
      P(
        'offer',
        'query',
        'string',
        false,
        'একটি অফারের slug: শুধু সেই অফারের প্রোডাক্ট।',
        "An offer's slug: only that offer's products.",
      ),
      P(
        'cursor',
        'query',
        'string',
        false,
        'আগের পেজের nextCursor।',
        "The previous page's nextCursor.",
      ),
      P(
        'limit',
        'query',
        'number',
        false,
        'এক পেজে কয়টি: 1 থেকে 60, না দিলে 24।',
        'How many a page: 1 to 60, 24 if left out.',
      ),
      P(
        'v',
        'query',
        'string',
        false,
        'ক্যাটালগ ভার্সন (Version দেখুন)। দিলে বদল সাথে সাথে দেখা যায়।',
        'The catalogue version (see Version), so a change shows at once.',
      ),
    ],
    ok: ['প্রোডাক্ট পাওয়া গেছে।', 'Products retrieved.'],
    data: {
      products: [
        {
          id: P1,
          slug: 'jamdani-saree',
          name: 'জামদানি শাড়ি',
          minPrice: '3200.00',
          maxPrice: '3200.00',
          stockState: 'in',
          image: IMG1,
          createdAt: '2026-11-02T08:15:00.000Z',
          swatches,
          minRegularPrice: '4000.00',
          bestDiscount: 20,
          left: null,
          ordered: 41,
          bestSeller: true,
          designId: null,
          hasVideo: true,
        },
        {
          id: P2,
          slug: 'cotton-three-piece',
          name: 'সুতি থ্রি-পিস',
          minPrice: '1450.00',
          maxPrice: '1550.00',
          stockState: 'low',
          image: IMG2,
          createdAt: '2026-10-28T11:40:00.000Z',
          swatches: [],
          minRegularPrice: null,
          bestDiscount: 0,
          left: 3,
          ordered: 12,
          bestSeller: false,
          designId: null,
          hasVideo: false,
        },
      ],
      nextCursor: 'eyJrIjoiMjAyNi0xMC0yOFQxMTo0MDowMFoiLCJpIjoiNGUxYTdkOTMifQ',
    },
    note: [
      'দাম টাকায়, টেক্সট হিসেবে ("3200.00")। ETag আসে: If-None-Match পাঠালে না বদলালে 304।',
      'Prices are taka, as text ("3200.00"). An ETag comes back: send If-None-Match and an unchanged answer is 304.',
    ],
  },
  {
    id: 'product',
    g: 'catalogue',
    m: 'GET',
    p: '/catalogue/products/{slug}',
    ex: '/catalogue/products/jamdani-saree',
    what: [
      'একটি প্রোডাক্টের পুরো পেজ: ছবি, অপশন, প্রতিটি ভ্যারিয়েন্টের দাম ও স্টক। অর্ডারে variantId এখান থেকে নিন।',
      "One product's whole page: photos, options, each variant's price and stock. Take the order's variantId from here.",
    ],
    params: [
      P(
        'slug',
        'path',
        'string',
        true,
        'প্রোডাক্টের লিংকের নাম। পুরোনো লিংকেও বর্তমান প্রোডাক্ট আসে।',
        "The product's link name. An old link answers with the product as it is now.",
      ),
      P('v', 'query', 'string', false, 'ক্যাটালগ ভার্সন।', 'The catalogue version.'),
    ],
    ok: ['প্রোডাক্ট পাওয়া গেছে।', 'Product retrieved.'],
    data: {
      id: P1,
      slug: 'jamdani-saree',
      name: 'জামদানি শাড়ি',
      description: 'হাতে বোনা ঢাকাই জামদানি, 6 গজ, ব্লাউজ পিস সহ।',
      minPrice: '3200.00',
      maxPrice: '3200.00',
      minRegularPrice: '4000.00',
      bestDiscount: 20,
      stockState: 'in',
      stockUnit: 'piece',
      sharedStock: false,
      condition: 'new',
      primaryCategoryId: C_SAREE,
      categoryIds: [C_SAREE],
      images: [{ ...IMG1, width: 1200, height: 1500, designId: null }],
      video: null,
      options: [
        {
          attributeId: COLOR,
          name: 'রং',
          dataType: 'enum_single',
          unitKind: null,
          values: swatches,
          designs: false,
        },
      ],
      attributes: [
        {
          name: 'কাপড়',
          dataType: 'enum_single',
          unitKind: null,
          values: ['হাফ সিল্ক'],
          text: null,
          number: null,
          yes: null,
        },
      ],
      variants: [
        {
          id: V1,
          optionIds: [OV1],
          price: '3200.00',
          regularPrice: '4000.00',
          stockState: 'in',
          available: true,
        },
        {
          id: V2,
          optionIds: [OV2],
          price: '3200.00',
          regularPrice: '4000.00',
          stockState: 'low',
          available: true,
        },
      ],
      sizeChart: null,
      paymentPolicy: 'none',
      advanceAmount: null,
      deliveryZoneIds: [],
      modifierGroups: [],
      asked: [],
      combo: null,
    },
    errs: [
      [
        404,
        'not_found',
        'ProductNotFound',
        'প্রোডাক্টটি পাওয়া যায়নি।',
        'This product was not found.',
      ],
    ],
    note: [
      'উত্তরের slug আপনার পাঠানোটা না হলে লিংক বদলেছে: নতুন লিংকে রিডাইরেক্ট করুন।',
      'If the answer\u2019s slug is not the one you sent, the link has changed: redirect to the new one.',
    ],
  },
  {
    id: 'categories',
    g: 'catalogue',
    m: 'GET',
    p: '/catalogue/categories',
    what: [
      'শপের দেখানো ক্যাটাগরিগুলো, গাছের মতো: প্রতিটির ভেতরে তার সাব-ক্যাটাগরি। মেনু বানাতে কাজে লাগে।',
      "The shop's visible categories as a tree, each with its subcategories inside. Good for a menu.",
    ],
    params: [P('v', 'query', 'string', false, 'ক্যাটালগ ভার্সন।', 'The catalogue version.')],
    ok: ['ক্যাটাগরি পাওয়া গেছে।', 'Categories retrieved.'],
    data: {
      categories: [
        {
          id: C_WOMEN,
          slug: 'women',
          name: 'মেয়েদের পোশাক',
          image: null,
          cover: null,
          productCount: 38,
          children: [
            {
              id: C_SAREE,
              slug: 'saree',
              name: 'শাড়ি',
              image: null,
              cover: null,
              productCount: 14,
              children: [],
            },
            {
              id: C_3PC,
              slug: 'three-piece',
              name: 'থ্রি-পিস',
              image: null,
              cover: null,
              productCount: 24,
              children: [],
            },
          ],
        },
      ],
    },
  },
  {
    id: 'offer',
    g: 'offers',
    m: 'GET',
    p: '/catalogue/offers/{slug}',
    ex: '/catalogue/offers/winter-sale',
    what: [
      'একটি অফার (চলছে বা শেষ): নাম, কত ছাড়, কয়টি প্রোডাক্ট। এর প্রোডাক্টগুলো আনুন /catalogue/products?offer=winter-sale দিয়ে।',
      'An offer, running or ended: its name, how much off, how many products. Fetch its products with /catalogue/products?offer=winter-sale.',
    ],
    params: [
      P('slug', 'path', 'string', true, 'অফারের লিংকের নাম।', "The offer's link name."),
      P('v', 'query', 'string', false, 'ক্যাটালগ ভার্সন।', 'The catalogue version.'),
    ],
    ok: ['অফার লোড হয়েছে।', 'Offer loaded.'],
    data: {
      name: 'শীতের অফার',
      slug: 'winter-sale',
      state: 'running',
      cut: { kind: 'percent', amount: 20 },
      products: 12,
    },
    errs: [
      [404, 'not_found', 'OfferNotFound', 'অফারটি পাওয়া যায়নি।', 'That offer was not found.'],
    ],
    note: ['cut.kind হলো percent (শতাংশ) বা taka (টাকা)।', 'cut.kind is percent or taka.'],
  },
  {
    id: 'locations',
    g: 'delivery',
    m: 'GET',
    p: '/locations',
    sell: true,
    what: [
      'দেশের সব জেলা, সিটি আর থানা। কাস্টমার থানা সিলেক্ট করবে; অর্ডারের locationId হলো থানার id।',
      "Every zilla, city and thana. The shopper selects a thana; the order's locationId is the thana's id.",
    ],
    params: [],
    ok: ['জেলা ও থানার লিস্ট পাওয়া গেছে।', 'Districts and thanas retrieved.'],
    data: {
      cities: [
        { code: 'dhaka', nameEn: 'Dhaka city', nameBn: 'ঢাকা সিটি' },
        { code: 'chattogram', nameEn: 'Chattogram city', nameBn: 'চট্টগ্রাম সিটি' },
      ],
      zillas: [
        {
          id: 14,
          nameEn: 'Dhaka',
          nameBn: 'ঢাকা',
          thanas: [
            { id: 146, nameEn: 'Dhanmondi', nameBn: 'ধানমন্ডি', cityCode: 'dhaka' },
            { id: 162, nameEn: 'Mirpur', nameBn: 'মিরপুর', cityCode: 'dhaka' },
            { id: 174, nameEn: 'Savar', nameBn: 'সাভার', cityCode: null },
          ],
        },
      ],
    },
    note: [
      'নমুনাটা ছোট করা; আসল উত্তরে সব জেলা ও থানা থাকে। লিস্টটা খুব কম বদলায়, তাই সেভ করে রাখতে পারেন।',
      'Shortened: the real answer has every zilla and thana. It rarely changes, so you can keep a copy.',
    ],
  },
  {
    id: 'estimate',
    g: 'delivery',
    m: 'POST',
    p: '/delivery-estimate',
    sell: true,
    st: 200,
    what: [
      'কার্টের প্রোডাক্টগুলোর এখনকার দাম আর একটি থানায় ডেলিভারি চার্জ, অর্ডার যেভাবে হিসাব হয় ঠিক সেভাবে। থানা না দিলে চার্জের রেঞ্জ আসে।',
      'The cart\u2019s items as they stand now, and the delivery charge to a thana, worked out exactly as the order will be. Without a thana, the range of charges.',
    ],
    params: [
      P(
        'locationId',
        'body',
        'number',
        false,
        'থানার id (/locations থেকে)। না দিলে range আসে।',
        'The thana\u2019s id (from /locations). Left out, you get range.',
      ),
      P(
        'items',
        'body',
        'array',
        true,
        '1 থেকে 100টি: variantId, quantity, আর অ্যাড-অন থাকলে modifiers।',
        '1 to 100 of them: variantId, quantity, and modifiers when the product has add-ons.',
      ),
    ],
    body: { locationId: 162, items: [{ variantId: V1, quantity: 1 }] },
    ok: ['ডেলিভারি চার্জ হিসাব হয়েছে।', 'Delivery charge worked out.'],
    data: {
      lines: [
        {
          variantId: V1,
          onSale: true,
          price: '3200.00',
          stockState: 'in',
          available: true,
          itemTotal: '3200.00',
          advance: null,
          paymentPolicy: 'none',
          choicesFit: true,
        },
      ],
      subtotal: '3200.00',
      zone: zoneHome,
      deliveryCharge: '70.00',
      range: null,
      deliverable: true,
      notDeliveredHere: [],
      taxes: [],
      advance: null,
    },
    errs: [THANA_400],
  },
  {
    id: 'order',
    g: 'orders',
    m: 'POST',
    p: '/orders',
    sell: true,
    st: 201,
    what: [
      'কাস্টমারের অর্ডার, ক্যাশ অন ডেলিভারি। অর্ডারটি সাথে সাথে আপনার ড্যাশবোর্ডের অর্ডারে আসে, Pending অবস্থায়, কনফার্ম করার কলের অপেক্ষায়। স্টকে না থাকা পণ্যও অর্ডার করা যায়: অর্ডারটি স্টক কম দেখায়, আর স্টক যোগ করলে পাঠানো যায়।',
      "A shopper's order, cash on delivery. It lands in your dashboard's Orders at once, pending, waiting for your confirming call. A product out of stock can be ordered too: the order shows it short, and ships once you add the stock.",
    ],
    params: [
      P(
        'Idempotency-Key',
        'header',
        'string',
        true,
        'প্রতি অর্ডারে একটি নতুন এলোমেলো মান। আবার পাঠালে একই কী দিন: দ্বিতীয় অর্ডার হবে না।',
        'A new random value per order. Send the same one on a retry: no second order is made.',
      ),
      P(
        'customerName',
        'body',
        'string',
        true,
        'কাস্টমারের নাম, সর্বোচ্চ 100 অক্ষর।',
        "The shopper's name, up to 100 characters.",
      ),
      P(
        'phone',
        'body',
        'string',
        true,
        'বাংলাদেশি মোবাইল নম্বর, যেমন 01711234567।',
        'A Bangladeshi mobile number, such as 01711234567.',
      ),
      P(
        'locationId',
        'body',
        'number',
        true,
        'থানার id (/locations থেকে)।',
        'The thana\u2019s id (from /locations).',
      ),
      P(
        'deliveryAddress',
        'body',
        'string',
        true,
        'বাড়ি, রোড, এলাকা; সর্বোচ্চ 500 অক্ষর।',
        'House, road, area; up to 500 characters.',
      ),
      P(
        'shopperNote',
        'body',
        'string',
        false,
        'কাস্টমারের নোট, সর্বোচ্চ 500 অক্ষর।',
        "The shopper's note, up to 500 characters.",
      ),
      P(
        'items',
        'body',
        'array',
        true,
        '1 থেকে 100টি: variantId, quantity; দরকার হলে captured, choices, modifiers।',
        '1 to 100 of them: variantId, quantity; captured, choices and modifiers when the product asks.',
      ),
      P(
        'payment',
        'body',
        'object',
        false,
        'শুধু অ্যাডভান্স লাগে এমন অর্ডারে: method (ঐচ্ছিক), returnUrl, cancelUrl। ঠিকানাগুলো কী-টির ওয়েবসাইটের হতে হবে।',
        "Only for an order that needs an advance: method (optional), returnUrl, cancelUrl. The addresses must be on the key's websites.",
      ),
    ],
    hd: [['Idempotency-Key', DOC_IDEMPOTENCY_KEY, 'idempotencyKey']],
    pre: [
      '// One key per order; keep it, so a retry sends the same one.',
      'const idempotencyKey = crypto.randomUUID();',
    ],
    body: {
      customerName: 'নুসরাত জাহান',
      phone: '01711234567',
      locationId: 162,
      deliveryAddress: 'বাড়ি 12, রোড 7, সেকশন 10, মিরপুর',
      shopperNote: 'বিকেল 4টার পর দিলে ভালো হয়',
      items: [{ variantId: V1, quantity: 1 }],
    },
    ok: ['অর্ডার তৈরি হয়েছে।', 'Order created.'],
    data: {
      orderNumber: '261121-0057',
      trackingId: 'K7F2M9QX',
      status: 'pending',
      createdAt: '2026-11-21T05:42:10.000Z',
      items: [lineSaree],
      subtotal: '3200.00',
      deliveryCharge: '70.00',
      discount: '0.00',
      grandTotal: '3270.00',
      codAmount: '3270.00',
      taxes: [],
      purchaseEventId: 'purchase.K7F2M9QX',
      payment: null,
    },
    errs: [
      [
        400,
        'validation_error',
        'ProductNotFound',
        'প্রোডাক্টটি পাওয়া যায়নি।',
        'This product was not found.',
      ],
      [
        400,
        'idempotency_key_required',
        'IdempotencyKeyRequired',
        'এই রিকোয়েস্টের সাথে একটি Idempotency-Key হেডার পাঠান, যাতে আবার পাঠালেও দুবার তৈরি না হয়।',
        'Send an Idempotency-Key header with this request, so sending it again never makes it twice.',
      ],
      [
        409,
        'conflict',
        'ShopDoesNotDeliverHere',
        'এই শপ এই এরিয়াতে ডেলিভারি দেয় না।',
        'This shop does not deliver to this area.',
      ],
      [
        409,
        'conflict',
        'NoPaymentMethod',
        'এই শপ এখন অনলাইনে অ্যাডভান্স নিতে পারছে না। শপের সাথে যোগাযোগ করুন।',
        "This shop can't take an advance online right now. Please contact the shop.",
      ],
      [
        422,
        'idempotency_conflict',
        'IdempotencyKeyConflict',
        'এই রিকোয়েস্ট কী ইতিমধ্যে ভিন্ন ডেটার সাথে ব্যবহৃত হয়েছে।',
        'This request key was already used with different data.',
      ],
      [
        429,
        'rate_limited',
        'TooManyOrders',
        'অল্প সময়ে অনেক অর্ডার এসেছে। এক মিনিট পর আবার ট্রাই করুন।',
        'Too many orders in a short time. Wait a minute and try again.',
      ],
    ],
    note: [
      'দাম, ছাড়, ডেলিভারি চার্জ বা স্ট্যাটাস পাঠাবেন না: Lytro নিজে হিসাব করে। একই Idempotency-Key আবার পাঠালে প্রথম উত্তরটাই আসে, সাথে Idempotent-Replay: true। অ্যাডভান্স লাগলে অর্ডার Unverified থাকে, আর payment.paymentUrl-এ কাস্টমারকে পাঠান।',
      'Never send a price, discount, delivery charge or status: Lytro works them out. The same Idempotency-Key sent again returns the first answer, with Idempotent-Replay: true. When an advance is needed the order starts unverified: send the shopper to payment.paymentUrl.',
    ],
  },
  {
    id: 'track',
    g: 'orders',
    m: 'GET',
    p: '/track/{trackingId}',
    ex: '/track/H4QW8N2C',
    what: [
      'ট্র্যাকিং আইডি দিয়ে অর্ডারের অবস্থা: স্ট্যাটাস, টাইমলাইন, প্রোডাক্ট, টোটাল আর শিপ হলে কুরিয়ার। কাস্টমারের ঠিকানা বা ফোন কখনো আসে না।',
      "An order by its tracking ID: status, timeline, items, totals and, once shipped, its courier. Never the shopper's address or phone.",
    ],
    params: [
      P(
        'trackingId',
        'path',
        'string',
        true,
        '8 অক্ষরের ট্র্যাকিং আইডি; ছোট-বড় হাতের অক্ষর সমান।',
        'The 8-character tracking ID; upper or lower case alike.',
      ),
    ],
    ok: ['অর্ডার পাওয়া গেছে।', 'Order found.'],
    data: {
      orderNumber: '261119-0042',
      trackingId: 'H4QW8N2C',
      status: 'shipped',
      timeline: [
        { step: 'placed', at: '2026-11-19T05:42:10.000Z' },
        { step: 'confirmed', at: '2026-11-19T07:05:00.000Z' },
        { step: 'shipped', at: '2026-11-20T04:30:00.000Z' },
      ],
      items: [lineThreePiece],
      subtotal: '1450.00',
      deliveryCharge: '70.00',
      discount: '0.00',
      grandTotal: '1520.00',
      codAmount: '1520.00',
      taxes: [],
      due: '1520.00',
      courier: {
        name: 'Steadfast',
        trackingCode: '15BAEB8A',
        trackingLink: 'https://steadfast.com.bd/t/15BAEB8A',
      },
      courierMessage: null,
      courierReturning: false,
      payment: null,
      // PFQ-5: a pay-as-you-go shop's phone once the seller has the shopper's; null on every other shop.
      shopPhone: null,
    },
    errs: [
      [404, 'not_found', 'OrderNotFound', 'অর্ডারটি পাওয়া যায়নি।', 'That order was not found.'],
      [
        429,
        'rate_limited',
        'TooManyRequests',
        'অনেক বেশি রিকোয়েস্ট এসেছে। একটু অপেক্ষা করে আবার ট্রাই করুন।',
        'Too many requests. Please wait a moment and try again.',
      ],
    ],
  },
  {
    id: 'sh-code',
    g: 'shopper',
    m: 'POST',
    p: '/shopper/code',
    st: 200,
    what: [
      'সাইন আপের কোড কাস্টমারের ফোনে SMS-এ পাঠায়। SMS-এর খরচ আপনার শপের ব্যালেন্স থেকে কাটা হয়; ব্যালেন্সে না কুলালে পাঠানো হয় না।',
      "Sends the sign-up code to the shopper's phone by SMS. The SMS is paid from your shop's balance, and isn't sent when the balance can't cover it.",
    ],
    params: [
      P(
        'phone',
        'body',
        'string',
        true,
        'কাস্টমারের মোবাইল নম্বর।',
        "The shopper's mobile number.",
      ),
    ],
    body: { phone: '01711234567' },
    ok: ['কোড পাঠানো হয়েছে।', 'Code sent.'],
    data: { expiresInSeconds: 300, resendAfterSeconds: 60 },
    errs: [
      [
        409,
        'conflict',
        'ShopperAlreadyRegistered',
        'এই ফোন নম্বরে এখানে আগেই অ্যাকাউন্ট আছে। পাসওয়ার্ড দিয়ে লগইন করুন।',
        'This phone already has an account here. Sign in with your password.',
      ],
      [
        429,
        'rate_limited',
        'TooManyCodesRequested',
        'এই নম্বর বা ইমেইলের জন্য অনেকবার কোড চাওয়া হয়েছে। পরে আবার ট্রাই করুন।',
        'Too many codes were requested for this destination. Try again later.',
      ],
      [
        429,
        'quota_exceeded',
        'ShopCannotSendCode',
        'এই শপ এখন সাইন আপ কোড পাঠাতে পারছে না। পরে আবার ট্রাই করুন।',
        "This shop can't send a sign-up code right now. Please try again later.",
      ],
      [
        503,
        'service_unavailable',
        'CodeSendFailed',
        'আপনার কোড পাঠানো যায়নি। এক মিনিট পর আবার ট্রাই করুন।',
        'We could not send your code. Try again in a minute.',
      ],
    ],
  },
  {
    id: 'sh-signup',
    g: 'shopper',
    m: 'POST',
    p: '/shopper/signup',
    st: 201,
    what: [
      'কোড, নাম আর পাসওয়ার্ড দিয়ে অ্যাকাউন্ট তৈরি; সাথে সাথে লগইন। উত্তরের token পরের রিকোয়েস্টে X-Shopper-Token হিসেবে পাঠান।',
      'Makes the account with the code, a name and a password, signed in at once. Send the answer\u2019s token as X-Shopper-Token after this.',
    ],
    params: [
      P('phone', 'body', 'string', true, 'যে নম্বরে কোড গেছে।', 'The number the code went to.'),
      P('code', 'body', 'string', true, '6 সংখ্যার কোড।', 'The 6-digit code.'),
      P(
        'name',
        'body',
        'string',
        true,
        'কাস্টমারের নাম, সর্বোচ্চ 100 অক্ষর।',
        "The shopper's name, up to 100 characters.",
      ),
      P('password', 'body', 'string', true, '8 থেকে 20 অক্ষর।', '8 to 20 characters.'),
    ],
    body: { phone: '01711234567', code: '482913', name: 'নুসরাত জাহান', password: 'Megh#2026' },
    ok: ['আপনার অ্যাকাউন্ট তৈরি হয়েছে।', 'Your account is ready.'],
    data: signedIn,
    errs: [
      [
        409,
        'conflict',
        'ShopperAlreadyRegistered',
        'এই ফোন নম্বরে এখানে আগেই অ্যাকাউন্ট আছে। পাসওয়ার্ড দিয়ে লগইন করুন।',
        'This phone already has an account here. Sign in with your password.',
      ],
      [400, 'validation_error', 'CodeIncorrect', 'কোডটি সঠিক নয়।', 'The code is not correct.'],
      [
        429,
        'rate_limited',
        'TooManyWrongCodes',
        'অনেকবার ভুল কোড দেওয়া হয়েছে। আবার চেষ্টা করার আগে অপেক্ষা করুন।',
        'Too many wrong codes. Wait before trying again.',
      ],
    ],
    note: ['token 30 দিন চলে (expiresAt)।', 'The token lasts 30 days (expiresAt).'],
  },
  {
    id: 'sh-signin',
    g: 'shopper',
    m: 'POST',
    p: '/shopper/signin',
    st: 200,
    what: [
      'ফোন আর পাসওয়ার্ড দিয়ে লগইন, কোড ছাড়া।',
      'Signs in with the phone and password, no code.',
    ],
    params: [
      P('phone', 'body', 'string', true, 'অ্যাকাউন্টের ফোন নম্বর।', "The account's phone number."),
      P('password', 'body', 'string', true, 'পাসওয়ার্ড।', 'The password.'),
    ],
    body: { phone: '01711234567', password: 'Megh#2026' },
    ok: ['লগইন হয়েছে।', 'Signed in.'],
    data: signedIn,
    errs: [
      [
        401,
        'unauthenticated',
        'PhoneOrPasswordWrong',
        'এই ফোন নম্বর ও পাসওয়ার্ড মিলছে না।',
        'That phone number and password do not match.',
      ],
      [
        429,
        'rate_limited',
        'TooManyFailedSignins',
        'অনেকবার লগইন করতে ব্যর্থ হয়েছে। আবার চেষ্টা করার আগে অপেক্ষা করুন।',
        'Too many failed sign-ins. Wait before trying again.',
      ],
    ],
  },
  {
    id: 'sh-signout',
    g: 'shopper',
    m: 'POST',
    p: '/shopper/signout',
    st: 200,
    auth: true,
    what: [
      'এই লগইনটা শেষ করে; token আর কাজ করবে না।',
      'Ends this sign-in; the token stops working.',
    ],
    params: [TOKEN_PARAM],
    ok: ['লগআউট হয়েছে।', 'Signed out.'],
    data: { ok: true },
    errs: [SIGNIN],
  },
  {
    id: 'sh-me',
    g: 'shopper',
    m: 'GET',
    p: '/shopper/me',
    auth: true,
    what: ['লগইন করা কাস্টমারের অ্যাকাউন্ট।', 'The signed-in shopper\u2019s account.'],
    params: [TOKEN_PARAM],
    ok: ['অ্যাকাউন্টের তথ্য পাওয়া গেছে।', 'Account retrieved.'],
    data: shopper,
    errs: [SIGNIN],
  },
  {
    id: 'sh-me-edit',
    g: 'shopper',
    m: 'PATCH',
    p: '/shopper/me',
    auth: true,
    what: [
      'কাস্টমারের নাম বদলায়। ফোন নম্বরই অ্যাকাউন্ট, তাই সেটা বদলায় না।',
      "Changes the shopper's name. The phone is the account, so it never changes.",
    ],
    params: [
      TOKEN_PARAM,
      P(
        'name',
        'body',
        'string',
        true,
        'নতুন নাম, সর্বোচ্চ 100 অক্ষর।',
        'The new name, up to 100 characters.',
      ),
    ],
    body: { name: 'নুসরাত জাহান রিমা' },
    ok: ['অ্যাকাউন্ট আপডেট হয়েছে।', 'Account updated.'],
    data: { ...shopper, name: 'নুসরাত জাহান রিমা' },
    errs: [SIGNIN],
  },
  {
    id: 'sh-password',
    g: 'shopper',
    m: 'POST',
    p: '/shopper/password',
    st: 200,
    auth: true,
    what: [
      'বর্তমান পাসওয়ার্ড দিয়ে নতুন পাসওয়ার্ড; কাস্টমারের অন্য সব লগইন শেষ হয়ে যায়।',
      "A new password, given the current one; the shopper's other sign-ins end.",
    ],
    params: [
      TOKEN_PARAM,
      P('currentPassword', 'body', 'string', true, 'এখনকার পাসওয়ার্ড।', 'The password now.'),
      P(
        'newPassword',
        'body',
        'string',
        true,
        'নতুন পাসওয়ার্ড, 8 থেকে 20 অক্ষর।',
        'The new password, 8 to 20 characters.',
      ),
    ],
    body: { currentPassword: 'Megh#2026', newPassword: 'Nusrat@Mirpur10' },
    ok: ['আপনার পাসওয়ার্ড পরিবর্তন হয়েছে।', 'Your password has been changed.'],
    data: { ok: true },
    errs: [SIGNIN],
  },
  {
    id: 'sh-addresses',
    g: 'shopper',
    m: 'GET',
    p: '/shopper/addresses',
    auth: true,
    what: [
      'কাস্টমারের সেভ করা অ্যাড্রেস, ডিফল্টটা প্রথমে। চেকআউটে আগে থেকে ভরে দিতে কাজে লাগে।',
      "The shopper's saved addresses, the default first. Fill checkout in with them.",
    ],
    params: [TOKEN_PARAM],
    ok: ['অ্যাড্রেসগুলো পাওয়া গেছে।', 'Addresses retrieved.'],
    data: { addresses: [addrHome, addrOffice] },
    errs: [SIGNIN],
  },
  {
    id: 'sh-address-new',
    g: 'shopper',
    m: 'POST',
    p: '/shopper/addresses',
    st: 201,
    auth: true,
    what: [
      'নতুন অ্যাড্রেস সেভ করে, সর্বোচ্চ 10টি; প্রথমটাই ডিফল্ট। উত্তরে সব অ্যাড্রেস আসে।',
      'Saves an address, up to 10; the first is the default. The answer lists them all.',
    ],
    params: [
      TOKEN_PARAM,
      P(
        'label',
        'body',
        'string',
        true,
        'যেমন বাসা বা অফিস; সর্বোচ্চ 30 অক্ষর।',
        'Such as Home or Office; up to 30 characters.',
      ),
      P('locationId', 'body', 'number', true, 'থানার id।', 'The thana\u2019s id.'),
      P(
        'deliveryAddress',
        'body',
        'string',
        true,
        'বাড়ি, রোড, এলাকা; সর্বোচ্চ 500 অক্ষর।',
        'House, road, area; up to 500 characters.',
      ),
      P(
        'isDefault',
        'body',
        'boolean',
        false,
        'true দিলে এটাই ডিফল্ট।',
        'true makes it the default.',
      ),
    ],
    body: {
      label: 'অফিস',
      locationId: 146,
      deliveryAddress: 'লেভেল 5, বাড়ি 27, রোড 9/A, ধানমন্ডি',
      isDefault: false,
    },
    ok: ['অ্যাড্রেস সেভ হয়েছে।', 'Address saved.'],
    data: { addresses: [addrHome, addrOffice] },
    errs: [SIGNIN, THANA_400],
  },
  {
    id: 'sh-address-edit',
    g: 'shopper',
    m: 'PATCH',
    p: '/shopper/addresses/{id}',
    ex: '/shopper/addresses/' + AD2,
    auth: true,
    what: [
      'একটি অ্যাড্রেস বদলায়, অথবা isDefault: true দিয়ে ডিফল্ট করে।',
      'Changes an address, or makes it the default with isDefault: true.',
    ],
    params: [
      TOKEN_PARAM,
      P('id', 'path', 'string', true, 'অ্যাড্রেসের id।', "The address's id."),
      P(
        'label · locationId · deliveryAddress · isDefault',
        'body',
        '',
        false,
        'যেটা বদলাবেন শুধু সেটা; অন্তত একটি।',
        'Only what changes; at least one.',
      ),
    ],
    body: { isDefault: true },
    ok: ['অ্যাড্রেস সেভ হয়েছে।', 'Address saved.'],
    data: {
      addresses: [
        { ...addrOffice, isDefault: true },
        { ...addrHome, isDefault: false },
      ],
    },
    errs: [SIGNIN, ADDR_404],
  },
  {
    id: 'sh-address-delete',
    g: 'shopper',
    m: 'DELETE',
    p: '/shopper/addresses/{id}',
    ex: '/shopper/addresses/' + AD2,
    auth: true,
    what: [
      'একটি অ্যাড্রেস ডিলিট করে। ডিফল্টটা ডিলিট হলে বাকিগুলোর সবচেয়ে পুরোনোটা ডিফল্ট হয়।',
      'Deletes an address. If it was the default, the oldest one left becomes the default.',
    ],
    params: [TOKEN_PARAM, P('id', 'path', 'string', true, 'অ্যাড্রেসের id।', "The address's id.")],
    ok: ['অ্যাড্রেস ডিলিট হয়েছে।', 'Address deleted.'],
    data: { addresses: [addrHome] },
    errs: [SIGNIN, ADDR_404],
  },
  {
    id: 'sh-orders',
    g: 'shopper',
    m: 'GET',
    p: '/shopper/orders',
    q: '?page=1&limit=20',
    auth: true,
    what: [
      'কাস্টমারের ফোন নম্বরের সব অর্ডার, নতুনটা আগে: নম্বর, স্ট্যাটাস আর টোটাল। নাম বা ঠিকানা আসে না।',
      "Every order with the shopper's phone, newest first: number, status and total. Never a name or address.",
    ],
    params: [
      TOKEN_PARAM,
      P('page', 'query', 'number', false, 'পেজ নম্বর, 1 থেকে।', 'The page, from 1.'),
      P(
        'limit',
        'query',
        'number',
        false,
        'এক পেজে কয়টি: 1 থেকে 100, না দিলে 20।',
        'How many a page: 1 to 100, 20 if left out.',
      ),
    ],
    ok: ['অর্ডারগুলো পাওয়া গেছে।', 'Orders retrieved.'],
    data: {
      orders: [
        {
          orderNumber: '261121-0057',
          trackingId: 'K7F2M9QX',
          status: 'pending',
          grandTotal: '3270.00',
          createdAt: '2026-11-21T05:42:10.000Z',
        },
        {
          orderNumber: '261119-0042',
          trackingId: 'H4QW8N2C',
          status: 'shipped',
          grandTotal: '1520.00',
          createdAt: '2026-11-19T05:42:10.000Z',
        },
      ],
      page: 1,
      limit: 20,
      total: 2,
      pages: 1,
    },
    errs: [SIGNIN],
  },
  {
    id: 'feed',
    g: 'feeds',
    m: 'GET',
    p: '/feeds/meta/{token}.csv',
    ex: '/feeds/meta/YOUR_FEED_TOKEN.csv',
    nokey: true,
    csv: true,
    what: [
      'Facebook আর Instagram শপের জন্য Meta ক্যাটালগ ফিড: বিক্রিতে থাকা প্রতিটি ভ্যারিয়েন্টের এক লাইন, CSV-তে। Meta Commerce Manager নিজে নিজে এটা নিয়মিত পড়ে।',
      'The Meta catalog feed for your Facebook and Instagram shop: one row per variant on sale, as CSV. Meta Commerce Manager reads it on its own schedule.',
    ],
    params: [
      P(
        'token',
        'path',
        'string',
        true,
        'ফিডের গোপন ঠিকানার অংশ। পুরো ঠিকানা কপি করুন সেটিংস → Facebook ও Meta থেকে।',
        "The secret part of the feed's address. Copy the whole address from Settings → Facebook and Meta.",
      ),
    ],
    csvHead:
      'id,item_group_id,title,description,availability,condition,price,link,image_link,additional_image_link,brand,color,size',
    errs: [
      [404, 'not_found', 'PageNotFound', 'পেজটি খুঁজে পাওয়া যায়নি।', 'Page not found.'],
      [
        429,
        'quota_exceeded',
        'RequestsUsedUp',
        'এই শপ এই বিলিং পিরিয়ডের সব API রিকোয়েস্ট ব্যবহার করে ফেলেছে। পরের পিরিয়ডে আবার শুরু হবে।',
        'This shop has used all its API requests for this billing period. They start again with the next one.',
      ],
    ],
    note: [
      'এই রুটে API কী লাগে না: ঠিকানার token-ই চাবি, তাই ঠিকানাটা কাউকে দেবেন না। প্রতিটি ফিড পড়া একটি রিকোয়েস্ট হিসেবে গোনা হয়।',
      'No API key here: the token in the address is the key, so keep the address private. Each fetch counts as one request.',
    ],
  },
  {
    id: 'methods',
    g: 'payments',
    m: 'GET',
    p: '/payment-methods',
    what: [
      'কাস্টমার যে মেথডে অ্যাডভান্স দিতে পারে: চালু থাকা প্রতিটি মেথড আর তার অ্যাক্টিভ অ্যাকাউন্ট। ক্যাশ হয় না, তাই কোনো মেথড বন্ধ করলে সাথে সাথে চেকআউট থেকে সরে যায়।',
      'The methods a shopper can pay an advance by: each one that is on, with its active account. Never cached, so a method you switch off leaves checkout at once.',
    ],
    params: [],
    ok: ['পেমেন্ট মেথডের তথ্য পাওয়া গেছে।', 'Payment methods retrieved.'],
    data: {
      methods: [
        {
          method: 'bkash',
          kind: 'wallet',
          way: 'listener',
          accountName: 'Megh Fashion',
          number: '01711234567',
          accountType: 'personal',
          note: null,
          bank: null,
        },
        {
          method: 'nagad',
          kind: 'wallet',
          way: 'manual',
          accountName: 'Megh Fashion',
          number: '01819876543',
          accountType: 'personal',
          note: null,
          bank: null,
        },
      ],
    },
    note: [
      'মালিকের ফোন ভেরিফাই না হওয়া পর্যন্ত লিস্ট খালি থাকে।',
      "The list stays empty until the owner's phone is verified.",
    ],
  },
  {
    id: 'version',
    g: 'version',
    m: 'GET',
    p: '/catalogue/version',
    what: [
      'ক্যাটালগের এখনকার ভার্সন। প্রথমে এটা পড়ুন, তারপর ক্যাটালগের ঠিকানায় ?v= হিসেবে বসান: কিছু বদলালে ভার্সন বদলায়, তাই ব্রাউজার নতুন উত্তর আনে।',
      "The catalogue's version now. Read it first, then put it in the catalogue addresses as ?v=: any change changes the version, so the browser fetches fresh answers.",
    ],
    params: [],
    ok: ['ক্যাটালগ ভার্সন পাওয়া গেছে।', 'Catalogue version retrieved.'],
    data: { version: '184.7' },
  },
];

/* Every route with a key meets these, in this order (public-key.guard.ts); then the route's own. */
