import { headers } from 'next/headers';
import { GonePage, NothingHerePage, OfflinePage } from '@/components/pages';
import { loadShopPage } from '@/lib/storefront';
import { STOREFRONT_PATH_HEADER } from '@/lib/request-path';

// What a path that leads nowhere shows, answered 404. A product or landing link of an open shop shows the branded
// "no longer available" page (LND-03); a switched-off storefront's other paths (SFT-16) and a host with no shop show
// "nothing here"; a closed shop shows its offline page wherever it is asked (SFT-12).
export default async function NotFound() {
  const page = await loadShopPage();
  if (page.state === 'closed') return <OfflinePage words={page.words} />;
  if (page.state === 'missing') return <NothingHerePage words={page.words} />;
  const path = (await headers()).get(STOREFRONT_PATH_HEADER) ?? '';
  const productLink =
    path.startsWith('/l/') || (path.startsWith('/p/') && page.shop.storefrontEnabled);
  if (!productLink && !page.shop.storefrontEnabled) return <NothingHerePage words={page.words} />;
  return (
    <GonePage words={page.words} shop={page.info} storefrontOn={page.shop.storefrontEnabled} />
  );
}
