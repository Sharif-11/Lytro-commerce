import type { Metadata } from 'next';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteNav } from '@/components/layout/site-nav';
import { Container } from '@/components/ui/container';
import { Icon, type IconName } from '@/components/ui/icon';
import { SectionHeading } from '@/components/ui/section-heading';
import { HelpLineApi } from '@/lib/api/help-line-api';
import { channelWords } from '@/lib/contact/channel-words';
import {
  displayNumber,
  HelpLineWords,
  phoneHref,
  whatsappHref,
} from '@/lib/contact/help-line-words';
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

// docs/SITE-PAGES-DESIGN.md §2. WhatsApp, the phone and the hours are Lytro's help line, the numbers the operator sets in
// the console (GET /help-line, D8-69, D8-73), so placeholders cannot ship: a number not set, or cleared, is not shown,
// and with neither the hours go too. Email comes from the environment.
const text = {
  ...channelWords,
  lead: {
    bn: 'সেটআপে আটকে গেছেন, কোন প্ল্যান মানায় বুঝছেন না, বা কলে ডেমো চান? মেসেজ দিন। বাংলা বা ইংরেজিতে উত্তর দিই, প্রতিদিন {opens} থেকে {closes}।',
    en: 'Stuck on setup, unsure which plan fits, or want a demo on a call? Message us. We answer in Bangla or English, every day, {opens} to {closes}.',
  },
  leadUnset: {
    bn: 'সেটআপে আটকে গেছেন, কোন প্ল্যান মানায় বুঝছেন না, বা কলে ডেমো চান? মেসেজ দিন। বাংলা বা ইংরেজিতে উত্তর দিই।',
    en: 'Stuck on setup, unsure which plan fits, or want a demo on a call? Message us. We answer in Bangla or English.',
  },
  whatsappAction: { bn: 'মেসেজ', en: 'Message' },
  phoneAction: { bn: 'কল', en: 'Call' },
  emailAction: { bn: 'লিখুন', en: 'Write' },
  noChannels: {
    bn: 'সাপোর্ট লাইন চালু হলে এখানে WhatsApp, ফোন আর ইমেইল বসবে। ততদিন নিচের ফর্মটা ব্যবহার করুন।',
    en: 'WhatsApp, phone and email go here once the support line is live. Until then, use the form below.',
  },
  hoursTitle: { bn: 'সাপোর্টের সময়', en: 'Support hours' },
  openNow: { bn: 'এখন খোলা', en: 'Open now' },
  closedNow: { bn: 'এখন বন্ধ · {at} খুলবে', en: 'Closed now · opens at {at}' },
  everyDay: { bn: 'প্রতিদিন', en: 'Every day' },
  outside: { bn: 'এর বাইরে', en: 'Outside these hours' },
  outsideWhatsapp: {
    bn: 'WhatsApp-এ লিখে রাখুন, খোলার পর উত্তর দিই',
    en: 'Leave a WhatsApp; we reply when we open',
  },
  addressTitle: { bn: 'Lytro, চট্টগ্রাম', en: 'Lytro, Chittagong' },
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
  const line = await new HelpLineApi(env).current();
  const words = new HelpLineWords(copy);
  const whatsapp = line?.whatsapp ?? null;
  const phone = line?.phone ?? null;
  // D8-69, D8-73: the hours are the help line's, shown only while it has a number to reach.
  const hours = line && (whatsapp !== null || phone !== null) ? line : null;

  const channels: Channel[] = [];
  if (whatsapp !== null) {
    channels.push({
      icon: 'message',
      title: copy.of(text.whatsapp),
      value: displayNumber(whatsapp),
      sub: copy.of(text.whatsappSub),
      action: copy.of(text.whatsappAction),
      href: whatsappHref(whatsapp),
    });
  }
  if (phone !== null) {
    channels.push({
      icon: 'phone',
      title: copy.of(text.phone),
      value: displayNumber(phone),
      sub: copy.of(text.phoneSub),
      action: copy.of(text.phoneAction),
      href: phoneHref(phone),
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

  const rows = hours
    ? [
        [copy.of(text.everyDay), words.span(hours)],
        ...(whatsapp !== null ? [[copy.of(text.outside), copy.of(text.outsideWhatsapp)]] : []),
      ]
    : [];
  const lead = hours
    ? copy
        .of(text.lead)
        .replace('{opens}', words.hour(hours.opensHour))
        .replace('{closes}', words.hour(hours.closesHour))
    : copy.of(text.leadUnset);

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
              lead={lead}
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
              {hours ? (
                <div className="rounded-card border border-line bg-white p-5 shadow-card">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="heading text-[18px] text-ink">{copy.of(text.hoursTitle)}</h2>
                    <OpenNow
                      opensHour={hours.opensHour}
                      closesHour={hours.closesHour}
                      open={copy.of(text.openNow)}
                      closed={copy
                        .of(text.closedNow)
                        .replace('{at}', words.hour(hours.opensHour, true))}
                    />
                  </div>
                  <dl className="mt-4 divide-y divide-line">
                    {rows.map(([when, what]) => (
                      <div
                        key={when}
                        className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:justify-between sm:gap-4"
                      >
                        <dt className="text-[15px] font-semibold text-ink">{when}</dt>
                        <dd className="num text-[15px] text-neutral-700 sm:text-right">{what}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}
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
              <ContactForm language={language} whatsapp={whatsapp !== null} />
            </div>
          </Container>
        </section>
      </main>
      <SiteFooter language={language} />
    </>
  );
}
