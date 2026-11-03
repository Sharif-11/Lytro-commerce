import type { Metadata } from 'next';
import { AccountHead } from '@/components/account/account-parts';
import { AddressesView } from '@/components/account/addresses-view';
import { OfflinePage } from '@/components/pages';
import { ShopShell } from '@/components/shop-shell';
import { accountPage } from '@/lib/account/account-page';
import { loadAddresses, loadFrame, loadShopPage } from '@/lib/storefront';

// CUS-06 (`account-addresses`): the shopper's saved addresses.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const page = await loadShopPage();
  if (page.state !== 'open') return {};
  return {
    metadataBase: new URL(page.shop.publicOrigin),
    title: `${page.words.t('ac_addresses')} · ${page.info.name}`,
    robots: { index: false, follow: false },
  };
}

export default async function AccountAddressesPage() {
  const opened = await accountPage('/account/addresses');
  if ('closed' in opened) return <OfflinePage words={opened.words} />;
  const { page, shopper } = opened;
  const [frame, addresses] = await Promise.all([loadFrame(page), loadAddresses(page)]);
  const language = page.words.language;
  return (
    <ShopShell page={page} frame={frame} back="/" title={page.words.t('account')}>
      <AccountHead language={language} name={shopper.name} phone={shopper.phone} tab="addresses" />
      <AddressesView language={language} first={addresses} />
    </ShopShell>
  );
}
