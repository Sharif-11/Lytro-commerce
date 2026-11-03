import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TrackFrame } from '@/components/order/track-frame';
import { TrackingRefused, TrackingView } from '@/components/order/tracking-view';
import { OfflinePage } from '@/components/pages';
import { loadShopPage, storefrontApi } from '@/lib/storefront';

// ORD-17, SFT-08: an order at a stable address for its tracking ID. Read fresh on every request and kept by no shared
// cache; it never holds the customer's address or phone.
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const page = await loadShopPage();
  if (page.state !== 'open') return {};
  return {
    metadataBase: new URL(page.shop.publicOrigin),
    title: `${page.words.t('tr_title')} · ${page.info.name}`,
    robots: { index: false, follow: false },
  };
}

export default async function TrackedOrderPage({ params }: Props) {
  const { id } = await params;
  const page = await loadShopPage();
  if (page.state === 'closed') return <OfflinePage words={page.words} />;
  if (page.state === 'missing') notFound();
  const trackingId = decodeURIComponent(id).toUpperCase();
  const read = await storefrontApi.track(page.shop, page.shopper, trackingId);
  return (
    <TrackFrame page={page}>
      {read.kind === 'found' ? (
        <TrackingView order={read.order} words={page.words} />
      ) : (
        <TrackingRefused trackingId={trackingId} busy={read.kind === 'busy'} words={page.words} />
      )}
    </TrackFrame>
  );
}
