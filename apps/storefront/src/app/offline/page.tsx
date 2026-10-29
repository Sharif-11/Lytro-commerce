import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OfflinePage, OfflineUnsavedPage } from '@/components/pages';
import { loadShopPage } from '@/lib/storefront';

// CCH-10 (Slice 12c, `offline-unsaved`): the page the installed storefront shows, offline, for one this phone never
// saved. The service worker keeps it when it installs; it is never indexed.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function OfflineUnsaved() {
  const page = await loadShopPage();
  if (page.state === 'closed') return <OfflinePage words={page.words} />;
  if (page.state === 'missing' || !page.shop.storefrontEnabled) notFound();
  return <OfflineUnsavedPage words={page.words} shop={page.info} />;
}
