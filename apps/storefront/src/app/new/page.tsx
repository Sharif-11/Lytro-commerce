import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ListView } from '@/components/catalogue/list-view';
import { OfflinePage } from '@/components/pages';
import { ShopShell } from '@/components/shop-shell';
import { listParams } from '@/lib/catalogue/browse';
import { loadFrame, loadShopPage, storefrontApi } from '@/lib/storefront';

// STOREFRONT-DESIGN §3, Slice 12b: New arrivals, at /new -- every product, newest first, all or only what is in stock
// (`?stock=in`). The home's "New arrivals" and its hero lead here.
export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata(): Promise<Metadata> {
  const page = await loadShopPage();
  if (page.state !== 'open' || !page.shop.storefrontEnabled) return {};
  return {
    metadataBase: new URL(page.shop.publicOrigin),
    title: `${page.words.t('new_in')} · ${page.info.name}`,
  };
}

export default async function NewArrivalsPage({ searchParams }: Props) {
  const query = await searchParams;
  const page = await loadShopPage();
  if (page.state === 'closed') return <OfflinePage words={page.words} />;
  if (page.state === 'missing' || !page.shop.storefrontEnabled) notFound();
  const listed = { ...listParams(query, 'newest'), sort: 'newest' as const };
  const asked = { sort: listed.sort, inStock: listed.inStock };
  const [frame, list] = await Promise.all([
    loadFrame(page),
    storefrontApi.products(page.shop, page.shopper, asked),
  ]);
  const { words } = page;
  return (
    <ShopShell page={page} frame={frame} back="/" title={words.t('new_in')}>
      <ListView
        words={words}
        heading={
          <div>
            <h1 className="pt">{words.t('new_in')}</h1>
          </div>
        }
        chips={null}
        path="/new"
        params={listed}
        fallback="newest"
        sortable={false}
        page={list ?? { products: [], nextCursor: null }}
        query={asked}
      />
    </ShopShell>
  );
}
