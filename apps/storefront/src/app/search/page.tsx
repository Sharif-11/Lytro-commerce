import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductList } from '@/components/catalogue/product-list';
import { Icon } from '@/components/icon';
import { OfflinePage } from '@/components/pages';
import { SearchPanel } from '@/components/search/search-panel';
import { Frame } from '@/components/shell';
import { searchOf } from '@/lib/catalogue/browse';
import { loadFrame, loadShopPage, storefrontApi } from '@/lib/storefront';

// CCH-12, STOREFRONT-DESIGN §3: a search's results, at /search?q=, in the search panel the prototype draws over the
// page: one counted call per search, made when the shopper submits it. Without a search, the panel's recent searches
// and categories. Never indexed: a search's page is the shopper's, not the shop's.
export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const page = await loadShopPage();
  if (page.state !== 'open' || !page.shop.storefrontEnabled) return {};
  const q = searchOf(await searchParams);
  return {
    metadataBase: new URL(page.shop.origin),
    title:
      q === null ? page.info.name : `${page.words.t('results_for', { q })} · ${page.info.name}`,
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const query = await searchParams;
  const page = await loadShopPage();
  if (page.state === 'closed') return <OfflinePage words={page.words} />;
  if (page.state === 'missing' || !page.shop.storefrontEnabled) notFound();
  const q = searchOf(query);
  const asked = q === null ? null : { search: q };
  const [frame, list] = await Promise.all([
    loadFrame(page),
    asked === null ? null : storefrontApi.products(page.shop, page.shopper, asked),
  ]);
  const { words } = page;
  let results;
  if (asked !== null && list && list.products.length > 0) {
    results = (
      <div className="page tight" style={{ paddingTop: 12 }}>
        <div className="sub">{words.t('results_for', { q: asked.search })}</div>
        <ProductList
          key={asked.search}
          language={words.language}
          products={list.products}
          nextCursor={list.nextCursor}
          query={asked}
          now={Date.now()}
        />
      </div>
    );
  } else if (asked !== null) {
    results = (
      <div
        className="page tight"
        style={{ alignItems: 'center', textAlign: 'center', paddingTop: 48 }}
      >
        <Icon name="search" style={{ width: 40, height: 40, color: 'var(--n300)' }} />
        <b style={{ fontSize: 17 }}>{words.t('no_results')}</b>
        <p className="sub">{words.t('no_results_hint')}</p>
        <a className="btn ghost" href="/#categories">
          {words.t('browse_cats')}
        </a>
      </div>
    );
  }
  return (
    <Frame language={words.language}>
      <div className="shell">
        <SearchPanel
          key={q ?? ''}
          language={words.language}
          categories={frame.categories}
          query={q ?? ''}
          results={results}
        />
      </div>
    </Frame>
  );
}
