import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { withBusyMetadata, withBusyPage } from '@/components/busy-page';
import { PaymentReturnView } from '@/components/order/payment-return-view';
import { PlacedView } from '@/components/order/placed-view';
import { OfflinePage } from '@/components/pages';
import { Header, Shell } from '@/components/shell';
import { frameBrand } from '@/lib/design/design-look';
import { ShopBusy } from '@/lib/api/storefront-api';
import { paymentStandingOf } from '@/lib/order/payment-return';
import { loadShopPage, shopperToken, storefrontApi } from '@/lib/storefront';

// ORD-02, SFT-06 (`confirm-cod`): the confirmation a checkout leads to, in the minimal frame it is drawn in. The landing
// page shows the same confirmation in place (LND-10).
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pay?: string }>;
}

export const generateMetadata = withBusyMetadata(async (): Promise<Metadata> => {
  const page = await loadShopPage();
  if (page.state !== 'open') return {};
  return {
    metadataBase: new URL(page.shop.publicOrigin),
    title: `${page.words.t('cf_h')} · ${page.info.name}`,
    robots: { index: false, follow: false },
  };
});

export default withBusyPage(async function OrderPlacedPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { pay } = await searchParams;
  const page = await loadShopPage();
  if (page.state === 'closed') return <OfflinePage words={page.words} />;
  if (page.state === 'missing') notFound();
  const read = await storefrontApi.track(page.shop, page.shopper, decodeURIComponent(id));
  // Too many looks just now is a wait, not an order that is gone (Slice 9.10): the busy page, not not-found.
  if (read.kind === 'busy') throw new ShopBusy(429, read.retryAfter, 'the order');
  if (read.kind !== 'found') notFound();
  const language = page.words.language;
  const signedIn = (await shopperToken()) !== null;
  // PAY-08, PAY-11: an order that owed an advance says where that stands, from the order itself.
  const standing = paymentStandingOf(read.order);
  return (
    <Shell
      // SB-17: the theme's colours and fonts under the confirmation's own short header.
      brand={frameBrand(page.info)}
      language={language}
      tight
      header={
        <Header
          shop={page.info}
          language={language}
          variant="minimal"
          homeLink={page.shop.storefrontEnabled}
        />
      }
      footer={null}
    >
      {standing ? (
        <PaymentReturnView
          language={language}
          order={read.order}
          standing={standing}
          rejected={pay === 'failed'}
          shopPhone={page.info.contact.phone}
          storefrontOn={page.shop.storefrontEnabled}
        />
      ) : (
        <PlacedView
          language={language}
          orderNumber={read.order.orderNumber}
          trackingId={read.order.trackingId}
          codAmount={read.order.codAmount}
          items={read.order.items}
          offerAccount={page.shop.storefrontEnabled && !signedIn}
        />
      )}
    </Shell>
  );
});
