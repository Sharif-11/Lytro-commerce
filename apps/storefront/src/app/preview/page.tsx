import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { withBusyPage } from '@/components/busy-page';
import { EdgeMark } from '@/components/edge-mark';
import { HomeView, loadHome } from '@/components/home/home-view';
import { Icon } from '@/components/icon';
import { OfflinePage } from '@/components/pages';
import { BarePage } from '@/components/shell';
import { frameBrand, triedTheme } from '@/lib/design/design-look';
import { loadShopPage, storefrontApi } from '@/lib/storefront';

// STOREFRONT-BUILDER-PLAN SB-12: the home page drawn from the shop's draft design, through the short-lived signed link
// the editor makes (`/preview?t=<token>`). Its own address, so Cloudflare, which keys the home without its query, never
// answers it with the live home; never kept anywhere (the middleware's `no-store`, a private edge mark, the service
// worker leaves it); never indexed. A link that has ended, been changed or names another shop says so. The theme gallery
// adds `theme=<key>` to show a theme over the draft before the seller chooses it.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default withBusyPage(async function PreviewPage({ searchParams }: Props) {
  const query = await searchParams;
  const token = query['t'];
  const page = await loadShopPage();
  if (page.state === 'closed') return <OfflinePage words={page.words} />;
  if (page.state === 'missing' || !page.shop.storefrontEnabled) notFound();
  const { words } = page;
  const info =
    typeof token === 'string' && token.length > 0
      ? await storefrontApi.shopPreview(page.shop, page.shopper, token)
      : null;
  if (!info?.design) {
    return (
      <BarePage
        language={words.language}
        brand={frameBrand(page.info)}
        mark={<Icon name="clock" />}
        title={words.t('sb_preview_ended_h')}
        text={words.t('sb_preview_ended')}
      />
    );
  }
  const preview = { ...page, info: triedTheme(info, query['theme']) };
  const home = await loadHome(preview);
  return (
    <>
      <EdgeMark page={preview} keepPrivate />
      <HomeView
        page={preview}
        home={home}
        notice={
          <div className="banner info preview" role="status">
            <Icon name="info" />
            <span>{words.t('sb_preview_bar')}</span>
          </div>
        }
      />
    </>
  );
});
