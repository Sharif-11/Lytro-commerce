import type { ReactNode } from 'react';
import { loadFrame, type OpenShopPage } from '@/lib/storefront';
import { Footer, Header, Shell } from '../shell';
import { ShopShell } from '../shop-shell';

/** ORD-17, LND-11, LND-02: tracking in the storefront's frame, or, while the storefront is off, the landing page's: a
    landing page's confirmation leads here, and a landing page keeps working with the storefront off. */
export async function TrackFrame({ page, children }: { page: OpenShopPage; children: ReactNode }) {
  const { words } = page;
  if (page.shop.storefrontEnabled) {
    const frame = await loadFrame(page);
    return (
      <ShopShell page={page} frame={frame} back="/" title={words.t('tr_title')}>
        {children}
      </ShopShell>
    );
  }
  return (
    <Shell
      brand={page.info.brand}
      language={words.language}
      header={<Header shop={page.info} language={words.language} variant="minimal" />}
      footer={<Footer shop={page.info} language={words.language} landing storefrontOn={false} />}
    >
      {children}
    </Shell>
  );
}
