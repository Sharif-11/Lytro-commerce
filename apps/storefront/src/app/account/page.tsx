import type { Metadata } from 'next';
import { AccountHead } from '@/components/account/account-parts';
import { OrdersView } from '@/components/account/orders-view';
import { OfflinePage } from '@/components/pages';
import { ShopShell } from '@/components/shop-shell';
import { accountPage } from '@/lib/account/account-page';
import { loadFrame, loadOrders, loadShopPage } from '@/lib/storefront';

// ORD-18, CUS-05 (`account-orders`): My account: every order with this phone. Signed out, it leads to Sign in.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const page = await loadShopPage();
  if (page.state !== 'open') return {};
  return {
    metadataBase: new URL(page.shop.publicOrigin),
    title: `${page.words.t('account')} · ${page.info.name}`,
    robots: { index: false, follow: false },
  };
}

export default async function AccountPage() {
  const opened = await accountPage('/account');
  if ('closed' in opened) return <OfflinePage words={opened.words} />;
  const { page, shopper } = opened;
  const [frame, first] = await Promise.all([loadFrame(page), loadOrders(page, 1)]);
  const language = page.words.language;
  return (
    <ShopShell page={page} frame={frame} back="/" title={page.words.t('account')}>
      <AccountHead language={language} name={shopper.name} phone={shopper.phone} tab="orders" />
      <OrdersView
        language={language}
        first={first ?? { orders: [], page: 1, limit: 20, total: 0, pages: 0 }}
      />
    </ShopShell>
  );
}
