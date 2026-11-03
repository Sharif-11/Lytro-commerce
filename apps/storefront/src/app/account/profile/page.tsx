import type { Metadata } from 'next';
import { AccountHead } from '@/components/account/account-parts';
import { ProfileView } from '@/components/account/profile-view';
import { OfflinePage } from '@/components/pages';
import { ShopShell } from '@/components/shop-shell';
import { accountPage } from '@/lib/account/account-page';
import { loadFrame, loadShopPage } from '@/lib/storefront';

// CUS-05 (`e48-profile`): the shopper's name, phone and password.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const page = await loadShopPage();
  if (page.state !== 'open') return {};
  return {
    metadataBase: new URL(page.shop.publicOrigin),
    title: `${page.words.t('e48Profile')} · ${page.info.name}`,
    robots: { index: false, follow: false },
  };
}

export default async function AccountProfilePage() {
  const opened = await accountPage('/account/profile');
  if ('closed' in opened) return <OfflinePage words={opened.words} />;
  const { page, shopper } = opened;
  const frame = await loadFrame(page);
  const language = page.words.language;
  return (
    <ShopShell page={page} frame={frame} back="/" title={page.words.t('account')}>
      <AccountHead language={language} name={shopper.name} phone={shopper.phone} tab="profile" />
      <ProfileView language={language} name={shopper.name} phone={shopper.phone} />
    </ShopShell>
  );
}
