import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { withBusyMetadata, withBusyPage } from '@/components/busy-page';
import { HomeView, loadHome } from '@/components/home/home-view';
import { OfflinePage } from '@/components/pages';
import { loadShopPage } from '@/lib/storefront';

// The shop's front page (STOREFRONT-DESIGN §2). Every request is rendered and counted (SFT-11, SFT-15).
export const dynamic = 'force-dynamic';

export const generateMetadata = withBusyMetadata(async (): Promise<Metadata> => {
  const page = await loadShopPage();
  if (page.state !== 'open' || !page.shop.storefrontEnabled) return {};
  return { metadataBase: new URL(page.shop.publicOrigin), title: page.info.name };
});

export default withBusyPage(async function HomePage() {
  const page = await loadShopPage();
  if (page.state === 'closed') return <OfflinePage words={page.words} />;
  if (page.state === 'missing' || !page.shop.storefrontEnabled) notFound();
  return <HomeView page={page} home={await loadHome(page)} />;
});
