import type { Metadata } from 'next';
import { SignUpView } from '@/components/account/sign-up-view';
import { OfflinePage } from '@/components/pages';
import { ShopShell } from '@/components/shop-shell';
import { signInPage } from '@/lib/account/account-page';
import { safeNext } from '@/lib/account/shopper-cookie';
import { loadFrame, loadShopPage } from '@/lib/storefront';

// CUS-03, CUS-04, CUS-07 (`e48-signup`): a code once, then a name and a password.
export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ next?: string | string[] }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const page = await loadShopPage();
  if (page.state !== 'open') return {};
  return {
    metadataBase: new URL(page.shop.publicOrigin),
    title: `${page.words.t('e48SignUp')} · ${page.info.name}`,
    robots: { index: false, follow: false },
  };
}

export default async function SignUpPage({ searchParams }: Props) {
  const next = safeNext((await searchParams).next);
  const opened = await signInPage(next);
  if ('closed' in opened) return <OfflinePage words={opened.words} />;
  const { page } = opened;
  const frame = await loadFrame(page);
  return (
    <ShopShell page={page} frame={frame} back="/sign-in" title={page.words.t('e48SignUp')} tight>
      <SignUpView language={page.words.language} next={next} shopPhone={page.info.contact.phone} />
    </ShopShell>
  );
}
