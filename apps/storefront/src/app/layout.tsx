import type { ReactNode } from 'react';

export const metadata = {
  title: 'Storefront',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="bn">
      <body>{children}</body>
    </html>
  );
}
