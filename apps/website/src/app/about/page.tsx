import type { Metadata } from 'next';
import { FinalCta } from '@/components/landing/final-cta';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteNav } from '@/components/layout/site-nav';
import { Container } from '@/components/ui/container';
import { Icon, type IconName } from '@/components/ui/icon';
import { SectionHeading } from '@/components/ui/section-heading';
import { SiteEnvironment } from '@/lib/env';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import { requestLanguage } from '@/lib/i18n/read-language';
import { AppUrls } from '@/lib/urls';

export const metadata: Metadata = {
  title: 'আমাদের সম্পর্কে',
  description:
    'Lytro শুরু হয়েছিল ঢাকার একটা গ্যাজেটের দোকানের নিজের টুল হিসেবে। সেই দোকানটা আজও প্রতিদিন এটাতেই চলে।',
  alternates: { canonical: '/about' },
};

// docs/SITE-PAGES-DESIGN.md §1. First person plural, plain, no superlatives, no invented people or numbers.
const text = {
  eyebrow: { bn: 'আমাদের সম্পর্কে', en: 'About' },
  title: {
    bn: 'আমরা আগে সেলার। সফটওয়্যারটা পরে এসেছে।',
    en: 'We are sellers first. The software came second.',
  },
  lead: {
    bn: 'Lytro শুরু হয়েছিল ঢাকার একটা গ্যাজেটের দোকানের নিজের টুল হিসেবে, ফেক অর্ডারে টাকা আর কুরিয়ারে ঘণ্টা হারানো বন্ধ করতে। সেই দোকানটা আজও প্রতিদিন এটাতেই চলে। এখন আপনারটাও চলবে।',
    en: 'Lytro began as the tool one Dhaka gadget shop built to stop losing money on fake orders and lost hours on couriers. It still runs that shop every day. Now it runs yours.',
  },
  storyEyebrow: { bn: 'গল্পটা', en: 'The story' },
  storyTitle: {
    bn: 'বোর্ডরুমে নয়, দোকানের কাউন্টারে বানানো',
    en: 'Built on a shop counter, not in a boardroom',
  },
  story1: {
    bn: 'Lytronix ঢাকায় ব্যাটারি আর গ্যাজেট বিক্রি করে, বেশিরভাগই একটা ফেসবুক পেজ আর একটা ফোন দিয়ে। অর্ডার থাকতো মেসেঞ্জারে আর খাতায়। প্রতিদিন কেউ একজন কুরিয়ার পোর্টালে ঠিকানা টাইপ করতো, বিকাশের SMS হাতে হাতে অর্ডারের সাথে মেলাতো, আর এমন নম্বরে শিপ করতো যেটা আগেই তিনটা পার্সেল ফেরত দিয়েছে।',
    en: 'Lytronix sells batteries and gadgets in Dhaka, mostly through a Facebook page and a phone. Orders lived in Messenger and a notebook. Every day someone typed addresses into a courier portal, matched bKash SMS to orders by hand, and shipped to numbers that had returned three parcels before.',
  },
  story2: {
    bn: 'তাই আমরা নিজেদের দরকারি টুলটা বানালাম: অর্ডারের জন্য এক স্ক্রিন, এক ট্যাপে কুরিয়ার বুকিং, পেমেন্ট SMS পড়ার ছোট একটা অ্যাপ, আর এমন একটা চেক যেটা মনে রাখে কোন নম্বর আমাদের ঠকিয়েছে। কাজ হলো। পরিচিত সেলাররা চাইলো। Lytro সেই টুলটাই, নতুন করে বানানো, যাতে যেকোনো দোকান ব্যবহার করতে পারে, বাংলায়, ফোন থেকে।',
    en: 'So we built the tool we needed: one screen for orders, a courier booking that took one tap, a small app that read payment SMS, and a check that remembered which numbers had burned us. It worked. Sellers we knew asked for it. Lytro is that tool, rebuilt so any shop can use it, in Bangla, from a phone.',
  },
  quote: {
    bn: 'আপনি যে অ্যাকাউন্ট পান, আমরা নিজেদের দোকানও সেটাতেই চালাই। একই সাইন-আপ, একই লিমিট, একই ফি। কিছু ভাঙলে আগে আমাদেরই ভাঙে।',
    en: 'We run our own shop on the same account you get. Same sign-up, same limits, same fees. When something breaks, it breaks for us first.',
  },
  story3: {
    bn: 'Lytro বানায় Lytronix, ঢাকার একটা কোম্পানি। প্ল্যাটফর্মটা আলাদা প্রোডাক্ট, নিজের টিম, সাপোর্ট লাইন আর অ্যাকাউন্ট নিয়ে; ব্যাটারির দোকানটা শুধু এর প্রথম কাস্টমার।',
    en: 'Lytro is made by Lytronix, a Dhaka company. The platform is a separate product with its own team, support line and accounts; the battery shop is simply its first customer.',
  },
  timelineEyebrow: { bn: 'সময়রেখা', en: 'Timeline' },
  timelineTitle: { bn: 'আগে, তারপর, এখন, পরে', en: 'Before, then, now, next' },
  beliefsEyebrow: { bn: 'আমরা যা বিশ্বাস করি', en: 'What we believe' },
  beliefsTitle: {
    bn: 'ছয়টা নিয়ম, প্রোডাক্টের ভেতরে লেখা',
    en: 'Six rules, written into the product',
  },
  teamEyebrow: { bn: 'টিম', en: 'The team' },
  teamTitle: { bn: 'ছোট, ঢাকায়, নাগালের মধ্যে', en: 'Small, in Dhaka, reachable' },
  teamNote: {
    bn: 'টিম দেখাতে রাজি হলে এখানে নাম আর ছবি বসবে। ততদিন কার্ডগুলো সৎ প্লেসহোল্ডার, স্টক মুখ নয়।',
    en: 'Names and photos go here once the team agrees to be shown. Until then the cards stay honest placeholders, not stock faces.',
  },
  ctaTitle: { bn: 'নিজের অর্ডার দিয়েই দেখুন', en: 'See it with your own orders' },
  talk: { bn: 'আগে কথা বলুন', en: 'Talk to us first' },
} satisfies Record<string, Bilingual>;

const facts: { value: string; label: Bilingual }[] = [
  {
    value: '2',
    label: {
      bn: 'ব্যবসা: একটা ব্যাটারি বেচে, একটা Lytro বানায়',
      en: 'businesses: one sells batteries, one builds Lytro',
    },
  },
  {
    value: '1',
    label: {
      bn: 'প্রথম টেন্যান্ট, আমাদের নিজের দোকান, আপনার মতো একই শর্তে',
      en: 'first tenant, our own shop, on the same terms as yours',
    },
  },
  {
    value: '৳0',
    label: { bn: 'শুরু করতে মাসিক ফি, সবার জন্য', en: 'monthly fee to start, for everyone' },
  },
  {
    value: 'BD',
    label: {
      bn: 'ডেটা বাংলাদেশে BDIX সার্ভারে, প্রতি রাতে ব্যাকআপ',
      en: 'data hosted in Bangladesh on BDIX servers, backed up nightly',
    },
  },
];

const timeline: { when: Bilingual; title: Bilingual; body: Bilingual }[] = [
  {
    when: { bn: 'আগে', en: 'Before' },
    title: {
      bn: 'একটা খাতা, মেসেঞ্জার আর তিনটা কুরিয়ার পোর্টাল',
      en: 'A notebook, Messenger and three courier portals',
    },
    body: {
      bn: 'Lytronix-এর দোকান চলে যেভাবে বেশিরভাগ দোকান চলে।',
      en: 'The Lytronix shop runs the way most shops do.',
    },
  },
  {
    when: { bn: 'তারপর', en: 'Then' },
    title: { bn: 'একটা দোকানের জন্য একটা টুল', en: 'A tool for one shop' },
    body: {
      bn: 'অর্ডার, কুরিয়ার বুকিং, পেমেন্ট SMS আর ফ্রড চেক, নিজেদের জন্য বানানো।',
      en: 'Orders, courier booking, payment SMS and a fraud check, built for ourselves.',
    },
  },
  {
    when: { bn: 'এখন', en: 'Now' },
    title: { bn: 'Lytro, সব দোকানের জন্য', en: 'Lytro, for every shop' },
    body: {
      bn: 'গোড়া থেকে নতুন করে প্ল্যাটফর্ম হিসেবে বানানো, বাংলায়, ফোন থেকে, বিক্রি হলে তবেই ফি।',
      en: 'Rebuilt from the ground up as a platform, in Bangla, phone first, pay when you sell.',
    },
  },
  {
    when: { bn: 'পরে', en: 'Next' },
    title: { bn: 'স্টক, পরিসংখ্যান আর আরও কুরিয়ার', en: 'Stock, statistics and more couriers' },
    body: {
      bn: 'ফিচার লাইভ হলে তবেই লিস্টে ওঠে। নোটিশ বোর্ডে চোখ রাখুন।',
      en: 'We list a feature only when it is live. Watch the notice board.',
    },
  },
];

const beliefs: { icon: IconName; title: Bilingual; body: Bilingual }[] = [
  {
    icon: 'wallet',
    title: { bn: 'আপনার টাকা আমাদের হাত দিয়ে যায় না', en: 'Your money never passes through us' },
    body: {
      bn: 'কাস্টমার পেমেন্ট করে আপনার নিজের বিকাশ, নগদ বা ব্যাংকে। আমরা ধরে রাখি না, দেরিও করাই না।',
      en: 'Customers pay your own bKash, Nagad or bank. We never hold, settle or delay it.',
    },
  },
  {
    icon: 'check',
    title: { bn: 'যা লাইভ, শুধু সেটাই দাবি করি', en: 'We only claim what is live' },
    body: {
      bn: 'শূন্য দেখানো কাউন্টার নেই, নিজেরা লেখা রিভিউ নেই, প্রাইসিং পেজে “শিগগিরই আসছে” ফিচার নেই।',
      en: 'No counters that show zero, no quotes we wrote ourselves, no features that are “coming soon” on the pricing page.',
    },
  },
  {
    icon: 'globe',
    title: { bn: 'বাংলা আগে, পরে অনুবাদ নয়', en: 'Bangla first, not translated later' },
    body: {
      bn: 'প্রতিটা স্ক্রিন, SMS আর ইনভয়েস আগে বাংলায় লেখা, সেলাররা যে শব্দ ব্যবহার করে সেভাবে। ইংরেজি একটা টগল।',
      en: 'Every screen, SMS and invoice is written in Bangla first, in the words sellers use. English is a toggle.',
    },
  },
  {
    icon: 'lock',
    title: { bn: 'আপনার দোকানের ডেটা শুধু আপনার', en: "Your shop's data is yours alone" },
    body: {
      bn: 'প্রতিটা রিকোয়েস্ট আপনার দোকানের সাথে মিলিয়ে দেখা হয়। কে কী বদলালো তার লগ থাকে। প্রতি রাতে ব্যাকআপ।',
      en: 'Every request is checked against your shop. Every change is logged with who made it. Backups run every night.',
    },
  },
  {
    icon: 'truck',
    title: { bn: 'আপনার কুরিয়ার, আপনার রেট', en: 'Your couriers, your rates' },
    body: {
      bn: 'কুরিয়ার বুক হয় আপনার নিজের অ্যাকাউন্টে। আপনি আর যারা পার্সেল পৌঁছায়, তাদের মাঝে আমরা বসি না।',
      en: 'Couriers are booked on your own account. We do not sit between you and the people who deliver your parcels.',
    },
  },
  {
    icon: 'message',
    title: { bn: 'একজন মানুষ উত্তর দেয়', en: 'A person answers' },
    body: {
      bn: 'প্রথম দোকানের সেটআপে সাহায্য ফ্রি, WhatsApp-এ বা কলে, বাংলায়।',
      en: 'Setup help for your first shop is free, on WhatsApp or a call, in Bangla.',
    },
  },
];

// Replaced only when real people agree to appear (SITE-PAGES-DESIGN.md §1). Names stay empty until then.
const team: { role: Bilingual; does: Bilingual; name: string | null }[] = [
  {
    role: { bn: 'ফাউন্ডার', en: 'Founder' },
    does: {
      bn: 'Lytronix-এর দোকান আর প্ল্যাটফর্ম চালান',
      en: 'Runs the Lytronix shop and the platform',
    },
    name: null,
  },
  {
    role: { bn: 'ইঞ্জিনিয়ারিং', en: 'Engineering' },
    does: { bn: 'Lytro বানায় আর চালায়', en: 'Builds and operates Lytro' },
    name: null,
  },
  {
    role: { bn: 'সেলার সাপোর্ট', en: 'Seller support' },
    does: { bn: 'আপনার WhatsApp লাইন, বাংলায়', en: 'Your WhatsApp line, in Bangla' },
    name: null,
  },
];

export default async function AboutPage() {
  const language = await requestLanguage.read();
  const copy = new Copy(language);
  const env = SiteEnvironment.current();
  const urls = new AppUrls(env.appUrl);

  return (
    <>
      <SiteNav language={language} />
      <main>
        <section className="relative overflow-hidden bg-brand-900 text-white">
          <div className="dot-grid pointer-events-none absolute inset-0" aria-hidden="true" />
          <Container className="relative py-14 sm:py-20">
            <SectionHeading
              as="h1"
              align="left"
              tone="light"
              eyebrow={copy.of(text.eyebrow)}
              title={copy.of(text.title)}
              lead={copy.of(text.lead)}
            />
          </Container>
        </section>

        <section className="bg-white">
          <Container className="py-16 sm:py-20">
            <div className="mx-auto max-w-[720px]">
              <SectionHeading
                align="left"
                eyebrow={copy.of(text.storyEyebrow)}
                title={copy.of(text.storyTitle)}
              />
              <div className="mt-6 space-y-5 text-[17px] text-neutral-700">
                <p>{copy.of(text.story1)}</p>
                <p>{copy.of(text.story2)}</p>
                <blockquote className="border-l-4 border-accent-500 bg-brand-50 px-5 py-4 text-[18px] font-semibold text-ink">
                  {copy.of(text.quote)}
                </blockquote>
                <p>{copy.of(text.story3)}</p>
              </div>
            </div>
          </Container>
        </section>

        <section className="bg-neutral-50">
          <Container className="py-12 sm:py-16">
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {facts.map((fact) => (
                <li
                  key={fact.label.en}
                  className="rounded-card border border-line bg-white p-5 shadow-card"
                >
                  <p className="num text-[34px] font-extrabold leading-none text-brand-800">
                    {fact.value}
                  </p>
                  <p className="mt-3 text-[15px] text-neutral-700">{copy.of(fact.label)}</p>
                </li>
              ))}
            </ul>
          </Container>
        </section>

        <section className="bg-white">
          <Container className="py-16 sm:py-20">
            <SectionHeading
              eyebrow={copy.of(text.timelineEyebrow)}
              title={copy.of(text.timelineTitle)}
            />
            <ol className="mx-auto mt-10 grid max-w-[1000px] gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {timeline.map((item, index) => (
                <li
                  key={item.when.en}
                  className="rounded-card border border-line bg-white p-5 shadow-card"
                >
                  <p
                    className={`text-[12px] font-bold uppercase tracking-[0.12em] ${index === 2 ? 'text-accent-700' : 'text-brand-700'}`}
                  >
                    {copy.of(item.when)}
                  </p>
                  <h3 className="heading mt-2 text-[17px] text-ink">{copy.of(item.title)}</h3>
                  <p className="mt-2 text-[15px] text-neutral-700">{copy.of(item.body)}</p>
                </li>
              ))}
            </ol>
          </Container>
        </section>

        <section className="relative bg-brand-900 text-white">
          <div className="dot-grid pointer-events-none absolute inset-0" aria-hidden="true" />
          <Container className="relative py-16 sm:py-20">
            <SectionHeading
              tone="light"
              eyebrow={copy.of(text.beliefsEyebrow)}
              title={copy.of(text.beliefsTitle)}
            />
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {beliefs.map((belief) => (
                <li
                  key={belief.title.en}
                  className="rounded-card border border-white/12 bg-white/6 p-5"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-500 text-ink">
                    <Icon name={belief.icon} size={20} strokeWidth={2.4} />
                  </span>
                  <h3 className="heading mt-4 text-[18px] text-white">{copy.of(belief.title)}</h3>
                  <p className="mt-2 text-[15px] text-white/85">{copy.of(belief.body)}</p>
                </li>
              ))}
            </ul>
          </Container>
        </section>

        <section className="bg-white">
          <Container className="py-16 sm:py-20">
            <SectionHeading
              eyebrow={copy.of(text.teamEyebrow)}
              title={copy.of(text.teamTitle)}
              lead={copy.of(text.teamNote)}
            />
            <ul className="mx-auto mt-10 grid max-w-[900px] gap-4 sm:grid-cols-3">
              {team.map((member) => (
                <li
                  key={member.role.en}
                  className="flex flex-col items-center rounded-card border border-dashed border-neutral-200 bg-neutral-50 p-6 text-center"
                >
                  <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-neutral-200 bg-white text-neutral-500">
                    <Icon name="users" size={24} />
                  </span>
                  <p className="mt-4 text-[16px] font-bold text-ink">
                    {member.name ?? copy.of(member.role)}
                  </p>
                  <p className="mt-1 text-[14px] text-neutral-700">{copy.of(member.does)}</p>
                </li>
              ))}
            </ul>
          </Container>
        </section>

        <FinalCta
          language={language}
          signInUrl={urls.signIn()}
          secondaryHref="/contact"
          secondaryLabel={copy.of(text.talk)}
        />
      </main>
      <SiteFooter language={language} />
    </>
  );
}
