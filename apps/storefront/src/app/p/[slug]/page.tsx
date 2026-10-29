import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { OfflinePage } from '@/components/pages';
import { ProductView } from '@/components/product/product-view';
import { Footer, Header, Shell } from '@/components/shell';
import { categoryName, keptQuery, productOpening } from '@/lib/product/opening';
import { productMetadata } from '@/lib/product/product-metadata';
import { loadProduct, loadShopPage, storefrontApi } from '@/lib/storefront';

// SFT-04: a product's page in the shop's storefront, at /p/<slug>. Every request is rendered and counted (SFT-15);
// nothing here is kept by a shared cache.
export const dynamic = 'force-dynamic';

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
  return productMetadata(read.product, page.info, page.shop.origin, `/p/${read.product.slug}`);
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
  const [opening, categories] = await Promise.all([
    productOpening(page, product, v),
    storefrontApi.categories(page.shop, page.shopper),
  ]);
  const language = page.words.language;
  return (
    <Shell
      language={language}
      header={<Header shop={page.info} language={language} variant="back" title={product.name} />}
      footer={<Footer shop={page.info} language={language} landing={false} storefrontOn />}
    >
      <ProductView
        language={language}
        product={product}
        category={categoryName(categories, product.primaryCategoryId)}
        zones={page.info.deliveryZones}
        shopPhone={page.info.contact.phone}
        linkedVariantId={opening.linkedVariantId}
        areaId={opening.areaId}
        initialEstimate={opening.estimate}
        shareUrl={`${page.shop.origin}/p/${product.slug}`}
      />
    </Shell>
  );
}
