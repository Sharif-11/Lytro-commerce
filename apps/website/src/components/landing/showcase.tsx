import { StorefrontFrame } from '@/components/mockups/storefront-frame';
import { TrackingFrame } from '@/components/mockups/tracking-frame';
import { Container } from '@/components/ui/container';
import { SectionHeading } from '@/components/ui/section-heading';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';

const text = {
  eyebrow: { bn: 'কাস্টমার যা দেখে', en: 'What your customers see' },
  title: {
    bn: 'আপনার মতো দেখতে দোকান, আর একটা ট্র্যাকিং পেজ যেটা আপনার হয়ে উত্তর দেয়',
    en: 'A shop that looks like yours, and a tracking page that answers for you',
  },
  storefront: { bn: 'স্টোরফ্রন্ট', en: 'Storefront' },
  storefrontSub: { bn: 'সেলারের রঙ, আমাদের নয়', en: "the seller's colours, not ours" },
  tracking: { bn: 'ট্র্যাকিং পেজ', en: 'Tracking page' },
  trackingSub: { bn: 'SMS-এর লিংক থেকে খোলে', en: 'opened from the SMS link' },
} satisfies Record<string, Bilingual>;

/** Shown only when the storefront is live (LIVE_FEATURES includes `showcase`). */
export function Showcase({ language }: { language: Language }) {
  const copy = new Copy(language);
  return (
    <section id="showcase" className="scroll-mt-16 bg-neutral-50">
      <Container className="py-16 sm:py-20">
        <SectionHeading eyebrow={copy.of(text.eyebrow)} title={copy.of(text.title)} />
        <div className="mx-auto mt-10 grid max-w-[960px] gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-start">
          <figure>
            <StorefrontFrame language={language} />
            <figcaption className="mt-3 text-center text-[14px] text-neutral-700">
              <span className="font-bold text-ink">{copy.of(text.storefront)}</span> ·{' '}
              {copy.of(text.storefrontSub)}
            </figcaption>
          </figure>
          <figure>
            <TrackingFrame language={language} />
            <figcaption className="mt-3 text-center text-[14px] text-neutral-700">
              <span className="font-bold text-ink">{copy.of(text.tracking)}</span> ·{' '}
              {copy.of(text.trackingSub)}
            </figcaption>
          </figure>
        </div>
      </Container>
    </section>
  );
}
