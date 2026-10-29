import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OfflinePage } from '@/components/pages';
import { ProductCard } from '@/components/product-card';
import { Footer, Header, Shell } from '@/components/shell';
import { loadShopPage, storefrontApi } from '@/lib/storefront';

// The shop's front page. Slice 12a lists its newest products so every product page has a way in; Slice 12b brings the
// drawn home (categories, sections) and the category, search and cart pages.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const page = await loadShopPage();
  if (page.state !== 'open' || !page.shop.storefrontEnabled) return {};
  return { metadataBase: new URL(page.shop.origin), title: page.info.name };
}

export default async function HomePage() {
  const page = await loadShopPage();
  if (page.state === 'closed') return <OfflinePage words={page.words} />;
  if (page.state === 'missing' || !page.shop.storefrontEnabled) notFound();
  const { products } = await storefrontApi.products(page.shop, page.shopper, { sort: 'newest' });
  const { words } = page;
  return (
    <Shell
      language={words.language}
      header={<Header shop={page.info} language={words.language} variant="home" />}
      footer={<Footer shop={page.info} language={words.language} landing={false} storefrontOn />}
    >
      <section className="sec">
        <div className="sechead">
          <h2>{words.t('new_in')}</h2>
        </div>
        {products.length > 0 ? (
          <div className="grid">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} words={words} />
            ))}
          </div>
        ) : (
          <p className="sub">{words.t('no_results')}</p>
        )}
      </section>
    </Shell>
  );
}
