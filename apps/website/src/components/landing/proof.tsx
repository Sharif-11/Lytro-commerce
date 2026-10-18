import Link from 'next/link';
import { Container } from '@/components/ui/container';
import { Icon } from '@/components/ui/icon';
import { SectionHeading } from '@/components/ui/section-heading';
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

export function Proof({ language }: { language: Language }) {
  const copy = new Copy(language);
  return (
    <section id="about" className="scroll-mt-16 bg-white">
      <Container className="py-16 sm:py-20">
        <div className="mx-auto grid max-w-[1000px] gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <SectionHeading
              align="left"
              eyebrow={copy.of(text.eyebrow)}
              title={copy.of(text.title)}
              lead={copy.of(text.story)}
            />
            <Link
              href="/about"
              className="mt-5 inline-flex min-h-11 items-center gap-2 text-[15px] font-bold text-brand-800 hover:text-brand-900"
            >
              {copy.of(text.more)}
              <Icon name="arrow" size={18} />
            </Link>
          </div>
          <div className="rounded-card border border-dashed border-neutral-200 bg-neutral-50 p-6">
            {testimonials.length === 0 ? (
              <p className="text-[15px] text-neutral-700">{copy.of(text.empty)}</p>
            ) : (
              <ul className="space-y-4">
                {testimonials.map((item) => (
                  <li key={item.who}>
                    <p className="text-[16px] text-ink">“{copy.of(item.quote)}”</p>
                    <p className="mt-2 text-[14px] font-bold text-ink">{item.who}</p>
                    <p className="text-[13px] text-neutral-700">{copy.of(item.what)}</p>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-5 flex items-center gap-3 border-t border-line pt-5">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-700 text-[16px] font-extrabold text-white">
                L
              </span>
              <div>
                <p className="text-[14px] font-bold text-ink">{copy.of(text.who)}</p>
                <p className="text-[13px] text-neutral-700">{copy.of(text.what)}</p>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
