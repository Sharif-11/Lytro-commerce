import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTakaExact } from '@lytronix/ui';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { buttonClass } from '@/components/ui/classes';
import { Sheet } from '@/components/ui/sheet';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { linkOf } from '@/lib/product-link';
import { useShopAddress } from '@/hooks/use-shop-address';
import { useShell } from '@/shell/shell-context';
import type { ProductDetail } from '@/types/product';

/**
 * After a new product's first save (the owner, 2026-11-25: "after saving a product we want the seller share the
 * product"; the sketch's `pq-saved`): the product with its first photo, name and price, its landing page link (LND-06,
 * the shop's own address as the link card builds it), and Copy, Share and See the page -- then Add another product or
 * Go to the product. A pay-as-you-go shop whose storefront is paused until its activation top-up is told when the link
 * opens, with the top-up. Editing a saved product shows no sheet.
 */
export function SavedSheet({
  product,
  onAnother,
  onProduct,
  onClose,
}: {
  product: ProductDetail | null;
  onAnother: () => void;
  onProduct: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const { host } = useShopAddress();
  const { slug, tenant, showToast } = useShell();
  const { copied, copy } = useCopyToClipboard();
  const shown = product ? linkOf(host, product, null) : '';
  const url = `https://${shown}`;
  const cover = product?.images[0]?.urls.thumbnail;
  const paused = tenant.fairUse?.on === true && tenant.fairUse.paused;
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const fallback = [
    { name: t('qsWhatsapp'), href: `https://wa.me/?text=${encodeURIComponent(url)}` },
    {
      name: t('qsFacebook'),
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    },
    { name: t('qsMessenger'), href: `fb-messenger://share/?link=${encodeURIComponent(url)}` },
  ];
  return (
    <Sheet
      open={product !== null}
      title={t('qsTitle')}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2">
          <Button wide tone="outline" onClick={onAnother}>
            <Icon name="plus" />
            {t('qsAnother')}
          </Button>
          <Button wide tone="ghost" onClick={onProduct}>
            {t('qsToProduct')}
          </Button>
        </div>
      }
    >
      {product ? (
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
          <p className="text-[14px] text-fg-muted">{t('qsLead')}</p>
          <div className="flex h-12 items-center rounded-control border border-line-strong bg-surface px-3 text-[16px]">
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
                {t('qsPaused', { amount: tenant.fairUse?.activationTopUp ?? 10 })}
              </span>
              <Link
                to="/$shop/balance"
                params={{ shop: slug }}
                search={{ topup: 1, amount: tenant.fairUse?.activationTopUp ?? 10 }}
                className="font-semibold whitespace-nowrap text-primary"
              >
                {t('qsActivate')}
              </Link>
            </div>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-3">
            <Button
              tone="primary"
              onClick={() => {
                void copy(url).then((ok) => {
                  if (ok) showToast(t('qsCopiedToast'));
                });
              }}
            >
              <Icon name={copied ? 'check' : 'copy'} />
              {copied ? t('qsCopied') : t('qsCopy')}
            </Button>
            {canShare ? (
              <Button
                tone="outline"
                onClick={() => {
                  void navigator.share({ title: product.name, url }).catch(() => undefined);
                }}
              >
                <Icon name="share" />
                {t('qsShare')}
              </Button>
            ) : null}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={`${buttonClass('outline', 'md')} no-underline`}
            >
              <Icon name="external" />
              {t('qsView')}
            </a>
          </div>
          {canShare ? null : (
            <div className="flex flex-col gap-1.5">
              <span className="text-[14px] font-medium text-fg-muted">{t('qsShare')}</span>
              <div className="flex flex-wrap gap-2">
                {fallback.map((each) => (
                  <a
                    key={each.name}
                    href={each.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${buttonClass('outline', 'sm')} no-underline`}
                  >
                    <Icon name="share" />
                    {each.name}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </Sheet>
  );
}
