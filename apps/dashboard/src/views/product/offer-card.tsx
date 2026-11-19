import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { OfferState } from '@lytronix/validators';
import { StatusTag } from '@/components/ui/status-tag';
import { useShell } from '@/shell/shell-context';
import type { ProductDetail } from '@/types/product';

/**
 * OFFERS-PLAN OF-17 (the sketch's `of-product`): each offer not ended that holds the product -- its name and state,
 * the designs it holds with their struck-through and offer prices, why their prices are locked, and the way to it.
 */
export function OfferCards({ product }: { product: ProductDetail }): React.JSX.Element | null {
  const { t } = useTranslation('shop');
  const { slug } = useShell();
  if (product.offers.length === 0) return null;
  return (
    <>
      {product.offers.map((offer) => {
        const running = offer.state === OfferState.Running;
        const designs = offer.designIds
          ? product.designs.filter((design) => offer.designIds?.includes(design.id))
          : [];
        return (
          <div
            key={offer.offerId}
            className="flex flex-col gap-2.5 rounded-card border border-accent-300 bg-accent-soft/40 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-[17px] font-semibold">
                {offer.name}
                <StatusTag tone={running ? 'ok' : 'neutral'}>
                  {running ? t('of.running') : t('of.waiting')}
                </StatusTag>
              </h3>
              <Link
                to="/$shop/offers/$offerId"
                params={{ shop: slug, offerId: offer.offerId }}
                className="font-semibold text-primary"
              >
                {t('of.openOffer')}
              </Link>
            </div>
            {running && designs.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {designs.map((design) => {
                  const sizes = product.variants.filter((variant) =>
                    variant.optionIds.includes(design.id),
                  );
                  const first = sizes[0];
                  return (
                    <span
                      key={design.id}
                      className="num inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[14px] font-medium"
                    >
                      {design.name}
                      {first?.effectiveRegularPrice ? (
                        <s className="text-fg-muted">{formatTaka(first.effectiveRegularPrice)}</s>
                      ) : null}
                      {first ? formatTaka(first.effectivePrice) : null}
                    </span>
                  );
                })}
              </div>
            ) : null}
            <p className="text-[14px] text-fg-muted">
              {!running
                ? t('of.cardWaiting')
                : offer.designIds
                  ? t('of.cardDesigns')
                  : t('of.cardWhole')}
            </p>
          </div>
        );
      })}
    </>
  );
}
