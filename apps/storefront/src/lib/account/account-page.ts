import { notFound, redirect } from 'next/navigation';
import type { ShopperView } from '../api/storefront-api';
import { loadShopper, loadShopPage, type OpenShopPage } from '../storefront';

/** An account page's first read: the shop, then who is signed in, leading anyone else to Sign in and back here. A shop
    switched off has no account (SFT-16); a closed one says so, for its offline page. */
export async function accountPage(
  path: string,
): Promise<
  { page: OpenShopPage; shopper: ShopperView } | { closed: true; words: OpenShopPage['words'] }
> {
  const page = await loadShopPage();
  if (page.state === 'closed') return { closed: true, words: page.words };
  if (page.state === 'missing' || !page.shop.storefrontEnabled) notFound();
  const shopper = await loadShopper();
  if (shopper === null) redirect(`/sign-in?next=${encodeURIComponent(path)}`);
  return { page, shopper };
}

/** A sign-in or sign-up page's first read: the open shop, and someone already signed in leads on. */
export async function signInPage(
  next: string,
): Promise<{ page: OpenShopPage } | { closed: true; words: OpenShopPage['words'] }> {
  const page = await loadShopPage();
  if (page.state === 'closed') return { closed: true, words: page.words };
  if (page.state === 'missing' || !page.shop.storefrontEnabled) notFound();
  if ((await loadShopper()) !== null) redirect(next);
  return { page };
}
