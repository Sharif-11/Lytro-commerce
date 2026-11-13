import { PhoneDashboard } from '@/components/mockups/phone-dashboard';
import { Icon } from '@/components/ui/icon';
import { Mark } from '@/components/ui/mark';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';
import { ClaimBox } from './claim-box';

const text = {
  eyebrow: { bn: 'বাংলাদেশি অনলাইন সেলারদের জন্য', en: 'For Bangladeshi online sellers' },
  // The headline's two halves: the second is the marigold one with the swash under it.
  titleStart: { bn: 'আপনার দোকান,', en: 'Your shop,' },
  titleEnd: { bn: 'আপনার হাতে।', en: 'in your hand.' },
  lead: {
    bn: 'অর্ডার, বিকাশ-নগদ পেমেন্ট, কুরিয়ার বুকিং আর ফেক অর্ডার চেক, সব এক জায়গায়, পুরোটাই বাংলায়। শুরু করতে কোনো মাসিক ফি নেই।',
    en: 'Orders, bKash and Nagad payments, courier booking and fake-order checks, all in one place and all in Bangla. No monthly fee to start.',
  },
  trial: { bn: '৩০ দিন ফ্রি ট্রায়াল', en: '30-day free trial' },
  noCard: { bn: 'কার্ড লাগবে না', en: 'No card needed' },
  noFee: { bn: 'মাসিক ফি নেই', en: 'No monthly fee' },
  see: { bn: 'একটা দোকান দেখতে কেমন, দেখুন', en: 'See what a shop looks like' },
} satisfies Record<string, Bilingual>;

/** The sketch's hero (LANDING-PAGE-DESIGN.md §3 row 2): words, the claim box and the ticks first, then one phone
    screen; side by side from 900 px. The nav floats over it, and `id="hero"` is what the nav and the start bar watch. */
export function Hero({
  language,
  signInUrl,
  platformDomain,
  showcaseLive,
}: {
  language: Language;
  signInUrl: string;
  platformDomain: string;
  showcaseLive: boolean;
}) {
  const copy = new Copy(language);
  const ticks = [text.trial, text.noCard, text.noFee];
  return (
    <section className="hero" id="hero">
      <div className="glow" aria-hidden="true" />
      <div className="dots" aria-hidden="true" />
      <Mark size={620} className="wm-big" />
      <div className="wrap">
        <div className="copy">
          <span className="eyebrow">
            <i />
            <span>{copy.of(text.eyebrow)}</span>
          </span>
          <h1>
            {copy.of(text.titleStart)}
            <br />
            <em>
              {copy.of(text.titleEnd)}
              <svg viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true">
                <path
                  d="M3 10 C 50 2, 120 2, 197 8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
              </svg>
            </em>
          </h1>
          <p className="lead">{copy.of(text.lead)}</p>
          <ClaimBox language={language} signInUrl={signInUrl} platformDomain={platformDomain} />
          <div className="micro">
            {ticks.map((tick) => (
              <span key={tick.en}>
                <Icon name="check" size={18} strokeWidth={2.4} />
                <i>{copy.of(tick)}</i>
              </span>
            ))}
          </div>
          {showcaseLive ? (
            <a href="#showcase" className="demo">
              <i>
                <Icon name="play" size={16} />
              </i>
              <span>{copy.of(text.see)}</span>
            </a>
          ) : null}
        </div>
        <PhoneDashboard language={language} />
      </div>
      <svg className="curve" viewBox="0 0 1440 58" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 58 C 420 0 1020 0 1440 58 L1440 58 L0 58 Z" fill="#ffffff" />
      </svg>
    </section>
  );
}
