import { Icon } from '@/components/ui/icon';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';

const text = {
  eyebrow: { bn: 'সমস্যাটা আমরা জানি', en: 'We know the problem' },
  title: {
    bn: 'খাতা, মেসেঞ্জার আর অনুমান, বেশিরভাগ দোকান এভাবেই চলে',
    en: 'Notebook, Messenger and guesswork: that is how most shops run today',
  },
  lead: {
    bn: 'এগুলোর প্রতিটা প্রতি সপ্তাহে আপনার টাকা বা সময় খায়। Lytro একটা একটা করে সরিয়ে দেয়।',
    en: 'Every one of these costs you money or hours every week. Lytro removes them one by one.',
  },
  before: { bn: 'আগে', en: 'Before' },
  after: { bn: 'Lytro-তে', en: 'With Lytro' },
} satisfies Record<string, Bilingual>;

// MARKETING-PLAN.md §2: the five pains, each paired with the feature that answers it.
const pairs: { before: Bilingual; after: Bilingual }[] = [
  {
    before: {
      bn: 'ফেক আর রিটার্ন অর্ডারে কুরিয়ার ফি আর স্টক, দুটোই নষ্ট হয়।',
      en: 'Fake and returned orders burn courier fees and stock.',
    },
    after: {
      bn: 'শিপ করার আগেই ফেক অর্ডার ধরুন। ঝুঁকির নম্বর আগের রেকর্ড থেকে ফ্ল্যাগ হয়।',
      en: 'Catch fake orders before you ship. Risky numbers are flagged from their history.',
    },
  },
  {
    before: {
      bn: 'হাতে অর্ডার কনফার্ম আর কুরিয়ার বুক করতে প্রতিদিন ঘণ্টার পর ঘণ্টা যায়।',
      en: 'Confirming orders and booking couriers by hand takes hours every day.',
    },
    after: {
      bn: 'এক ট্যাপে কুরিয়ার বুক করুন। ট্র্যাকিং নম্বর নিজে থেকেই চলে আসে।',
      en: 'Book the courier in one tap. The tracking number comes back on its own.',
    },
  },
  {
    before: {
      bn: 'কাস্টমার বারবার জিজ্ঞেস করে, “আমার অর্ডার কোথায়?”',
      en: 'Customers keep asking “where is my order?”',
    },
    after: {
      bn: 'কাস্টমার SMS-এর লিংক থেকে নিজেই অর্ডার ট্র্যাক করে।',
      en: 'Customers track their own order from an SMS link.',
    },
  },
  {
    before: {
      bn: 'বিকাশ-নগদের পেমেন্ট অর্ডারের সাথে মেলাতে গিয়ে ভুল হয়।',
      en: 'Matching bKash and Nagad payments to orders goes wrong.',
    },
    after: {
      bn: 'SMS থেকে পেমেন্ট নিজেই মিলে যায়। আপনি শুধু “পেইড” দেখেন।',
      en: 'Payments match themselves from the SMS. You just see “paid”.',
    },
  },
  {
    before: {
      bn: 'কাজ করবে কিনা না জেনে মাসিক ফি দিতে চান না।',
      en: 'You do not want to pay a monthly fee before you know it works.',
    },
    after: {
      bn: 'অর্ডার কুরিয়ারে গেলে তবেই ফি। দোকান খোলা ফ্রি।',
      en: 'A fee only when an order goes to the courier. Opening the shop is free.',
    },
  },
];

/** The sketch's before-and-after cards: stacked on a phone, side by side from 640 px with the column names above them,
    and an arrow between from 900 px. */
export function Problems({ language }: { language: Language }) {
  const copy = new Copy(language);
  return (
    <section className="sec" id="problems">
      <div className="wrap">
        <div className="sec-head center">
          <span className="eyebrow">
            <i />
            <span>{copy.of(text.eyebrow)}</span>
          </span>
          <h2>{copy.of(text.title)}</h2>
          <p>{copy.of(text.lead)}</p>
        </div>
        <div className="pair-h" aria-hidden="true">
          <span>{copy.of(text.before)}</span>
          <span />
          <span>{copy.of(text.after)}</span>
        </div>
        <ul className="pairs">
          {pairs.map((pair) => (
            <li key={pair.before.en} className="pair card">
              <div className="before">
                <span className="ico">
                  <Icon name="x" size={14} strokeWidth={2.2} />
                </span>
                <span>
                  <span className="sr-only">{copy.of(text.before)}: </span>
                  {copy.of(pair.before)}
                </span>
              </div>
              <div className="mid" aria-hidden="true">
                <i>
                  <Icon name="arrow" size={16} />
                </i>
              </div>
              <div className="after">
                <span className="ico">
                  <Icon name="check" size={14} strokeWidth={2.4} />
                </span>
                <span>
                  <span className="sr-only">{copy.of(text.after)}: </span>
                  {copy.of(pair.after)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
