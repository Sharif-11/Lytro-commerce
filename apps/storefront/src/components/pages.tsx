import type { PublicBrand } from '@/lib/api/storefront-api';
import type { Words } from '@/lib/i18n/words';
import { ReloadButton } from './reload-button';
import type { ShopFace } from './shell';
import { BarePage, Logo, UnknownMark } from './shell';

// The prototype's bare pages (offline, store-off, landing-gone), each for the case the server named.

/** SFT-12, LIF-07: a closed shop's every page. It names no shop, since a closed shop is shown to nobody. */
export function OfflinePage({ words }: { words: Words }) {
  return (
    <BarePage
      language={words.language}
      mark={null}
      title={words.t('off_h')}
      text={words.t('off_p')}
    />
  );
}

/** No shop at this host, or a path its switched-off storefront no longer serves (SFT-16). */
export function NothingHerePage({ words }: { words: Words }) {
  return (
    <BarePage
      language={words.language}
      mark={<UnknownMark />}
      title={words.t('nf_h')}
      text={words.t('nf_p')}
    />
  );
}

/** LND-03: a product link that leads nowhere now, in the shop's own colours, with a way into the shop while its
    storefront is on. */
export function GonePage({
  words,
  shop,
  storefrontOn,
}: {
  words: Words;
  shop: ShopFace & { brand: PublicBrand | null };
  storefrontOn: boolean;
}) {
  return (
    <BarePage
      language={words.language}
      brand={shop.brand}
      mark={<Logo shop={shop} />}
      title={words.t('gone_h')}
      text={words.t('gone_p')}
      action={
        storefrontOn ? (
          <a className="btn primary" href="/">
            {words.t('go_shop')}
          </a>
        ) : null
      }
    />
  );
}

/** CCH-10 (Slice 12c, `offline-unsaved`): what the installed storefront shows, offline, for a page this phone never
    saved -- kept by the service worker when it is installed, in the shop's own colours. */
export function OfflineUnsavedPage({
  words,
  shop,
}: {
  words: Words;
  shop: ShopFace & { brand: PublicBrand | null };
}) {
  return (
    <BarePage
      language={words.language}
      brand={shop.brand}
      mark={<Logo shop={shop} />}
      title={words.t('nosave_h')}
      text={words.t('nosave_p')}
      action={<ReloadButton label={words.t('nosave_btn')} />}
    />
  );
}
