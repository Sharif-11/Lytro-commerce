import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CheckoutView } from '@/components/order/checkout-view';
import { OfflinePage } from '@/components/pages';
import { Footer, Header, Shell } from '@/components/shell';
import { loadAddresses, loadFrame, loadShopper, loadShopPage } from '@/lib/storefront';

// SFT-06 (`checkout`, Slice 4.8e): one page, guest, cash on delivery. The cart lives in the browser, so the page is the
// browser's; never kept by any cache (CCH-07).
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const page = await loadShopPage();
  if (page.state !== 'open' || !page.shop.storefrontEnabled) return {};
  return {
    metadataBase: new URL(page.shop.publicOrigin),
    title: `${page.words.t('co_title')} · ${page.info.name}`,
    robots: { index: false, follow: false },
  };
}

export default async function CheckoutPage() {
  const page = await loadShopPage();
  if (page.state === 'closed') return <OfflinePage words={page.words} />;
  // SFT-16: a switched-off storefront answers its paths with not-found.
  if (page.state === 'missing' || !page.shop.storefrontEnabled) notFound();
  const [frame, signedIn] = await Promise.all([loadFrame(page), loadShopper()]);
  const addresses = signedIn === null ? [] : await loadAddresses(page);
  const language = page.words.language;
  return (
    <Shell
      brand={page.info.brand}
      language={language}
      tight
      header={
        <Header
          shop={page.info}
          language={language}
          variant="back"
          title={page.words.t('co_title')}
          backHref="/cart"
          nav={{
            categories: frame.categories,
            shopPhone: page.info.contact.phone,
            areaId: frame.areaId,
          }}
        />
      }
      footer={<Footer shop={page.info} language={language} landing={false} storefrontOn />}
    >
      <CheckoutView
        language={language}
        shopPhone={page.info.contact.phone}
        areaId={frame.areaId}
        shopper={signedIn}
        addresses={addresses}
      />
    </Shell>
  );
}
