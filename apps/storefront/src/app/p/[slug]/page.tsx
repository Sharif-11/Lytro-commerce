import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { OfflinePage } from '@/components/pages';
import { ProductCard } from '@/components/product-card';
import { ProductView } from '@/components/product/product-view';
import { ShopShell } from '@/components/shop-shell';
import { categoryById, findCategory } from '@/lib/catalogue/browse';
import { keptQuery, productOpening } from '@/lib/product/opening';
import { productMetadata } from '@/lib/product/product-metadata';
import { loadFrame, loadProduct, loadShopPage, storefrontApi } from '@/lib/storefront';

// SFT-04: a product's page in the shop's storefront, at /p/<slug>. Every request is rendered and counted (SFT-15);
// nothing here is kept by a shared cache.
export const dynamic = 'force-dynamic';

// Slice 12b's read: "You may also like" shows up to eight from the product's main category.
const ALSO_LIKE = 8;

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ v?: string | string[] }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadShopPage();
  if (page.state !== 'open' || !page.shop.storefrontEnabled) return {};
  const read = await loadProduct(slug);
  if (read?.kind !== 'found') return { title: page.info.name };
  return productMetadata(
    read.product,
    page.info,
    page.shop.publicOrigin,
    `/p/${read.product.slug}`,
  );
}

export default async function ProductPage({ params, searchParams }: Props) {
  const [{ slug }, { v }] = await Promise.all([params, searchParams]);
  const page = await loadShopPage();
  if (page.state === 'closed') return <OfflinePage words={page.words} />;
  // SFT-16: a switched-off storefront answers its paths with not-found; landing pages are separate (/l/).
  if (page.state === 'missing' || !page.shop.storefrontEnabled) notFound();
  const read = await loadProduct(slug);
  if (read === null || read.kind === 'missing') notFound();
  if (read.kind === 'moved') permanentRedirect(`/p/${read.slug}${keptQuery(v)}`);

  const { product } = read;
  const [opening, frame] = await Promise.all([productOpening(page, product, v), loadFrame(page)]);
  // Its main category, when the shop shows it: the way back, the header link it lights, and "You may also like".
  const primary = categoryById(frame.categories, product.primaryCategoryId);
  const found = primary ? findCategory(frame.categories, primary.slug) : null;
  const related = primary
    ? await storefrontApi.products(page.shop, page.shopper, {
        category: primary.slug,
        limit: ALSO_LIKE + 1,
      })
    : null;
  const also = (related?.products ?? [])
    .filter((card) => card.id !== product.id)
    .slice(0, ALSO_LIKE);
  const { words } = page;
  const now = Date.now();
  return (
    <ShopShell
      page={page}
      frame={frame}
      back={primary ? `/c/${primary.slug}` : '/'}
      title={product.name}
      current={found?.top.slug}
    >
      <ProductView
        language={words.language}
        product={product}
        category={primary?.name ?? null}
        zones={page.info.deliveryZones}
        shopPhone={page.info.contact.phone}
        linkedVariantId={opening.linkedVariantId}
        areaId={opening.areaId}
        initialEstimate={opening.estimate}
        shareUrl={`${page.shop.publicOrigin}/p/${product.slug}`}
      />
      {also.length > 0 ? (
        <section className="sec">
          <div className="sechead">
            <h2>{words.t('also_like')}</h2>
          </div>
          <div className="rail">
            {also.map((card) => (
              <ProductCard key={card.id} product={card} words={words} now={now} />
            ))}
          </div>
        </section>
      ) : null}
    </ShopShell>
  );
}
