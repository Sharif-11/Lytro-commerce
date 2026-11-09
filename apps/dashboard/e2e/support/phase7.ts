import {
  renderSmsTemplate,
  SMS_EVENTS,
  SmsEvent,
  smsUnitsOf,
  smsWithName,
  type SmsVariable,
} from '@lytronix/validators';

// Phase 7 against a mocked API (TENANT-DASHBOARD-DESIGN §7.40, Part 37): Lytro's notices, the bell and its switches, push,
// SMS settings, log and report, the fake order check, reading a message, and the reads allowance, as the server answers
// them. The figures and words are the prototype's (docs/brand/lytro-dashboard.html), so a screen can be set beside its
// drawing. Every shop gets the quiet answers (no notices, an empty bell, Lytro's SMS words) unless a test names its own.

type Language = 'bn' | 'en';
type Words = { bn: string; en: string };

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
// One moment for every time a fixture names, so a read after a write answers the same times it did before.
const NOW = Date.now();
const ago = (ms: number): string => new Date(NOW - ms).toISOString();
const ahead = (ms: number): string => new Date(NOW + ms).toISOString();

export type Refused = {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};
type Answer = { data: unknown } | { refused: Refused } | null;

// ---------- notices (NTC-01 to NTC-19)

export type NoticeId = 'policy' | 'maint' | 'rate' | 'feature' | 'security' | 'general';

interface NoticeDraft {
  id: NoticeId;
  category: string;
  severity: 'info' | 'important' | 'urgent';
  pinned?: boolean;
  requiresAck?: boolean;
  read: boolean;
  daysAgo: number;
  editedDaysAgo?: number;
  window?: boolean;
  title: Words;
  body: Words;
  html: Words;
}

// The prototype's six (P37_NOTICES), newest first after the pinned one.
const NOTICES: NoticeDraft[] = [
  {
    id: 'policy',
    category: 'policy',
    severity: 'important',
    pinned: true,
    requiresAck: true,
    read: false,
    daysAgo: 2,
    title: {
      bn: 'নতুন নিয়ম: COD অর্ডারের রিফান্ড',
      en: 'Updated terms: refunds on cash-on-delivery orders',
    },
    body: {
      bn: '1 ডিসেম্বর থেকে ক্যাশ অন ডেলিভারি অর্ডারের রিফান্ড শপ নিজেই কাস্টমারকে দেবে। Lytro টাকা ধরে রাখে না।',
      en: 'From 1 December, the shop refunds its own cash-on-delivery customers. Lytro never holds the money.',
    },
    html: {
      bn: '<p><b>1 ডিসেম্বর</b> থেকে ক্যাশ অন ডেলিভারি অর্ডারের রিফান্ড শপ নিজেই কাস্টমারকে দেবে। Lytro কখনো এই টাকা ধরে রাখে না।</p><ul><li>কুরিয়ারের টাকা সরাসরি আপনার কাছে আসে।</li><li>রিফান্ড অর্ডারের পেমেন্ট কার্ডে রেকর্ড করুন।</li><li>বিবাদ হলে অর্ডারের হিস্ট্রি দেখান।</li></ul><p>পুরো নিয়ম পড়ুন: <a href="https://lytro.app/terms" target="_blank" rel="noopener noreferrer">lytro.app/terms</a></p>',
      en: '<p>From <b>1 December</b>, the shop refunds its own cash-on-delivery customers. Lytro never holds this money.</p><ul><li>Courier cash comes straight to you.</li><li>Record a refund on the order\'s payments card.</li><li>If there is a dispute, show the order\'s history.</li></ul><p>Read the full terms: <a href="https://lytro.app/terms" target="_blank" rel="noopener noreferrer">lytro.app/terms</a></p>',
    },
  },
  {
    id: 'maint',
    category: 'maintenance',
    severity: 'urgent',
    read: false,
    daysAgo: 1,
    window: true,
    title: {
      bn: 'মেইনটেন্যান্স: 9 নভেম্বর রাত 2টা থেকে 3টা',
      en: 'Maintenance on 9 November, 2:00 to 3:00 am',
    },
    body: {
      bn: 'ড্যাশবোর্ড আর স্টোরফ্রন্ট 20 মিনিট পর্যন্ত বন্ধ থাকতে পারে। আগের অর্ডার নিরাপদ।',
      en: 'The dashboard and storefront may be down for up to 20 minutes. Orders already placed are safe.',
    },
    html: {
      bn: '<p>9 নভেম্বর রাত <b>2টা থেকে 3টার</b> মধ্যে Lytro আপগ্রেড হবে। ড্যাশবোর্ড আর স্টোরফ্রন্ট 20 মিনিট পর্যন্ত বন্ধ থাকতে পারে।</p><ul><li>এর আগে আসা অর্ডার নিরাপদ।</li><li>ওই সময়ে কুরিয়ারের খবর পরে এসে যাবে।</li></ul>',
      en: '<p>Lytro will be upgraded on 9 November between <b>2:00 and 3:00 am</b>. The dashboard and storefront may be down for up to 20 minutes.</p><ul><li>Orders placed before then are safe.</li><li>Courier news from that time arrives afterwards.</li></ul>',
    },
  },
  {
    id: 'rate',
    category: 'rate_change',
    severity: 'important',
    read: false,
    daysAgo: 3,
    title: { bn: 'SMS-এর রেট 15 নভেম্বর থেকে বদলাচ্ছে', en: 'The SMS rate changes on 15 November' },
    body: {
      bn: '15 নভেম্বর থেকে প্রতি SMS পার্ট ৳0.60, আগে ছিল ৳0.55। আগে পাঠানো SMS-এর দাম বদলাবে না।',
      en: 'From 15 November each SMS part costs ৳0.60, up from ৳0.55. SMS already sent keep their price.',
    },
    html: {
      bn: '<p><b>15 নভেম্বর</b> থেকে প্রতি SMS পার্ট <b>৳0.60</b>, আগে ছিল ৳0.55। আগে পাঠানো SMS-এর দাম বদলাবে না।</p><ul><li>পার্ট আগের মতোই 67 অক্ষরের।</li><li>ফ্রি SMS আগের মতোই থাকবে।</li></ul>',
      en: '<p>From <b>15 November</b> each SMS part costs <b>৳0.60</b>, up from ৳0.55. SMS already sent keep their price.</p><ul><li>A part is still 67 characters.</li><li>Your free SMS stay as they are.</li></ul>',
    },
  },
  {
    id: 'feature',
    category: 'new_feature',
    severity: 'info',
    read: true,
    daysAgo: 5,
    title: {
      bn: 'মেসেজ থেকে ঠিকানা পড়া এখন চালু',
      en: "Read delivery details from a customer's message",
    },
    body: {
      bn: 'নতুন অর্ডারে কাস্টমারের মেসেজ পেস্ট করুন; নাম, ফোন আর ঠিকানা নিজে থেকে বসবে।',
      en: "Paste the customer's message on a new order; the name, phone and address fill themselves in.",
    },
    html: {
      bn: '<p>নতুন অর্ডারে কাস্টমারের মেসেজ পেস্ট করুন; নাম, ফোন, জেলা, থানা আর ঠিকানা নিজে থেকে বসবে। প্রতিটি পড়া <b>৳0.10</b>, কিছু না পেলে টাকা কাটে না।</p>',
      en: "<p>Paste the customer's message on a new order; the name, phone, zilla, thana and address fill themselves in. Each read is <b>৳0.10</b>, and nothing found costs nothing.</p>",
    },
  },
  {
    id: 'security',
    category: 'security',
    severity: 'info',
    read: true,
    daysAgo: 11,
    editedDaysAgo: 6,
    title: {
      bn: 'Lytro কখনো আপনার পাসওয়ার্ড বা OTP চায় না',
      en: 'Lytro never asks for your password or OTP',
    },
    body: {
      bn: 'কেউ Lytro-র নাম করে কোড চাইলে দেবেন না। সন্দেহ হলে সাপোর্টে জানান।',
      en: "If anyone asks for a code in Lytro's name, don't give it. Tell support if in doubt.",
    },
    html: {
      bn: '<p>কেউ Lytro-র নাম করে কোড বা পাসওয়ার্ড চাইলে <b>দেবেন না</b>। Lytro কখনো চায় না।</p>',
      en: "<p>If anyone asks for a code or password in Lytro's name, <b>don't give it</b>. Lytro never asks.</p>",
    },
  },
  {
    id: 'general',
    category: 'general',
    severity: 'info',
    read: true,
    daysAgo: 19,
    title: { bn: 'সাপোর্ট এখন রাত 10টা পর্যন্ত খোলা', en: 'Support is now open until 10 pm' },
    body: {
      bn: 'WhatsApp-এ সকাল 9টা থেকে রাত 10টা পর্যন্ত লিখুন।',
      en: 'Message us on WhatsApp from 9 am to 10 pm.',
    },
    html: {
      bn: '<p>WhatsApp-এ সকাল 9টা থেকে রাত 10টা পর্যন্ত লিখুন।</p>',
      en: '<p>Message us on WhatsApp from 9 am to 10 pm.</p>',
    },
  },
];

/** What a shop's notices are, for one test. */
export interface NoticesFixture {
  /** Which of the prototype's six the board has; all six by default. */
  ids?: NoticeId[];
  /** Every one read (the bell's Mark all, `p37-notices` all read). */
  allRead?: boolean;
  /** The owner pressed "I understand" on the policy notice (`p37-notice-acked`). */
  acked?: boolean;
  /** The maintenance window has started (`p37-maint-now`). */
  maintenanceNow?: boolean;
  /** The important ones come as a prompt at sign-in (`p37-prompt`). */
  prompt?: boolean;
  /** The urgent one shows as the marquee (`p37-marquee`). */
  marquee?: boolean;
  /** The notices carry no words in this language, so the other's come (`p37-notice-fallback`). */
  onlyIn?: Language;
}

const WINDOW_STARTS_MS = DAY_MS + 4 * 60 * MINUTE_MS + 12 * MINUTE_MS;

function noticeView(
  draft: NoticeDraft,
  fixture: NoticesFixture,
  language: Language,
): Record<string, unknown> {
  const lang = fixture.onlyIn ?? language;
  const starts = fixture.maintenanceNow ? ago(10 * MINUTE_MS) : ahead(WINDOW_STARTS_MS);
  return {
    id: `n-${draft.id}`,
    category: draft.category,
    severity: draft.severity,
    title: draft.title[lang],
    body: draft.body[lang],
    html: draft.html[lang],
    language: lang,
    pinned: draft.pinned ?? false,
    requiresAck: draft.requiresAck ?? false,
    acknowledgedAt: draft.requiresAck && fixture.acked ? ago(30 * MINUTE_MS) : null,
    publishedAt: ago(draft.daysAgo * DAY_MS),
    endsAt: null,
    editedAt: draft.editedDaysAgo === undefined ? null : ago(draft.editedDaysAgo * DAY_MS),
    windowStartsAt: draft.window ? starts : null,
    windowEndsAt: draft.window ? new Date(Date.parse(starts) + 60 * MINUTE_MS).toISOString() : null,
    read: fixture.allRead ? true : draft.read,
  };
}

function noticesOf(fixture: NoticesFixture, language: Language): Record<string, unknown>[] {
  const ids = fixture.ids ?? NOTICES.map((each) => each.id);
  return NOTICES.filter((each) => ids.includes(each.id)).map((each) =>
    noticeView(each, fixture, language),
  );
}

const brief = (view: Record<string, unknown>): Record<string, unknown> => ({
  id: view.id,
  title: view.title,
  category: view.category,
  severity: view.severity,
  publishedAt: view.publishedAt,
});

function summaryOf(fixture: NoticesFixture | null, language: Language): unknown {
  if (!fixture)
    return { unread: 0, banners: [], prompts: [], toAcknowledge: [], maintenance: null };
  const views = noticesOf(fixture, language);
  const maint = views.find((each) => each.category === 'maintenance');
  return {
    unread: views.filter((each) => !each.read).length,
    banners: fixture.marquee ? views.filter((each) => each.severity === 'urgent').map(brief) : [],
    prompts: fixture.prompt
      ? views.filter((each) => each.severity === 'important' && !each.read).map(brief)
      : [],
    toAcknowledge: views
      .filter((each) => each.requiresAck && each.acknowledgedAt === null)
      .map(brief),
    maintenance: maint
      ? {
          id: maint.id,
          title: maint.title,
          startsAt: maint.windowStartsAt,
          endsAt: maint.windowEndsAt,
          underWay: fixture.maintenanceNow ?? false,
        }
      : null,
  };
}

// ---------- the bell (NTF-01, NTF-04)

type BellRow =
  | 'placed'
  | 'verify'
  | 'notice'
  | 'moved'
  | 'look'
  | 'retire'
  | 'conn'
  | 'low'
  | 'balance'
  | 'renew'
  | 'bounced'
  | 'back';

interface BellDraft {
  kind: string;
  title: Words;
  body: Words;
  link: string | null;
}

// The prototype's rows (P37_NT), in the server's words.
const BELL: Record<BellRow, BellDraft> = {
  placed: {
    kind: 'order_placed',
    title: { bn: 'নতুন অর্ডার 261107-0052', en: 'New order 261107-0052' },
    body: { bn: 'নুসরাত জাহান · ৳1,450 · স্টোরফ্রন্ট', en: 'Nusrat Jahan · 1,450 TK · storefront' },
    link: '/orders/o-47',
  },
  verify: {
    kind: 'payment_to_verify',
    title: {
      bn: 'পেমেন্ট ভেরিফাই করুন: অর্ডার 261107-0049',
      en: 'Payment to verify: order 261107-0049',
    },
    body: {
      bn: 'bKash-এ ৳500, TrxID 9F2KQ7M1। মিলিয়ে দেখে অ্যাপ্রুভ করুন।',
      en: '500 TK by bKash, TrxID 9F2KQ7M1. Check it and approve.',
    },
    link: '/payments',
  },
  notice: {
    kind: 'lytro_notice',
    title: {
      bn: 'Lytro থেকে: SMS-এর রেট 15 নভেম্বর থেকে বদলাচ্ছে',
      en: 'From Lytro: The SMS rate changes on 15 November',
    },
    body: {
      bn: '15 নভেম্বর থেকে প্রতি SMS পার্ট ৳0.60, আগে ছিল ৳0.55। আগে পাঠানো SMS-এর দাম বদলাবে না।',
      en: 'From 15 November each SMS part costs ৳0.60, up from ৳0.55. SMS already sent keep their price.',
    },
    link: '/notices/n-rate',
  },
  moved: {
    kind: 'parcel_moved',
    title: { bn: 'অর্ডার 261106-0031: কুরিয়ারের কাছে', en: 'Order 261106-0031: with the courier' },
    body: { bn: 'Steadfast থেকে খবর।', en: 'News from Steadfast.' },
    link: '/orders/o-31',
  },
  look: {
    kind: 'parcel_attention',
    title: {
      bn: 'পার্সেল চেক করুন: অর্ডার 261031-0047',
      en: 'Check the parcel: order 261031-0047',
    },
    body: {
      bn: 'Steadfast: কুরিয়ার যে টাকা কালেক্ট করেছে বলছে, তা COD-এর সাথে মিলছে না।',
      en: 'Steadfast: the cash the courier reports differs from the COD.',
    },
    link: '/orders/o-47',
  },
  retire: {
    kind: 'courier_retiring',
    title: { bn: 'Steadfast বন্ধ হয়ে যাচ্ছে', en: 'Steadfast is being retired' },
    body: {
      bn: 'Lytro Steadfast বন্ধ করছে। বুক করা পার্সেল আগের মতোই চলবে। নতুন বুকিংয়ের জন্য Pathao কানেক্ট করুন। আপনার ডিফল্ট কুরিয়ার এখন Pathao।',
      en: 'Lytro is retiring Steadfast. Parcels already booked carry on as before. Connect Pathao for new bookings. Your default courier is now Pathao.',
    },
    link: '/settings/couriers',
  },
  conn: {
    kind: 'courier_connection',
    title: { bn: 'Pathao কানেকশনে সমস্যা', en: 'Pathao connection needs a look' },
    body: {
      bn: 'Pathao আপনার লগইন নিচ্ছে না। কুরিয়ার সেটিংসে কী আবার দিন।',
      en: 'Pathao refuses your login. Enter the keys again in courier settings.',
    },
    link: '/settings/couriers',
  },
  low: {
    kind: 'low_stock',
    title: { bn: 'স্টক কম: কুর্তি · L · মেরুন', en: 'Low stock: Kurti · L · Maroon' },
    body: { bn: 'মাত্র 2টি বাকি (অ্যালার্ট 5-এ)।', en: 'Only 2 left (alert at 5).' },
    link: '/stock',
  },
  balance: {
    kind: 'low_balance',
    title: { bn: 'আপনার ব্যালেন্স কম', en: 'Your balance is low' },
    body: {
      bn: 'আপনার শপের ব্যালেন্স 48.00 TK, 50.00 TK-এর কম। SMS, অর্ডার ফি আর অন্য চার্জ দিতে থাকতে ড্যাশবোর্ড থেকে ব্যালেন্স টপ-আপ করুন।',
      en: "Your shop's balance is 48.00 TK, below 50.00 TK. Top up from the dashboard to keep paying for SMS, order fees and other charges.",
    },
    link: '/balance',
  },
  renew: {
    kind: 'renewal_reminder',
    title: { bn: 'প্ল্যান 7 দিনে শেষ হবে', en: 'Your plan ends in 7 days' },
    body: { bn: 'রিনিউ করুন, শপ চালু থাকবে।', en: 'Renew to keep the shop open.' },
    link: '/plan',
  },
  bounced: {
    kind: 'email_bounced',
    title: { bn: 'আপনার ইমেইলে মেইল পৌঁছাচ্ছে না', en: "Email to you isn't arriving" },
    body: {
      bn: 'rumana@gmail.com-এ পাঠানো ইমেইল ফেরত আসছে, তাই Lytro এখন আর এই ঠিকানায় ইমেইল পাঠাচ্ছে না। অ্যাকাউন্ট থেকে ইমেইল ঠিক করুন।',
      en: 'Email sent to rumana@gmail.com is bouncing, so Lytro has stopped emailing it. Fix your email in your account.',
    },
    link: '/account',
  },
  back: {
    kind: 'courier_back',
    title: { bn: 'Steadfast আবার চালু', en: 'Steadfast is back' },
    body: {
      bn: 'Lytro Steadfast আবার চালু করেছে। চাইলে আবার কানেক্ট করতে পারবেন।',
      en: 'Lytro has brought Steadfast back. You can connect it again.',
    },
    link: '/settings/couriers',
  },
};

/** The bell's rows for one test: each [row, unread, minutes ago]. */
export type BellFixture = [BellRow, boolean, number][];

// The prototype's default panel (P37_BELL_DEFAULT): four today, six earlier.
export const DRAWN_BELL: BellFixture = [
  ['placed', true, 8],
  ['verify', true, 34],
  ['notice', true, 70],
  ['moved', false, 70],
  ['look', true, 1.2 * 24 * 60],
  ['retire', false, 1.3 * 24 * 60],
  ['conn', false, 2 * 24 * 60],
  ['low', false, 2.2 * 24 * 60],
  ['balance', false, 3 * 24 * 60],
  ['renew', false, 5 * 24 * 60],
];

// The minutes since Dhaka's midnight: a row "today" is never older than this.
function minutesIntoToday(): number {
  const dhaka = new Date(NOW + 6 * 60 * MINUTE_MS);
  return dhaka.getUTCHours() * 60 + dhaka.getUTCMinutes();
}

function bellOf(
  fixture: BellFixture,
  language: Language,
  allRead: boolean,
): Record<string, unknown>[] {
  const today = minutesIntoToday();
  return fixture.map(([row, unread, minutes], index) => {
    const draft = BELL[row];
    // A row drawn under Today stays today whenever the test runs.
    const at = minutes < 24 * 60 ? Math.min(minutes, Math.max(0, today - 1)) : minutes;
    return {
      id: `nt-${String(index + 1)}`,
      kind: draft.kind,
      title: draft.title[language],
      body: draft.body[language],
      link: draft.link,
      createdAt: ago(at * MINUTE_MS),
      read: allRead || !unread,
    };
  });
}

// NTF-04's switches, as GET /notifications/preferences lists them for the owner (D7-40: money and account locked).
const KINDS: { kind: string; group: string; locked: boolean }[] = [
  { kind: 'order_placed', group: 'orders', locked: false },
  { kind: 'payment_to_verify', group: 'payments', locked: true },
  { kind: 'payment_verified', group: 'payments', locked: false },
  { kind: 'money_for_closed_order', group: 'payments', locked: true },
  { kind: 'gateway_attention', group: 'payments', locked: true },
  { kind: 'listener_phone', group: 'payments', locked: true },
  { kind: 'parcel_attention', group: 'couriers', locked: false },
  { kind: 'parcel_moved', group: 'couriers', locked: false },
  { kind: 'courier_connection', group: 'couriers', locked: false },
  { kind: 'courier_retiring', group: 'couriers', locked: false },
  { kind: 'courier_back', group: 'couriers', locked: false },
  { kind: 'low_stock', group: 'stock', locked: false },
  { kind: 'batch_expiring', group: 'stock', locked: false },
  { kind: 'held_stock_expired', group: 'stock', locked: false },
  { kind: 'media_failed', group: 'media', locked: false },
  { kind: 'low_balance', group: 'account', locked: true },
  { kind: 'usage_warning', group: 'account', locked: true },
  { kind: 'renewal_reminder', group: 'account', locked: true },
  { kind: 'account_notice', group: 'account', locked: true },
  { kind: 'email_bounced', group: 'account', locked: true },
  { kind: 'lytro_notice', group: 'account', locked: true },
];
// The kinds a staff member's role hears (`p37-prefs-staff`): orders and couriers, no money or account.
const STAFF_KINDS = new Set(['order_placed', 'parcel_attention', 'parcel_moved', 'low_stock']);

// ---------- SMS (SMS-01 to SMS-19)

/** A shop's SMS settings where they differ from Lytro's own words with the drawn switches. */
export interface SmsFixture {
  on?: Partial<Record<SmsEvent, boolean>>;
  templates?: Partial<Record<SmsEvent, string>>;
  smsName?: string | null;
  cap?: string | null;
  spent?: string;
  /** A shop with no orders yet: each estimate is a cost per order (`p37-sms-new`). */
  fresh?: boolean;
  ownerPhone?: string | null;
}

const UNIT = 67;
const RATE = '0.55';
const SHOP_NAME: Words = { bn: 'মেঘ ফ্যাশন', en: 'Megh Fashion' };
// Each event's SMS in the last 30 days (P37_EV's `n`).
const SENT_30: Record<SmsEvent, number> = {
  [SmsEvent.OrderPlaced]: 53,
  [SmsEvent.PaymentVerified]: 21,
  [SmsEvent.OrderShipped]: 47,
  [SmsEvent.OrderDelivered]: 44,
  [SmsEvent.OrderCancelled]: 6,
  [SmsEvent.NewOrderAlert]: 41,
  [SmsEvent.PaymentToVerify]: 9,
};

const SAMPLE: Partial<Record<SmsVariable, string>> = {
  order_number: '261106-0017',
  amount: '1,250',
  customer_name: 'রহিম উদ্দিন',
  tracking_link: 'https://megh.lytro.app/track/AB3XK9QZ',
};

const money = (value: number): string => value.toFixed(2);
const CYCLE_START = '2026-10-31T18:00:00.000Z';
const CYCLE_END = '2026-11-30T18:00:00.000Z';

function smsSettingsOf(fixture: SmsFixture, language: Language): Record<string, unknown> {
  const name = fixture.smsName ?? SHOP_NAME[language];
  const events = Object.values(SmsEvent).map((event) => {
    const definition = SMS_EVENTS[event];
    const template = fixture.templates?.[event] ?? definition.template;
    const sample = smsWithName(name, renderSmsTemplate(template, SAMPLE));
    const units = smsUnitsOf(sample, UNIT);
    const on = fixture.on?.[event] ?? definition.on;
    return {
      event,
      recipient: definition.recipient,
      on,
      template,
      edited: template !== definition.template,
      defaultTemplate: definition.template,
      variables: definition.variables,
      sample,
      units,
      estimate: fixture.fresh
        ? { basis: 'per_order', cost: money(units * Number(RATE)) }
        : {
            basis: 'last_30_days',
            count: SENT_30[event],
            cost: money(units * Number(RATE) * SENT_30[event]),
          },
    };
  });
  return {
    events,
    essentials: [
      {
        kind: 'shopper_code',
        words:
          language === 'bn'
            ? 'আপনার কোড 482913। কাউকে দেবেন না।'
            : 'Your code is 482913. Do not share it.',
        payer: 'balance',
      },
      {
        kind: 'staff_reset_code',
        words: 'আপনার পাসওয়ার্ড বদলের কোড 482913।',
        payer: 'free_then_balance',
      },
      { kind: 'shop_ready', words: 'Your shop is ready: megh.lytro.app', payer: 'free' },
    ],
    ownerPhone: fixture.ownerPhone === undefined ? '+8801711234567' : fixture.ownerPhone,
    smsName: name,
    usesShopName: fixture.smsName == null,
    shopName: SHOP_NAME[language],
    monthlySpendCap: fixture.cap ?? null,
    spentThisMonth: fixture.spent ?? '62.15',
    // The cycle Usage reads: 1 to 30 November, order SMS starting again on 1 December (Part 37's dates).
    cycleStart: CYCLE_START,
    cycleEnd: CYCLE_END,
    unitSize: UNIT,
    rate: RATE,
  };
}

/** The log's rows (`p37-sms-log`): sent, failed and blocked; an order's own when the test names it. */
function smsLogOf(language: Language, orderId: string | null): Record<string, unknown>[] {
  const name = SHOP_NAME[language];
  const placed = smsWithName(
    name,
    renderSmsTemplate(SMS_EVENTS[SmsEvent.OrderPlaced].template, {
      order_number: '261031-0047',
      amount: '3,470',
    }),
  );
  const shipped = smsWithName(
    name,
    renderSmsTemplate(SMS_EVENTS[SmsEvent.OrderShipped].template, {
      order_number: '261031-0047',
      tracking_link: 'https://megh.lytro.app/track/AB3XK9QZ',
    }),
  );
  const rows = [
    {
      id: 905,
      kind: 'order_shipped',
      toPhone: '01711 234 567',
      units: 2,
      cost: '1.10',
      status: 'sent',
      blockedReason: null,
      orderId: 'o-47',
      orderNumber: '261031-0047',
      body: shipped,
      createdAt: ago(18 * 60 * MINUTE_MS),
    },
    {
      id: 904,
      kind: 'order_placed',
      toPhone: '01711 234 567',
      units: 1,
      cost: '0.55',
      status: 'sent',
      blockedReason: null,
      orderId: 'o-47',
      orderNumber: '261031-0047',
      body: placed,
      createdAt: ago(25 * 60 * MINUTE_MS),
    },
    {
      id: 903,
      kind: 'signin_code',
      toPhone: '01711 234 567',
      units: 1,
      cost: '0.00',
      status: 'sent',
      blockedReason: null,
      orderId: null,
      orderNumber: null,
      body: null,
      createdAt: ago(26 * 60 * MINUTE_MS),
    },
    {
      id: 902,
      kind: 'order_cancelled',
      toPhone: '01812 445 566',
      units: 1,
      cost: '0.00',
      status: 'failed',
      blockedReason: null,
      orderId: 'o-31',
      orderNumber: '261029-0031',
      body: smsWithName(
        name,
        renderSmsTemplate(SMS_EVENTS[SmsEvent.OrderCancelled].template, {
          order_number: '261106-0031',
        }),
      ),
      createdAt: ago(2 * DAY_MS),
    },
    {
      id: 901,
      kind: 'order_placed',
      toPhone: '01912 778 899',
      units: 1,
      cost: '0.00',
      status: 'blocked',
      blockedReason: 'insufficient_balance',
      orderId: 'o-31',
      orderNumber: '261029-0031',
      body: placed,
      createdAt: ago(3 * DAY_MS),
    },
  ];
  return orderId === null
    ? rows
    : rows.filter((row) => row.orderId === orderId && row.status === 'sent');
}

function smsReportOf(from: string | null, to: string | null, empty: boolean): unknown {
  const day = (offset: number): string =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(
      new Date(NOW - offset * DAY_MS),
    );
  const dateTo = to ?? day(0);
  const dateFrom = from ?? day(29);
  if (empty) return { dateFrom, dateTo, days: [] };
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; offset < 10; offset += 1) {
    rows.push(
      {
        day: day(offset),
        kind: 'order_placed',
        sent: 2,
        failed: 0,
        blocked: offset === 3 ? 1 : 0,
        units: 2,
        cost: '1.10',
      },
      {
        day: day(offset),
        kind: 'order_shipped',
        sent: 2,
        failed: offset === 5 ? 1 : 0,
        blocked: 0,
        units: 4,
        cost: '2.20',
      },
    );
  }
  return { dateFrom, dateTo, days: rows };
}

// ---------- the fake order check (FRD-01 to FRD-11)

/** One check's figures (P37's `p37Fraud` options). */
export interface CheckFixture {
  figures?: [number, number, number];
  band?: 'none' | 'low' | 'medium' | 'high';
  range?: string | null;
  reports?: number;
  doubtful?: boolean;
  categories?: string[];
  own?: [number, number, number];
  steadfast?: 'answered' | 'not_connected' | 'failed' | 'no_history';
  cached?: boolean;
  /** Minutes since the check. */
  minutesAgo?: number;
  cost?: string;
}

export function checkView(
  phone: string,
  fixture: CheckFixture = {},
  trigger = 'staff',
): Record<string, unknown> {
  const state = fixture.steadfast ?? 'answered';
  const [d, r, c] = fixture.figures ?? [82, 12, 6];
  const [od, or, oc] = fixture.own ?? [3, 1, 0];
  return {
    id: `fc-${phone}`,
    phone,
    checkedAt: ago((fixture.minutesAgo ?? 1) * MINUTE_MS),
    trigger,
    orderId: trigger === 'order' ? 'o-47' : null,
    sources: [
      {
        source: 'steadfast',
        state: state === 'no_history' ? 'answered' : state,
        cached: fixture.cached ?? false,
      },
      { source: 'own_orders', state: 'answered', cached: false },
    ],
    steadfast:
      state === 'answered'
        ? {
            deliveredPercent: d,
            returnedPercent: r,
            cancelledPercent: c,
            volumeBand: fixture.band ?? 'medium',
            volumeRange: fixture.range === undefined ? '8' : fixture.range,
            reports: fixture.reports ?? 0,
            doubtful: fixture.doubtful ?? false,
            categories: fixture.categories ?? [],
          }
        : state === 'no_history'
          ? {
              deliveredPercent: null,
              returnedPercent: null,
              cancelledPercent: null,
              volumeBand: 'none',
              volumeRange: null,
              reports: 0,
              doubtful: false,
              categories: [],
            }
          : null,
    ownOrders: { delivered: od, returned: or, cancelled: oc },
    cost: fixture.cost ?? '0.0000',
  };
}

/** What the order's automatic check answers (GET /fraud-checks/orders/:id). */
export type OrderCheckFixture =
  | { state: 'done'; check?: CheckFixture }
  | { state: 'pending' }
  | {
      state: 'skipped';
      reason: 'rule_off' | 'below_minimum' | 'refused' | 'minute_limit' | 'failed';
      message?: string;
    }
  | { state: 'not_applicable' };

export interface FraudFixture {
  order?: OrderCheckFixture;
  /** The number's latest check, by phone ('01711234567'); none for the rest. */
  latest?: Record<string, CheckFixture>;
  /** What Check this number or Check again answers. */
  run?: CheckFixture | { refused: 'minute' | 'needs_plan' | 'frozen' };
  rule?: { codOrders: boolean; minAmount: string | null };
}

// ---------- reading a message (ORD-30 to ORD-34)

export type ReadFixture = 'narayanganj' | 'dhaka' | 'none' | 'minute' | 'unavailable' | 'nobal';

function readOf(fixture: ReadFixture, allowanceLeft: number | null): Answer {
  const charged =
    allowanceLeft === null
      ? { paidFrom: 'balance', amount: '0.1000', allowanceLeft: null }
      : { paidFrom: 'allowance', amount: '0.0000', allowanceLeft: allowanceLeft - 1 };
  if (fixture === 'minute') {
    return {
      refused: { status: 429, code: 'rate_limited', message: 'Too many reads in a minute.' },
    };
  }
  if (fixture === 'unavailable') {
    return {
      refused: { status: 503, code: 'service_unavailable', message: "Couldn't read it just now." },
    };
  }
  if (fixture === 'nobal') {
    return {
      refused: {
        status: 402,
        code: 'quota_exceeded',
        message: "The balance can't pay for this.",
        details: { balance: '0.04' },
      },
    };
  }
  if (fixture === 'none') {
    return {
      data: {
        draft: {
          customerName: null,
          phone: null,
          zillaId: null,
          locationId: null,
          deliveryAddress: null,
          notes: null,
        },
        fields: {
          customerName: 'missing',
          phone: 'missing',
          zilla: 'missing',
          thana: 'missing',
          deliveryAddress: 'missing',
          notes: 'missing',
        },
        written: { phone: null, zilla: null, thana: null },
        confidence: 0,
        charged: null,
      },
    };
  }
  if (fixture === 'dhaka') {
    return {
      data: {
        draft: {
          customerName: 'Tania Rahman',
          phone: '01711556677',
          zillaId: 1,
          locationId: 102,
          deliveryAddress: 'Section 6, Block C, House 22',
          notes: null,
        },
        fields: {
          customerName: 'found',
          phone: 'found',
          zilla: 'found',
          thana: 'check',
          deliveryAddress: 'found',
          notes: 'missing',
        },
        written: { phone: null, zilla: null, thana: 'Mirpur-10' },
        confidence: 0.84,
        charged,
      },
    };
  }
  return {
    data: {
      draft: {
        customerName: 'Sadia Islam',
        phone: '01812445566',
        zillaId: 9,
        locationId: null,
        deliveryAddress: 'House 14, Road 2, next to Fatulla bazar',
        notes: 'Deliver after evening',
      },
      fields: {
        customerName: 'found',
        phone: 'found',
        zilla: 'found',
        thana: 'missing',
        deliveryAddress: 'found',
        notes: 'found',
      },
      written: { phone: null, zilla: null, thana: 'Fatulla' },
      confidence: 0.8,
      charged,
    },
  };
}

// ---------- the reads allowance (PLN-20)

/** The reads pack: its uses this period, or none (each read at the rate). */
export interface ReadsFixture {
  /** Used of 200, until its end; null for no pack. */
  used?: number | null;
  /** Reads paid one by one this cycle. */
  outside?: number;
}

export const READS_ADDON = {
  id: 'a-reads',
  key: 'address_reads_200',
  kind: 'allowance',
  limitKey: null,
  unitSize: 200,
  price: 20,
  labelEn: '200 address reads',
  labelBn: '200টি ঠিকানা পড়া',
};

const READS_ENDS_MS = 2 * DAY_MS;

/** GET /usage's payPerUse (PLN-20): the pack pooled, or none, and the reads paid at the rate. */
export function payPerUseOf(fixture: ReadsFixture | null | undefined): unknown[] {
  const used = fixture?.used ?? null;
  return [
    {
      key: 'address_reads',
      rate: '0.1000',
      allowance:
        used === null ? null : { used, total: 200, left: 200 - used, endsAt: ahead(READS_ENDS_MS) },
      outsideAllowance: {
        count: fixture?.outside ?? (used === null ? 23 : 0),
        cost: money((fixture?.outside ?? (used === null ? 23 : 0)) * 0.1),
      },
    },
  ];
}

/** The pack the shop has, as GET /addons/mine lists it, with its uses left. */
export function ownedReads(fixture: ReadsFixture | null | undefined): Record<string, unknown>[] {
  const used = fixture?.used ?? null;
  if (used === null) return [];
  return [
    {
      id: 'p-reads',
      addonId: READS_ADDON.id,
      key: READS_ADDON.key,
      kind: 'allowance',
      labelEn: READS_ADDON.labelEn,
      labelBn: READS_ADDON.labelBn,
      limitKey: null,
      unitSize: 200,
      quantity: 1,
      startsAt: ago(28 * DAY_MS),
      expiresAt: ahead(READS_ENDS_MS),
      renews: true,
      renewal: 'with_plan',
      endsSoon: false,
      usesLeft: 200 - used,
    },
  ];
}

/** The pack for sale, as GET /addons lists it. */
export function readsOffer(standing: { trial?: boolean; payg?: boolean }): Record<string, unknown> {
  const addon = { ...READS_ADDON, price: '20.00', retiredAt: null };
  if (standing.trial || standing.payg) {
    return {
      addon,
      price: null,
      expiresAt: null,
      blockedBy: 'AddonNotAvailable',
      amounts: [],
      daysLeft: null,
      renewalPrice: null,
    };
  }
  return {
    addon,
    price: 13,
    expiresAt: ahead(20 * DAY_MS),
    blockedBy: null,
    amounts: [13, 27, 40],
    daysLeft: 20,
    renewalPrice: 20,
  };
}

// ---------- the whole of it

/** Part 37's side of a shop, for one test. */
export interface Phase7Fixture {
  notices?: NoticesFixture | null;
  bell?: BellFixture | null;
  bellRead?: boolean;
  /** The kinds switched off (NTF-04). */
  off?: string[];
  /** A VAPID key, so push can be turned on (NTF-02); none by default. */
  pushKey?: string | null;
  /** Whether the server holds this browser's subscription for the person looking; yes by default. */
  pushHeld?: boolean;
  sms?: SmsFixture;
  smsLogEmpty?: boolean;
  smsReportEmpty?: boolean;
  fraud?: FraudFixture;
  read?: ReadFixture;
  reads?: ReadsFixture | null;
  /** The reads pack is for sale in the add-on shop. */
  readsOffered?: boolean;
  /** The person's language as the server keeps it (I18N-01). */
  language?: Language | null;
  /** The owner's email bounces (NTF-06). */
  bounced?: boolean;
}

/** Writes the tests read back: what was sent. */
export interface Phase7Writes {
  acknowledged: string[];
  dismissed: string[];
  prefs: string[] | null;
  sms: Record<string, unknown>[];
  rule: Record<string, unknown> | null;
  checks: string[];
  reads: string[];
  language: string | null;
}

export function phase7Writes(): Phase7Writes {
  return {
    acknowledged: [],
    dismissed: [],
    prefs: null,
    sms: [],
    rule: null,
    checks: [],
    reads: [],
    language: null,
  };
}

/**
 * Part 37's routes, or null for every other path. `isOwner` and `permissions` decide the staff's own lists.
 */
export function phase7Answer(
  method: string,
  path: string,
  url: URL,
  body: Record<string, unknown> | null,
  fixture: Phase7Fixture,
  context: { language: Language; isOwner: boolean; trial: boolean; writes: Phase7Writes },
): Answer {
  const { language, writes } = context;
  // Notices.
  if (method === 'GET' && path === '/notices/summary') {
    return { data: summaryOf(fixture.notices ?? null, language) };
  }
  if (method === 'GET' && path === '/notices') {
    if (!fixture.notices) return { data: { items: [], unread: 0, next: null } };
    const category = url.searchParams.get('category');
    const q = url.searchParams.get('q')?.toLowerCase() ?? '';
    const views = noticesOf(fixture.notices, language);
    const items = views.filter(
      (each) =>
        (!category || each.category === category) &&
        (!q || `${String(each.title)} ${String(each.body)}`.toLowerCase().includes(q)),
    );
    return { data: { items, unread: views.filter((each) => !each.read).length, next: null } };
  }
  const notice = /^\/notices\/(n-[a-z]+)(\/(read|dismiss|acknowledge))?$/.exec(path);
  if (notice) {
    const [, id, , action] = notice;
    const fixtureOf = fixture.notices ?? {};
    if (method === 'GET' && !action) {
      const draft = NOTICES.find((each) => `n-${each.id}` === id);
      if (!draft)
        return { refused: { status: 404, code: 'not_found', message: 'No such notice.' } };
      const acked = fixtureOf.acked || writes.acknowledged.includes(id ?? '');
      return { data: noticeView(draft, { ...fixtureOf, acked }, language) };
    }
    if (method === 'POST' && action === 'read') return { data: { unread: 0 } };
    if (method === 'POST' && action === 'dismiss') {
      writes.dismissed.push(id ?? '');
      return { data: { ok: true } };
    }
    if (method === 'POST' && action === 'acknowledge') {
      writes.acknowledged.push(id ?? '');
      return { data: { acknowledgedAt: new Date().toISOString() } };
    }
  }
  // The bell.
  if (method === 'GET' && path === '/notifications') {
    const rows = bellOf(fixture.bell ?? [], language, fixture.bellRead ?? false);
    const limit = Number(url.searchParams.get('limit') ?? '20');
    return {
      data: {
        items: rows.slice(0, limit),
        unread: rows.filter((each) => !each.read).length,
        next: null,
      },
    };
  }
  if (method === 'POST' && path === '/notifications/read') {
    fixture.bellRead = body?.all === true || fixture.bellRead;
    return { data: { marked: 1, unread: 0 } };
  }
  if (path === '/notifications/preferences') {
    if (method === 'PUT') writes.prefs = (body?.off as string[] | undefined) ?? [];
    const off = writes.prefs ?? fixture.off ?? [];
    const kinds = KINDS.filter((each) => context.isOwner || STAFF_KINDS.has(each.kind)).map(
      (each) => ({
        kind: each.kind,
        group: each.group,
        on: each.locked || !off.includes(each.kind),
        locked: each.locked,
      }),
    );
    return { data: { kinds } };
  }
  if (method === 'GET' && path === '/push/key')
    return { data: { publicKey: fixture.pushKey ?? null } };
  if (path === '/push/subscriptions/check') {
    return { data: { subscribed: fixture.pushHeld ?? true } };
  }
  if (path === '/push/subscriptions') return { data: { subscribed: method === 'POST' } };
  if (method === 'POST' && path === '/push/test') return { data: { sent: 2, gone: 1, failed: 0 } };
  if (method === 'PUT' && path === '/me/language') {
    writes.language = typeof body?.language === 'string' ? body.language : '';
    return { data: { language: body?.language, kept: true } };
  }
  // SMS.
  if (path === '/sms/settings') {
    const sms = (fixture.sms ??= {});
    if (method === 'PATCH') {
      writes.sms.push(body ?? {});
      const events = (body?.events ?? {}) as Partial<Record<SmsEvent, boolean>>;
      const templates = (body?.templates ?? {}) as Partial<Record<SmsEvent, string>>;
      for (const [event, template] of Object.entries(templates)) {
        if (!template.includes('{order_number}')) {
          return {
            refused: {
              status: 400,
              code: 'validation_error',
              message: 'Check the fields.',
              details: {
                fields: [
                  {
                    field: `templates.${event}`,
                    problem: 'keep_order_number',
                    message: 'Keep the order number in the SMS.',
                  },
                ],
              },
            },
          };
        }
      }
      sms.on = { ...sms.on, ...events };
      sms.templates = { ...sms.templates, ...templates };
      if ('smsName' in (body ?? {})) sms.smsName = (body?.smsName as string | null) ?? null;
      if ('monthlySpendCap' in (body ?? {})) {
        const cap = body?.monthlySpendCap as number | null;
        sms.cap = cap === null ? null : money(cap);
      }
    }
    return { data: smsSettingsOf(sms, language) };
  }
  const reset = /^\/sms\/settings\/templates\/([a-z_]+)\/reset$/.exec(path);
  if (method === 'POST' && reset) {
    const sms = (fixture.sms ??= {});
    const event = reset[1] ?? '';
    sms.templates = Object.fromEntries(
      Object.entries(sms.templates ?? {}).filter(([key]) => key !== event),
    );
    return { data: smsSettingsOf(sms, language) };
  }
  if (method === 'GET' && path === '/sms/log') {
    if (fixture.smsLogEmpty) return { data: { sms: [] } };
    const orderId = url.searchParams.get('orderId');
    if (url.searchParams.get('before')) return { data: { sms: [] } };
    return { data: { sms: smsLogOf(language, orderId) } };
  }
  if (method === 'GET' && path === '/sms/report') {
    return {
      data: smsReportOf(
        url.searchParams.get('from'),
        url.searchParams.get('to'),
        fixture.smsReportEmpty ?? false,
      ),
    };
  }
  // The fake order check.
  const fraud = fixture.fraud ?? {};
  if (method === 'GET' && path === '/fraud-checks') {
    const phone = url.searchParams.get('phone') ?? '';
    const given = fraud.latest?.[phone];
    return { data: { latest: given ? checkView(phone, given) : null } };
  }
  if (method === 'POST' && path === '/fraud-checks') {
    const phone = typeof body?.phone === 'string' ? body.phone : '';
    writes.checks.push(phone);
    const run = fraud.run ?? {};
    if ('refused' in run) {
      const said = {
        minute: {
          status: 429,
          code: 'rate_limited',
          message: 'Too many phones checked in the last minute.',
        },
        needs_plan: {
          status: 402,
          code: 'quota_exceeded',
          message:
            language === 'bn'
              ? 'চেক চার্জ হলে ফোন চেক করতে প্ল্যান লাগবে। প্ল্যান কিনুন।'
              : 'Checking a phone needs a plan while checks are charged. Buy a plan to use it.',
        },
        frozen: { status: 403, code: 'tenant_offline', message: 'The plan has ended.' },
      }[run.refused];
      return { refused: said };
    }
    return { data: checkView(phone, { ...run, minutesAgo: 0 }) };
  }
  const ordered = /^\/fraud-checks\/orders\/([^/]+)$/.exec(path);
  if (method === 'GET' && ordered) {
    const order = fraud.order ?? { state: 'not_applicable' };
    if (order.state === 'done') {
      return {
        data: {
          state: 'done',
          reason: null,
          minAmount: null,
          message: null,
          check: checkView('01711234567', { minutesAgo: 6 * 60, ...order.check }, 'order'),
        },
      };
    }
    if (order.state === 'skipped') {
      return {
        data: {
          state: 'skipped',
          reason: order.reason,
          minAmount: order.reason === 'below_minimum' ? '500.00' : null,
          message: order.message ?? null,
          check: null,
        },
      };
    }
    return {
      data: { state: order.state, reason: null, minAmount: null, message: null, check: null },
    };
  }
  if (path === '/fraud-checks/rule') {
    if (method === 'PUT') {
      writes.rule = body;
      fraud.rule = {
        codOrders: Boolean(body?.codOrders),
        minAmount: (body?.minAmount as string | null) ?? null,
      };
      fixture.fraud = fraud;
    }
    return { data: fraud.rule ?? { codOrders: true, minAmount: null } };
  }
  // Reading a message.
  if (method === 'POST' && path === '/orders/read-address') {
    writes.reads.push(typeof body?.text === 'string' ? body.text : '');
    const left = fixture.reads?.used == null ? null : 200 - fixture.reads.used;
    return readOf(fixture.read ?? 'narayanganj', left);
  }
  return null;
}
