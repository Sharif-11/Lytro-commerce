import type { Metadata } from 'next';
import { Inter, Noto_Sans_Bengali, Plus_Jakarta_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { SiteEnvironment } from '@/lib/env';
import { requestLanguage } from '@/lib/i18n/read-language';
import './globals.css';

// BRAND-IDENTITY.md §5: Plus Jakarta Sans for the wordmark and English headlines, Inter for UI and digits,
// Noto Sans Bengali for Bangla. Self-hosted by next/font, so the page never waits on a third-party host.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
});
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});
const notoBengali = Noto_Sans_Bengali({
  subsets: ['bengali', 'latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-noto-bengali',
  display: 'swap',
});

const env = SiteEnvironment.current();

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: {
    default: 'Lytro — আপনার দোকান, আপনার হাতে',
    template: '%s · Lytro',
  },
  description:
    'বাংলাদেশি সেলারের জন্য আসল অনলাইন দোকান চালানোর সবচেয়ে সহজ উপায়: অর্ডার, বিকাশ-নগদ পেমেন্ট, কুরিয়ার বুকিং আর ফেক অর্ডার চেক, বাংলায়। ৩০ দিন ফ্রি, কার্ড লাগে না।',
  applicationName: 'Lytro',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Lytro',
    locale: 'bn_BD',
    alternateLocale: ['en_US'],
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const language = await requestLanguage.read();
  return (
    <html
      lang={language}
      className={`${jakarta.variable} ${inter.variable} ${notoBengali.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
