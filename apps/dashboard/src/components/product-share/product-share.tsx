import { useId, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTakaExact } from '@lytronix/ui';
import { useMarkLinkShared } from '@/api/home';
import { useProduct } from '@/api/products';
import { Icon } from '@/components/icon';
import { LinkShare } from '@/components/link-share';
import { Button } from '@/components/ui/button';
import { buttonClass } from '@/components/ui/classes';
import { Sheet } from '@/components/ui/sheet';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { useShopAddress } from '@/hooks/use-shop-address';
import { designLinkOf } from '@/lib/product-link';
import { useShell } from '@/shell/shell-context';
import type { ProductDetail } from '@/types/product';

/** A design's cover: the first of its photos, as the storefront's design cards show it. */
function coverOf(product: ProductDetail, photoIds: readonly string[]): string | null {
  const first = photoIds[0];
  return product.images.find((image) => image.id === first)?.urls.thumbnail ?? null;
}

/**
 * A product's link to share (TENANT-DASHBOARD-DESIGN §7.4c, the sketch's `pl-share-sheet`; the owner, 2026-11-25:
 * "the product card in product list need the sharable link also"): the product, its landing link on the shop's own
 * address (LND-06), Copy (Copied for 1.6 s and a toast), Share (the phone's own share, else WhatsApp, Facebook and
 * Messenger) and See the page; on a product with photo designs, the link opening with one of them chosen (`?d=`, DC-3),
 * the whole product by default; then the shop's own link, as Home's card has it. A pay-as-you-go shop not open yet is
 * told when the link opens. A copy or share ticks the set-up checklist's "link shared" (SUP-01), as Home's card does.
 * Quick add's save sheet (`pq-saved`) is the same body with its own heading and buttons.
 */
export function ProductShareBody({ product }: { product: ProductDetail }): React.JSX.Element {
  const { t } = useTranslation('shop');
  // Home's link card's own words for the shop's link (one definition).
  const { t: home } = useTranslation('home');
  const { t: shell } = useTranslation('shell');
  const { host, url: shopUrl } = useShopAddress();
  const { slug, tenant, showToast } = useShell();
  const shared = useMarkLinkShared();
  const { copied, copy } = useCopyToClipboard(1600);
  const [designId, setDesignId] = useState<string | null>(null);
  const designsHeading = useId();
  const shopHeading = useId();
  const markShared = (): void => {
    shared.mutate();
  };
  const shown = designLinkOf(host, product, designId);
  const url = `https://${shown}`;
  const design = product.designs.find((each) => each.id === designId) ?? null;
  const cover = design
    ? coverOf(product, design.photoIds)
    : (product.images[0]?.urls.thumbnail ?? null);
  const paused = tenant.fairUse?.on === true && tenant.fairUse.paused;
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const fallback = [
    { name: shell('whatsapp'), href: `https://wa.me/?text=${encodeURIComponent(url)}` },
    {
      name: shell('facebook'),
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    },
    { name: t('psMessenger'), href: `fb-messenger://share/?link=${encodeURIComponent(url)}` },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {cover ? (
          <img src={cover} alt="" className="size-16 flex-none rounded-[10px] object-cover" />
        ) : (
          <span className="grid size-16 flex-none place-items-center rounded-[10px] bg-neutral-100 text-neutral-400">
            <Icon name="image" />
          </span>
        )}
        <span className="flex min-w-0 flex-col gap-0.5">
          <b className="truncate text-[16px] font-semibold">{product.name}</b>
          <span className="num text-[15px] text-fg-muted">
            {formatTakaExact(product.basePrice)}
          </span>
        </span>
      </div>
      <p className="text-[14px] text-fg-muted">{t('psLead')}</p>
      <div
        className="flex h-12 items-center rounded-control border border-line-strong bg-surface px-3 text-[16px]"
        data-testid="share-link"
      >
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
          {shown}
        </span>
      </div>
      {paused ? (
        <div className="flex flex-wrap items-start gap-2 rounded-[10px] bg-warning-soft px-3 py-2.5 text-[14px] text-fg-muted">
          <span className="mt-0.5 flex-none text-warning">
            <Icon name="clock" size={16} />
          </span>
          <span className="min-w-[180px] flex-1">
            {t('psPaused', { amount: tenant.fairUse?.activationTopUp ?? 10 })}
          </span>
          <Link
            to="/$shop/balance"
            params={{ shop: slug }}
            search={{ topup: 1, amount: tenant.fairUse?.activationTopUp ?? 10 }}
            className="font-semibold whitespace-nowrap text-primary"
          >
            {t('psActivate')}
          </Link>
        </div>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-3">
        <Button
          tone="primary"
          onClick={() => {
            void copy(url).then((ok) => {
              if (!ok) return;
              showToast(t('psCopiedToast'));
              markShared();
            });
          }}
        >
          <Icon name={copied ? 'check' : 'copy'} />
          {copied ? t('psCopied') : t('psCopy')}
        </Button>
        {canShare ? (
          <Button
            tone="outline"
            onClick={() => {
              void navigator
                .share({ title: product.name, url })
                .then(markShared)
                .catch(() => undefined);
            }}
          >
            <Icon name="share" />
            {t('psShare')}
          </Button>
        ) : null}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={`${buttonClass('outline', 'md')} justify-center no-underline`}
        >
          <Icon name="external" />
          {t('psSee')}
        </a>
      </div>
      {canShare ? null : (
        <div className="flex flex-wrap gap-2">
          {fallback.map((each) => (
            <a
              key={each.name}
              href={each.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={markShared}
              className={`${buttonClass('outline', 'sm')} no-underline`}
            >
              <Icon name="share" />
              {each.name}
            </a>
          ))}
        </div>
      )}
      {product.designs.length > 1 ? (
        <section
          aria-labelledby={designsHeading}
          className="flex flex-col gap-1.5 border-t border-line pt-3"
        >
          <h3 id={designsHeading} className="text-[15px] font-semibold">
            {t('psDesigns')}
          </h3>
          <p className="text-[14px] text-fg-muted">{t('psDesignsHint')}</p>
          <div className="flex items-center gap-2 overflow-x-auto p-0.5" role="radiogroup">
            <button
              type="button"
              role="radio"
              aria-checked={designId === null}
              onClick={() => {
                setDesignId(null);
              }}
              className={`h-14 flex-none rounded-[10px] px-3.5 text-[14px] font-medium ${
                designId === null
                  ? 'border-2 border-primary bg-primary-soft text-primary'
                  : 'border border-line-strong bg-surface'
              }`}
            >
              {t('psWhole')}
            </button>
            {product.designs.map((each) => {
              const image = coverOf(product, each.photoIds);
              const on = designId === each.id;
              return (
                <button
                  key={each.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={each.name || t('psDesignN', { n: each.number })}
                  onClick={() => {
                    setDesignId(each.id);
                  }}
                  className={`relative size-14 flex-none overflow-hidden rounded-[10px] border-2 bg-neutral-100 p-0 ${
                    on ? 'border-primary' : 'border-transparent'
                  }`}
                >
                  {image ? <img src={image} alt="" className="size-full object-cover" /> : null}
                  {on ? (
                    <span className="absolute top-[3px] right-[3px] grid size-5 place-items-center rounded-full bg-primary text-white">
                      <Icon name="check" size={14} />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
      <section aria-labelledby={shopHeading} className="border-t border-line pt-3">
        <h3 id={shopHeading} className="text-[15px] font-semibold">
          {home('shopLink')}
        </h3>
        <p className="text-[14px] text-fg-muted">{t('psShopHint')}</p>
        <LinkShare url={shopUrl} shown={host} onShared={markShared} />
      </section>
    </div>
  );
}

/** The share sheet a product row and the product page open: the product read by its id while the sheet is open. */
export function ProductShareSheet({
  productId,
  onClose,
}: {
  productId: string | null;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const { t: shell } = useTranslation('shell');
  const product = useProduct(productId);
  return (
    <Sheet open={productId !== null} title={t('psTitle')} onClose={onClose}>
      {product.data ? (
        <ProductShareBody product={product.data} />
      ) : (
        <p className="text-[15px] text-fg-muted">{shell('loading')}</p>
      )}
    </Sheet>
  );
}
