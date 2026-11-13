// The sketch's own day (docs/brand/lytro-operator.html, its fixtures), in the server's shapes, so a screen can be set beside
// its drawing. Every function makes a fresh copy: a test's writes change only its own.

/** The moment the sketch is drawn at. */
export const NOW = '2026-10-21T14:30:00+06:00';

const CREATED = '2026-01-01T00:00:00.000Z';

/** The sketch's limits on a plan, without the per-minute limit KNOWN-GAPS §82 took off plans. */
function planLimits(
  products: number,
  monthly: number | null,
  staff: number,
  storage: number,
  bandwidth: number,
  smsTotal: number | null,
  smsMonthly: number | null,
  devices: number,
  retention: number,
  requests: number,
): Record<string, number | null> {
  return {
    products,
    orders_handled_monthly: monthly,
    staff,
    storage_mb: storage,
    bandwidth_gb: bandwidth,
    essential_sms_total: smsTotal,
    essential_sms_monthly: smsMonthly,
    paired_devices: devices,
    activity_retention_days: retention,
    requests_monthly: requests,
  };
}

export function drawnPlans(): Record<string, unknown>[] {
  const plan = (
    id: string,
    name: string,
    rank: number,
    forSale: boolean,
    version: number,
    limits: Record<string, number | null>,
    features: Record<string, boolean>,
    description: string,
    shopsByVersion: { version: number; shops: number }[],
  ) => ({
    id,
    name,
    description,
    rank,
    forSale,
    version,
    limits,
    features,
    createdAt: '2026-07-14T00:00:00.000Z',
    shopsByVersion,
    deletable: false,
    // PLN-21, as the sketch draws it: Starter is the suggested plan; the pricing page shows the plans for sale and
    // Pay-as-you-go, never the Trial.
    suggested: id === 'p-starter',
    trial: id === 'p-trial',
    onPricingPage: forSale || id === 'p-payg',
  });
  const small = { custom_domain: false, ai_reply: false, api: true, payment_page: true };
  const large = { custom_domain: true, ai_reply: true, api: true, payment_page: true };
  return [
    plan(
      'p-trial',
      'Trial',
      0,
      false,
      2,
      planLimits(20, 40, 1, 200, 5, 8, null, 1, 30, 20000),
      small,
      'Thirty days to reach a first order.',
      [{ version: 2, shops: 310 }],
    ),
    plan(
      'p-payg',
      'Pay-as-you-go',
      1,
      false,
      1,
      planLimits(25, null, 1, 250, 10, null, 5, 1, 30, 100000),
      small,
      'No subscription; a fee on every fulfilled order.',
      [{ version: 1, shops: 44 }],
    ),
    plan(
      'p-starter',
      'Starter',
      2,
      true,
      3,
      planLimits(100, 300, 2, 2048, 30, null, 10, 1, 30, 200000),
      small,
      'A small shop with one helper.',
      [
        { version: 3, shops: 131 },
        { version: 2, shops: 57 },
      ],
    ),
    plan(
      'p-growth',
      'Growth',
      3,
      true,
      2,
      planLimits(1000, 1500, 5, 4096, 100, null, 15, 2, 90, 600000),
      large,
      'A growing shop with staff and its own domain.',
      [{ version: 2, shops: 71 }],
    ),
    plan(
      'p-pro',
      'Pro',
      4,
      true,
      1,
      planLimits(5000, 6000, 15, 8192, 300, null, 20, 5, 365, 2000000),
      large,
      'Many staff, many devices, a year of history.',
      [{ version: 1, shops: 19 }],
    ),
  ];
}

/** Starter's two earlier versions. A stored version records when it was replaced. */
export function drawnPlanVersions(): Record<string, Record<string, unknown>[]> {
  const starter = (version: number, recordedAt: string, products: number, monthly: number) => ({
    id: `pv-${String(version)}`,
    planId: 'p-starter',
    version,
    name: 'Starter',
    description: null,
    rank: 2,
    forSale: true,
    limits: planLimits(products, monthly, 2, 2048, 30, null, 10, 1, 30, 200000),
    features: { custom_domain: false, ai_reply: false, api: true, payment_page: true },
    recordedAt,
  });
  return {
    'p-starter': [
      starter(1, '2026-08-12T00:00:00.000Z', 80, 250),
      starter(2, '2026-09-29T00:00:00.000Z', 80, 300),
    ],
  };
}

export function drawnTerms(): Record<string, unknown>[] {
  const term = (
    id: string,
    labelEn: string,
    labelBn: string,
    months: number,
    displayOrder: number,
    defaultDiscountPct: string | null,
    invoices: number,
    more: Record<string, unknown> = {},
  ) => ({
    id,
    labelEn,
    labelBn,
    months,
    visible: true,
    displayOrder,
    defaultDiscountPct,
    tenantId: null,
    retiredAt: null,
    createdAt: CREATED,
    invoices,
    deletable: false,
    ...more,
  });
  return [
    term('t1', '1 month', '১ মাস', 1, 1, null, 412),
    term('t6', '6 months', '৬ মাস', 6, 2, '5.00', 57),
    term('t12', '12 months', '১২ মাস', 12, 3, '12.00', 96),
    term('t3x', 'Launch offer · 3 months', 'লঞ্চ অফার · ৩ মাস', 3, 4, '20.00', 3, {
      visible: false,
      tenantId: 'ten-0007',
      retiredAt: '2026-09-30T00:00:00.000Z',
    }),
  ];
}

export function drawnPrices(): { planId: string; billingTermId: string; price: string }[] {
  const prices: [string, string, number][] = [
    ['p-starter', 't1', 449],
    ['p-starter', 't6', 2559],
    ['p-starter', 't12', 4741],
    ['p-starter', 't3x', 1077],
    ['p-growth', 't1', 699],
    ['p-growth', 't6', 3984],
    ['p-growth', 't12', 7381],
    ['p-pro', 't1', 999],
    ['p-pro', 't6', 5694],
    ['p-pro', 't12', 10549],
  ];
  return prices.map(([planId, billingTermId, price]) => ({
    planId,
    billingTermId,
    price: `${String(price)}.00`,
  }));
}

export function drawnRates(): Record<string, unknown>[] {
  const rate = (key: string, value: string, effectiveFrom: string) => ({
    key,
    value,
    effectiveFrom: `${effectiveFrom}T00:00:00.000Z`,
  });
  return [
    rate('sms_per_unit', '0.40', '2026-09-01'),
    rate('ai_reply', '1.00', '2026-07-14'),
    rate('fraud_check', '2.00', '2026-07-14'),
    rate('payg_order_fee_min', '20.00', '2026-07-14'),
    rate('payg_order_fee_pct', '1.50', '2026-10-02'),
    rate('payg_product_fee', '10.00', '2026-07-14'),
    rate('sms_unit_size_chars', '160.00', '2026-07-14'),
    rate('listener_verification_pct', '0.10', '2026-11-02'),
    rate('gateway_verification_pct', '1.00', '2026-11-03'),
  ];
}

export function drawnRateHistory(): Record<string, Record<string, unknown>[]> {
  const line = (id: number, key: string, oldValue: string, newValue: string, day: string) => ({
    id,
    key,
    oldValue,
    newValue,
    changedBy: 'op-1',
    changedByEmail: 'ops@lytro.app',
    noticeId: null,
    changedAt: `${day}T00:00:00.000Z`,
  });
  return {
    sms_per_unit: [line(1, 'sms_per_unit', '0.35', '0.40', '2026-09-01')],
    payg_order_fee_pct: [
      line(2, 'payg_order_fee_pct', '1.50', '2.00', '2026-08-01'),
      line(3, 'payg_order_fee_pct', '2.00', '1.50', '2026-10-02'),
    ],
  };
}

/** OPERATOR-CONSOLE-DESIGN §10: bKash on the listener, Nagad by hand, as a platform starts. */
export function drawnPaymentMethods(): Record<string, unknown> {
  const wallet = (method: string, enabled: boolean, way: string, ways: string[]) => ({
    method,
    kind: method === 'bank' ? 'bank' : 'wallet',
    enabled,
    way,
    ways,
    gateway:
      method === 'bkash'
        ? { connected: false, unreadable: false, sandbox: false, number: null }
        : null,
  });
  return {
    methods: [
      wallet('bkash', true, 'listener', ['automated', 'listener', 'manual']),
      wallet('nagad', true, 'manual', ['manual']),
      wallet('rocket', true, 'manual', ['manual']),
      wallet('upay', false, 'manual', ['manual']),
      wallet('bank', false, 'manual', ['manual']),
    ],
    bankAccounts: [],
  };
}

export function drawnWallets(): Record<string, unknown>[] {
  const wallet = (
    id: string,
    provider: string,
    number: string,
    label: string | null,
    enabled: boolean,
    displayOrder: number,
  ) => ({ id, provider, number, label, enabled, displayOrder, createdAt: CREATED });
  return [
    wallet('w1', 'bKash', '01711 000000', 'Lytronix · personal', true, 1),
    wallet('w2', 'Nagad', '01811 000000', 'Lytronix · personal', true, 2),
    wallet('w3', 'Rocket', '01911 0000001', null, false, 3),
  ];
}

export function drawnCatalogueAddons(): Record<string, unknown>[] {
  const addon = (
    key: string,
    labelEn: string,
    labelBn: string,
    kind: string,
    limitKey: string | null,
    unitSize: number | null,
    price: number,
    counts: { running?: number; bought?: number },
    retiredAt: string | null = null,
  ) => ({
    id: `addon-${key}`,
    key,
    kind,
    limitKey,
    unitSize,
    price: `${String(price)}.00`,
    labelEn,
    labelBn,
    retiredAt,
    createdAt: CREATED,
    running: counts.running ?? 0,
    boughtThisMonth: counts.bought ?? 0,
  });
  return [
    addon(
      'products_500',
      'Extra 500 products',
      'আরও ৫০০ প্রোডাক্ট',
      'limit',
      'products',
      500,
      149,
      {
        running: 41,
      },
    ),
    addon('seat', 'One seat', 'একটা সিট', 'limit', 'staff', 1, 49, { running: 118 }),
    addon('storage_1gb', '1 GB storage', '১ GB স্টোরেজ', 'limit', 'storage_mb', 1024, 29, {
      running: 63,
    }),
    addon('bandwidth_10gb', '10 GB bandwidth', '১০ GB ব্যান্ডউইথ', 'pack', 'bandwidth_gb', 10, 30, {
      bought: 212,
    }),
    addon(
      'requests_100k',
      '100,000 requests',
      '১,০০,০০০ রিকোয়েস্ট',
      'pack',
      'requests_monthly',
      100000,
      20,
      { bought: 37 },
    ),
    addon('brand_identity', 'Brand identity', 'ব্র্যান্ড আইডেন্টিটি', 'feature', null, null, 149, {
      running: 26,
    }),
    // D7-17, D7-36 (Phase 7): the first allowance, 200 reads at the rate's price.
    addon(
      'address_reads_200',
      'Address reads from messages',
      'মেসেজ থেকে ঠিকানা পড়া',
      'allowance',
      'address_reads',
      200,
      20,
      { running: 37 },
    ),
    addon(
      'storage_500mb',
      '500 MB storage',
      '৫০০ MB স্টোরেজ',
      'limit',
      'storage_mb',
      512,
      19,
      { running: 4 },
      '2026-10-20T00:00:00.000Z',
    ),
  ];
}

export function drawnPresets(): Record<string, unknown>[] {
  const preset = (
    key: string,
    labelEn: string,
    labelBn: string,
    stockUnit: string,
    stockTracking: string,
    batchTracked: boolean,
    serialTracked: boolean,
    serialFormat: string,
    low: number,
    suggestedCategories: string[],
    suggestedAttributeIds: string[],
    upFrontFields: string[],
  ) => ({
    key,
    labelEn,
    labelBn,
    defaults: {
      stockUnit,
      stockTracking,
      batchTracked,
      serialTracked,
      serialFormat,
      lowStockThreshold: `${String(low)}.000`,
      suggestedCategories,
      suggestedAttributeIds,
      upFrontFields,
    },
  });
  return [
    preset(
      'clothing',
      'Clothing',
      'পোশাক',
      'piece',
      'tracked',
      false,
      false,
      'any',
      5,
      ['Sarees', 'Three-piece', 'Panjabi', 'Shirts', 'T-shirts', 'Kids', 'Hijab', 'Lungi'],
      ['a1', 'a2', 'a3'],
      ['sizeChart', 'deliveryCharge'],
    ),
    preset(
      'mobiles_gadgets',
      'Mobiles and gadgets',
      'মোবাইল ও গ্যাজেট',
      'piece',
      'tracked',
      false,
      true,
      'imei',
      2,
      ['Phones', 'Chargers', 'Earbuds', 'Cases', 'Power banks', 'Smart watches'],
      ['a4', 'a5', 'a1', 'a7'],
      ['serialTracked', 'itemCondition', 'paymentPolicy', 'lowStockThreshold'],
    ),
    preset(
      'electronics',
      'Electronics',
      'ইলেকট্রনিক্স',
      'piece',
      'tracked',
      false,
      true,
      'any',
      2,
      ['Fans', 'Lights', 'Kitchen', 'Audio', 'Cables'],
      ['a4', 'a7'],
      ['serialTracked', 'itemCondition', 'weightKg'],
    ),
    preset(
      'cosmetics',
      'Cosmetics',
      'কসমেটিক্স',
      'piece',
      'tracked',
      true,
      false,
      'any',
      5,
      ['Skin care', 'Make-up', 'Hair', 'Fragrance', 'Men'],
      ['a4'],
      ['batchTracked', 'lowStockThreshold'],
    ),
    preset(
      'grocery',
      'Grocery',
      'মুদি',
      'kg',
      'tracked',
      true,
      false,
      'any',
      10,
      ['Rice', 'Oil', 'Spices', 'Snacks', 'Drinks', 'Household'],
      ['a4', 'a6'],
      ['batchTracked', 'weightKg', 'lowStockThreshold'],
    ),
    preset(
      'food_bakery',
      'Food and bakery',
      'খাবার ও বেকারি',
      'piece',
      'not_tracked',
      false,
      false,
      'any',
      0,
      ['Cakes', 'Pastry', 'Bread', 'Frozen', 'Pitha'],
      ['a6'],
      ['stockTracking', 'deliveryCharge', 'paymentPolicy'],
    ),
    preset(
      'pharmacy',
      'Pharmacy',
      'ফার্মেসি',
      'piece',
      'tracked',
      true,
      false,
      'any',
      20,
      ['Medicine', 'Baby care', 'Devices', 'Supplements'],
      ['a4'],
      ['batchTracked', 'lowStockThreshold'],
    ),
    preset(
      'shoes_bags',
      'Shoes and bags',
      'জুতা ও ব্যাগ',
      'piece',
      'tracked',
      false,
      false,
      'any',
      3,
      ['Men', 'Women', 'Kids', 'Bags', 'Sandals'],
      ['a2', 'a1', 'a3'],
      ['sizeChart', 'itemCondition'],
    ),
    preset(
      'books_stationery',
      'Books and stationery',
      'বই ও স্টেশনারি',
      'piece',
      'tracked',
      false,
      false,
      'any',
      3,
      ['Fiction', 'Academic', 'Children', 'Pens', 'Notebooks'],
      [],
      ['itemCondition', 'weightKg'],
    ),
  ];
}

export function drawnAttributes(): Record<string, unknown>[] {
  const option = (
    id: string,
    value: string,
    swatchColor: string | null = null,
    retired = false,
  ) => ({
    id,
    value,
    swatchColor,
    swatchImage: null,
    scope: 'platform',
    retired,
  });
  const attribute = (
    id: string,
    name: string,
    dataType: string,
    unitKind: string | null,
    retired: boolean,
    options: ReturnType<typeof option>[],
  ) => ({ id, name, dataType, unitKind, scope: 'platform', retired, options });
  return [
    attribute('a1', 'Colour', 'enum_single', null, false, [
      option('c1', 'Black', '#111111'),
      option('c2', 'White', '#ffffff'),
      option('c3', 'Red', '#c8323b'),
      option('c4', 'Navy', '#1f2f5c'),
      option('c5', 'Maroon', '#7a1f25'),
      option('c6', 'Olive', '#6b7a2a'),
      option('c7', 'Sky blue', '#7fc8f8'),
      option('c8', 'Gold', '#d4a017', true),
    ]),
    attribute('a2', 'Size', 'enum_single', null, false, [
      option('s1', 'XS'),
      option('s2', 'S'),
      option('s3', 'M'),
      option('s4', 'L'),
      option('s5', 'XL'),
      option('s6', 'XXL'),
      option('s7', 'Free size'),
    ]),
    attribute('a3', 'Material', 'text', null, false, []),
    attribute('a4', 'Brand', 'text', null, false, []),
    attribute('a5', 'Storage', 'enum_single', null, false, [
      option('t1', '64 GB'),
      option('t2', '128 GB'),
      option('t3', '256 GB'),
      option('t4', '512 GB'),
      option('t5', '1 TB'),
    ]),
    attribute('a6', 'Weight', 'number_with_unit', 'weight', false, []),
    attribute('a7', 'Warranty', 'enum_single', null, false, [
      option('w1', 'None'),
      option('w2', '6 months'),
      option('w3', '1 year'),
      option('w4', '2 years'),
    ]),
    attribute('a8', 'Pattern', 'enum_multi', null, true, [
      option('p1', 'Plain'),
      option('p2', 'Printed'),
      option('p3', 'Check'),
    ]),
  ];
}

export function drawnOptionSets(): Record<string, unknown>[] {
  const set = (id: string, name: string, options: string[], presetKey: string | null) => ({
    id,
    name,
    options,
    scope: 'platform',
    presetKey,
  });
  return [
    set('o1', 'Clothing sizes', ['XS', 'S', 'M', 'L', 'XL', 'XXL'], 'clothing'),
    set(
      'o2',
      'Shoe sizes, EU',
      ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'],
      'shoes_bags',
    ),
    set('o3', 'Phone storage', ['64 GB', '128 GB', '256 GB', '512 GB'], 'mobiles_gadgets'),
    set('o4', 'Basic colours', ['Black', 'White', 'Red', 'Blue', 'Green'], null),
  ];
}

export interface ShopFixture {
  id: string;
  slug: string;
  shopName: string;
  state: string;
  planId: string;
  planName: string;
  planVersion: number;
  periodEnd: string | null;
  suspension: { at: string; reason: string; by: string } | null;
  paymentPageSuspension: { at: string; reason: string } | null;
  newShopCap: { set: boolean | null; holds: boolean };
  overrides: Record<string, unknown>[];
}

function shop(
  id: string,
  slug: string,
  shopName: string,
  state: string,
  planName: string,
  planId: string,
  planVersion: number,
  periodEnd: string | null,
  more: Partial<ShopFixture> = {},
): ShopFixture {
  return {
    id,
    slug,
    shopName,
    state,
    planId,
    planName,
    planVersion,
    periodEnd,
    suspension: null,
    paymentPageSuspension: null,
    newShopCap: { set: null, holds: state === 'pay_as_you_go' },
    overrides: [],
    ...more,
  };
}

export const RAHIM = 'ten-0001';
export const GADGET = 'ten-0007';
export const MEHEDI = 'ten-0015';

export function drawnShops(): ShopFixture[] {
  return [
    shop(
      RAHIM,
      'rahim-fashion',
      'Rahim Fashion',
      'active',
      'Starter',
      'p-starter',
      3,
      '2026-11-14',
    ),
    shop(
      GADGET,
      'dhaka-gadget',
      'Dhaka Gadget House',
      'active',
      'Growth',
      'p-growth',
      2,
      '2027-03-02',
      {
        suspension: {
          at: '2026-10-12T10:05:00+06:00',
          reason: 'Counterfeit chargers reported by two shoppers; listings under review',
          by: 'ops@lytro.app',
        },
        overrides: [
          {
            id: 'o-1',
            tenantId: GADGET,
            limitKey: 'products',
            value: 1500,
            reason: 'Agreed with the owner during migration from the old shop',
            setBy: 'op-1',
            setByEmail: 'ops@lytro.app',
            setAt: '2026-09-18T00:00:00.000Z',
          },
        ],
      },
    ),
    shop(
      'ten-0012',
      'nusrat-cosmetics',
      'Nusrat Cosmetics',
      'trial',
      'Trial',
      'p-trial',
      2,
      '2026-11-09',
    ),
    shop(
      MEHEDI,
      'mehedi-books',
      'Mehedi Books',
      'pay_as_you_go',
      'Pay-as-you-go',
      'p-payg',
      1,
      null,
    ),
    shop(
      'ten-0019',
      'sadia-collection',
      'Sadia Collection',
      'grace',
      'Starter',
      'p-starter',
      2,
      '2026-10-19',
    ),
    shop(
      'ten-0023',
      'tanvir-mobiles',
      'Tanvir Mobiles',
      'read_only',
      'Growth',
      'p-growth',
      2,
      '2026-10-15',
    ),
    shop(
      'ten-0028',
      'keya-boutique',
      'Keya Boutique',
      'locked',
      'Starter',
      'p-starter',
      3,
      '2026-10-08',
    ),
    shop(
      'ten-0031',
      'lal-sabuj-grocery',
      'Lal Sabuj Grocery',
      'archived',
      'Starter',
      'p-starter',
      2,
      '2026-09-20',
    ),
    shop('ten-0034', 'faiza-shoes', 'Faiza Shoes', 'active', 'Pro', 'p-pro', 1, '2027-06-30', {
      overrides: [
        {
          id: 'o-2',
          tenantId: 'ten-0034',
          limitKey: 'bandwidth_gb',
          value: null,
          reason: 'Eid campaign, agreed for October',
          setBy: 'op-1',
          setByEmail: 'ops@lytro.app',
          setAt: '2026-10-02T00:00:00.000Z',
        },
      ],
    }),
    shop(
      'ten-0040',
      'arif-electronics',
      'Arif Electronics',
      'active',
      'Growth',
      'p-growth',
      2,
      '2026-12-01',
    ),
    shop('ten-0044', 'mim-bakery', 'Mim Bakery', 'trial', 'Trial', 'p-trial', 2, '2026-11-18'),
    shop(
      'ten-0051',
      'joy-pharmacy',
      'Joy Pharmacy',
      'active',
      'Starter',
      'p-starter',
      3,
      '2026-11-02',
    ),
  ];
}

/** A shop as its own page reads it. */
export function shopDetail(each: ShopFixture): Record<string, unknown> {
  return {
    id: each.id,
    slug: each.slug,
    shopName: each.shopName,
    state: each.state,
    createdAt: CREATED,
    planId: each.planId,
    planName: each.planName,
    planVersion: each.planVersion,
    periodStart: null,
    periodEnd: each.periodEnd,
    overrideCount: each.overrides.length,
    suspension: each.suspension,
    paymentPageSuspension: each.paymentPageSuspension,
    newShopCap: each.newShopCap,
  };
}

export interface PaymentFixture {
  id: string;
  tenantId: string;
  kind: string;
  planId: string | null;
  billingTermId: string | null;
  amount: string;
  creditAmount: string;
  quotedAt: string;
  status: string;
  senderNumber: string | null;
  transactionId: string | null;
  verifiedBy: null;
  verifiedAt: null;
  submittedAt: string;
  note: null;
  cancelReason: null;
  createdAt: string;
  addons: Record<string, unknown>[];
  shopName: string;
  shopSlug: string;
  wallet: string | null;
  amountSent: string | null;
  amountArrived: string | null;
  reviewReason: string | null;
}

function payment(
  id: string,
  shopName: string,
  shopSlug: string,
  tenantId: string,
  kind: string,
  planId: string | null,
  billingTermId: string | null,
  amount: string,
  sender: string,
  trx: string,
  quotedAt: string,
  createdAt: string,
  more: Partial<PaymentFixture> = {},
): PaymentFixture {
  return {
    id,
    tenantId,
    kind,
    planId,
    billingTermId,
    amount,
    creditAmount: '0.00',
    quotedAt,
    status: 'pending',
    senderNumber: sender,
    transactionId: trx,
    verifiedBy: null,
    verifiedAt: null,
    submittedAt: createdAt,
    note: null,
    cancelReason: null,
    createdAt,
    addons: [],
    shopName,
    shopSlug,
    wallet: null,
    amountSent: amount,
    amountArrived: null,
    reviewReason: null,
    ...more,
  };
}

export const REVIEW_RENEWAL = 'pay-9101';
export const REVIEW_PURCHASE = 'pay-9104';
export const TOP_UP = 'pay-9106';
export const UPGRADE = 'pay-9107';
export const REVIEW_SENDER = 'pay-9111';
export const ADDON = 'pay-9110';

export function drawnPayments(): PaymentFixture[] {
  return [
    payment(
      REVIEW_RENEWAL,
      'Sadia Collection',
      'sadia-collection',
      'ten-0019',
      'renewal',
      'p-starter',
      't1',
      '449.00',
      '01712 345678',
      'BKH7A2M9Q1',
      '2026-10-21T11:02:00+06:00',
      '2026-10-21T11:40:00+06:00',
      {
        status: 'needs_review',
        wallet: 'bKash',
        amountSent: '449.00',
        amountArrived: '448.00',
        reviewReason: 'amount',
      },
    ),
    payment(
      REVIEW_PURCHASE,
      'Keya Boutique',
      'keya-boutique',
      'ten-0028',
      'purchase',
      'p-starter',
      't12',
      '4741.00',
      '01911 223344',
      'NGD55K2P0X',
      '2026-10-20T21:15:00+06:00',
      '2026-10-20T21:50:00+06:00',
      {
        status: 'needs_review',
        wallet: 'Nagad',
        amountSent: '4741.00',
        amountArrived: '4700.00',
        reviewReason: 'amount',
      },
    ),
    payment(
      TOP_UP,
      'Rahim Fashion',
      'rahim-fashion',
      RAHIM,
      'top_up',
      null,
      null,
      '500.00',
      '01811 998877',
      'BKH9Z1C4T7',
      '2026-10-21T13:58:00+06:00',
      '2026-10-21T14:05:00+06:00',
    ),
    payment(
      UPGRADE,
      'Arif Electronics',
      'arif-electronics',
      'ten-0040',
      'upgrade',
      'p-pro',
      't1',
      '400.00',
      '01555 112233',
      'BKH2Q8W7N4',
      '2026-10-21T12:20:00+06:00',
      '2026-10-21T12:31:00+06:00',
    ),
    payment(
      'pay-9108',
      'Nusrat Cosmetics',
      'nusrat-cosmetics',
      'ten-0012',
      'purchase',
      'p-growth',
      't6',
      '3984.00',
      '01611 445566',
      'NGD3H6J9L2',
      '2026-10-21T09:12:00+06:00',
      '2026-10-21T09:30:00+06:00',
    ),
    payment(
      'pay-9109',
      'Joy Pharmacy',
      'joy-pharmacy',
      'ten-0051',
      'top_up',
      null,
      null,
      '1000.00',
      '01722 667788',
      'BKH4R5T6Y8',
      '2026-10-21T14:10:00+06:00',
      '2026-10-21T14:18:00+06:00',
    ),
    payment(
      REVIEW_SENDER,
      'Faiza Shoes',
      'faiza-shoes',
      'ten-0034',
      'top_up',
      null,
      null,
      '2000.00',
      '01611 223300',
      'BKH8S3D1F6',
      '2026-10-21T10:02:00+06:00',
      '2026-10-21T10:15:00+06:00',
      {
        status: 'needs_review',
        wallet: 'bKash',
        amountSent: '2000.00',
        amountArrived: '2000.00',
        reviewReason: 'sender',
      },
    ),
  ];
}

/** The add-on paid on the payment page, which the sketch draws on its own. */
export function addonPayment(): PaymentFixture {
  return payment(
    ADDON,
    'Rahim Fashion',
    'rahim-fashion',
    RAHIM,
    'addon',
    null,
    null,
    '99.00',
    '01811 998877',
    'BKH6M2N8P1',
    '2026-10-21T12:48:00+06:00',
    '2026-10-21T12:55:00+06:00',
    {
      addons: [
        {
          id: 'pa-1',
          key: 'products_500',
          labelEn: 'Extra 500 products',
          labelBn: 'আরও ৫০০ প্রোডাক্ট',
          quantity: 1,
          price: '99.00',
          status: 'pending',
          startsAt: null,
          expiresAt: '2026-11-14T00:00:00.000Z',
        },
      ],
    },
  );
}

export interface ReportFixture {
  id: string;
  shop: { id: string; name: string; slug: string; paymentPageSuspended: boolean };
  paymentUrl: string;
  reason: string;
  note: string | null;
  ip: string | null;
  status: string;
  createdAt: string;
  handledAt: string | null;
}

function report(
  id: string,
  shopId: string,
  name: string,
  slug: string,
  reason: string,
  note: string | null,
  ip: string | null,
  status: string,
  createdAt: string,
  handledAt: string | null = null,
): ReportFixture {
  return {
    id,
    shop: { id: shopId, name, slug, paymentPageSuspended: false },
    paymentUrl: `https://pay.lytro.app/p/${id}`,
    reason,
    note,
    ip,
    status,
    createdAt,
    handledAt,
  };
}

export const PIN_REPORT = 'rep-31';

export function drawnReports(): ReportFixture[] {
  return [
    report(
      PIN_REPORT,
      'ten-0040',
      'Arif Electronics',
      'arif-electronics',
      'asked_for_pin',
      null,
      '203.0.113.24',
      'open',
      '2026-10-21T13:40:00+06:00',
    ),
    report(
      'rep-30',
      GADGET,
      'Dhaka Gadget House',
      'dhaka-gadget',
      'wrong_amount',
      'The order said ৳1,250 but the page asked for ৳1,520.',
      '203.0.113.87',
      'open',
      '2026-10-21T10:22:00+06:00',
    ),
    report(
      'rep-29',
      'ten-0034',
      'Faiza Shoes',
      'faiza-shoes',
      'other',
      "It kept reloading and showed another shop's logo for a moment.",
      '198.51.100.12',
      'open',
      '2026-10-20T19:05:00+06:00',
    ),
    report(
      'rep-27',
      RAHIM,
      'Rahim Fashion',
      'rahim-fashion',
      'wrong_shop',
      null,
      '198.51.100.40',
      'dismissed',
      '2026-10-18T16:30:00+06:00',
      '2026-10-18T18:02:00+06:00',
    ),
    report(
      'rep-22',
      'ten-0028',
      'Keya Boutique',
      'keya-boutique',
      'asked_for_pin',
      'They wanted my bKash PIN on a phone call too.',
      null,
      'actioned',
      '2026-10-11T12:15:00+06:00',
      '2026-10-11T12:40:00+06:00',
    ),
  ];
}

export interface DeviceFixture {
  id: string;
  name: string;
  model: string | null;
  appVersion: string;
  pairedAt: string;
  lastSeenAt: string | null;
  online: boolean;
  status: string;
  revokedAt: string | null;
  revokeReason: null;
  flags: number;
  uploadsToday: number;
  installationId: string;
}

function device(
  id: string,
  name: string,
  model: string,
  appVersion: string,
  lastSeenAt: string,
  online: boolean,
  status: string,
  uploadsToday: number,
  flags: number,
  installationId: string,
): DeviceFixture {
  return {
    id,
    name,
    model,
    appVersion,
    pairedAt: CREATED,
    lastSeenAt,
    online,
    status,
    revokedAt: status === 'revoked' ? lastSeenAt : null,
    revokeReason: null,
    flags,
    uploadsToday,
    installationId,
  };
}

export function drawnShopPhones(): DeviceFixture[] {
  return [
    device(
      'd1',
      'Counter phone',
      'Xiaomi Redmi 12',
      '1.0.3',
      '2026-10-21T14:22:00+06:00',
      true,
      'active',
      14,
      0,
      'inst-7f3a92c1',
    ),
    device(
      'd2',
      'Old phone',
      'Samsung A15',
      '1.0.1',
      '2026-09-30T11:10:00+06:00',
      false,
      'revoked',
      0,
      2,
      'inst-21bb06fe',
    ),
  ];
}

export function drawnLytroPhones(): DeviceFixture[] {
  return [
    device(
      'l1',
      'Lytro bKash phone',
      'Xiaomi Redmi 12',
      '1.0.3',
      '2026-10-21T14:28:00+06:00',
      true,
      'active',
      23,
      0,
      'inst-90de41aa',
    ),
    device(
      'l2',
      'Lytro Nagad phone',
      'Samsung A15',
      '1.0.3',
      '2026-10-21T13:49:00+06:00',
      false,
      'active',
      6,
      0,
      'inst-3c77ab10',
    ),
  ];
}

export function drawnReceipts(): Record<string, unknown>[] {
  const receipt = (
    id: string,
    method: string | null,
    amount: string | null,
    transactionId: string | null,
    status: string,
    senderNumber: string | null,
    deviceId: string,
    receivedAt: string,
    more: Record<string, unknown> = {},
  ) => ({
    id,
    method,
    amount,
    transactionId,
    status,
    reviewReason: null,
    ignoredReason: null,
    orderNumber: null,
    receivedAt,
    senderNumber,
    deviceId,
    planPaymentId: null,
    text: null,
    ...more,
  });
  return [
    receipt(
      'r1',
      'bKash',
      '448.00',
      'BKH7A2M9Q1',
      'needs_review',
      '01712345678',
      'l1',
      '2026-10-21T11:38:00+06:00',
      {
        reviewReason: 'amount',
        planPaymentId: REVIEW_RENEWAL,
        text: 'You have received Tk 448.00 from 01712345678. Fee Tk 0.00. Balance Tk 12,040.50. TrxID BKH7A2M9Q1 at 21/10/2026 11:38',
      },
    ),
    receipt(
      'r2',
      'bKash',
      '699.00',
      'BKH3D8F1K2',
      'matched',
      '01755667788',
      'l1',
      '2026-10-21T11:12:00+06:00',
      {
        planPaymentId: 'pay-9099',
        text: 'You have received Tk 699.00 from 01755667788. Fee Tk 0.00. Balance Tk 11,592.50. TrxID BKH3D8F1K2 at 21/10/2026 11:12',
      },
    ),
    receipt(
      'r3',
      'Nagad',
      '1200.00',
      'NGD7W2E5R9',
      'unmatched',
      '01899001122',
      'l2',
      '2026-10-21T09:47:00+06:00',
      {
        text: 'Money Received. Amount: Tk 1,200.00 Sender: 01899001122 TxnID: NGD7W2E5R9 Balance: Tk 8,410.00',
      },
    ),
    receipt(
      'r4',
      'bKash',
      '699.00',
      'BKH3D8F1K2',
      'duplicate',
      '01755667788',
      'l1',
      '2026-10-21T11:13:00+06:00',
    ),
    receipt('r5', null, null, null, 'ignored', '16216', 'l1', '2026-10-20T20:31:00+06:00', {
      ignoredReason: 'not_receipt',
    }),
  ];
}

export function drawnUnread(): { day: string; shape: string; count: number }[] {
  return [
    {
      day: '2026-10-21',
      shape: 'You have received Tk # from #. Ref #. Fee Tk #. Balance Tk #. TrxID # at #',
      count: 23,
    },
    { day: '2026-10-21', shape: 'Cash In Tk # from #. Fee Tk #. TrxID # at #', count: 2 },
    {
      day: '2026-10-20',
      shape: 'You have received Tk # from #. Ref #. Fee Tk #. Balance Tk #. TrxID # at #',
      count: 11,
    },
    {
      day: '2026-10-19',
      shape: 'Money Received. Amount: Tk # Sender: # Ref: # TxnID: # Balance: Tk #',
      count: 4,
    },
  ];
}

export function drawnCredentialUses(): Record<string, unknown>[] {
  const use = (at: string, action: string, sessionId: string | null, succeeded: boolean) => ({
    method: 'bKash',
    action,
    accountId: 'acct-1',
    sessionId,
    succeeded,
    at,
  });
  return [
    use('2026-10-21T14:12:00+06:00', 'query', 'ps-8f2a', true),
    use('2026-10-21T14:11:00+06:00', 'execute', 'ps-8f2a', true),
    use('2026-10-21T14:10:00+06:00', 'create', 'ps-8f2a', true),
    use('2026-10-21T14:10:30+06:00', 'token', null, true),
    use('2026-10-21T09:03:00+06:00', 'create', 'ps-77c1', false),
  ];
}

export function drawnChanges(): Record<string, unknown>[] {
  return [
    {
      id: 4,
      action: 'rate_changed',
      at: '2026-09-01T00:00:00.000Z',
      by: 'ops@lytro.app',
      key: 'sms_per_unit',
      oldValue: '0.35',
      newValue: '0.40',
      reason: 'Provider price',
      shop: null,
    },
    {
      id: 3,
      action: 'rate_changed',
      at: '2026-10-02T00:00:00.000Z',
      by: 'ops@lytro.app',
      key: 'payg_order_fee_pct',
      oldValue: '2',
      newValue: '1.5',
      reason: 'Launch',
      shop: null,
    },
    {
      id: 2,
      action: 'settings_changed',
      at: '2026-10-02T00:00:00.000Z',
      by: 'ops@lytro.app',
      key: 'trial_days',
      oldValue: 7,
      newValue: 30,
      reason: 'Longer trial',
      shop: null,
    },
    {
      id: 1,
      action: 'tenant_suspended',
      at: '2026-10-12T04:05:00.000Z',
      by: 'ops@lytro.app',
      key: null,
      oldValue: null,
      newValue: null,
      reason: 'Counterfeit chargers',
      shop: { id: GADGET, name: 'Dhaka Gadget House', slug: 'dhaka-gadget' },
    },
  ];
}

/** A shop's add-ons and limits, as the sketch draws them. */
export function drawnAddons(): Record<string, unknown> {
  const addon = (
    id: string,
    key: string,
    kind: string,
    labelEn: string,
    labelBn: string,
    renewal: string,
    monthlyPrice: string,
    paidFrom: string,
  ) => ({
    id,
    addonId: id,
    key,
    kind,
    labelEn,
    labelBn,
    limitKey: null,
    unitSize: null,
    quantity: 1,
    startsAt: null,
    expiresAt: '2026-11-14T00:00:00.000Z',
    renews: renewal === 'with_plan',
    renewal,
    endsSoon: false,
    monthlyPrice,
    paidFrom,
  });
  const part = (key: string, plan: number, addons: number) => ({
    key,
    plan,
    overridden: false,
    override: null,
    addons,
    effective: plan + addons,
  });
  return {
    addons: [
      addon(
        'a1',
        'products_500',
        'limit',
        'Extra 500 products',
        'আরও ৫০০ প্রোডাক্ট',
        'with_plan',
        '149.00',
        'balance',
      ),
      addon('a2', 'seat', 'limit', 'One seat', 'একটা সিট', 'off', '49.00', 'wallet'),
      addon(
        'a3',
        'brand_identity',
        'feature',
        'Brand identity',
        'ব্র্যান্ড আইডেন্টিটি',
        'with_plan',
        '149.00',
        'balance',
      ),
    ],
    brandIdentity: true,
    packs: [
      { metric: 'bandwidth', left: 6.2 * 1024 ** 3, autoBuy: true },
      { metric: 'requests', left: 40000, autoBuy: false },
    ],
    limits: [
      part('products', 100, 500),
      part('staff', 2, 1),
      part('storage_mb', 2048, 0),
      part('bandwidth_gb', 30, 20),
    ],
  };
}

/** The signed-in operator's id, as GET /auth/operator/me answers it and every row they changed names them. */
export const OPERATOR_ID = 'op-1';

export function drawnSettings(): Record<string, unknown>[] {
  const setting = (
    key: string,
    value: number | string | string[] | Record<string, number>,
    description: string,
    changed?: { at: string; by: string | null },
  ) => ({
    key,
    value,
    description,
    updatedBy: changed?.by ? 'op-1' : null,
    updatedByEmail: changed?.by ?? null,
    updatedAt: changed?.at ?? '2026-07-14T00:00:00.000Z',
  });
  return [
    setting('trial_days', 30, 'How many days a new shop stays on the Trial plan (TRL-01).', {
      at: '2026-10-02T00:00:00.000Z',
      by: 'ops@lytro.app',
    }),
    setting(
      'top_up_min_amount',
      100,
      'The smallest amount a tenant may top up in one payment, in TK (BAL-04).',
    ),
    setting(
      'top_up_max_amount',
      50000,
      'The largest amount a tenant may top up in one payment, in TK (BAL-04).',
    ),
    setting('grace_days', 3, 'How many days of grace a lapsed tenant gets (LIF-26, 2.3).'),
    setting(
      'read_only_days',
      4,
      'How many days after grace a lapsed tenant stays read-only (LIF-26, 2.3).',
    ),
    setting(
      'locked_days',
      8,
      'How many days after read-only a lapsed tenant stays locked (LIF-26, 2.3).',
    ),
    setting(
      'archived_days',
      45,
      'How many days after locked a lapsed tenant stays archived before deletion (LIF-26, 2.3).',
    ),
    setting(
      'reservation_expiry_minutes',
      30,
      'How many minutes an order awaiting online payment holds its stock (INV-16).',
    ),
    setting(
      'order_limit_mode',
      'allow_with_prompt',
      "Past the period's order-handling limit: block, or allow with a prompt to upgrade (QTA-03).",
    ),
    setting(
      'usage_grace_percent',
      10,
      'How far past its bandwidth or API request limit a shop is still served, as a percent of the limit (BND-03, RTE-03).',
    ),
    setting(
      'fast_spend_percent',
      5,
      "The share of a cycle's API requests that, spent in one hour, alerts the owner and the operator (RTE-12).",
    ),
    setting(
      'public_requests_per_visitor_per_minute',
      120,
      'How many requests one visitor may make to one shop in a minute, through its public keys (RTE-06).',
    ),
    setting(
      'public_orders_per_shop_per_minute',
      60,
      'How many orders shoppers may place in one shop in a minute, every plan alike (RTE-08).',
    ),
    setting(
      'payment_sessions_per_shop_per_minute',
      60,
      'How many payments shoppers may open in one shop in a minute, every plan alike (RTE-08).',
    ),
    setting(
      'new_shop_payment_cap_amount',
      20000,
      "The most a new shop's online payments may come to in a day, in TK, where the new-shop cap holds (TVR-04).",
    ),
    setting(
      'new_shop_payment_cap_days',
      30,
      'How many days a shop counts as new for the new-shop payment cap (TVR-04).',
    ),
    setting(
      'listener_offline_minutes',
      30,
      'How many minutes after its last report a listener phone counts offline (LSN-03, VER-07).',
    ),
    setting(
      'listener_min_app_version',
      '1.0.0',
      'The oldest listener app version that may call, as 1.2.3; older apps must update (LSN-18).',
    ),
    setting(
      'listener_senders',
      ['bKash', 'NAGAD', 'upay', '16216'],
      "The senders whose SMS count as a wallet's, for every shop (LSN-16).",
    ),
    setting('media_image_max_mb', 5, 'The largest image one upload may be, in MB (STO-04).'),
    setting('media_video_max_mb', 100, 'The largest video one upload may be, in MB (STO-05).'),
    setting(
      'catalogue_list_max_age_seconds',
      30,
      "How long a shopper's browser keeps a product list, in seconds (CCH-03).",
    ),
    setting(
      'catalogue_list_stale_seconds',
      120,
      'How long an older product list may still be shown while it is fetched again, in seconds (CCH-03).',
    ),
    setting(
      'catalogue_detail_max_age_seconds',
      60,
      "How long a shopper's browser keeps a product page, in seconds (CCH-03).",
    ),
    setting(
      'catalogue_search_max_age_seconds',
      30,
      "How long a shopper's browser keeps search results, in seconds (CCH-03).",
    ),
    setting(
      'catalogue_categories_max_age_seconds',
      300,
      "How long a shopper's browser keeps the category tree, in seconds (CCH-03).",
    ),
    setting(
      'terms_version',
      '2026-11-04',
      'The terms of service in force, which a new account accepts: change it when new terms are published (LEG-01).',
      { at: '2026-11-04T00:00:00.000Z', by: null },
    ),
    setting(
      'privacy_version',
      '2026-11-04',
      'The privacy policy in force, which a new account accepts: change it when a new policy is published (LEG-01).',
      { at: '2026-11-04T00:00:00.000Z', by: null },
    ),
    // Phase 6's four courier settings and Phase 7's five (OPERATOR-CONSOLE-DESIGN v5), as the sketch draws them.
    setting(
      'courier_check_min_age_hours',
      6,
      'How many hours old a parcel must be before the night check asks after it (CRR-15).',
      { at: '2026-11-04T00:00:00.000Z', by: null },
    ),
    setting(
      'courier_check_quiet_hours',
      24,
      'How many hours without a courier message before the night check asks after a parcel (CRR-15).',
      { at: '2026-11-04T00:00:00.000Z', by: null },
    ),
    setting(
      'courier_check_stop_days',
      30,
      'How many days with no change before a parcel stops being checked and shows no news (CRR-15).',
      { at: '2026-11-04T00:00:00.000Z', by: null },
    ),
    setting(
      'courier_sync_minutes',
      10,
      'How many minutes a Sync shows its saved answer before it may ask the courier again (CRR-14).',
      { at: '2026-11-04T00:00:00.000Z', by: null },
    ),
    setting(
      'address_read_provider',
      'gemini',
      "The AI that reads a customer's delivery details from a pasted message: gemini (AI-10, D7-4).",
      { at: '2026-11-06T00:00:00.000Z', by: null },
    ),
    setting(
      'address_read_model',
      'gemini-3.5-flash-lite',
      "The AI's model for reading delivery details, as the AI names it, such as gemini-3.5-flash-lite (AI-10, D7-4).",
      { at: '2026-11-06T00:00:00.000Z', by: null },
    ),
    setting(
      'address_reads_per_shop_per_minute',
      30,
      'How many messages one shop may have read in a minute, a flood guard (ORD-33).',
      { at: '2026-11-06T00:00:00.000Z', by: null },
    ),
    setting(
      'fraud_checks_per_shop_per_minute',
      30,
      'How many fraud checks one shop may run in a minute, by staff or on new orders (FRD-07).',
      { at: '2026-11-07T00:00:00.000Z', by: null },
    ),
    setting(
      'notification_retention_days',
      30,
      'How many days a notification is kept in the bell before it is deleted (NTF-01, D7-39).',
      { at: '2026-11-07T00:00:00.000Z', by: null },
    ),
    // Slice 8.8: the rows migration 0128 gives Slices 8.6's and 8.7's settings; a number not set is stored empty.
    setting(
      'help_whatsapp',
      '',
      "Lytro's WhatsApp number, 01XXXXXXXXX, that the dashboard, Lytro's payment page and the website show (D8-4, D8-68).",
      { at: '2026-11-10T00:00:00.000Z', by: null },
    ),
    setting(
      'help_phone',
      '',
      "Lytro's phone number for calls, 01XXXXXXXXX, that the dashboard, Lytro's payment page and the website show (D8-4, D8-68).",
      { at: '2026-11-10T00:00:00.000Z', by: null },
    ),
    setting(
      'help_opens_hour',
      9,
      'The hour Lytro starts answering the help line, every day, 0 to 23 in Dhaka (D8-68).',
      { at: '2026-11-10T00:00:00.000Z', by: null },
    ),
    setting(
      'help_closes_hour',
      22,
      'The hour Lytro stops answering the help line, every day, 0 to 23 in Dhaka (D8-68).',
      { at: '2026-11-10T00:00:00.000Z', by: null },
    ),
    setting(
      'media_budget_usd',
      10,
      "The month's budget for Lytro's Cloudflare costs, in whole US dollars (MED-12, D8-58).",
      { at: '2026-11-10T00:00:00.000Z', by: null },
    ),
    setting(
      'media_budget_alert_percent',
      80,
      'The percent of the media budget that emails the alert address, once a billing period (MED-12).',
      { at: '2026-11-10T00:00:00.000Z', by: null },
    ),
    setting(
      'media_cost_alert_email',
      '',
      'The one address the media budget alert goes to (MED-12, D8-61).',
      { at: '2026-11-10T00:00:00.000Z', by: null },
    ),
    setting(
      'cloudflare_billing_day',
      1,
      "The day of the month Cloudflare's invoice period starts on, 1 to 28 (MED-12, D8-61).",
      { at: '2026-11-10T00:00:00.000Z', by: null },
    ),
    setting(
      'cloudflare_prices',
      {
        r2ClassAPerMillion: 4.5,
        r2ClassBPerMillion: 0.36,
        r2StoragePerGbMonth: 0.015,
        r2FreeClassAMillions: 1,
        r2FreeClassBMillions: 10,
        r2FreeStorageGbMonths: 10,
        workersMonthly: 5,
        workersIncludedMillions: 10,
        workersPerMillion: 0.3,
      },
      "Cloudflare's R2 and Workers prices and monthly allowances, in US dollars, that the media costs estimate uses (D8-60).",
      { at: '2026-11-10T00:00:00.000Z', by: null },
    ),
  ];
}
