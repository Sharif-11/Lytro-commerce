import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PaymentReturnView } from '@/components/order/payment-return-view';
import { PlacedView } from '@/components/order/placed-view';
import { OfflinePage } from '@/components/pages';
import { Header, Shell } from '@/components/shell';
import { paymentStandingOf } from '@/lib/order/payment-return';
import { loadShopPage, shopperToken, storefrontApi } from '@/lib/storefront';

// ORD-02, SFT-06 (`confirm-cod`): the confirmation a checkout leads to, in the minimal frame it is drawn in. The landing
// page shows the same confirmation in place (LND-10).
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pay?: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const page = await loadShopPage();
  if (page.state !== 'open') return {};
  return {
    metadataBase: new URL(page.shop.publicOrigin),
    title: `${page.words.t('cf_h')} · ${page.info.name}`,
    robots: { index: false, follow: false },
  };
}

export default async function OrderPlacedPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { pay } = await searchParams;
  const page = await loadShopPage();
  if (page.state === 'closed') return <OfflinePage words={page.words} />;
  if (page.state === 'missing') notFound();
  const read = await storefrontApi.track(page.shop, page.shopper, decodeURIComponent(id));
  if (read.kind !== 'found') notFound();
  const language = page.words.language;
  const signedIn = (await shopperToken()) !== null;
  // PAY-08, PAY-11: an order that owed an advance says where that stands, from the order itself.
  const standing = paymentStandingOf(read.order);
  return (
    <Shell
      brand={page.info.brand}
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
}
