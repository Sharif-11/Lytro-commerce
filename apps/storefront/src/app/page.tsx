import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { withBusyMetadata, withBusyPage } from '@/components/busy-page';
import { EdgeMark } from '@/components/edge-mark';
import { HomeView, loadHome } from '@/components/home/home-view';
import { OfflinePage } from '@/components/pages';
import { loadShopPage } from '@/lib/storefront';

// The shop's front page (STOREFRONT-DESIGN §2). Kept at Cloudflare's edge for shoppers who aren't signed in and read
// Bangla, and never counted (Slice 9.10, D9-32); rendered for each of the others.
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
  const home = await loadHome(page);
  return (
    <>
      <EdgeMark page={page} listing products={home.newest?.products ?? []} />
      <HomeView page={page} home={home} />
    </>
  );
});
