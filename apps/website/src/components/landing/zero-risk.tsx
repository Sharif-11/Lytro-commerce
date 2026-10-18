import { Container } from '@/components/ui/container';
import { Icon, type IconName } from '@/components/ui/icon';
import { SectionHeading } from '@/components/ui/section-heading';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';

const text = {
  eyebrow: { bn: 'ঝুঁকি শূন্য', en: 'Zero risk' },
  title: { bn: 'চেষ্টা করে দেখতে কিছু হারাবেন না', en: 'Nothing to lose by trying' },
} satisfies Record<string, Bilingual>;

// Every line is true per the SRS: AUTH-28 (no card), PLN cancel from the dashboard, TEN isolation, TRL-07.
const cards: { icon: IconName; title: Bilingual; body: Bilingual }[] = [
  {
    icon: 'phone',
    title: { bn: 'শুরু করতে কার্ড লাগে না', en: 'No card to start' },
    body: {
      bn: 'একটা ফোন নম্বর আর একটা কোড। এটাই পুরো সাইন-আপ।',
      en: 'A phone number and a code. That is the whole sign-up.',
    },
  },
  {
    icon: 'x',
    title: { bn: 'যেকোনো সময় ক্যানসেল', en: 'Cancel any time' },
    body: {
      bn: 'ড্যাশবোর্ড থেকেই প্ল্যান বন্ধ। কল নেই, ফর্ম নেই।',
      en: 'Stop a plan from the dashboard. No call, no form.',
    },
  },
  {
    icon: 'lock',
    title: { bn: 'ডেটা আপনারই থাকে', en: 'Your data stays yours' },
    body: {
      bn: 'আপনার অর্ডার আর কাস্টমার শুধু আপনার দোকানই দেখে।',
      en: 'Only your shop can see its orders and customers.',
    },
  },
  {
    icon: 'calendar',
    title: { bn: 'ট্রায়াল শেষে তালা পড়ে না', en: 'Trial never locks you out' },
    body: {
      bn: '৩০ দিন পর সব ঠিক রেখেই পে-অ্যাজ-ইউ-গো-তে চলবেন।',
      en: 'After 30 days you continue on pay-as-you-go with everything intact.',
    },
  },
];

export function ZeroRisk({ language }: { language: Language }) {
  const copy = new Copy(language);
  return (
    <section className="bg-brand-50">
      <Container className="py-16 sm:py-20">
        <SectionHeading eyebrow={copy.of(text.eyebrow)} title={copy.of(text.title)} />
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <li
              key={card.title.en}
              className="rounded-card border border-line bg-white p-5 shadow-card"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-success-soft text-success">
                <Icon name={card.icon} size={20} />
              </span>
              <h3 className="heading mt-4 text-[17px] text-ink">{copy.of(card.title)}</h3>
              <p className="mt-2 text-[15px] text-neutral-700">{copy.of(card.body)}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
