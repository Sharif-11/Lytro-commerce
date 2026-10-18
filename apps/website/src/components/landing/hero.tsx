import { PhoneDashboard } from '@/components/mockups/phone-dashboard';
import { Container } from '@/components/ui/container';
import { Icon } from '@/components/ui/icon';
import { Mark } from '@/components/ui/mark';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';
import { ClaimBox } from './claim-box';

const text = {
  pill: {
    bn: '৩০ দিন ফ্রি ট্রায়াল। কার্ড নেই, মাসিক ফি নেই।',
    en: '30-day free trial. No card, no monthly fee.',
  },
  eyebrow: { bn: 'বাংলাদেশি অনলাইন সেলারদের জন্য', en: 'For Bangladeshi online sellers' },
  title: { bn: 'আপনার দোকান, আপনার হাতে।', en: 'Your shop, in your hand.' },
  lead: {
    bn: 'অর্ডার, বিকাশ-নগদ পেমেন্ট, কুরিয়ার বুকিং আর ফেক অর্ডার চেক, সব এক জায়গায়, পুরোটাই বাংলায়। শুরু করতে কোনো মাসিক ফি নেই।',
    en: 'Orders, bKash and Nagad payments, courier booking and fake-order checks, all in one place and all in Bangla. No monthly fee to start.',
  },
  trial: { bn: '৩০ দিন ফ্রি ট্রায়াল', en: '30-day free trial' },
  noCard: { bn: 'কার্ড লাগবে না', en: 'No card needed' },
  noFee: { bn: 'মাসিক ফি নেই', en: 'No monthly fee' },
  see: { bn: 'একটা দোকান দেখতে কেমন, দেখুন', en: 'See what a shop looks like' },
  fakeTitle: { bn: 'ফেক অর্ডার চেক', en: 'Fake-order check' },
  fakeSub: { bn: 'এই নম্বরে আগে ৩টি রিটার্ন', en: '3 returns on this number before' },
  paidTitle: { bn: 'বিকাশ ৳3,490 মিলেছে', en: 'bKash ৳3,490 matched' },
  paidSub: { bn: 'অর্ডার #1042, নিজে থেকেই', en: 'Order #1042, automatically' },
} satisfies Record<string, Bilingual>;

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
    <section id="hero" className="relative overflow-hidden bg-brand-900 text-white">
      <div className="dot-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div
        className="pointer-events-none absolute -top-40 right-[-20%] h-[520px] w-[520px] rounded-full bg-brand-700/60 blur-3xl"
        aria-hidden="true"
      />
      <Container className="relative grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
        <div className="max-w-[600px]">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[13px] font-semibold text-white">
            <Mark size={16} color="#f8cf6e" draw />
            {copy.of(text.pill)}
          </p>
          <p className="mt-6 text-[13px] font-bold uppercase tracking-[0.14em] text-brand-300">
            {copy.of(text.eyebrow)}
          </p>
          <h1 className="display mt-3 text-[36px] text-white sm:text-[48px] lg:text-[58px]">
            {copy.of(text.title)}
          </h1>
          <p className="mt-5 text-[17px] text-white/88 sm:text-[19px]">{copy.of(text.lead)}</p>

          <div className="mt-8">
            <ClaimBox language={language} signInUrl={signInUrl} platformDomain={platformDomain} />
          </div>

          <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[14px] font-semibold text-white/90">
            {ticks.map((tick) => (
              <li key={tick.en} className="inline-flex items-center gap-1.5">
                <Icon name="check" size={16} className="text-accent-300" strokeWidth={3} />
                {copy.of(tick)}
              </li>
            ))}
          </ul>

          {showcaseLive ? (
            <a
              href="#showcase"
              className="mt-6 inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold text-brand-300 hover:text-white"
            >
              <Icon name="eye" size={18} />
              {copy.of(text.see)}
            </a>
          ) : null}
        </div>

        <div className="relative mx-auto w-full max-w-[420px] lg:max-w-none">
          <div className="flex justify-center lg:justify-end lg:pr-10">
            <div className="lg:rotate-[-4deg] lg:transition-transform lg:duration-300 lg:hover:rotate-0">
              <PhoneDashboard language={language} />
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:absolute lg:inset-y-0 lg:left-0 lg:mt-0 lg:flex lg:w-[240px] lg:flex-col lg:justify-center lg:gap-6">
            <FloatingCard
              icon="shield"
              tone="danger"
              title={copy.of(text.fakeTitle)}
              sub={copy.of(text.fakeSub)}
            />
            <FloatingCard
              icon="wallet"
              tone="success"
              title={copy.of(text.paidTitle)}
              sub={copy.of(text.paidSub)}
            />
          </div>
        </div>
      </Container>
    </section>
  );
}

function FloatingCard({
  icon,
  tone,
  title,
  sub,
}: {
  icon: 'shield' | 'wallet';
  tone: 'danger' | 'success';
  title: string;
  sub: string;
}) {
  const badge = tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success';
  return (
    <div className="flex items-start gap-3 rounded-card bg-white p-3.5 text-ink shadow-lift">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${badge}`}>
        <Icon name={icon} size={20} />
      </span>
      <div className="min-w-0">
        <p className="num text-[14px] font-bold">{title}</p>
        <p className="text-[13px] text-neutral-700">{sub}</p>
      </div>
    </div>
  );
}
