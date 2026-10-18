import Link from 'next/link';
import { Wordmark } from '@/components/ui/wordmark';
import { SiteEnvironment } from '@/lib/env';
import { LiveFeatures } from '@/lib/features';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';
import { AppUrls } from '@/lib/urls';

const text = {
  tagline: {
    bn: 'বাংলাদেশি সেলারের জন্য আসল অনলাইন দোকান চালানোর সবচেয়ে সহজ উপায়: অর্ডার, পেমেন্ট, কুরিয়ার আর ফ্রড চেক, বাংলায়।',
    en: 'The simplest way for a Bangladeshi seller to run a real online shop: orders, payments, couriers and fraud checks, in Bangla.',
  },
  product: { bn: 'প্রোডাক্ট', en: 'Product' },
  features: { bn: 'ফিচার', en: 'Features' },
  why: { bn: 'কেন Lytro', en: 'Why Lytro' },
  pricing: { bn: 'প্রাইসিং', en: 'Pricing' },
  storefront: { bn: 'স্টোরফ্রন্ট', en: 'Storefront' },
  help: { bn: 'সাহায্য', en: 'Help' },
  faq: { bn: 'প্রশ্নোত্তর', en: 'FAQ' },
  setupHelp: { bn: 'সেটআপে সাহায্য', en: 'Setup help' },
  whatsapp: { bn: 'WhatsApp সাপোর্ট', en: 'WhatsApp support' },
  staffLogin: { bn: 'স্টাফ লগইন', en: 'Staff log in' },
  company: { bn: 'কোম্পানি', en: 'Company' },
  about: { bn: 'আমাদের সম্পর্কে', en: 'About us' },
  contact: { bn: 'যোগাযোগ', en: 'Contact' },
  made: {
    bn: 'ঢাকায় তৈরি, সারা বাংলাদেশের সেলারদের জন্য',
    en: 'Made in Dhaka, for sellers across Bangladesh',
  },
} satisfies Record<string, Bilingual>;

interface FooterLink {
  href: string;
  label: string;
  external?: boolean;
}

/** Three link columns, the wordmark with the Bangla lockup, and the company line. Only pages that exist are
    linked (LANDING-PAGE-DESIGN.md §3 row 14): Terms, Privacy and Notices join when those routes ship. */
export function SiteFooter({ language }: { language: Language }) {
  const copy = new Copy(language);
  const env = SiteEnvironment.current();
  const urls = new AppUrls(env.appUrl);
  const live = new LiveFeatures(env.liveFeatures);

  const product: FooterLink[] = [
    { href: '/#features', label: copy.of(text.features) },
    { href: '/#why', label: copy.of(text.why) },
    { href: '/#pricing', label: copy.of(text.pricing) },
    ...(live.has('showcase') ? [{ href: '/#showcase', label: copy.of(text.storefront) }] : []),
  ];
  const help: FooterLink[] = [
    { href: '/#faq', label: copy.of(text.faq) },
    { href: '/contact', label: copy.of(text.setupHelp) },
    ...(env.support.whatsapp
      ? [
          {
            href: `https://wa.me/${env.support.whatsapp}`,
            label: copy.of(text.whatsapp),
            external: true,
          },
        ]
      : []),
    { href: urls.staffSignIn(), label: copy.of(text.staffLogin), external: true },
  ];
  const company: FooterLink[] = [
    { href: '/about', label: copy.of(text.about) },
    { href: '/contact', label: copy.of(text.contact) },
  ];

  const columns = [
    { title: copy.of(text.product), links: product },
    { title: copy.of(text.help), links: help },
    { title: copy.of(text.company), links: company },
  ];

  return (
    <footer className="border-t border-line bg-neutral-50">
      <div className="mx-auto w-full max-w-[1160px] px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="max-w-[320px]">
            <Wordmark height={30} />
            <p className="mt-4 text-[15px] text-neutral-700">{copy.of(text.tagline)}</p>
            <p
              lang="bn"
              className="mt-4 inline-flex items-center gap-2 text-[15px] font-bold text-brand-800"
            >
              <span
                className="inline-block h-5 w-1 rounded-full bg-accent-500"
                aria-hidden="true"
              />
              লাইট্রো
            </p>
          </div>
          {columns.map((column) => (
            <div key={column.title}>
              <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-ink">
                {column.title}
              </h2>
              <ul className="mt-4 space-y-1">
                {column.links.map((link) => (
                  <li key={link.href}>
                    {link.external || link.href.startsWith('/#') ? (
                      <a
                        href={link.href}
                        className="inline-flex min-h-10 items-center text-[15px] text-neutral-700 hover:text-brand-800"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="inline-flex min-h-10 items-center text-[15px] text-neutral-700 hover:text-brand-800"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-line pt-6 text-[14px] text-neutral-700 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Lytro by Lytronix</p>
          <p>{copy.of(text.made)}</p>
        </div>
      </div>
    </footer>
  );
}
