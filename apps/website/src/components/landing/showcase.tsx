import { StorefrontFrame } from '@/components/mockups/storefront-frame';
import { TrackingFrame } from '@/components/mockups/tracking-frame';
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

/** Shown only when the storefront is live (LIVE_FEATURES includes `showcase`): the sketch's two browser frames, side
    by side from 640 px, each with its caption. */
export function Showcase({ language }: { language: Language }) {
  const copy = new Copy(language);
  return (
    <section className="sec tint" id="showcase">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">
            <i />
            <span>{copy.of(text.eyebrow)}</span>
          </span>
          <h2>{copy.of(text.title)}</h2>
        </div>
        <div className="show">
          <figure className="frame">
            <StorefrontFrame language={language} />
            <figcaption className="cap">
              <h3>{copy.of(text.storefront)}</h3>
              <span>{copy.of(text.storefrontSub)}</span>
            </figcaption>
          </figure>
          <figure className="frame">
            <TrackingFrame language={language} />
            <figcaption className="cap">
              <h3>{copy.of(text.tracking)}</h3>
              <span>{copy.of(text.trackingSub)}</span>
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
