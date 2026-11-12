import { InventoryCard } from '@/components/mockups/inventory-card';
import { StatsCard } from '@/components/mockups/stats-card';
import { CheckList } from '@/components/ui/check-list';
import { Container } from '@/components/ui/container';
import { Icon, type IconName } from '@/components/ui/icon';
import { Paragraphs } from '@/components/ui/paragraphs';
import { SectionHeading } from '@/components/ui/section-heading';
import type { LiveFeatures } from '@/lib/features';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';
import type { ReactNode } from 'react';

const text = {
  eyebrow: { bn: 'ফিচার', en: 'Features' },
  title: {
    bn: 'আপনার অনলাইন দোকানের সব কাজ, এক জায়গায়',
    en: "All of your online shop's work, in one place",
  },
  lead: {
    bn: 'আপনি যদি একাই মোবাইল দিয়ে পুরো ব্যবসা সামলান, তাহলে Lytro আপনার জন্য। অর্ডার নেওয়া থেকে শুরু করে পেমেন্ট, কুরিয়ার, স্টক ও কর্মচারী পরিচালনা—সবকিছু করুন একটি জায়গা থেকেই।',
    en: 'If you run the whole business on your own from your phone, Lytro is for you. From taking orders to payments, couriers, stock and staff, do it all from one place.',
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
  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${tone}`}>
    {label}
  </span>
);

// One vignette line: its text and its pill side by side, the pill dropping under the text on a narrow card.
const ROW =
  'flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-lg bg-neutral-50 px-2.5 py-1.5';
const cards: Card[] = [
  {
    icon: 'shield',
    title: {
      bn: 'অর্ডারটি ভুয়া কি না, আগে থেকেই জানুন',
      en: 'Know if an order is fake, before you ship',
    },
    body: {
      bn: 'কুরিয়ারে পাঠানোর আগে ক্রেতার ফোন নম্বরের আগের অর্ডারের রেকর্ড যাচাই করুন। আগে কতবার পার্সেল রিটার্ন বা ক্যানসেল হয়েছে, তা দেখে সিদ্ধান্ত নিন।',
      en: "Before a parcel goes to the courier, check the buyer's phone number against its past orders. See how often parcels came back or were cancelled, then decide.",
    },
    vignette: (copy) => (
      <div className="space-y-1.5 text-[12px]">
        <div className={ROW}>
          <span className="num text-ink">017XXXXX842</span>
          {pill('bg-danger-soft text-danger', copy.of({ bn: '৩টি রিটার্ন', en: '3 returns' }))}
        </div>
        <div className={ROW}>
          <span className="num text-ink">019XXXXX310</span>
          {pill(
            'bg-success-soft text-success',
            copy.of({ bn: '১২টি ডেলিভারি', en: '12 delivered' }),
          )}
        </div>
      </div>
    ),
  },
  {
    icon: 'truck',
    title: { bn: 'এক ক্লিকেই কুরিয়ার বুকিং', en: 'Book the courier in one click' },
    body: {
      bn: 'অর্ডার থেকেই আপনার Steadfast বা Pathao অ্যাকাউন্ট ব্যবহার করে কুরিয়ার বুক করুন। বারবার কুরিয়ার ওয়েবসাইটে গিয়ে তথ্য দেওয়ার দরকার নেই। পার্সেলের ট্র্যাকিং ও ডেলিভারি আপডেট চলে আসবে আপনার দোকানেই।',
      en: "Book the courier from the order itself, with your own Steadfast or Pathao account. No more typing the details into the courier's website. Tracking and delivery updates come back to your shop.",
    },
    vignette: (copy) => (
      <div className={`${ROW} text-[12px]`}>
        <span className="num text-ink">#1040 · Steadfast</span>
        {pill(
          'bg-brand-100 text-brand-800',
          copy.of({ bn: 'পার্সেল পথে আছে', en: 'Parcel on the way' }),
        )}
      </div>
    ),
  },
  {
    icon: 'wallet',
    title: { bn: 'পেমেন্ট মিলবে অটোমেটিক', en: 'Payments match automatically' },
    body: {
      bn: 'কাস্টমার বিকাশ বা নগদে টাকা পাঠালে পেমেন্টের SMS থেকে Lytro নিজেই বুঝে নেবে কোন অর্ডারের টাকা এসেছে। এরপর সেই অর্ডার Paid হিসেবে চিহ্নিত হবে।',
      en: 'When a customer sends money by bKash or Nagad, Lytro reads the payment SMS and works out which order it is for. That order is then marked Paid.',
    },
    vignette: (copy) => (
      <div className="rounded-lg bg-neutral-50 px-2.5 py-1.5 text-[12px]">
        <div className="flex items-center justify-between">
          <span className="num text-ink">bKash</span>
          <span className="num font-bold text-ink">৳3,490</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-neutral-700">
          <span>
            {copy.of({
              bn: 'অর্ডার #1042-এর পেমেন্ট মিলেছে',
              en: 'Payment matched to order #1042',
            })}
          </span>
          {pill('bg-success-soft text-success', copy.of({ bn: 'পেমেন্ট সম্পন্ন', en: 'Paid' }))}
        </div>
      </div>
    ),
  },
  {
    icon: 'store',
    title: { bn: 'আপনার নিজের অনলাইন দোকান', en: 'Your own online shop' },
    body: {
      bn: 'আপনার দোকানের নাম, লোগো ও পছন্দের রঙ দিয়ে তৈরি করুন নিজের অনলাইন শপ। কাস্টমার পণ্য দেখবে, কার্টে যোগ করবে এবং সরাসরি অর্ডার করতে পারবে।\n\nডেলিভারি চার্জ, অনলাইন পেমেন্ট ও ক্যাশ অন ডেলিভারি—সবকিছু নিজের মতো সাজিয়ে নিন।',
      en: "Make your own online shop with your shop's name, logo and colours. Customers browse your products, add them to a cart and order directly.\n\nDelivery charges, online payment and cash on delivery: set everything up your way.",
    },
    vignette: (copy) => (
      <div className={`${ROW} text-[12px]`}>
        <span className="num text-ink">rahim-gadgets.lytro.app</span>
        {pill(
          'bg-success-soft text-success',
          copy.of({ bn: 'আপনার দোকান এখন অনলাইনে', en: 'Your shop is online' }),
        )}
      </div>
    ),
  },
  {
    icon: 'users',
    title: { bn: 'কর্মচারীদের কাজ ভাগ করে দিন', en: 'Share the work with your staff' },
    body: {
      bn: 'আপনার দোকানে যিনি অর্ডার দেখবেন, তিনি শুধু অর্ডারের কাজই করতে পারবেন। যিনি হিসাব রাখবেন, তিনি হিসাবের কাজ করবেন। সবাইকে নিজের কাজ অনুযায়ী অনুমতি দিন।\n\nকে কখন কোন তথ্য পরিবর্তন করেছেন, সেটাও দেখতে পারবেন আপনি।',
      en: 'Whoever handles orders in your shop can only work on orders. Whoever keeps the accounts works on the accounts. Give each person access for their own job.\n\nYou can also see who changed what, and when.',
    },
    vignette: (copy) => (
      <div className="space-y-1.5 text-[12px]">
        <div className={ROW}>
          <span className="text-ink">
            Sumi · {copy.of({ bn: 'শুধু অর্ডার দেখার অনুমতি', en: 'May see orders only' })}
          </span>
          {pill('bg-neutral-100 text-neutral-700', copy.of({ bn: 'স্টাফ', en: 'Staff' }))}
        </div>
        <div className={ROW}>
          <span className="text-ink">Rahim · {copy.of({ bn: 'মালিক', en: 'Owner' })}</span>
          {pill(
            'bg-brand-100 text-brand-800',
            copy.of({ bn: 'সবকিছুর নিয়ন্ত্রণ', en: 'In charge of everything' }),
          )}
        </div>
      </div>
    ),
  },
  {
    icon: 'layers',
    title: { bn: 'পণ্য, সাইজ ও স্টকের হিসাব', en: 'Products, sizes and stock' },
    body: {
      bn: 'একই পণ্যের বিভিন্ন সাইজ, রঙ বা মডেল আলাদাভাবে যোগ করুন। প্রতিটি ভ্যারিয়েন্টের স্টক কত আছে, তা দেখুন। অর্ডার, বিক্রি ও রিটার্ন অনুযায়ী স্টকের হিসাব নিজে থেকেই আপডেট হবে।',
      en: 'Add the sizes, colours or models of one product separately, and see how much of each variant is in stock. Stock updates on its own with every order, sale and return.',
    },
    vignette: (copy) => (
      <div className="space-y-1.5 text-[12px]">
        <div className={ROW}>
          <span className="text-ink">Kurti · M · {copy.of({ bn: 'মেরুন', en: 'Maroon' })}</span>
          <span className="num font-bold text-ink">{copy.of({ bn: '১৪টি', en: '14' })}</span>
        </div>
        <div className={ROW}>
          <span className="text-ink">Kurti · L · {copy.of({ bn: 'মেরুন', en: 'Maroon' })}</span>
          {pill('bg-accent-100 text-accent-700', copy.of({ bn: '২টি বাকি', en: '2 left' }))}
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
              <Paragraphs
                text={copy.of(card.body)}
                className="mt-2 flex-1 text-[15px] text-neutral-700"
              />
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
