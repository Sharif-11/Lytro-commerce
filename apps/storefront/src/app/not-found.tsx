import { headers } from 'next/headers';
import { withBusyPage } from '@/components/busy-page';
import {
  EmptyBox,
  EmptyFrame,
  MoreProducts,
  ShopContacts,
} from '@/components/catalogue/empty-state';
import { GonePage, NothingHerePage, OfflinePage } from '@/components/pages';
import { ShopShell } from '@/components/shop-shell';
import { emptyNext } from '@/lib/catalogue/empty';
import { pageTheme } from '@/lib/design/design-look';
import { loadFrame, loadShopPage, type OpenShopPage } from '@/lib/storefront';
import { STOREFRONT_PATH_HEADER } from '@/lib/request-path';

// What a path that leads nowhere shows, answered 404. An open shop's says its product is gone (LND-03): in the shop's
// own frame with more of its products while its storefront is on (SB-33, em-product-gone); alone for a landing link
// while it is off. A switched-off storefront's other paths (SFT-16) and a host with no shop show "nothing here"; a
// closed shop shows its offline page wherever it is asked (SFT-12).
export default withBusyPage(async function NotFound() {
  const page = await loadShopPage();
  if (page.state === 'closed') return <OfflinePage words={page.words} />;
  if (page.state === 'missing') return <NothingHerePage words={page.words} />;
  if (!page.shop.storefrontEnabled) {
    const path = (await headers()).get(STOREFRONT_PATH_HEADER) ?? '';
    if (!path.startsWith('/l/')) return <NothingHerePage words={page.words} />;
    return <GonePage words={page.words} shop={page.info} />;
  }
  return <GoneInShop page={page} />;
});

/** SB-33 (em-product-gone): the shop's header, one line, a few more of its products and "See all products". */
async function GoneInShop({ page }: { page: OpenShopPage }) {
  const [frame, next] = await Promise.all([loadFrame(page), emptyNext(page, null, false)]);
  const { words } = page;
  const theme = pageTheme(page.info);
  return (
    <ShopShell page={page} frame={frame} back="/" title={words.t('gone_h')}>
      <EmptyFrame theme={theme}>
        <EmptyBox icon="bag" title={words.t('gone_h')} text={words.t('em_gone_p')} main>
          {next?.kind === 'bare' ? <ShopContacts shop={page.info} words={words} /> : null}
        </EmptyBox>
        {next?.kind === 'more' ? (
          <MoreProducts
            theme={theme}
            title={words.t('em_more_shop')}
            products={next.products}
            words={words}
            now={Date.now()}
          />
        ) : null}
      </EmptyFrame>
    </ShopShell>
  );
}
