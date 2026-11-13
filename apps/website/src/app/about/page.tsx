import type { Metadata } from 'next';
import { FinalCta } from '@/components/landing/final-cta';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteNav } from '@/components/layout/site-nav';
import { Container } from '@/components/ui/container';
import { Icon, type IconName } from '@/components/ui/icon';
import { Paragraphs } from '@/components/ui/paragraphs';
import { SectionHeading } from '@/components/ui/section-heading';
import { SiteEnvironment } from '@/lib/env';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import { requestLanguage } from '@/lib/i18n/read-language';
import { AppUrls } from '@/lib/urls';

export const metadata: Metadata = {
  title: 'আমাদের সম্পর্কে',
  description:
    'আমরা নিজেরাও অনলাইন ব্যবসা করি। Lytro তৈরি হয়েছে আমাদের নিজেদের অনলাইন ব্যবসার প্রয়োজন থেকে।',
  alternates: { canonical: '/about' },
};

// docs/SITE-PAGES-DESIGN.md §1. First person plural, plain, no superlatives, no invented people or numbers.
const text = {
  eyebrow: { bn: 'আমাদের সম্পর্কে', en: 'About' },
  title: {
    bn: 'আমরা নিজেরাও অনলাইন ব্যবসা করি। তাই আপনার সমস্যাগুলো বুঝি।',
    en: 'We run an online business too, so we know your problems.',
  },
  lead: {
    bn: 'Lytro তৈরি হয়েছে আমাদের নিজেদের অনলাইন ব্যবসার প্রয়োজন থেকে। অর্ডার সামলানো, ভুয়া অর্ডার চেনা, পেমেন্টের হিসাব মেলানো আর কুরিয়ার বুক করতে গিয়ে প্রতিদিন অনেক সময় নষ্ট হতো।\n\nনিজেদের এই সমস্যাগুলোর সমাধান করতে গিয়েই Lytro-এর শুরু। এখন সেই সুবিধাগুলোই আমরা নিয়ে এসেছি আপনার ব্যবসার জন্য।',
    en: 'Lytro grew out of what our own online business needed. Handling orders, spotting fake ones, matching payments and booking couriers cost us hours every day.\n\nLytro began as our fix for those problems. Now we have brought the same tools to your business.',
  },
  storyEyebrow: { bn: 'আমাদের গল্প', en: 'Our story' },
  storyTitle: {
    bn: 'একটি দোকানের প্রয়োজন থেকেই Lytro-এর শুরু',
    en: "Lytro began with one shop's needs",
  },
  quote: {
    bn: 'Lytro শুধু অন্যদের জন্য তৈরি কোনো সফটওয়্যার নয়। আমরা নিজেরাও এটি ব্যবহার করি। আপনার দোকানে যে সুবিধা থাকবে, আমাদের দোকানেও সেই একই সুবিধা থাকবে।',
    en: 'Lytro is not software we made only for others. We use it ourselves. Whatever your shop has, our shop has too.',
  },
  story3: {
    bn: 'Lytro তৈরি করেছে Lytronix। এটি আমাদের আলাদা একটি সফটওয়্যার প্রোডাক্ট, যার নিজস্ব প্ল্যাটফর্ম, টিম ও সাপোর্ট ব্যবস্থা রয়েছে।',
    en: 'Lytro is made by Lytronix. It is our separate software product, with its own platform, team and support.',
  },
  factsTitle: { bn: 'আমাদের পরিচয় এক নজরে', en: 'Who we are, at a glance' },
  timelineEyebrow: { bn: 'আমাদের পথচলা', en: 'Our journey' },
  timelineTitle: {
    bn: 'যেভাবে শুরু, যেভাবে এগিয়ে যাচ্ছি',
    en: 'How we started, and where we are going',
  },
  beliefsEyebrow: { bn: 'আমরা যা বিশ্বাস করি', en: 'What we believe' },
  beliefsTitle: {
    bn: 'ছয়টি বিষয়, যেগুলো মেনেই Lytro তৈরি করছি',
    en: 'Six things we hold to as we build Lytro',
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

// The story in order: how the shop ran, what each order cost us, then what we did about it.
const story: { before: Bilingual[]; pains: Bilingual[]; after: Bilingual[] } = {
  before: [
    {
      bn: 'Lytronix একটি বাংলাদেশি ব্যাটারি ও গ্যাজেট ব্যবসা। আমাদের ব্যবসার অনেক কাজই চলত Facebook পেজ, Messenger আর একটি মোবাইল ফোনের মাধ্যমে।',
      en: 'Lytronix is a Bangladeshi battery and gadget business. Much of our work ran through a Facebook page, Messenger and one mobile phone.',
    },
    {
      bn: 'প্রতিদিন নতুন অর্ডার আসত। কিন্তু প্রতিটি অর্ডার সামলাতে ছিল অনেক ঝামেলা।',
      en: 'New orders came in every day, and every one of them was a hassle to handle.',
    },
  ],
  pains: [
    {
      bn: 'কাস্টমারের ঠিকানা বারবার কুরিয়ার ওয়েবসাইটে লিখতে হতো।',
      en: "We typed customers' addresses into the courier's website again and again.",
    },
    {
      bn: 'বিকাশ বা নগদের পেমেন্ট SMS দেখে হাতে হাতে হিসাব মেলাতে হতো।',
      en: 'We matched bKash and Nagad payment SMS to orders by hand.',
    },
    {
      bn: 'ভুয়া অর্ডার বা আগের রিটার্নের রেকর্ড যাচাই করা কঠিন ছিল।',
      en: 'Checking for fake orders or past returns was hard.',
    },
    {
      bn: 'অর্ডার, পেমেন্ট ও স্টকের হিসাব রাখতে অনেক সময় চলে যেত।',
      en: 'Keeping track of orders, payments and stock took a lot of time.',
    },
  ],
  after: [
    {
      bn: 'আমরা বুঝতে পারলাম, এই সমস্যাগুলো শুধু আমাদের নয়। বাংলাদেশের অসংখ্য অনলাইন ব্যবসায়ী প্রতিদিন একই সমস্যার মুখোমুখি হন।',
      en: 'We realised these problems were not only ours. Countless online sellers in Bangladesh face the same ones every day.',
    },
    {
      bn: 'তাই নিজেদের কাজ সহজ করতে আমরা একটি সফটওয়্যার তৈরি করলাম। যেখানে অর্ডার, পেমেন্ট, কুরিয়ার ও ব্যবসার অন্যান্য কাজ এক জায়গা থেকেই করা যায়।',
      en: 'So to make our own work easier, we built software where orders, payments, couriers and the rest of the business are all handled from one place.',
    },
    { bn: 'সেই সফটওয়্যারই আজকের Lytro।', en: "That software is today's Lytro." },
    {
      bn: 'এখন আমরা চাই, ছোট বা বড় যেকোনো অনলাইন ব্যবসায়ী যেন সহজেই এই সুবিধাগুলো ব্যবহার করতে পারেন।',
      en: 'Now we want every online seller, small or large, to be able to use it easily.',
    },
  ],
};

const facts: { value: Bilingual; label: Bilingual }[] = [
  {
    value: { bn: '২টি কাজ', en: '2 jobs' },
    label: {
      bn: 'একটি অনলাইন ব্যবসা পরিচালনা এবং একটি সফটওয়্যার তৈরি।',
      en: 'Running an online business, and building software.',
    },
  },
  {
    value: { bn: 'নিজের দোকান', en: 'Our own shop' },
    label: {
      bn: 'Lytro-এর প্রথম ব্যবহারকারী আমাদের নিজেদের ব্যবসা।',
      en: "Lytro's first user is our own business.",
    },
  },
  {
    value: { bn: '৳০', en: '৳0' },
    label: {
      bn: 'শুরু করার জন্য কোনো মাসিক সাবস্ক্রিপশন ফি নেই।',
      en: 'No monthly subscription fee to start.',
    },
  },
  {
    value: { bn: 'বাংলাদেশ', en: 'Bangladesh' },
    label: {
      bn: 'বাংলাদেশি ব্যবসায়ীদের কথা মাথায় রেখেই তৈরি।',
      en: 'Made with Bangladeshi sellers in mind.',
    },
  },
];

const timeline: { when: Bilingual; title: Bilingual; body: Bilingual }[] = [
  {
    when: { bn: '১. শুরুতে — নিজেদের ব্যবসার সমস্যা', en: "1. At first: our own shop's problem" },
    title: {
      bn: 'অর্ডার ছিল Messenger-এ, হিসাব ছিল খাতায়',
      en: 'Orders in Messenger, accounts in a notebook',
    },
    body: {
      bn: 'অর্ডার, পেমেন্ট, কুরিয়ার ও স্টকের হিসাব রাখতে প্রতিদিন অনেক সময় নষ্ট হতো। ভুলও হতো অনেক।',
      en: 'Keeping track of orders, payments, couriers and stock wasted hours every day, and mistakes were common.',
    },
  },
  {
    when: { bn: '২. এরপর — নিজেদের জন্য একটি সমাধান', en: '2. Then: a fix for ourselves' },
    title: { bn: 'সব কাজ এক জায়গায় আনার চেষ্টা', en: 'Bringing all the work into one place' },
    body: {
      bn: 'অর্ডার ম্যানেজমেন্ট, কুরিয়ার বুকিং, পেমেন্ট যাচাই ও ভুয়া অর্ডার চেনার সুবিধা নিয়ে তৈরি হলো আমাদের নিজস্ব সফটওয়্যার।',
      en: 'We built our own software for managing orders, booking couriers, verifying payments and spotting fake orders.',
    },
  },
  {
    when: { bn: '৩. এখন — Lytro সবার জন্য', en: '3. Now: Lytro for everyone' },
    title: { bn: 'আপনার ব্যবসাও চলুক আরও সহজে', en: 'Let your business run more easily too' },
    body: {
      bn: 'নিজেদের অভিজ্ঞতা থেকে তৈরি সেই সমাধানকে আমরা একটি পূর্ণাঙ্গ প্ল্যাটফর্ম হিসেবে সাজিয়েছি, যেন অন্য ব্যবসায়ীরাও ব্যবহার করতে পারেন।',
      en: 'We turned what we built from our own experience into a complete platform, so other sellers can use it too.',
    },
  },
  {
    when: {
      bn: '৪. সামনে — আরও সুবিধা, আরও সহজ ব্যবসা',
      en: '4. Next: more features, an easier business',
    },
    title: { bn: 'আপনার ব্যবসার সঙ্গে Lytro-ও এগিয়ে যাবে', en: 'Lytro grows with your business' },
    body: {
      bn: 'আমরা নতুন নতুন সুবিধা যুক্ত করছি, যাতে পণ্য, অর্ডার, হিসাব ও ব্যবসার প্রতিদিনের কাজ আরও সহজ হয়।',
      en: 'We keep adding features that make products, orders, accounts and the everyday work of a business easier.',
    },
  },
];

const beliefs: { icon: IconName; title: Bilingual; body: Bilingual }[] = [
  {
    icon: 'wallet',
    title: { bn: '১. আপনার টাকা, আপনার কাছেই থাকবে', en: '1. Your money stays with you' },
    body: {
      bn: 'কাস্টমার আপনার নিজের বিকাশ, নগদ বা ব্যাংক অ্যাকাউন্টে টাকা দেবেন। Lytro আপনার বিক্রির টাকা নিজের কাছে রাখবে না। পেমেন্ট পাওয়ার জন্য আমাদের কাছে অপেক্ষাও করতে হবে না।',
      en: 'Customers pay into your own bKash, Nagad or bank account. Lytro never keeps your sales money, and you never wait on us to get paid.',
    },
  },
  {
    icon: 'check',
    title: { bn: '২. যা তৈরি হয়েছে, শুধু সেটাই দেখাই', en: '2. We only show what is built' },
    body: {
      bn: 'যে সুবিধাগুলো সত্যিই ব্যবহার করতে পারবেন, আমরা সেগুলোই দেখাই। এখনো তৈরি হয়নি এমন ফিচারকে চালু বলে প্রচার করি না। আমাদের কাছে বিশ্বাসই সবচেয়ে গুরুত্বপূর্ণ।',
      en: 'We show only the features you can really use. We never advertise an unfinished feature as live. Trust matters most to us.',
    },
  },
  {
    icon: 'globe',
    title: { bn: '৩. বাংলা ভাষাই আমাদের প্রথম পছন্দ', en: '3. Bangla comes first' },
    body: {
      bn: 'Lytro তৈরি হয়েছে বাংলাদেশের ব্যবসায়ীদের জন্য। তাই ড্যাশবোর্ড থেকে শুরু করে অর্ডার, ইনভয়েস ও অন্যান্য কাজ—সবকিছু বাংলায় সহজভাবে বোঝার মতো করে তৈরি করছি। চাইলে ইংরেজিও ব্যবহার করতে পারবেন।',
      en: 'Lytro is made for sellers in Bangladesh, so everything from the dashboard to orders and invoices is written to be easy to follow in Bangla. You can use English too.',
    },
  },
  {
    icon: 'lock',
    title: { bn: '৪. আপনার ব্যবসার তথ্য আপনারই থাকবে', en: '4. Your business data stays yours' },
    body: {
      bn: 'প্রতিটি দোকানের তথ্য আলাদাভাবে সংরক্ষণ করা হয়। কে কখন কী পরিবর্তন করেছেন, তার রেকর্ড থাকে। আপনার গুরুত্বপূর্ণ তথ্যের জন্য নিয়মিত ব্যাকআপের ব্যবস্থাও রয়েছে।',
      en: "Each shop's data is stored separately. There is a record of who changed what, and when. Your important data is backed up regularly.",
    },
  },
  {
    icon: 'truck',
    title: { bn: '৫. আপনার কুরিয়ার, আপনার অ্যাকাউন্ট', en: '5. Your courier, your account' },
    body: {
      bn: 'Steadfast বা Pathao-তে পার্সেল বুক হবে আপনার নিজের অ্যাকাউন্ট থেকে। কুরিয়ারের রেট ও পেমেন্টের নিয়ন্ত্রণও থাকবে আপনার হাতে।',
      en: "Parcels are booked with Steadfast or Pathao from your own account. The courier's rates and payments stay in your hands.",
    },
  },
  {
    icon: 'message',
    title: {
      bn: '৬. সমস্যায় পড়লে পাশে পাবেন একজন মানুষ',
      en: '6. A person helps when you are stuck',
    },
    body: {
      bn: 'নতুন দোকান তৈরি করতে বা Lytro ব্যবহার করতে সমস্যা হলে আমাদের সঙ্গে যোগাযোগ করুন। WhatsApp বা ফোনে বাংলায় সহায়তা পাবেন।\n\nকারণ আমরা জানি, নতুন একটি সফটওয়্যার ব্যবহার শুরু করাটা সবার জন্য সহজ নয়।',
      en: 'If you have trouble setting up a new shop or using Lytro, contact us. You get help in Bangla, on WhatsApp or by phone.\n\nBecause we know starting with new software is not easy for everyone.',
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
                {story.before.map((paragraph) => (
                  <p key={paragraph.en}>{copy.of(paragraph)}</p>
                ))}
                <ul className="list-disc space-y-2 pl-6 marker:text-accent-500">
                  {story.pains.map((pain) => (
                    <li key={pain.en}>{copy.of(pain)}</li>
                  ))}
                </ul>
                {story.after.map((paragraph) => (
                  <p key={paragraph.en}>{copy.of(paragraph)}</p>
                ))}
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
            <h2 className="heading text-center text-[22px] text-ink sm:text-[26px]">
              {copy.of(text.factsTitle)}
            </h2>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {facts.map((fact) => (
                <li
                  key={fact.label.en}
                  className="rounded-card border border-line bg-white p-5 shadow-card"
                >
                  <p className="num text-[34px] font-extrabold leading-none text-brand-800">
                    {copy.of(fact.value)}
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
                  <Paragraphs
                    text={copy.of(belief.body)}
                    className="mt-2 text-[15px] text-white/85"
                  />
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
