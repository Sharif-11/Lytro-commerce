import { Container } from '@/components/ui/container';
import { Icon, type IconName } from '@/components/ui/icon';
import { SectionHeading } from '@/components/ui/section-heading';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';

const text = {
  eyebrow: { bn: 'কেন Lytro', en: 'Why Lytro' },
  title: {
    bn: 'একজন সেলার নিজে বানালে যেভাবে বানাতো, সেভাবেই',
    en: 'Built the way a seller would build it',
  },
  lead: {
    bn: 'Lytro-কে আলাদা করে যে নিয়মগুলো, সেগুলো সহজ, আর প্রতিটা প্রোডাক্টের ভেতরে লেখা, শুধু ব্রোশিওরে নয়।',
    en: 'The rules that make Lytro different are simple, and each one is written into the product, not just the brochure.',
  },
} satisfies Record<string, Bilingual>;

// LANDING-PAGE-DESIGN.md §3 row 5b. The second rule follows WAL-20: manual verification is free; only
// automatic verification (listener or wallet checkout) carries a small percentage fee.
const rules: { icon: IconName; title: Bilingual; body: Bilingual }[] = [
  {
    icon: 'wallet',
    title: { bn: 'টাকা সরাসরি আপনার কাছে', en: 'Money goes straight to you' },
    body: {
      bn: 'কাস্টমার পেমেন্ট করে আপনার নিজের বিকাশ, নগদ বা ব্যাংকে। Lytro কখনো আপনার টাকা ধরে রাখে না, দেরিও করায় না।',
      en: 'Customers pay your own bKash, Nagad or bank. Lytro never holds, settles or delays your money.',
    },
  },
  {
    icon: 'check',
    title: { bn: 'হাতে পেমেন্ট যাচাই ফ্রি', en: 'Checking a payment by hand is free' },
    body: {
      bn: 'নিজে পেমেন্ট মিলিয়ে নিলে কোনো ফি নেই। লিসেনার বা ওয়ালেট চেকআউটে নিজে থেকে মিললে তবেই পেমেন্টের ওপর ছোট একটা পার্সেন্টেজ।',
      en: 'Verify a payment yourself and there is no charge. A small percentage applies only when the listener or a wallet checkout verifies it for you.',
    },
  },
  {
    icon: 'truck',
    title: { bn: 'নিজের কুরিয়ার অ্যাকাউন্ট', en: 'Your own courier account' },
    body: {
      bn: 'Steadfast আর Pathao বুক হয় আপনার নিজের অ্যাকাউন্টে। রেট আপনার, পেআউট আপনার, সম্পর্কটাও আপনার।',
      en: 'Steadfast and Pathao are booked on your credentials. Your rates, your payouts, your relationship.',
    },
  },
  {
    icon: 'globe',
    title: { bn: 'সব বাংলায়, ফোন থেকেই', en: 'Bangla everywhere, phone first' },
    body: {
      bn: 'ড্যাশবোর্ড, SMS, ইনভয়েস আর ট্র্যাকিং পেজ, সব বাংলায়, ইংরেজি এক ট্যাপ দূরে। ফোনের জন্য বানানো, ডেস্কটপ ছোট করে নয়।',
      en: 'Dashboard, SMS, invoices and tracking page all read in Bangla, with English a tap away. Built for a phone, not shrunk from a desktop.',
    },
  },
  {
    icon: 'database',
    title: { bn: 'আপনার ডেটা, প্রতি রাতে ব্যাকআপ', en: 'Your data, backed up every night' },
    body: {
      bn: 'প্রতিটা দোকানের ডেটা অন্য দোকান থেকে আলাদা, প্রতি রাতে এনক্রিপ্টেড ব্যাকআপ, আর কে কী বদলালো তার লগ থাকে।',
      en: "Each shop's data is kept apart from every other shop, encrypted backups run nightly, and every change is logged with who made it.",
    },
  },
  {
    icon: 'code',
    title: { bn: 'যে ওয়েবসাইট আছে, তার সাথেও চলে', en: 'Works with the website you already have' },
    body: {
      bn: 'নিজের সাইট বা ডেভেলপার আছে? স্টোরফ্রন্ট যে API ব্যবহার করে সেটাই নিন, আর অর্ডার, কুরিয়ার আর পেমেন্টের জন্য Lytro রাখুন।',
      en: 'Have your own site or a developer? Use the same API the storefront uses and keep Lytro for orders, couriers and payments.',
    },
  },
];

export function WhyLytro({ language }: { language: Language }) {
  const copy = new Copy(language);
  return (
    <section id="why" className="scroll-mt-16 bg-brand-900 text-white">
      <div className="dot-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <Container className="relative py-16 sm:py-20">
        <SectionHeading
          tone="light"
          eyebrow={copy.of(text.eyebrow)}
          title={copy.of(text.title)}
          lead={copy.of(text.lead)}
        />
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rules.map((rule) => (
            <li
              key={rule.title.en}
              className="rounded-card border border-white/12 bg-white/6 p-5 backdrop-blur-sm"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-500 text-ink">
                <Icon name={rule.icon} size={20} strokeWidth={2.4} />
              </span>
              <h3 className="heading mt-4 text-[18px] text-white">{copy.of(rule.title)}</h3>
              <p className="mt-2 text-[15px] text-white/85">{copy.of(rule.body)}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
