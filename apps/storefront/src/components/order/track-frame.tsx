import type { ReactNode } from 'react';
import { loadFrame, type OpenShopPage, type PageFrame } from '@/lib/storefront';
import { Footer, Header, Shell } from '../shell';
import { ShopShell } from '../shop-shell';

/** The storefront's frame for tracking, or null while the storefront is off; read by the page itself, so a server too
    busy for it shows the busy page (Slice 9.10). */
export function loadTrackFrame(page: OpenShopPage): Promise<PageFrame | null> {
  // PYG-23: while the storefront is paused, tracking shows in the landing page's frame: the shop's categories aren't served.
  return page.shop.storefrontEnabled && page.info.paused !== true
    ? loadFrame(page)
    : Promise.resolve(null);
}

/** ORD-17, LND-11, LND-02: tracking in the storefront's frame, or, while the storefront is off, the landing page's: a
    landing page's confirmation leads here, and a landing page keeps working with the storefront off. */
export function TrackFrame({
  page,
  frame,
  children,
}: {
  page: OpenShopPage;
  frame: PageFrame | null;
  children: ReactNode;
}) {
  const { words } = page;
  if (frame !== null) {
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
