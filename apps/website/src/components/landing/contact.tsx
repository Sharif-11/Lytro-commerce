import type { HelpLineView } from '@lytronix/validators';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/ui/icon';
import { channelWords } from '@/lib/contact/channel-words';
import {
  displayNumber,
  HelpLineWords,
  phoneHref,
  whatsappHref,
} from '@/lib/contact/help-line-words';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';

const text = {
  lead: {
    bn: 'প্রথম দোকানের সেটআপে সাহায্য ফ্রি। WhatsApp-এ মেসেজ দিন, কল করুন বা লিখুন; বাংলা বা ইংরেজিতে উত্তর দিই, প্রতিদিন {opens} থেকে {closes}।',
    en: 'Setup help for your first shop is free. Message us on WhatsApp, call, or write; we answer in Bangla or English, every day, {opens} to {closes}.',
  },
  leadUnset: {
    bn: 'প্রথম দোকানের সেটআপে সাহায্য ফ্রি। যোগাযোগ পেজ থেকে লিখুন; বাংলা বা ইংরেজিতে উত্তর দিই।',
    en: 'Setup help for your first shop is free. Write to us from the contact page; we answer in Bangla or English.',
  },
  whatsappAction: { bn: 'WhatsApp-এ মেসেজ দিন', en: 'Message on WhatsApp' },
  phoneAction: { bn: 'ডেমো কল বুক করুন', en: 'Book a demo call' },
  emailAction: { bn: 'ইমেইল পাঠান', en: 'Send an email' },
  form: { bn: 'যোগাযোগ ফর্ম', en: 'Contact form' },
  formSub: {
    bn: 'যোগাযোগ পেজের ফর্মে লিখুন, আমরা উত্তর দেব।',
    en: 'Write to us with the form on the contact page and we will answer.',
  },
  formAction: { bn: 'যোগাযোগ পেজে যান', en: 'Go to the contact page' },
} satisfies Record<string, Bilingual>;

interface Channel {
  icon: IconName;
  title: string;
  value: string | null;
  sub: string;
  action: string;
  href: string;
  primary: boolean;
}

/** The sketch's contact cards (LANDING-PAGE-DESIGN.md §3 row 12). WhatsApp, the phone and the hours are the help
    line's (GET /help-line, D8-69), so a number that isn't set isn't shown, and with neither the hours go too; the
    email is the site's setting. With none of the three the one card left is the contact page's form. */
export function Contact({
  language,
  helpLine,
  email,
}: {
  language: Language;
  helpLine: HelpLineView | null;
  email: string | null;
}) {
  const copy = new Copy(language);
  const words = new HelpLineWords(copy);
  const whatsapp = helpLine?.whatsapp ?? null;
  const phone = helpLine?.phone ?? null;
  const hours = helpLine && (whatsapp !== null || phone !== null) ? helpLine : null;
  const lead = hours
    ? copy
        .of(text.lead)
        .replace('{opens}', words.hour(hours.opensHour))
        .replace('{closes}', words.hour(hours.closesHour))
    : copy.of(text.leadUnset);

  const channels: Channel[] = [];
  if (whatsapp !== null) {
    channels.push({
      icon: 'message',
      title: copy.of(channelWords.whatsapp),
      value: displayNumber(whatsapp),
      sub: copy.of(channelWords.whatsappSub),
      action: copy.of(text.whatsappAction),
      href: whatsappHref(whatsapp),
      primary: true,
    });
  }
  if (phone !== null) {
    channels.push({
      icon: 'phone',
      title: copy.of(channelWords.phone),
      value: displayNumber(phone),
      sub: copy.of(channelWords.phoneSub),
      action: copy.of(text.phoneAction),
      href: phoneHref(phone),
      primary: false,
    });
  }
  if (email) {
    channels.push({
      icon: 'mail',
      title: copy.of(channelWords.email),
      value: email,
      sub: copy.of(channelWords.emailSub),
      action: copy.of(text.emailAction),
      href: `mailto:${email}`,
      primary: false,
    });
  }

  return (
    <section className="sec" id="contact">
      <div className="wrap">
        <div className="sec-head center">
          <span className="eyebrow">
            <i />
            <span>{copy.of(channelWords.eyebrow)}</span>
          </span>
          <h2>{copy.of(channelWords.title)}</h2>
          <p>{lead}</p>
        </div>
        <div className="cgrid">
          {channels.map((channel) => (
            <div key={channel.title} className="ccard card">
              <div className="ic">
                <Icon name={channel.icon} size={22} />
              </div>
              <h3>{channel.title}</h3>
              <div className="val">{channel.value}</div>
              <p>{channel.sub}</p>
              <a
                href={channel.href}
                className={`btn btn-sm ${channel.primary ? 'btn-primary' : 'btn-outline'}`}
              >
                {channel.action}
              </a>
            </div>
          ))}
          {channels.length === 0 ? (
            <div className="ccard card">
              <div className="ic">
                <Icon name="message" size={22} />
              </div>
              <h3>{copy.of(text.form)}</h3>
              <p>{copy.of(text.formSub)}</p>
              <Link href="/contact" className="btn btn-primary btn-sm">
                {copy.of(text.formAction)}
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
