import { Container } from '@/components/ui/container';
import { Icon, type IconName } from '@/components/ui/icon';
import { SectionHeading } from '@/components/ui/section-heading';
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
const pairs: { icon: IconName; before: Bilingual; after: Bilingual }[] = [
  {
    icon: 'alert',
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
    icon: 'clock',
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
    icon: 'message',
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
    icon: 'wallet',
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
    icon: 'lock',
    before: {
      bn: 'কাজ করবে কিনা না জেনে মাসিক ফি দিতে চান না।',
      en: 'You do not want to pay a monthly fee before you know it works.',
    },
    after: {
      bn: 'অর্ডার ডেলিভার হলে তবেই ফি। দোকান খোলা ফ্রি।',
      en: 'Pay only when an order is delivered. Opening the shop is free.',
    },
  },
];

export function Problems({ language }: { language: Language }) {
  const copy = new Copy(language);
  return (
    <section className="bg-neutral-50">
      <Container className="py-16 sm:py-20">
        <SectionHeading
          eyebrow={copy.of(text.eyebrow)}
          title={copy.of(text.title)}
          lead={copy.of(text.lead)}
        />
        <div className="mx-auto mt-10 max-w-[900px] overflow-hidden rounded-card border border-line bg-white shadow-card">
          <div className="hidden grid-cols-[1fr_auto_1fr] border-b border-line bg-neutral-50 px-5 py-3 text-[12px] font-bold uppercase tracking-[0.12em] sm:grid">
            <span className="text-neutral-700">{copy.of(text.before)}</span>
            <span className="w-10" />
            <span className="text-brand-700">{copy.of(text.after)}</span>
          </div>
          <ul className="divide-y divide-line">
            {pairs.map((pair) => (
              <li
                key={pair.before.en}
                className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-4 sm:px-5"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-danger-soft text-danger">
                    <Icon name={pair.icon} size={18} />
                  </span>
                  <div>
                    <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-neutral-700 sm:hidden">
                      {copy.of(text.before)}
                    </p>
                    <p className="text-[15px] text-neutral-700">{copy.of(pair.before)}</p>
                  </div>
                </div>
                <span
                  className="hidden w-10 justify-center text-brand-700 sm:flex"
                  aria-hidden="true"
                >
                  <Icon name="arrow" size={20} />
                </span>
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-800">
                    <Icon name="check" size={18} strokeWidth={2.5} />
                  </span>
                  <div>
                    <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-brand-700 sm:hidden">
                      {copy.of(text.after)}
                    </p>
                    <p className="text-[15px] font-semibold text-ink">{copy.of(pair.after)}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}
