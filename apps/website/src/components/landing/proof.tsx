import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { Mark } from '@/components/ui/mark';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';

const text = {
  eyebrow: { bn: 'আমাদের সম্পর্কে', en: 'About us' },
  title: {
    bn: 'আমরা নিজেরাও প্রতিদিন Lytro-তে বিক্রি করি, আপনার মতো একই অ্যাকাউন্টে',
    en: 'We sell on Lytro every day, with the same account as you',
  },
  story: {
    bn: 'Lytro যারা বানিয়েছে, সেই Lytronix নিজের ব্যাটারির দোকানটা এই প্ল্যাটফর্মে সাধারণ টেন্যান্ট হিসেবেই চালায়। একই সাইন-আপ, একই লিমিট, একই ফি। কিছু ভাঙলে আগে আমাদেরই ভাঙে।',
    en: 'Lytronix, the company behind Lytro, runs its own battery shop on the platform as an ordinary tenant. Same sign-up, same limits, same fees. When something breaks, it breaks for us first.',
  },
  more: { bn: 'আমাদের গল্পটা পড়ুন', en: 'Read our story' },
  empty: {
    bn: 'প্রথম দশটা দোকান লাইভ হওয়ার পর এখানে সেলারদের কথা বসবে। ততদিন এই কার্ডটা খালি থাকুক, বানানো কথা নয়।',
    en: 'Seller quotes go here after the first ten shops are live. Until then this card stays honest and empty.',
  },
  who: { bn: 'Lytronix, প্রথম টেন্যান্ট', en: 'Lytronix, the first tenant' },
  what: { bn: 'ব্যাটারি আর গ্যাজেট সেলার, ঢাকা', en: 'Battery and gadget seller, Dhaka' },
} satisfies Record<string, Bilingual>;

// MARKETING-PLAN.md §5: real quotes only, from Stage 1 case studies. The list starts empty on purpose.
const testimonials: { quote: Bilingual; who: string; what: Bilingual }[] = [];

/** The sketch's dark band: who builds Lytro, and the quote card, which says plainly that it waits for real quotes. */
export function Proof({ language }: { language: Language }) {
  const copy = new Copy(language);
  const quotes =
    testimonials.length > 0
      ? testimonials.map((item) => ({
          text: copy.of(item.quote),
          who: item.who,
          what: copy.of(item.what),
        }))
      : [{ text: copy.of(text.empty), who: copy.of(text.who), what: copy.of(text.what) }];
  return (
    <section className="sec proof on-dark" id="about">
      <div className="glow" aria-hidden="true" />
      <Mark size={340} className="wm-bg" />
      <div className="wrap">
        <div>
          <span className="eyebrow">
            <i />
            <span>{copy.of(text.eyebrow)}</span>
          </span>
          <h2>{copy.of(text.title)}</h2>
          <p>{copy.of(text.story)}</p>
          <Link href="/about" className="more-link">
            {copy.of(text.more)}
            <Icon name="arrow" size={18} />
          </Link>
        </div>
        {quotes.map((quote) => (
          <figure key={quote.who} className="q">
            <blockquote className="t">{quote.text}</blockquote>
            <figcaption className="who">
              <i>{quote.who.charAt(0)}</i>
              <div>
                <b>{quote.who}</b>
                <span>{quote.what}</span>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
