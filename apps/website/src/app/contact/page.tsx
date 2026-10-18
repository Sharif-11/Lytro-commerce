import type { Metadata } from 'next';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteNav } from '@/components/layout/site-nav';
import { Container } from '@/components/ui/container';
import { Icon, type IconName } from '@/components/ui/icon';
import { SectionHeading } from '@/components/ui/section-heading';
import { SiteEnvironment } from '@/lib/env';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import { requestLanguage } from '@/lib/i18n/read-language';
import { ContactForm } from './contact-form';
import { OpenNow } from './open-now';

export const metadata: Metadata = {
  title: 'যোগাযোগ',
  description:
    'একজন মানুষের সাথে কথা বলুন, বটের সাথে নয়। WhatsApp, ফোন বা ইমেইলে, বাংলা বা ইংরেজিতে।',
  alternates: { canonical: '/contact' },
};

// docs/SITE-PAGES-DESIGN.md §2. Channel values come from the environment so placeholders cannot ship: a
// channel that is not configured is simply not shown.
const text = {
  eyebrow: { bn: 'যোগাযোগ', en: 'Contact' },
  title: { bn: 'একজন মানুষের সাথে কথা বলুন, বটের সাথে নয়', en: 'Talk to a person, not a bot' },
  lead: {
    bn: 'সেটআপে আটকে গেছেন, কোন প্ল্যান মানায় বুঝছেন না, বা কলে ডেমো চান? মেসেজ দিন। বাংলা বা ইংরেজিতে উত্তর দিই, শনি থেকে বৃহস্পতি, সকাল ১০টা থেকে রাত ৮টা।',
    en: 'Stuck on setup, unsure which plan fits, or want a demo on a call? Message us. We answer in Bangla or English, Saturday to Thursday, 10 am to 8 pm.',
  },
  whatsapp: { bn: 'WhatsApp', en: 'WhatsApp' },
  whatsappSub: {
    bn: 'সবচেয়ে দ্রুত। যেখানে আটকে আছেন তার স্ক্রিনশট পাঠান।',
    en: 'Fastest. Send a screenshot of where you are stuck.',
  },
  whatsappAction: { bn: 'মেসেজ', en: 'Message' },
  phone: { bn: 'ফোন', en: 'Phone' },
  phoneSub: {
    bn: 'কলে বা স্ক্রিন শেয়ারে লাইভ ডেমোর জন্য।',
    en: 'For a live demo on a call or screen share.',
  },
  phoneAction: { bn: 'কল', en: 'Call' },
  email: { bn: 'ইমেইল', en: 'Email' },
  emailSub: {
    bn: 'পার্টনারশিপ, এজেন্সি, যেখানে লিখিত রেকর্ড দরকার।',
    en: 'Partnerships, agencies, anything that needs a paper trail.',
  },
  emailAction: { bn: 'লিখুন', en: 'Write' },
  noChannels: {
    bn: 'সাপোর্ট লাইন চালু হলে এখানে WhatsApp, ফোন আর ইমেইল বসবে। ততদিন নিচের ফর্মটা ব্যবহার করুন।',
    en: 'WhatsApp, phone and email go here once the support line is live. Until then, use the form below.',
  },
  hoursTitle: { bn: 'সাপোর্টের সময়', en: 'Support hours' },
  openNow: { bn: 'এখন খোলা', en: 'Open now' },
  closedNow: { bn: 'এখন বন্ধ', en: 'Closed now' },
  weekdays: { bn: 'শনি থেকে বৃহস্পতি', en: 'Saturday to Thursday' },
  weekdayHours: { bn: 'সকাল ১০টা থেকে রাত ৮টা', en: '10:00 to 20:00' },
  friday: { bn: 'শুক্রবার', en: 'Friday' },
  fridayHours: {
    bn: 'বন্ধ; WhatsApp-এর উত্তর পরদিন সকালে',
    en: 'Closed; WhatsApp answered next morning',
  },
  urgent: {
    bn: 'জরুরি: পেমেন্ট পেজ বা স্টোরফ্রন্ট বন্ধ',
    en: 'Urgent: payment page or storefront down',
  },
  urgentHours: { bn: 'যেকোনো সময়, WhatsApp', en: 'Any time, WhatsApp' },
  addressTitle: { bn: 'Lytronix, ঢাকা', en: 'Lytronix, Dhaka' },
  addressSub: { bn: 'দেখা করতে আগে সময় নিন।', en: 'Visits by appointment.' },
} satisfies Record<string, Bilingual>;

interface Channel {
  icon: IconName;
  title: string;
  value: string;
  sub: string;
  action: string;
  href: string;
}

export default async function ContactPage() {
  const language = await requestLanguage.read();
  const copy = new Copy(language);
  const env = SiteEnvironment.current();

  const channels: Channel[] = [];
  if (env.support.whatsapp) {
    channels.push({
      icon: 'message',
      title: copy.of(text.whatsapp),
      value: `+${env.support.whatsapp}`,
      sub: copy.of(text.whatsappSub),
      action: copy.of(text.whatsappAction),
      href: `https://wa.me/${env.support.whatsapp}`,
    });
  }
  if (env.support.phone) {
    channels.push({
      icon: 'phone',
      title: copy.of(text.phone),
      value: env.support.phone,
      sub: copy.of(text.phoneSub),
      action: copy.of(text.phoneAction),
      href: `tel:${env.support.phone.replace(/[\s-]/g, '')}`,
    });
  }
  if (env.support.email) {
    channels.push({
      icon: 'mail',
      title: copy.of(text.email),
      value: env.support.email,
      sub: copy.of(text.emailSub),
      action: copy.of(text.emailAction),
      href: `mailto:${env.support.email}`,
    });
  }

  const hours = [
    [copy.of(text.weekdays), copy.of(text.weekdayHours)],
    [copy.of(text.friday), copy.of(text.fridayHours)],
    [copy.of(text.urgent), copy.of(text.urgentHours)],
  ];

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

        <section className="bg-neutral-50">
          <Container className="py-12 sm:py-16">
            {channels.length > 0 ? (
              <ul className="grid gap-4 sm:grid-cols-3">
                {channels.map((channel) => (
                  <li
                    key={channel.title}
                    className="flex flex-col rounded-card border border-line bg-white p-5 shadow-card"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-800">
                      <Icon name={channel.icon} size={20} />
                    </span>
                    <h2 className="heading mt-4 text-[18px] text-ink">{channel.title}</h2>
                    <p className="num mt-1 text-[16px] font-semibold text-ink select-all">
                      {channel.value}
                    </p>
                    <p className="mt-2 flex-1 text-[14px] text-neutral-700">{channel.sub}</p>
                    <a
                      href={channel.href}
                      className="mt-4 inline-flex min-h-11 items-center justify-center rounded-control bg-brand-700 px-4 text-[15px] font-semibold text-white hover:bg-brand-800"
                    >
                      {channel.action}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-card border border-dashed border-neutral-200 bg-white p-5 text-[15px] text-neutral-700">
                {copy.of(text.noChannels)}
              </p>
            )}

            <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
              <div className="rounded-card border border-line bg-white p-5 shadow-card">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="heading text-[18px] text-ink">{copy.of(text.hoursTitle)}</h2>
                  <OpenNow open={copy.of(text.openNow)} closed={copy.of(text.closedNow)} />
                </div>
                <dl className="mt-4 divide-y divide-line">
                  {hours.map(([when, what]) => (
                    <div
                      key={when}
                      className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:justify-between sm:gap-4"
                    >
                      <dt className="text-[15px] font-semibold text-ink">{when}</dt>
                      <dd className="text-[15px] text-neutral-700 sm:text-right">{what}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="flex items-center gap-4 rounded-card border border-line bg-white p-5 shadow-card">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
                  <Icon name="map" size={28} />
                </span>
                <div>
                  <h2 className="heading text-[18px] text-ink">{copy.of(text.addressTitle)}</h2>
                  <p className="mt-1 text-[14px] text-neutral-700">{copy.of(text.addressSub)}</p>
                </div>
              </div>
            </div>
          </Container>
        </section>

        <section className="bg-white">
          <Container className="py-12 sm:py-16">
            <div className="mx-auto max-w-[720px]">
              <ContactForm language={language} />
            </div>
          </Container>
        </section>
      </main>
      <SiteFooter language={language} />
    </>
  );
}
