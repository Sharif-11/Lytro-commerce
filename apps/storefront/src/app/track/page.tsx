import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { TrackFrame } from '@/components/order/track-frame';
import { TrackingStart } from '@/components/order/tracking-view';
import { OfflinePage } from '@/components/pages';
import { loadShopPage } from '@/lib/storefront';

// ORD-17, SFT-08 (`e48-tracking-start`): the place to look an order up, and where the search box sends its ID.
export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ id?: string | string[] }>;
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

export default async function TrackPage({ searchParams }: Props) {
  const { id } = await searchParams;
  const page = await loadShopPage();
  if (page.state === 'closed') return <OfflinePage words={page.words} />;
  if (page.state === 'missing') notFound();
  const typed = typeof id === 'string' ? id.trim() : '';
  if (typed !== '') redirect(`/track/${encodeURIComponent(typed.toUpperCase())}`);
  return (
    <TrackFrame page={page}>
      <TrackingStart words={page.words} />
    </TrackFrame>
  );
}
