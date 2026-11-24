import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { withBusyMetadata, withBusyPage } from '@/components/busy-page';
import { OfflinePage } from '@/components/pages';
import { loadOnePage, OnePageInShop } from '@/components/product/one-page-route';
import { keptQuery } from '@/lib/product/opening';
import { productMetadata } from '@/lib/product/product-metadata';
import { pathOfSlug, slugOfSegment } from '@/lib/request-path';
import { loadProduct, loadShopPage } from '@/lib/storefront';

// SFT-04: a product's page in the shop's storefront, at /p/<slug>: the one product page (the owner, 2026-11-24), the
// product and its order form together in the shop's own frame. Kept at Cloudflare's edge whatever its query (a `?v=`
// link and an ad's click ID alike), never counted, and tagged by the product and each it suggests (Slice 9.10, D9-32);
// rendered for each shopper who is signed in or reads English.
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ v?: string | string[]; d?: string | string[] }>;
}

export const generateMetadata = withBusyMetadata(async ({ params }: Props): Promise<Metadata> => {
  const slug = slugOfSegment((await params).slug);
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
});

export default withBusyPage(async function ProductPage({ params, searchParams }: Props) {
  const [{ slug: segment }, { v, d }] = await Promise.all([params, searchParams]);
  const slug = slugOfSegment(segment);
  const page = await loadShopPage();
  if (page.state === 'closed') return <OfflinePage words={page.words} />;
  // SFT-16: a switched-off storefront answers its paths with not-found; landing links are separate (/l/).
  if (page.state === 'missing' || !page.shop.storefrontEnabled) notFound();
  const read = await loadProduct(slug);
  if (read === null || read.kind === 'missing') notFound();
  if (read.kind === 'moved') permanentRedirect(`${pathOfSlug('/p', read.slug)}${keptQuery(v)}`);

  const data = await loadOnePage(page, read.product, v);
  return (
    <OnePageInShop
      page={page}
      data={data}
      source="storefront"
      // DC-3: a design card's link; on a page the edge keeps, the browser applies it with `?v=`.
      linkedDesignId={
        !data.opening.openInBrowser && typeof d === 'string' && d.length > 0 ? d : null
      }
    />
  );
});
