import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { withBusyMetadata, withBusyPage } from '@/components/busy-page';
import { ListView } from '@/components/catalogue/list-view';
import { EdgeMark } from '@/components/edge-mark';
import { OfflinePage } from '@/components/pages';
import { ShopShell } from '@/components/shop-shell';
import { listParams } from '@/lib/catalogue/browse';
import { loadFrame, loadShopPage, storefrontApi } from '@/lib/storefront';

// STOREFRONT-BUILDER-PLAN SB-9, SB-16: On sale, at /offers -- every product saving at least 1%, the biggest saving
// first, all or only what is in stock (`?stock=in`). The designed home's on-sale row, offers and buttons lead here.
export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const generateMetadata = withBusyMetadata(async (): Promise<Metadata> => {
  const page = await loadShopPage();
  if (page.state !== 'open' || !page.shop.storefrontEnabled) return {};
  return {
    metadataBase: new URL(page.shop.publicOrigin),
    title: `${page.words.t('sb_on_sale')} · ${page.info.name}`,
  };
});

export default withBusyPage(async function OffersPage({ searchParams }: Props) {
  const query = await searchParams;
  const page = await loadShopPage();
  if (page.state === 'closed') return <OfflinePage words={page.words} />;
  if (page.state === 'missing' || !page.shop.storefrontEnabled) notFound();
  const listed = { ...listParams(query, 'newest'), sort: 'newest' as const };
  const asked = { sort: 'discount', inStock: listed.inStock, onSale: true };
  const [frame, list] = await Promise.all([
    loadFrame(page),
    storefrontApi.products(page.shop, page.shopper, asked),
  ]);
  const { words } = page;
  return (
    <ShopShell page={page} frame={frame} back="/" title={words.t('sb_on_sale')}>
      <EdgeMark page={page} listing products={list?.products ?? []} />
      <ListView
        words={words}
        heading={
          <div>
            <h1 className="pt">{words.t('sb_on_sale')}</h1>
          </div>
        }
        chips={null}
        path="/offers"
        params={listed}
        fallback="newest"
        sortable={false}
        page={list ?? { products: [], nextCursor: null }}
        query={asked}
      />
    </ShopShell>
  );
});
