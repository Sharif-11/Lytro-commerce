import { Icon } from '@/components/ui/icon';
import { Mark } from '@/components/ui/mark';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';

const text = {
  eyebrow: { bn: 'ঝুঁকি শূন্য', en: 'Zero risk' },
  title: { bn: 'চেষ্টা করে দেখতে কিছু হারাবেন না', en: 'Nothing to lose by trying' },
  lead: {
    bn: 'চারটা ছোট কথা, প্রতিটা প্রোডাক্টের ভেতরে লেখা, শুধু এখানে বলা নয়।',
    en: 'Four short promises, each one written into the product, not just said here.',
  },
  seal: { bn: '৩০ দিন ফ্রি ট্রায়াল', en: '30-day free trial' },
  sealSub: { bn: 'কার্ড নেই, মাসিক ফি নেই', en: 'no card, no monthly fee' },
} satisfies Record<string, Bilingual>;

// Every line is true per the SRS: AUTH-28 (no card), PLN cancel from the dashboard, TEN isolation, TRL-07.
const promises: { title: Bilingual; body: Bilingual }[] = [
  {
    title: { bn: 'শুরু করতে কার্ড লাগে না', en: 'No card to start' },
    body: {
      bn: 'একটা ফোন নম্বর আর একটা কোড। এটাই পুরো সাইন-আপ।',
      en: 'A phone number and a code. That is the whole sign-up.',
    },
  },
  {
    title: { bn: 'যেকোনো সময় ক্যানসেল', en: 'Cancel any time' },
    body: {
      bn: 'ড্যাশবোর্ড থেকেই প্ল্যান বন্ধ। কল নেই, ফর্ম নেই।',
      en: 'Stop a plan from the dashboard. No call, no form.',
    },
  },
  {
    title: { bn: 'ডেটা আপনারই থাকে', en: 'Your data stays yours' },
    body: {
      bn: 'আপনার অর্ডার আর কাস্টমার শুধু আপনার দোকানই দেখে।',
      en: 'Only your shop can see its orders and customers.',
    },
  },
  {
    title: { bn: 'ট্রায়াল শেষে তালা পড়ে না', en: 'Trial never locks you out' },
    body: {
      bn: '৩০ দিন পর সব ঠিক রেখেই পে-অ্যাজ-ইউ-গো-তে চলবেন।',
      en: 'After 30 days you continue on pay-as-you-go with everything intact.',
    },
  },
];

/** The sketch's pledge card: the heading and the trial seal, then the four promises, each with a marigold tick. */
export function ZeroRisk({ language }: { language: Language }) {
  const copy = new Copy(language);
  return (
    <section className="sec" id="risk">
      <div className="wrap">
        <div className="pledge">
          <div className="pl-head">
            <span className="eyebrow">
              <i />
              <span>{copy.of(text.eyebrow)}</span>
            </span>
            <h2>{copy.of(text.title)}</h2>
            <p>{copy.of(text.lead)}</p>
            <span className="seal" aria-hidden="true">
              <i>
                <Mark size={20} />
              </i>
              <span>
                <span>{copy.of(text.seal)}</span>
                <small>{copy.of(text.sealSub)}</small>
              </span>
            </span>
          </div>
          <ol className="pl-list">
            {promises.map((promise) => (
              <li key={promise.title.en}>
                <span className="tick">
                  <Icon name="check" size={22} strokeWidth={2.4} />
                </span>
                <h3>{copy.of(promise.title)}</h3>
                <p>{copy.of(promise.body)}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
