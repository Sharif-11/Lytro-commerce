import Link from 'next/link';
import { buttonClass } from '@/components/ui/button';
import { Wordmark } from '@/components/ui/wordmark';
import { SiteEnvironment } from '@/lib/env';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';
import { AppUrls } from '@/lib/urls';
import { LanguageToggle } from './language-toggle';
import { NavShell } from './nav-shell';

const text = {
  features: { bn: 'ফিচার', en: 'Features' },
  why: { bn: 'কেন Lytro', en: 'Why Lytro' },
  how: { bn: 'কিভাবে কাজ করে', en: 'How it works' },
  pricing: { bn: 'প্রাইসিং', en: 'Pricing' },
  faq: { bn: 'প্রশ্নোত্তর', en: 'FAQ' },
  about: { bn: 'আমাদের সম্পর্কে', en: 'About' },
  contact: { bn: 'যোগাযোগ', en: 'Contact' },
  login: { bn: 'লগইন', en: 'Log in' },
  cta: { bn: 'ফ্রি দোকান খুলুন', en: 'Open a free shop' },
  note: {
    bn: '৩০ দিন ফ্রি ট্রায়াল। কার্ড নেই, মাসিক ফি নেই।',
    en: '30-day free trial. No card, no monthly fee.',
  },
  openMenu: { bn: 'মেনু খুলুন', en: 'Open menu' },
  closeMenu: { bn: 'মেনু বন্ধ করুন', en: 'Close menu' },
  home: { bn: 'Lytro হোম', en: 'Lytro home' },
} satisfies Record<string, Bilingual>;

/** Sticky, 64 px, blurred white with a hairline (LANDING-PAGE-DESIGN.md §4). Phones and tablets get the
    wordmark, the বাং/EN toggle and the burger; the links, log in and the one marigold button appear at the
    desktop breakpoint, and until then they live in the sheet. */
export function SiteNav({ language }: { language: Language }) {
  const copy = new Copy(language);
  const env = SiteEnvironment.current();
  const urls = new AppUrls(env.appUrl);

  const desktopLinks = [
    { href: '/#features', label: copy.of(text.features) },
    { href: '/#pricing', label: copy.of(text.pricing) },
    { href: '/#faq', label: copy.of(text.faq) },
    { href: '/about', label: copy.of(text.about) },
    { href: '/contact', label: copy.of(text.contact) },
  ];
  const sheetLinks = [
    { href: '/#features', label: copy.of(text.features) },
    { href: '/#why', label: copy.of(text.why) },
    { href: '/#how', label: copy.of(text.how) },
    { href: '/#pricing', label: copy.of(text.pricing) },
    { href: '/#faq', label: copy.of(text.faq) },
    { href: '/about', label: copy.of(text.about) },
    { href: '/contact', label: copy.of(text.contact) },
  ];
  const login = { href: urls.logIn(), label: copy.of(text.login) };
  const cta = { href: urls.signIn(), label: copy.of(text.cta) };

  const bar = (
    <>
      <Link href="/" aria-label={copy.of(text.home)} className="flex shrink-0 items-center">
        <Wordmark height={28} />
      </Link>

      <nav className="ml-4 hidden items-center gap-0.5 lg:flex" aria-label="Primary">
        {desktopLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-control px-3 py-2 text-[15px] font-semibold text-neutral-700 hover:bg-neutral-50 hover:text-ink"
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <LanguageToggle language={language} />
        {/* Wrapped so `hidden` is not overridden by the button's own display class. */}
        <div className="hidden items-center gap-2 lg:flex">
          <a href={login.href} className={buttonClass('ghost')}>
            {login.label}
          </a>
          <a href={cta.href} className={buttonClass('accent')}>
            {cta.label}
          </a>
        </div>
      </div>
    </>
  );

  return (
    <NavShell
      bar={bar}
      links={sheetLinks}
      login={login}
      cta={cta}
      note={copy.of(text.note)}
      labels={{ open: copy.of(text.openMenu), close: copy.of(text.closeMenu) }}
    />
  );
}
