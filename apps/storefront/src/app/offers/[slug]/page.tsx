import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { withBusyMetadata, withBusyPage } from '@/components/busy-page';
import { ListView } from '@/components/catalogue/list-view';
import { EdgeMark } from '@/components/edge-mark';
import { OfflinePage } from '@/components/pages';
import { ShopShell } from '@/components/shop-shell';
import type { PublicOffer } from '@/lib/api/storefront-api';
import { listParams } from '@/lib/catalogue/browse';
import { spreadsDesigns } from '@/lib/design/card-links';
import { pageTheme } from '@/lib/design/design-look';
import { offerPath } from '@/lib/design/links';
import { money, type Words } from '@/lib/i18n/words';
import { slugOfSegment } from '@/lib/request-path';
import { loadFrame, loadShopPage, storefrontApi } from '@/lib/storefront';

// OFFERS-PLAN OF-8, OF-12, OF-21: an offer's page, at /offers/<its link name> -- its name and cut over every card in
// it (designs as their own cards), in the shop's order with Sort and "In stock only". The link a seller puts in a
// Facebook ad. Once the offer has ended the page says so, and shows the same products at their prices now with the way
// to what is on sale now, so an old ad's click is not wasted. One not started, or none, is not found.
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** The offer's line: "20% off 14 products", or its products once it has ended. */
function lineOf(offer: PublicOffer, words: Words): string {
  if (offer.state === 'ended') return words.t('sb_n_products', { n: offer.products });
  return offer.cut.kind === 'percent'
    ? words.t('of_line_percent', { cut: offer.cut.amount, n: offer.products })
    : words.t('of_line_taka', { cut: money(offer.cut.amount), n: offer.products });
}

export const generateMetadata = withBusyMetadata(async ({ params }: Props): Promise<Metadata> => {
  const { slug } = await params;
  const page = await loadShopPage();
  if (page.state !== 'open' || !page.shop.storefrontEnabled) return {};
  const offer = await storefrontApi.offer(page.shop, page.shopper, slugOfSegment(slug));
  if (!offer) return {};
  return {
    metadataBase: new URL(page.shop.publicOrigin),
    title: `${offer.name} · ${page.info.name}`,
    description: lineOf(offer, page.words),
  };
});

export default withBusyPage(async function OfferPage({ params, searchParams }: Props) {
  const [{ slug: segment }, query] = await Promise.all([params, searchParams]);
  const slug = slugOfSegment(segment);
  const page = await loadShopPage();
  if (page.state === 'closed') return <OfflinePage words={page.words} />;
  if (page.state === 'missing' || !page.shop.storefrontEnabled) notFound();
  const offer = await storefrontApi.offer(page.shop, page.shopper, slug);
  if (!offer) notFound();
  const listed = listParams(query, 'featured');
  const asked = {
    offer: offer.slug,
    sort: listed.sort,
    inStock: listed.inStock,
    designs: spreadsDesigns(page.info),
  };
  const [frame, list] = await Promise.all([
    loadFrame(page),
    storefrontApi.products(page.shop, page.shopper, asked),
  ]);
  const { words } = page;
  const ended = offer.state === 'ended';
  return (
    <ShopShell page={page} frame={frame} back="/offers" title={offer.name}>
      <EdgeMark page={page} listing products={list?.products ?? []} />
      <ListView
        words={words}
        heading={
          <div className="of-head">
            <span className="of-pill">{words.t('of_pill')}</span>
            <h1 className="pt">{offer.name}</h1>
            <div className="sub">{lineOf(offer, words)}</div>
            {ended ? (
              <div className="of-ended" role="status">
                <b>{words.t('of_ended')}</b>
                <span>{words.t('of_ended_line')}</span>
                <a href="/offers">{words.t('of_on_sale_now')} →</a>
              </div>
            ) : null}
          </div>
        }
        chips={null}
        path={offerPath(offer.slug)}
        params={listed}
        fallback="featured"
        sortable
        page={list ?? { products: [], nextCursor: null }}
        query={asked}
        theme={pageTheme(page.info)}
      />
    </ShopShell>
  );
});
