import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ListView } from '@/components/catalogue/list-view';
import { OfflinePage } from '@/components/pages';
import { ShopShell } from '@/components/shop-shell';
import { chipsFor, findCategory, listParams } from '@/lib/catalogue/browse';
import { loadFrame, loadShopPage, storefrontApi } from '@/lib/storefront';

// STOREFRONT-DESIGN §3: a category's page, at /c/<slug>: its products and its subcategories', in the shop's order
// unless asked otherwise (`?sort=`), all or only what is in stock (`?stock=in`). Every request is rendered and counted.
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadShopPage();
  if (page.state !== 'open' || !page.shop.storefrontEnabled) return {};
  const found = findCategory((await loadFrame(page)).categories, slug.toLowerCase());
  return {
    metadataBase: new URL(page.shop.origin),
    title: found ? `${found.category.name} · ${page.info.name}` : page.info.name,
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const page = await loadShopPage();
  if (page.state === 'closed') return <OfflinePage words={page.words} />;
  if (page.state === 'missing' || !page.shop.storefrontEnabled) notFound();
  const frame = await loadFrame(page);
  const found = findCategory(frame.categories, slug.toLowerCase());
  if (!found) notFound();
  const { category } = found;
  const listed = listParams(query, 'featured');
  const asked = { category: category.slug, sort: listed.sort, inStock: listed.inStock };
  const list = await storefrontApi.products(page.shop, page.shopper, asked);
  if (list === null) notFound();

  const { words } = page;
  const path = `/c/${category.slug}`;
  const { all, chips } = chipsFor(found);
  return (
    <ShopShell
      page={page}
      frame={frame}
      back={found.parent ? `/c/${found.parent.slug}` : '/'}
      title={category.name}
      current={found.top.slug}
    >
      <ListView
        words={words}
        heading={
          <div>
            <h1 className="pt">{category.name}</h1>
            <div className="sub">{words.count('products_n', category.productCount)}</div>
          </div>
        }
        chips={
          all || chips.length > 1 ? (
            <div className="chips">
              {all ? (
                <a className="chip on" href={path}>
                  {words.t('all')}
                </a>
              ) : null}
              {chips.map((chip) => (
                <a
                  key={chip.id}
                  className={!all && chip.id === category.id ? 'chip on' : 'chip'}
                  href={`/c/${chip.slug}`}
                >
                  {chip.name}
                </a>
              ))}
            </div>
          ) : null
        }
        path={path}
        params={listed}
        fallback="featured"
        sortable
        page={list}
        query={asked}
      />
    </ShopShell>
  );
}
