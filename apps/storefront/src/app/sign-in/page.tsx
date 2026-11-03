import type { Metadata } from 'next';
import { SignInView } from '@/components/account/sign-in-view';
import { OfflinePage } from '@/components/pages';
import { ShopShell } from '@/components/shop-shell';
import { signInPage } from '@/lib/account/account-page';
import { safeNext } from '@/lib/account/shopper-cookie';
import { loadFrame, loadShopPage } from '@/lib/storefront';

// CUS-03 (`account-signin`): phone and password.
export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ next?: string | string[] }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const page = await loadShopPage();
  if (page.state !== 'open') return {};
  return {
    metadataBase: new URL(page.shop.publicOrigin),
    title: `${page.words.t('ac_signin')} · ${page.info.name}`,
    robots: { index: false, follow: false },
  };
}

export default async function SignInPage({ searchParams }: Props) {
  const next = safeNext((await searchParams).next);
  const opened = await signInPage(next);
  if ('closed' in opened) return <OfflinePage words={opened.words} />;
  const { page } = opened;
  const frame = await loadFrame(page);
  return (
    <ShopShell page={page} frame={frame} back="/" title={page.words.t('ac_signin')} tight>
      <SignInView language={page.words.language} next={next} shopPhone={page.info.contact.phone} />
    </ShopShell>
  );
}
