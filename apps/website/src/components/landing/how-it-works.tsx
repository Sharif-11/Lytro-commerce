import { Container } from '@/components/ui/container';
import { SectionHeading } from '@/components/ui/section-heading';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';

const text = {
  eyebrow: { bn: 'কিভাবে কাজ করে', en: 'How it works' },
  title: { bn: '৩ মিনিটে বিক্রি শুরু', en: 'Selling in three minutes' },
} satisfies Record<string, Bilingual>;

// AUTH-28: the three real steps, nothing added.
const steps: { title: Bilingual; body: Bilingual }[] = [
  {
    title: { bn: 'ফোন নম্বর দিয়ে সাইন আপ করুন', en: 'Sign up with your phone number' },
    body: {
      bn: 'একটা কোড দিয়ে ভেরিফাই। পাসওয়ার্ড নেই, কার্ড নেই।',
      en: 'One code to verify. No password, no card.',
    },
  },
  {
    title: { bn: 'দোকানের নাম দিন', en: 'Name your shop' },
    body: {
      bn: 'নাম আর একটা লিংক ঠিক করুন। দোকানের পেজ তৈরি।',
      en: 'Pick a name and a link. Your shop page is ready.',
    },
  },
  {
    title: { bn: 'প্রথম অর্ডারটা নিন', en: 'Take your first order' },
    body: {
      bn: 'প্রোডাক্ট তুলুন, পেজে লিংক শেয়ার করুন, এক স্ক্রিন থেকে কনফার্ম আর কুরিয়ার বুক।',
      en: 'Add products, share the link on your page, confirm and book courier from one screen.',
    },
  },
];

export function HowItWorks({ language }: { language: Language }) {
  const copy = new Copy(language);
  return (
    <section id="how" className="scroll-mt-16 bg-white">
      <Container className="py-16 sm:py-20">
        <SectionHeading eyebrow={copy.of(text.eyebrow)} title={copy.of(text.title)} />
        <ol className="mx-auto mt-10 grid max-w-[960px] gap-4 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li
              key={step.title.en}
              className="relative rounded-card border border-line bg-white p-5 shadow-card"
            >
              <span className="num flex h-10 w-10 items-center justify-center rounded-full bg-accent-500 text-[16px] font-extrabold text-ink">
                {index + 1}
              </span>
              <h3 className="heading mt-4 text-[18px] text-ink">{copy.of(step.title)}</h3>
              <p className="mt-2 text-[15px] text-neutral-700">{copy.of(step.body)}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
