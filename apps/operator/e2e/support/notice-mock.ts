import { GADGET, RAHIM } from './console-data';

// Slice 7.7: Lytro's notices as Slice 7.4's operator routes answer them, drawn from the sketch's own samples
// (docs/brand/lytro-operator.html, P37_NOTICES): newest written first, each with what came of it.

type Row = Record<string, unknown>;

export interface NoticeMockState {
  notices: Row[];
  acknowledgments: Record<string, Row>;
  /** What POST /operator/notices/reach answers. */
  reach: number;
  /** Each rate's changes: a rate-change notice links the one it was written for. */
  rateHistory: Record<string, Row[]>;
  /** The page's clock: what a write is stamped with and a notice's status is judged by. */
  now: string;
}

type Answer = { data: unknown } | { refused: [number, string, string] };

const POLICY_BN =
  '15 নভেম্বর থেকে Lytro-এর পলিসি বদলাচ্ছে। যা বদলাচ্ছে:\n\n- বন্ধ হওয়া শপের ডেটা বন্ধের ৬০ দিন পর মুছে ফেলা হয়\n- ক্রেতারা রিপোর্ট করলে দেখার সময় পেমেন্ট পেজ সাসপেন্ড থাকতে পারে\n\nপড়ে নিচে "বুঝেছি" চাপুন।';
const POLICY_EN =
  'Lytro\'s policy changes from 15 Nov. What changes:\n\n- A closed shop\'s data is deleted 60 days after it closes\n- A payment page shoppers report may be suspended while we look\n\nPlease read it and press "I understand" below.';

const NONE = { shops: 0, people: 0, reads: 0, acknowledged: 0 };

function notice(fields: Row): Row {
  return {
    titleBn: null,
    titleEn: null,
    bodyBn: null,
    bodyEn: null,
    htmlBn: null,
    htmlEn: null,
    audience: { kind: 'all' },
    publishAt: null,
    endsAt: null,
    pinned: false,
    requiresAck: false,
    windowStartsAt: null,
    windowEndsAt: null,
    rateChangeId: null,
    createdBy: 'op-1',
    createdByEmail: 'ops@lytro.app',
    editedAt: null,
    withdrawnAt: null,
    sentAt: null,
    counts: NONE,
    versions: [],
    ...fields,
  };
}

/** The sketch's seven notices. */
export function drawnNotices(): Row[] {
  return [
    notice({
      id: 'n-15',
      status: 'draft',
      category: 'general',
      severity: 'info',
      createdAt: '2026-11-07T18:05:00+06:00',
      titleEn: 'Couriers close for Victory Day, 16 Dec',
      bodyEn:
        "Steadfast, Pathao and RedX don't pick up parcels on **16 Dec**.\n\n- Book by 15 Dec, 5 pm for a pickup that day\n- Parcels booked on 16 Dec are picked up on 17 Dec",
      endsAt: '2026-12-17T23:59:00+06:00',
    }),
    notice({
      id: 'n-14',
      status: 'scheduled',
      category: 'maintenance',
      severity: 'important',
      createdAt: '2026-11-07T17:10:00+06:00',
      titleBn: '10 নভেম্বর রাত 2টা থেকে ভোর 4টা মেইনটেন্যান্স',
      bodyBn:
        '10 নভেম্বর রাত 2টা থেকে ভোর 4টা পর্যন্ত Lytro-তে মেইনটেন্যান্স চলবে। এই সময়ে ড্যাশবোর্ড আর স্টোরফ্রন্ট মাঝে মাঝে বন্ধ থাকতে পারে।',
      titleEn: 'Maintenance 10 Nov, 2 am to 4 am',
      bodyEn:
        'Lytro is under maintenance from 10 Nov, 2 am to 4 am. The dashboard and storefronts may be unavailable at times during it.',
      publishAt: '2026-11-08T10:00:00+06:00',
      endsAt: '2026-11-10T04:00:00+06:00',
      windowStartsAt: '2026-11-10T02:00:00+06:00',
      windowEndsAt: '2026-11-10T04:00:00+06:00',
      pinned: true,
    }),
    notice({
      id: 'n-13',
      status: 'live',
      category: 'rate_change',
      severity: 'important',
      createdAt: '2026-11-07T14:52:00+06:00',
      rateChangeId: 41,
      titleBn: 'SMS, প্রতি পার্ট রেট 7 নভেম্বর থেকে ৳0.55 → ৳0.65',
      bodyBn:
        '7 নভেম্বর থেকে **SMS, প্রতি পার্ট** রেট ৳0.55 থেকে বদলে **৳0.65** হচ্ছে। এরপরের প্রতিটি চার্জে নতুন রেট লাগবে; আগের চার্জ বদলাবে না।',
      titleEn: 'SMS, per part rate ৳0.55 → ৳0.65 from 7 Nov',
      bodyEn:
        "From 7 Nov, the **SMS, per part** rate changes from ৳0.55 to **৳0.65**. Every charge after that uses the new rate; earlier charges don't change.",
      publishAt: '2026-11-07T15:00:00+06:00',
      sentAt: '2026-11-07T15:00:30+06:00',
      counts: { shops: 212, people: 318, reads: 147, acknowledged: 0 },
    }),
    notice({
      id: 'n-12',
      status: 'live',
      category: 'new_feature',
      severity: 'info',
      createdAt: '2026-11-07T10:30:00+06:00',
      audience: { kind: 'plans', planIds: ['p-starter', 'p-growth', 'p-pro'] },
      titleBn: 'কাস্টমারের মেসেজ থেকে ডেলিভারির তথ্য পড়ুন',
      bodyBn:
        'নতুন অর্ডার ফর্মে কাস্টমারের মেসেজ পেস্ট করুন, Lytro নিজেই **নাম, ফোন, জেলা, থানা আর ঠিকানা** বসিয়ে দেবে।\n\n- প্রতিবার পড়তে ৳0.10, অথবা অ্যালাউন্স থেকে কাটে\n- কিছু না পেলে টাকা কাটে না\n\n[কীভাবে কাজ করে](https://lytro.app/help/address-reads)',
      titleEn: "Read delivery details from a customer's message",
      bodyEn:
        "Paste a customer's message on the new-order form and Lytro fills in the **name, phone, zilla, thana and address**.\n\n- Each read costs ৳0.10, or comes from an allowance\n- A read that finds nothing costs nothing\n\n[How it works](https://lytro.app/help/address-reads)",
      publishAt: '2026-11-07T11:00:00+06:00',
      sentAt: '2026-11-07T11:00:30+06:00',
      counts: { shops: 187, people: 262, reads: 96, acknowledged: 0 },
    }),
    notice({
      id: 'n-11',
      status: 'live',
      category: 'policy',
      severity: 'important',
      createdAt: '2026-11-05T09:40:00+06:00',
      editedAt: '2026-11-06T09:12:00+06:00',
      titleBn: '15 নভেম্বর থেকে Lytro-এর পলিসি আপডেট',
      bodyBn: POLICY_BN,
      titleEn: "Lytro's policy updates from 15 Nov",
      bodyEn: POLICY_EN,
      publishAt: '2026-11-05T10:00:00+06:00',
      sentAt: '2026-11-05T10:00:30+06:00',
      pinned: true,
      requiresAck: true,
      counts: { shops: 212, people: 318, reads: 240, acknowledged: 41 },
      versions: [
        {
          editedBy: 'op-1',
          editedByEmail: 'ops@lytro.app',
          replacedAt: '2026-11-06T09:12:00+06:00',
          snapshot: {
            titleBn: '15 নভেম্বর থেকে Lytro-এর পলিসি আপডেট',
            titleEn: "Lytro's policy updates from 15 Nov",
            bodyBn:
              '15 নভেম্বর থেকে Lytro-এর পলিসি বদলাচ্ছে। যা বদলাচ্ছে:\n\n- বন্ধ হওয়া শপের ডেটা বন্ধের ৬০ দিন পর মুছে ফেলা হয়\n\nপড়ে নিচে "বুঝেছি" চাপুন।',
            bodyEn:
              'Lytro\'s policy changes from 15 Nov. What changes:\n\n- A closed shop\'s data is deleted 60 days after it closes\n\nPlease read it and press "I understand" below.',
            category: 'policy',
            severity: 'important',
          },
        },
      ],
    }),
    notice({
      id: 'n-10',
      status: 'ended',
      category: 'maintenance',
      severity: 'urgent',
      createdAt: '2026-11-03T20:25:00+06:00',
      titleBn: 'Lytro-তে সমস্যা চলছে',
      bodyBn:
        '3 নভেম্বর রাত 8:15 থেকে Lytro-এর কিছু অংশ ঠিকমতো কাজ করছে না। আমরা ঠিক করছি; ঠিক হলে এখানে জানাব।',
      titleEn: 'Lytro is having problems',
      bodyEn:
        "Since 3 Nov, 8:15 pm, part of Lytro isn't working properly. We're fixing it and will post here when it's done.",
      publishAt: '2026-11-03T20:30:00+06:00',
      endsAt: '2026-11-04T09:00:00+06:00',
      sentAt: '2026-11-03T20:30:30+06:00',
      counts: { shops: 205, people: 301, reads: 288, acknowledged: 0 },
    }),
    notice({
      id: 'n-9',
      status: 'withdrawn',
      category: 'security',
      severity: 'important',
      createdAt: '2026-11-01T11:50:00+06:00',
      withdrawnAt: '2026-11-02T14:05:00+06:00',
      audience: { kind: 'tenant', tenantId: GADGET },
      titleBn: 'আপনার পেমেন্ট পেজ রিভিউ হচ্ছে',
      bodyBn:
        'দুজন ক্রেতা আপনার পেমেন্ট পেজ রিপোর্ট করেছেন। আমরা দেখার সময় এটা চালু থাকবে; শেষ হলে এখানে জানাব।',
      titleEn: 'Your payment page is under review',
      bodyEn:
        "Two shoppers reported your payment page. It stays open while we look; we'll write here when we're done.",
      publishAt: '2026-11-01T12:00:00+06:00',
      sentAt: '2026-11-01T12:00:30+06:00',
      counts: { shops: 1, people: 3, reads: 2, acknowledged: 0 },
    }),
  ];
}

const shop = (slug: string, shopName: string, tenantId: string): Row => ({
  tenantId,
  slug,
  shopName,
});

/** The policy notice's lists: five that said it of 41, six still to of 171, as the sketch draws them. */
export function drawnAcknowledgments(): Record<string, Row> {
  return {
    'n-11': {
      acknowledged: [
        {
          ...shop('rahim-fashion', 'Rahim Fashion', RAHIM),
          userId: 'u-1',
          acknowledgedAt: '2026-11-05T11:40:00+06:00',
        },
        {
          ...shop('faiza-shoes', 'Faiza Shoes', 'ten-0021'),
          userId: 'u-2',
          acknowledgedAt: '2026-11-05T13:02:00+06:00',
        },
        {
          ...shop('arif-electronics', 'Arif Electronics', 'ten-0022'),
          userId: 'u-3',
          acknowledgedAt: '2026-11-05T19:26:00+06:00',
        },
        {
          ...shop('joy-pharmacy', 'Joy Pharmacy', 'ten-0023'),
          userId: 'u-4',
          acknowledgedAt: '2026-11-06T08:15:00+06:00',
        },
        {
          ...shop('mehedi-books', 'Mehedi Books', 'ten-0024'),
          userId: 'u-5',
          acknowledgedAt: '2026-11-06T21:47:00+06:00',
        },
      ],
      pending: [
        shop('dhaka-gadget', 'Dhaka Gadget House', GADGET),
        shop('nusrat-cosmetics', 'Nusrat Cosmetics', 'ten-0031'),
        shop('sadia-collection', 'Sadia Collection', 'ten-0032'),
        shop('tanvir-mobiles', 'Tanvir Mobiles', 'ten-0033'),
        shop('keya-boutique', 'Keya Boutique', 'ten-0034'),
        shop('mim-bakery', 'Mim Bakery', 'ten-0035'),
      ],
      acknowledgedCount: 41,
      pendingCount: 171,
    },
  };
}

export function noticeDefaults(): Omit<NoticeMockState, 'rateHistory' | 'now'> {
  return { notices: drawnNotices(), acknowledgments: drawnAcknowledgments(), reach: 212 };
}

/** What each template fills in, as notice-words.ts writes it for the sketch's samples. */
function templateDraft(body: Row | null): Row {
  const template = body?.template;
  const variables = (body?.variables ?? {}) as Row;
  const base = { windowStartsAt: null, windowEndsAt: null, rateChangeId: null, requiresAck: false };
  if (template === 'rate_change') {
    const rated = drawnNotices().find((each) => each.id === 'n-13') ?? {};
    return {
      ...base,
      titleBn: rated.titleBn,
      titleEn: rated.titleEn,
      bodyBn: rated.bodyBn,
      bodyEn: rated.bodyEn,
      category: 'rate_change',
      severity: 'important',
      rateChangeId: variables.rateChangeId ?? null,
    };
  }
  if (template === 'maintenance') {
    const kept = drawnNotices().find((each) => each.id === 'n-14') ?? {};
    return {
      ...base,
      titleBn: kept.titleBn,
      titleEn: kept.titleEn,
      bodyBn: kept.bodyBn,
      bodyEn: kept.bodyEn,
      category: 'maintenance',
      severity: 'important',
      windowStartsAt: variables.windowStartsAt ?? null,
      windowEndsAt: variables.windowEndsAt ?? null,
    };
  }
  if (template === 'outage') {
    return {
      ...base,
      titleBn: 'Lytro-তে সমস্যা চলছে',
      titleEn: 'Lytro is having problems',
      bodyBn:
        '7 নভেম্বর রাত 9:40 থেকে Lytro-এর কিছু অংশ ঠিকমতো কাজ করছে না। আমরা ঠিক করছি; ঠিক হলে এখানে জানাব।',
      bodyEn:
        "Since 7 Nov, 9:40 pm, part of Lytro isn't working properly. We're fixing it and will post here when it's done.",
      category: 'maintenance',
      severity: 'urgent',
    };
  }
  return {
    ...base,
    titleBn: '… থেকে Lytro-এর পলিসি আপডেট',
    titleEn: "Lytro's policy updates from …",
    bodyBn: POLICY_BN,
    bodyEn: POLICY_EN,
    category: 'policy',
    severity: 'important',
    requiresAck: true,
  };
}

/** Where a notice stands, read from its times as the server reads them. */
function statusOf(row: Row, clock: string): string {
  if (row.withdrawnAt) return 'withdrawn';
  if (!row.publishAt) return 'draft';
  const now = new Date(clock).getTime();
  const at = (value: unknown): number =>
    typeof value === 'string' ? new Date(value).getTime() : 0;
  if (at(row.publishAt) > now) return 'scheduled';
  if (row.endsAt && at(row.endsAt) <= now) return 'ended';
  return 'live';
}

let nextNotice = 100;

/** The notice routes, the writes changing what later reads say. */
export function noticeAnswer(
  method: string,
  path: string,
  url: URL,
  body: Row | null,
  state: NoticeMockState,
): Answer | undefined {
  if (path === '/operator/notices/template') return { data: templateDraft(body) };
  if (path === '/operator/notices/reach') return { data: { shops: state.reach } };
  if (path === '/operator/notices') {
    if (method === 'GET') {
      const category = url.searchParams.get('category');
      const words = (url.searchParams.get('q') ?? '').toLowerCase();
      const items = state.notices.filter(
        (each) =>
          (!category || each.category === category) &&
          (!words ||
            JSON.stringify([each.titleBn, each.titleEn, each.bodyBn, each.bodyEn])
              .toLowerCase()
              .includes(words)),
      );
      return { data: { items, next: null } };
    }
    nextNotice += 1;
    const created = notice({ ...body, id: `n-${String(nextNotice)}`, createdAt: state.now });
    created.status = statusOf(created, state.now);
    state.notices.unshift(created);
    // The server links a rate change to the notice written for it (RAT-09).
    for (const line of Object.values(state.rateHistory).flat()) {
      if (line.id === created.rateChangeId) line.noticeId = created.id;
    }
    return { data: created };
  }
  const acks = /^\/operator\/notices\/([^/]+)\/acknowledgments$/.exec(path);
  if (acks) {
    return {
      data: state.acknowledgments[acks[1] ?? ''] ?? {
        acknowledged: [],
        pending: [],
        acknowledgedCount: 0,
        pendingCount: 0,
      },
    };
  }
  const withdrawn = /^\/operator\/notices\/([^/]+)\/withdraw$/.exec(path);
  const one = withdrawn ?? /^\/operator\/notices\/([^/]+)$/.exec(path);
  if (!one) return undefined;
  const row = state.notices.find((each) => each.id === one[1]);
  if (!row) return { refused: [404, 'not_found', 'This notice is not available.'] };
  if (withdrawn) {
    Object.assign(row, { withdrawnAt: state.now, status: 'withdrawn' });
    return { data: row };
  }
  if (method === 'PATCH') {
    if (row.status === 'live') {
      (row.versions as Row[]).unshift({
        editedBy: 'op-1',
        editedByEmail: 'ops@lytro.app',
        replacedAt: state.now,
        snapshot: {
          titleBn: row.titleBn,
          titleEn: row.titleEn,
          bodyBn: row.bodyBn,
          bodyEn: row.bodyEn,
          category: row.category,
          severity: row.severity,
        },
      });
      Object.assign(row, body, { editedAt: state.now });
    } else {
      Object.assign(row, body);
      row.status = statusOf(row, state.now);
    }
    return { data: row };
  }
  return { data: row };
}

/**
 * The rates as Phase 7 left them in the sketch (D7-16: chat's rate gone; D7-7: fraud checks free; D7-36: a read at
 * ৳0.10), with the change the rate-change notice is drawn from (control.rate_history's id 41).
 */
export function phase7Rates(): Row[] {
  const rate = (key: string, value: string, effectiveFrom: string): Row => ({
    key,
    value,
    effectiveFrom: `${effectiveFrom}T00:00:00.000Z`,
  });
  return [
    rate('sms_per_unit', '0.65', '2026-11-07'),
    rate('fraud_check', '0.00', '2026-11-07'),
    rate('ai_extraction', '0.10', '2026-11-06'),
    rate('payg_order_fee_min', '20.00', '2026-07-14'),
    rate('payg_order_fee_pct', '1.50', '2026-10-02'),
    rate('payg_product_fee', '10.00', '2026-07-14'),
    rate('sms_unit_size_chars', '67.00', '2026-11-06'),
    rate('listener_verification_pct', '0.10', '2026-11-02'),
    rate('gateway_verification_pct', '1.00', '2026-11-03'),
  ];
}

export function phase7RateHistory(noticeOf41: string | null = null): Record<string, Row[]> {
  const line = (
    id: number,
    key: string,
    oldValue: string,
    newValue: string,
    at: string,
    noticeId: string | null = null,
  ): Row => ({
    id,
    key,
    oldValue,
    newValue,
    changedBy: 'op-1',
    changedByEmail: 'ops@lytro.app',
    noticeId,
    changedAt: at,
  });
  return {
    sms_per_unit: [
      line(12, 'sms_per_unit', '0.40', '0.55', '2026-09-01T00:00:00.000Z'),
      line(41, 'sms_per_unit', '0.55', '0.65', '2026-11-07T14:48:00+06:00', noticeOf41),
    ],
    payg_order_fee_pct: [line(3, 'payg_order_fee_pct', '2.00', '1.50', '2026-10-02T00:00:00.000Z')],
  };
}

/** Today's recent changes with the two rate changes the new-notice panel offers. */
export function phase7Changes(): Row[] {
  return [
    {
      id: 9,
      action: 'rate_changed',
      at: '2026-11-07T14:48:00+06:00',
      by: 'ops@lytro.app',
      key: 'sms_per_unit',
      oldValue: '0.55',
      newValue: '0.65',
      reason: 'Provider price',
      rateChangeId: 41,
      shop: null,
    },
    {
      id: 8,
      action: 'rate_changed',
      at: '2026-10-02T00:00:00.000Z',
      by: 'ops@lytro.app',
      key: 'payg_order_fee_pct',
      oldValue: '2.00',
      newValue: '1.50',
      reason: 'Launch price',
      rateChangeId: 3,
      shop: null,
    },
  ];
}
