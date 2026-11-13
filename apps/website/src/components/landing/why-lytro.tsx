import { Icon, type IconName } from '@/components/ui/icon';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';

const text = {
  eyebrow: { bn: 'কেন Lytro?', en: 'Why Lytro?' },
  title: {
    bn: 'একজন অনলাইন ব্যবসায়ীর যেসব সুবিধা সত্যিই দরকার, সেগুলোই আমরা তৈরি করেছি।',
    en: 'We built what an online seller really needs.',
  },
} satisfies Record<string, Bilingual>;

// LANDING-PAGE-DESIGN.md §3 row 5b. The second rule follows WAL-20: manual verification is free; only
// automatic verification (listener or wallet checkout) carries a fee.
const rules: { icon: IconName; title: Bilingual; body: Bilingual }[] = [
  {
    icon: 'wallet',
    title: { bn: 'আপনার টাকা থাকবে আপনার কাছেই', en: 'Your money stays with you' },
    body: {
      bn: 'কাস্টমারের পেমেন্ট সরাসরি আপনার নিজের বিকাশ, নগদ বা ব্যাংক অ্যাকাউন্টে যাবে। Lytro আপনার বিক্রির টাকা আটকে রাখবে না। পেমেন্ট পাওয়ার জন্য আমাদের কাছ থেকে টাকা তোলার অপেক্ষাও করতে হবে না।',
      en: 'Customers pay straight into your own bKash, Nagad or bank account. Lytro never holds your sales money, and you never wait to withdraw it from us.',
    },
  },
  {
    icon: 'check',
    title: {
      bn: 'নিজে পেমেন্ট মিলিয়ে নিলে কোনো চার্জ নেই',
      en: 'No charge when you check payments yourself',
    },
    body: {
      bn: 'আপনি নিজে পেমেন্ট যাচাই করলে কোনো অতিরিক্ত ফি নেই। শুধু Lytro-এর মাধ্যমে অটোমেটিক পেমেন্ট যাচাই বা পেমেন্ট সুবিধা ব্যবহার করলেই প্রযোজ্য সার্ভিস চার্জ দিতে হবে।',
      en: 'Verify a payment yourself and there is no extra fee. A service charge applies only when Lytro verifies payments automatically or takes them for you.',
    },
  },
  {
    icon: 'truck',
    title: {
      bn: 'কুরিয়ার অ্যাকাউন্ট আপনার, নিয়ন্ত্রণও আপনার',
      en: 'Your courier account, your control',
    },
    body: {
      bn: 'Steadfast বা Pathao-এর নিজের অ্যাকাউন্ট দিয়েই পার্সেল বুক করুন। কুরিয়ারের রেট, পেমেন্ট ও অন্যান্য হিসাব আপনার নিজের অ্যাকাউন্টেই থাকবে।',
      en: "Book parcels with your own Steadfast or Pathao account. The courier's rates, payments and other records all stay in your own account.",
    },
  },
  {
    icon: 'globe',
    title: { bn: 'পুরো দোকান চালান বাংলা ভাষায়', en: 'Run your whole shop in Bangla' },
    body: {
      bn: 'অর্ডার, পণ্য, হিসাব, ইনভয়েস ও ডেলিভারির তথ্য—সবকিছু বাংলায় দেখুন। প্রয়োজনে এক ট্যাপেই ইংরেজিতে পরিবর্তন করুন।\n\nমোবাইল থেকেই সহজে ব্যবহার করার জন্য তৈরি Lytro। কম্পিউটার থাকা বাধ্যতামূলক নয়।',
      en: "Orders, products, accounts, invoices and delivery details all read in Bangla. Switch to English with one tap when you need to.\n\nLytro is made to be easy on a phone. You don't need a computer.",
    },
  },
  {
    icon: 'database',
    title: { bn: 'আপনার ব্যবসার তথ্য নিরাপদে রাখুন', en: 'Keep your business data safe' },
    body: {
      bn: 'আপনার দোকানের তথ্য অন্য দোকান থেকে আলাদা থাকবে। প্রতিদিন আপনার ডেটার এনক্রিপ্টেড ব্যাকআপ রাখা হবে। পাশাপাশি কে কখন কী পরিবর্তন করেছেন, তার রেকর্ডও থাকবে।',
      en: "Your shop's data is kept apart from every other shop's. An encrypted backup of your data is made every day, and there is a record of who changed what, and when.",
    },
  },
  {
    icon: 'code',
    title: {
      bn: 'আগে থেকেই ওয়েবসাইট আছে? সমস্যা নেই!',
      en: 'Already have a website? No problem!',
    },
    body: {
      bn: 'আপনার নিজের ওয়েবসাইট বা ডেভেলপার থাকলেও Lytro ব্যবহার করতে পারবেন। API-এর মাধ্যমে আপনার ওয়েবসাইটকে Lytro-এর সঙ্গে যুক্ত করুন।\n\nআপনার ওয়েবসাইট আগের মতোই চলবে, আর অর্ডার, পেমেন্ট ও কুরিয়ারের কাজ সামলাবে Lytro।',
      en: 'Even with your own website or developer, you can use Lytro. Connect your website to Lytro through the API.\n\nYour website keeps running as before, and Lytro handles orders, payments and couriers.',
    },
  },
];

/** The sketch's six numbered cards, in one, two or three columns. */
export function WhyLytro({ language }: { language: Language }) {
  const copy = new Copy(language);
  return (
    <section className="sec" id="why">
      <div className="wrap">
        <div className="sec-head center">
          <span className="eyebrow">
            <i />
            <span>{copy.of(text.eyebrow)}</span>
          </span>
          <h2>{copy.of(text.title)}</h2>
        </div>
        <div className="wgrid">
          {rules.map((rule, index) => (
            <article key={rule.title.en} className="wcard card">
              <div className="ic">
                <Icon name={rule.icon} size={22} />
              </div>
              <span className="no">{String(index + 1).padStart(2, '0')}</span>
              <h3>{copy.of(rule.title)}</h3>
              <div className="body">
                {copy
                  .of(rule.body)
                  .split('\n\n')
                  .map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
