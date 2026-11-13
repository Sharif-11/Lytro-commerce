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

/** The sketch's three numbered steps: stacked on a phone, three across from 640 px, joined by a dashed line from
    900 px. */
export function HowItWorks({ language }: { language: Language }) {
  const copy = new Copy(language);
  return (
    <section className="sec" id="how">
      <div className="wrap">
        <div className="sec-head center">
          <span className="eyebrow">
            <i />
            <span>{copy.of(text.eyebrow)}</span>
          </span>
          <h2>{copy.of(text.title)}</h2>
        </div>
        <ol className="hgrid">
          {steps.map((step, index) => (
            <li key={step.title.en} className="step card">
              <span className="n">{index + 1}</span>
              <h3>{copy.of(step.title)}</h3>
              <p>{copy.of(step.body)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
