import type { ReactNode } from 'react';
import { InventoryCard } from '@/components/mockups/inventory-card';
import { StatsCard } from '@/components/mockups/stats-card';
import { Icon, type IconName } from '@/components/ui/icon';
import type { LiveFeatures } from '@/lib/features';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';

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
      <>
        <div className="r">
          <span className="k num">017XXXXX842</span>
          <span className="chip risk">{copy.of({ bn: '৩টি রিটার্ন', en: '3 returns' })}</span>
        </div>
        <div className="r">
          <span className="k num">019XXXXX310</span>
          <span className="chip ok">{copy.of({ bn: '১২টি ডেলিভারি', en: '12 delivered' })}</span>
        </div>
      </>
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
      <>
        <div className="r">
          <span className="k num">#1040 · Steadfast</span>
          <span className="chip ship">
            {copy.of({ bn: 'পার্সেল পথে আছে', en: 'Parcel on the way' })}
          </span>
        </div>
        <div className="bar">
          <i style={{ width: '66%' }} />
        </div>
      </>
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
      <>
        <div className="r">
          <span className="k num">bKash</span>
          <b>৳3,490</b>
        </div>
        <div className="r">
          <span className="k">
            {copy.of({
              bn: 'অর্ডার #1042-এর পেমেন্ট মিলেছে',
              en: 'Payment matched to order #1042',
            })}
          </span>
          <span className="chip ok">{copy.of({ bn: 'পেমেন্ট সম্পন্ন', en: 'Paid' })}</span>
        </div>
      </>
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
      <div className="r">
        <span className="k num">rahim-gadgets.lytro.app</span>
        <span className="chip ok">
          {copy.of({ bn: 'আপনার দোকান এখন অনলাইনে', en: 'Your shop is online' })}
        </span>
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
      <>
        <div className="r">
          <span className="k">
            Sumi · {copy.of({ bn: 'শুধু অর্ডার দেখার অনুমতি', en: 'May see orders only' })}
          </span>
          <span className="chip plain">{copy.of({ bn: 'স্টাফ', en: 'Staff' })}</span>
        </div>
        <div className="r">
          <span className="k">Rahim · {copy.of({ bn: 'মালিক', en: 'Owner' })}</span>
          <span className="chip ship">
            {copy.of({ bn: 'সবকিছুর নিয়ন্ত্রণ', en: 'In charge of everything' })}
          </span>
        </div>
      </>
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
      <>
        <div className="r">
          <span className="k">Kurti · M · {copy.of({ bn: 'মেরুন', en: 'Maroon' })}</span>
          <b>{copy.of({ bn: '১৪টি', en: '14' })}</b>
        </div>
        <div className="r">
          <span className="k">Kurti · L · {copy.of({ bn: 'মেরুন', en: 'Maroon' })}</span>
          <span className="chip pending">{copy.of({ bn: '২টি বাকি', en: '2 left' })}</span>
        </div>
      </>
    ),
  },
];

/** A card's body in one or more paragraphs, written with a blank line between each. */
function paragraphs(body: string): ReactNode {
  return body.split('\n\n').map((paragraph) => <p key={paragraph}>{paragraph}</p>);
}

/** The sketch's features: two spotlights with a picture each (from 640 px the picture sits beside the words), then six
    cards in one, two or three columns. */
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
    <section className="sec tint" id="features">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">
            <i />
            <span>{copy.of(text.eyebrow)}</span>
          </span>
          <h2>{copy.of(text.title)}</h2>
          <p>{copy.of(text.lead)}</p>
        </div>

        {spotlights.length > 0 ? (
          <div className="spots">
            {spotlights.map((spot) => (
              <article key={spot.key} className="spot card">
                <div className="txt">
                  <div className="hdr">
                    <div className="ic">
                      <Icon name={spot.icon} size={22} />
                    </div>
                    <h3>{copy.of(spot.data.title)}</h3>
                  </div>
                  <p>{copy.of(spot.data.body)}</p>
                  <ul>
                    {spot.data.points.map((point) => (
                      <li key={point.en}>
                        <Icon name="check" size={18} strokeWidth={2.4} />
                        <span>{copy.of(point)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {spot.art}
              </article>
            ))}
          </div>
        ) : null}

        <div className="fgrid">
          {cards.map((card) => (
            <article key={card.title.en} className="fcard card">
              <div className="ic">
                <Icon name={card.icon} size={22} />
              </div>
              <h3>{copy.of(card.title)}</h3>
              <div className="body">{paragraphs(copy.of(card.body))}</div>
              <div className="vig" aria-hidden="true">
                {card.vignette(copy)}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
