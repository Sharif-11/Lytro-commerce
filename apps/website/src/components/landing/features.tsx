import { InventoryCard } from '@/components/mockups/inventory-card';
import { StatsCard } from '@/components/mockups/stats-card';
import { CheckList } from '@/components/ui/check-list';
import { Container } from '@/components/ui/container';
import { Icon, type IconName } from '@/components/ui/icon';
import { SectionHeading } from '@/components/ui/section-heading';
import type { LiveFeatures } from '@/lib/features';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';
import type { ReactNode } from 'react';

const text = {
  eyebrow: { bn: 'ফিচার', en: 'Features' },
  title: {
    bn: 'একটা আসল দোকানের যা যা লাগে, সেটআপ ছাড়াই',
    en: 'Everything a real shop needs, nothing you have to set up',
  },
  lead: {
    bn: 'যিনি এক ফোন থেকে পুরো ব্যবসা চালান, তার জন্যই বানানো।',
    en: 'Built for a seller who runs the whole business from one phone.',
  },
} satisfies Record<string, Bilingual>;

// LANDING-PAGE-DESIGN.md §3 row 5: two spotlights (shown only once Phase 3 inventory and statistics are
// live) and six cards, each with a small vignette drawn from the real screen.
const inventory = {
  title: { bn: 'স্টক আর ইনভেন্টরি, সহজ ভাষায়', en: 'Stock and inventory, in plain words' },
  body: {
    bn: 'প্রতিটা বিক্রি, রিটার্ন আর কেনার সাথে স্টক নিজে বদলায়। প্রোডাক্ট শেষ হওয়ার আগেই লো-স্টক অ্যালার্ট পান, আর হিস্ট্রি পড়ুন ডায়েরির মতো, হিসাবের খাতার মতো নয়।',
    en: "Every sale, return and purchase moves stock on its own. You get a low-stock alert before a product runs out, and a history that reads like a diary, not an accountant's ledger.",
  },
  points: [
    {
      bn: 'এক ধাপে স্টক যোগ, সাপ্লায়ার আর দাম ঐচ্ছিক',
      en: 'Add stock in one step, supplier and cost optional',
    },
    {
      bn: 'ফোনের ক্যামেরায় বারকোড আর IMEI স্ক্যান',
      en: 'Barcode and IMEI scan from the phone camera',
    },
    {
      bn: 'খাবার আর কসমেটিক্সের জন্য ব্যাচ আর মেয়াদের তারিখ',
      en: 'Batches with expiry dates for food and cosmetics',
    },
    {
      bn: 'স্টক চেক, যা দেখায় কী বাড়লো আর কী হারালো',
      en: 'Stock check that shows what was gained or lost',
    },
  ],
};

const statistics = {
  title: {
    bn: 'ব্যবসার পরিসংখ্যান, যা দেখে সিদ্ধান্ত নেওয়া যায়',
    en: 'Business statistics you can act on',
  },
  body: {
    bn: 'সপ্তাহ, মাস, কোয়ার্টার বা বছরের বিক্রি, কোন প্রোডাক্ট চলছে আর কোনটা থেমে যাচ্ছে, আর আপনার স্টকের দাম কত। শুধু আসল হিসাব: টেস্ট পেমেন্ট, ফেইলড আর রিফান্ড অর্ডার বাদ।',
    en: 'Sales by week, month, quarter or year, which products are selling and which are slowing down, and what your stock is worth. Real figures only: test payments, failed and refunded orders are left out.',
  },
  points: [
    {
      bn: 'কোন প্রোডাক্ট বেশি বিক্রি, সংখ্যায় আর টাকায়',
      en: 'Hot-selling products by units and by revenue',
    },
    { bn: 'একটা প্রোডাক্ট বা পুরো দোকানের ট্রেন্ড', en: 'Trend for one product or the whole shop' },
    {
      bn: 'স্টকের দাম, বিক্রির খরচ আর কারণ অনুযায়ী লস',
      en: 'Inventory value, cost of goods sold and losses by reason',
    },
    { bn: 'স্টাফ শুধু তার রোলের হিসাবটুকুই দেখে', en: 'Staff see only what their role allows' },
  ],
};

interface Card {
  icon: IconName;
  title: Bilingual;
  body: Bilingual;
  vignette: (copy: Copy) => ReactNode;
}

const pill = (tone: string, label: string) => (
  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>{label}</span>
);

const cards: Card[] = [
  {
    icon: 'shield',
    title: { bn: 'ফেক অর্ডার চেক', en: 'Fake-order check' },
    body: {
      bn: 'কুরিয়ারে এক টাকা খরচের আগেই প্রতিটা নতুন অর্ডারের নম্বর রিটার্ন আর ক্যানসেলের রেকর্ডে মিলিয়ে দেখা হয়।',
      en: "Every new order's phone number is checked against return and cancel history before you spend a taka on courier.",
    },
    vignette: (copy) => (
      <div className="space-y-1.5 text-[12px]">
        <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-2.5 py-1.5">
          <span className="num text-ink">017XXXXX842</span>
          {pill('bg-danger-soft text-danger', copy.of({ bn: '৩ রিটার্ন', en: '3 returns' }))}
        </div>
        <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-2.5 py-1.5">
          <span className="num text-ink">019XXXXX310</span>
          {pill('bg-success-soft text-success', copy.of({ bn: '১২ ডেলিভারড', en: '12 delivered' }))}
        </div>
      </div>
    ),
  },
  {
    icon: 'truck',
    title: { bn: 'এক ট্যাপে কুরিয়ার', en: 'One-tap courier' },
    body: {
      bn: 'নিজের কুরিয়ার অ্যাকাউন্ট দিয়ে অর্ডার থেকেই Steadfast বা Pathao বুক করুন। ট্র্যাকিং আর স্ট্যাটাস নিজে থেকেই আসে।',
      en: 'Book Steadfast or Pathao from the order itself with your own courier account. Tracking and status come back automatically.',
    },
    vignette: (copy) => (
      <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-2.5 py-1.5 text-[12px]">
        <span className="num text-ink">#1040 · Steadfast</span>
        {pill('bg-brand-100 text-brand-800', copy.of({ bn: 'পথে আছে', en: 'In transit' }))}
      </div>
    ),
  },
  {
    icon: 'wallet',
    title: { bn: 'পেমেন্ট নিজেই মিলে যায়', en: 'Payments match themselves' },
    body: {
      bn: 'ফোনে ছোট একটা লিসেনার অ্যাপ বিকাশ-নগদের রিসিট SMS পড়ে ঠিক অর্ডারটাকে পেইড করে দেয়।',
      en: 'A small listener app on your phone reads the bKash and Nagad receipt SMS and marks the right order paid.',
    },
    vignette: (copy) => (
      <div className="rounded-lg bg-neutral-50 px-2.5 py-1.5 text-[12px]">
        <div className="flex items-center justify-between">
          <span className="num text-ink">bKash · TrxID 9KL2M</span>
          <span className="num font-bold text-ink">৳3,490</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-neutral-700">
          <span>{copy.of({ bn: '#1042-এর সাথে মিলেছে', en: 'Matched to #1042' })}</span>
          {pill('bg-success-soft text-success', copy.of({ bn: 'পেইড', en: 'Paid' }))}
        </div>
      </div>
    ),
  },
  {
    icon: 'store',
    title: { bn: 'নিজের স্টোরফ্রন্ট', en: 'Your own storefront' },
    body: {
      bn: 'আপনার নাম, লোগো আর রঙে আসল দোকানের পেজ, কার্ট, জেলা অনুযায়ী ডেলিভারি চার্জ, অনলাইন বা ক্যাশ অন ডেলিভারি চেকআউট।',
      en: 'A real shop page with your name, logo and colours, cart, delivery charge by district, and online or cash-on-delivery checkout.',
    },
    vignette: (copy) => (
      <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-2.5 py-1.5 text-[12px]">
        <span className="num text-ink">rahim-gadgets.lytro.app</span>
        {pill('bg-success-soft text-success', copy.of({ bn: 'লাইভ', en: 'Live' }))}
      </div>
    ),
  },
  {
    icon: 'users',
    title: { bn: 'স্টাফ, যার যার রোলে', en: 'Staff with their own roles' },
    body: {
      bn: 'প্যাকার, পেজ ম্যানেজার বা হিসাবরক্ষক, যার যতটুকু দরকার ততটুকুই দিন। কে কী বদলালো, সবই লগে থাকে।',
      en: 'Give a packer, a page manager or an accountant exactly the pages they need. Every change is logged with who did it.',
    },
    vignette: (copy) => (
      <div className="space-y-1.5 text-[12px]">
        <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-2.5 py-1.5">
          <span className="text-ink">
            Sumi · {copy.of({ bn: 'শুধু অর্ডার', en: 'Orders only' })}
          </span>
          {pill('bg-neutral-100 text-neutral-700', copy.of({ bn: 'স্টাফ', en: 'Staff' }))}
        </div>
        <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-2.5 py-1.5">
          <span className="text-ink">Rahim · {copy.of({ bn: 'মালিক', en: 'Owner' })}</span>
          {pill('bg-brand-100 text-brand-800', copy.of({ bn: 'সব', en: 'All' }))}
        </div>
      </div>
    ),
  },
  {
    icon: 'layers',
    title: { bn: 'ভ্যারিয়েন্ট আর স্টক', en: 'Variants and stock' },
    body: {
      bn: 'সাইজ, রঙ, মডেল: অ্যাট্রিবিউট লিখলেই ভ্যারিয়েন্ট তৈরি। প্রতিটা অর্ডার, রিটার্ন আর কেনার সাথে স্টক নিজে বদলায়।',
      en: 'Size, colour, model: type an attribute and the variants appear. Stock moves with every order, return and purchase.',
    },
    vignette: (copy) => (
      <div className="space-y-1.5 text-[12px]">
        <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-2.5 py-1.5">
          <span className="text-ink">Kurti · M · {copy.of({ bn: 'মেরুন', en: 'Maroon' })}</span>
          <span className="num font-bold text-ink">14</span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-2.5 py-1.5">
          <span className="text-ink">Kurti · L · {copy.of({ bn: 'মেরুন', en: 'Maroon' })}</span>
          {pill('bg-accent-100 text-accent-700', copy.of({ bn: '২টা বাকি', en: '2 left' }))}
        </div>
      </div>
    ),
  },
];

export function Features({ language, live }: { language: Language; live: LiveFeatures }) {
  const copy = new Copy(language);
  const spotlights = [
    live.has('inventory')
      ? {
          key: 'inventory',
          icon: 'box' as const,
          data: inventory,
          art: <InventoryCard language={language} />,
        }
      : null,
    live.has('statistics')
      ? {
          key: 'statistics',
          icon: 'chart' as const,
          data: statistics,
          art: <StatsCard language={language} />,
        }
      : null,
  ].filter((item) => item !== null);

  return (
    <section id="features" className="scroll-mt-16 bg-white">
      <Container className="py-16 sm:py-20">
        <SectionHeading
          eyebrow={copy.of(text.eyebrow)}
          title={copy.of(text.title)}
          lead={copy.of(text.lead)}
        />

        {spotlights.length > 0 ? (
          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            {spotlights.map((spot) => (
              <article
                key={spot.key}
                className="grid gap-6 rounded-sheet border border-line bg-brand-50 p-5 sm:p-7 lg:grid-cols-[1fr_280px]"
              >
                <div>
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-700 text-white">
                    <Icon name={spot.icon} size={22} />
                  </span>
                  <h3 className="heading mt-4 text-[22px] text-ink">{copy.of(spot.data.title)}</h3>
                  <p className="mt-2 text-[15px] text-neutral-700">{copy.of(spot.data.body)}</p>
                  <CheckList
                    className="mt-4"
                    items={spot.data.points.map((point) => copy.of(point))}
                  />
                </div>
                <div className="self-center">{spot.art}</div>
              </article>
            ))}
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <article
              key={card.title.en}
              className="flex flex-col rounded-card border border-line bg-white p-5 shadow-card transition-shadow hover:shadow-lift"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-800">
                <Icon name={card.icon} size={20} />
              </span>
              <h3 className="heading mt-4 text-[18px] text-ink">{copy.of(card.title)}</h3>
              <p className="mt-2 flex-1 text-[15px] text-neutral-700">{copy.of(card.body)}</p>
              <div className="mt-4" aria-hidden="true">
                {card.vignette(copy)}
              </div>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
