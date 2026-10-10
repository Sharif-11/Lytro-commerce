import type { Metadata } from 'next';
import { Inter, Noto_Sans_Bengali } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const notoBengali = Noto_Sans_Bengali({ subsets: ['bengali'], variable: '--font-noto-bengali' });

export const metadata: Metadata = {
  title: 'Lytro — আপনার অনলাইন দোকান চালান এক জায়গা থেকে',
  description:
    'অর্ডার, পেমেন্ট, কুরিয়ার আর ফ্রড চেক — সব একসাথে, বাংলায়। কোনো মাসিক ফি ছাড়াই আজই শুরু করুন।',
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="bn" className={`${inter.variable} ${notoBengali.variable}`}>
      <body>{children}</body>
    </html>
  );
}
