import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PlacedView } from '@/components/order/placed-view';
import { OfflinePage } from '@/components/pages';
import { Header, Shell } from '@/components/shell';
import { loadShopPage, shopperToken, storefrontApi } from '@/lib/storefront';

// ORD-02, SFT-06 (`confirm-cod`): the confirmation a checkout leads to, in the minimal frame it is drawn in. The landing
// page shows the same confirmation in place (LND-10).
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
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

export default async function OrderPlacedPage({ params }: Props) {
  const { id } = await params;
  const page = await loadShopPage();
  if (page.state === 'closed') return <OfflinePage words={page.words} />;
  if (page.state === 'missing') notFound();
  const read = await storefrontApi.track(page.shop, page.shopper, decodeURIComponent(id));
  if (read.kind !== 'found') notFound();
  const language = page.words.language;
  const signedIn = (await shopperToken()) !== null;
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
      <PlacedView
        language={language}
        orderNumber={read.order.orderNumber}
        trackingId={read.order.trackingId}
        codAmount={read.order.codAmount}
        offerAccount={page.shop.storefrontEnabled && !signedIn}
      />
    </Shell>
  );
}
