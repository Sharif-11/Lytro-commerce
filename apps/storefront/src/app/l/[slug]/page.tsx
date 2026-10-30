import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { LandingView } from '@/components/landing/landing-view';
import { MetaPixel } from '@/components/landing/meta-pixel';
import { OfflinePage } from '@/components/pages';
import { Footer, Header, Shell } from '@/components/shell';
import { keptQuery, productOpening } from '@/lib/product/opening';
import { productMetadata } from '@/lib/product/product-metadata';
import { VariantChoice } from '@/lib/product/variant-choice';
import { loadProduct, loadShopPage } from '@/lib/storefront';

// LND-01, LND-02: every active product's own page at /l/<slug>: that product only, no cart and no way into the
// catalogue. It follows the shop's visibility, not the storefront switch (SFT-16), so it keeps working with the
// storefront off. Rendered and counted on every request (LND-14).
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ v?: string | string[] }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadShopPage();
  if (page.state !== 'open') return {};
  const read = await loadProduct(slug);
  if (read?.kind !== 'found') return { title: page.info.name };
  return productMetadata(
    read.product,
    page.info,
    page.shop.publicOrigin,
    `/l/${read.product.slug}`,
  );
}

export default async function LandingPage({ params, searchParams }: Props) {
  const [{ slug }, { v }] = await Promise.all([params, searchParams]);
  const page = await loadShopPage();
  if (page.state === 'closed') return <OfflinePage words={page.words} />;
  if (page.state === 'missing') notFound();
  const read = await loadProduct(slug);
  if (read === null || read.kind === 'missing') notFound();
  if (read.kind === 'moved') permanentRedirect(`/l/${read.slug}${keptQuery(v)}`);

  const { product } = read;
  const opening = await productOpening(page, product, v);
  const language = page.words.language;
  // LND-15: the IDs the catalog feed lists: the linked variant, or every variant the page offers.
  const choice = new VariantChoice(product.options, product.variants);
  const opened = choice.variantFor(choice.initial(opening.linkedVariantId));
  const contentIds =
    opening.linkedVariantId !== null && opened
      ? [opened.id]
      : product.variants.map((variant) => variant.id);
  const value = opened
    ? Number(opened.price)
    : product.minPrice === null
      ? null
      : Number(product.minPrice);
  return (
    <>
      <Shell
        brand={page.info.brand}
        language={language}
        header={<Header shop={page.info} language={language} variant="minimal" />}
        footer={
          <Footer
            shop={page.info}
            language={language}
            landing
            storefrontOn={page.shop.storefrontEnabled}
          />
        }
      >
        <LandingView
          language={language}
          shopName={page.info.name}
          shopPhone={page.info.contact.phone}
          product={product}
          linkedVariantId={opening.linkedVariantId}
          areaId={opening.areaId}
          initialEstimate={opening.estimate}
        />
      </Shell>
      {page.info.metaPixelId ? (
        <MetaPixel pixelId={page.info.metaPixelId} contentIds={contentIds} value={value} />
      ) : null}
    </>
  );
}
