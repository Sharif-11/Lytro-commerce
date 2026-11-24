import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { PaymentPolicy } from '@lytronix/validators/enums';
import { withBusyMetadata, withBusyPage } from '@/components/busy-page';
import { EdgeMark } from '@/components/edge-mark';
import { MetaPixel } from '@/components/landing/meta-pixel';
import { OfflinePage } from '@/components/pages';
import { loadOnePage, OnePageInShop } from '@/components/product/one-page-route';
import { OnePageView } from '@/components/product/one-page-view';
import { Footer, Header, Shell } from '@/components/shell';
import type { PublicProduct } from '@/lib/api/storefront-api';
import { keptQuery, productOpening } from '@/lib/product/opening';
import { productMetadata } from '@/lib/product/product-metadata';
import { VariantChoice } from '@/lib/product/variant-choice';
import { pathOfSlug, slugOfSegment } from '@/lib/request-path';
import { shopChatOf } from '@/lib/shop/shop-chat';
import { loadProduct, loadShopPage, storefrontApi } from '@/lib/storefront';

// LND-01, LND-02 as amended by the owner, 2026-11-24 ("the landing page is product detail page"): every active product's
// link at /l/<slug> opens the one product page, in the shop's own frame with its header and categories, and its orders
// are counted as the landing link's (LND-09). It follows the shop's visibility, not the storefront switch (SFT-16): with
// the storefront off it still works, showing only this product, with no cart and no way into the shop. Kept at
// Cloudflare's edge whatever its query, where ads land, and never counted (Slice 9.10, D9-32, amending LND-14); rendered
// for each shopper who is signed in or reads English.
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ v?: string | string[] }>;
}

export const generateMetadata = withBusyMetadata(async ({ params }: Props): Promise<Metadata> => {
  const slug = slugOfSegment((await params).slug);
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
});

/** LND-15: the shop's pixel, with the IDs the catalog feed lists: the linked variant, or every variant the page offers. */
function pixelFor(
  pixelId: string | null,
  product: PublicProduct,
  linkedVariantId: string | null,
  openInBrowser: boolean,
) {
  if (!pixelId) return null;
  const choice = new VariantChoice(product.options, product.variants);
  const opened = choice.variantFor(choice.initial(linkedVariantId));
  const contentIds =
    linkedVariantId !== null && opened
      ? [opened.id]
      : product.variants.map((variant) => variant.id);
  const value = opened
    ? Number(opened.price)
    : product.minPrice === null
      ? null
      : Number(product.minPrice);
  return (
    <MetaPixel
      pixelId={pixelId}
      contentIds={contentIds}
      value={value}
      {...(openInBrowser ? { linkable: product.variants } : {})}
    />
  );
}

export default withBusyPage(async function LandingPage({ params, searchParams }: Props) {
  const [{ slug: segment }, { v }] = await Promise.all([params, searchParams]);
  const slug = slugOfSegment(segment);
  const page = await loadShopPage();
  if (page.state === 'closed') return <OfflinePage words={page.words} />;
  if (page.state === 'missing') notFound();
  const read = await loadProduct(slug);
  if (read === null || read.kind === 'missing') notFound();
  if (read.kind === 'moved') permanentRedirect(`${pathOfSlug('/l', read.slug)}${keptQuery(v)}`);

  const { product } = read;
  if (page.shop.storefrontEnabled) {
    const data = await loadOnePage(page, product, v);
    return (
      <>
        <OnePageInShop page={page} data={data} source="landing_page" linkedDesignId={null} />
        {pixelFor(
          page.info.metaPixelId,
          product,
          data.opening.linkedVariantId,
          data.opening.openInBrowser,
        )}
      </>
    );
  }

  // SFT-16: the storefront is off -- this product only, in the shop's bare frame.
  const [opening, methods] = await Promise.all([
    productOpening(page, product, v),
    product.paymentPolicy === PaymentPolicy.None
      ? Promise.resolve([])
      : storefrontApi.paymentMethods(page.shop, page.shopper),
  ]);
  const language = page.words.language;
  return (
    <>
      <EdgeMark page={page} products={[product]} />
      <Shell
        brand={page.info.brand}
        language={language}
        header={<Header shop={page.info} language={language} variant="minimal" />}
        footer={<Footer shop={page.info} language={language} landing storefrontOn={false} />}
      >
        <OnePageView
          language={language}
          shopName={page.info.name}
          shopPhone={page.info.contact.phone}
          product={product}
          category={null}
          zones={page.info.deliveryZones}
          chat={shopChatOf(page.info.contact)}
          linkedVariantId={opening.linkedVariantId}
          areaId={opening.areaId}
          initialEstimate={opening.estimate}
          openInBrowser={opening.openInBrowser}
          methods={methods}
          source="landing_page"
          storefrontOn={false}
          shareUrl={`${page.shop.publicOrigin}/l/${product.slug}`}
        />
      </Shell>
      {pixelFor(page.info.metaPixelId, product, opening.linkedVariantId, opening.openInBrowser)}
    </>
  );
});
