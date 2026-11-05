// The sketch's own day (docs/brand/lytro-operator.html, its fixtures), in the server's shapes, so a screen can be set beside
// its drawing. Every function makes a fresh copy: a test's writes change only its own.

/** The moment the sketch is drawn at. */
export const NOW = '2026-10-21T14:30:00+06:00';

const CREATED = '2026-01-01T00:00:00.000Z';

export function drawnPlans(): Record<string, unknown>[] {
  const plan = (id: string, name: string, rank: number, forSale: boolean, version: number) => ({
    id,
    name,
    description: null,
    rank,
    forSale,
    version,
    limits: { products: 100, staff: 2, storage_mb: 2048, bandwidth_gb: 30 },
    features: {},
    createdAt: CREATED,
  });
  return [
    plan('p-trial', 'Trial', 0, false, 2),
    plan('p-payg', 'Pay-as-you-go', 1, false, 1),
    plan('p-starter', 'Starter', 2, true, 3),
    plan('p-growth', 'Growth', 3, true, 2),
    plan('p-pro', 'Pro', 4, true, 1),
  ];
}

export function drawnTerms(): Record<string, unknown>[] {
  const term = (id: string, labelEn: string, labelBn: string, months: number) => ({
    id,
    labelEn,
    labelBn,
    months,
    visible: true,
    displayOrder: months,
    defaultDiscountPct: null,
    tenantId: null,
    retiredAt: null,
    createdAt: CREATED,
  });
  return [
    term('t1', '1 month', '১ মাস', 1),
    term('t6', '6 months', '৬ মাস', 6),
    term('t12', '12 months', '১২ মাস', 12),
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

/** A shop as the search lists it. */
export function shopSummary(each: ShopFixture): Record<string, unknown> {
  return {
    id: each.id,
    slug: each.slug,
    shopName: each.shopName,
    state: each.state,
    suspendedAt: each.suspension?.at ?? null,
    planId: each.planId,
    planName: each.planName,
    planVersion: each.planVersion,
    overrideCount: each.overrides.length,
    periodEnd: each.periodEnd,
  };
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

export function drawnSettings(): Record<string, unknown>[] {
  const setting = (key: string, value: number | string | boolean) => ({
    key,
    value,
    description: key,
    updatedBy: null,
    updatedAt: CREATED,
  });
  return [setting('new_shop_payment_cap_amount', 20000), setting('new_shop_payment_cap_days', 30)];
}
