import { spreadsDesigns } from '@/lib/design/card-links';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { withBusyMetadata, withBusyPage } from '@/components/busy-page';
import { EmptyBox, EmptyFrame, MoreProducts } from '@/components/catalogue/empty-state';
import { ProductList } from '@/components/catalogue/product-list';
import { pageTheme } from '@/lib/design/design-look';
import { EdgeMark } from '@/components/edge-mark';
import { OfflinePage } from '@/components/pages';
import { SearchPanel } from '@/components/search/search-panel';
import { Frame } from '@/components/shell';
import { offeredCategories, searchOf } from '@/lib/catalogue/browse';
import { type EmptyNext, emptyNext, shownOn } from '@/lib/catalogue/empty';
import { loadFrame, loadShopPage, storefrontApi } from '@/lib/storefront';

// CCH-12, STOREFRONT-DESIGN §3: a search's results, at /search?q=, in the search panel the prototype draws over the
// page: one call per search, made when the shopper submits it, and kept at Cloudflare's edge for a minute (Slice 9.10,
// D9-32). Without a search, the panel's recent searches and categories. Never indexed: a search's page is the
// shopper's, not the shop's.
export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const generateMetadata = withBusyMetadata(
  async ({ searchParams }: Props): Promise<Metadata> => {
    const page = await loadShopPage();
    if (page.state !== 'open' || !page.shop.storefrontEnabled) return {};
    const q = searchOf(await searchParams);
    return {
      metadataBase: new URL(page.shop.publicOrigin),
      title:
        q === null ? page.info.name : `${page.words.t('results_for', { q })} · ${page.info.name}`,
      robots: { index: false, follow: true },
    };
  },
);

export default withBusyPage(async function SearchPage({ searchParams }: Props) {
  const query = await searchParams;
  const page = await loadShopPage();
  if (page.state === 'closed') return <OfflinePage words={page.words} />;
  if (page.state === 'missing' || !page.shop.storefrontEnabled) notFound();
  const q = searchOf(query);
  const asked = q === null ? null : { search: q, designs: spreadsDesigns(page.info) };
  const [frame, list] = await Promise.all([
    loadFrame(page),
    asked === null ? null : storefrontApi.products(page.shop, page.shopper, asked),
  ]);
  const { words } = page;
  let results;
  let next: EmptyNext | null = null;
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
          theme={pageTheme(page.info)}
        />
      </div>
    );
  } else if (asked !== null) {
    // SB-33 (em-search-none): the searched words, the categories with something to see, and the most ordered few.
    next = await emptyNext(page, list, false, 'best_selling');
    const offered = offeredCategories(frame.categories);
    const theme = pageTheme(page.info);
    results = (
      <div className="page tight" style={{ paddingTop: 12 }}>
        <EmptyFrame theme={theme} plain>
          <EmptyBox
            icon="search"
            title={words.t('em_search_h', { q: asked.search })}
            text={words.t(offered.length > 0 ? 'no_results_hint' : 'em_search_p')}
          >
            {offered.length > 0 ? (
              <div className="sb-em-chips">
                {offered.map((category) => (
                  <a key={category.id} href={`/c/${category.slug}`}>
                    {category.name}
                  </a>
                ))}
              </div>
            ) : null}
          </EmptyBox>
          {next?.kind === 'more' ? (
            <MoreProducts
              theme={theme}
              title={words.t('em_popular')}
              products={next.products}
              words={words}
              now={Date.now()}
            />
          ) : null}
        </EmptyFrame>
      </div>
    );
  }
  return (
    <Frame language={words.language} brand={page.info.brand}>
      <EdgeMark page={page} listing products={shownOn(list, next)} />
      <div className="shell">
        <SearchPanel
          key={q ?? ''}
          language={words.language}
          categories={offeredCategories(frame.categories)}
          query={q ?? ''}
          results={results}
        />
      </div>
    </Frame>
  );
});
