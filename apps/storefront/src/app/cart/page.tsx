import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HomeView } from '@/components/home/home-view';
import { OfflinePage } from '@/components/pages';
import { loadShopPage } from '@/lib/storefront';

// STOREFRONT-DESIGN §10: the cart is a drawer, and also an address (/cart) that opens it over the shop's home, so a
// link to the cart works. The cart itself lives in the shopper's browser (SFT-05).
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const page = await loadShopPage();
  if (page.state !== 'open' || !page.shop.storefrontEnabled) return {};
  return {
    metadataBase: new URL(page.shop.origin),
    title: `${page.words.t('cart_title')} · ${page.info.name}`,
    robots: { index: false, follow: true },
  };
}

export default async function CartPage() {
  const page = await loadShopPage();
  if (page.state === 'closed') return <OfflinePage words={page.words} />;
  if (page.state === 'missing' || !page.shop.storefrontEnabled) notFound();
  return <HomeView page={page} startCartOpen />;
}
