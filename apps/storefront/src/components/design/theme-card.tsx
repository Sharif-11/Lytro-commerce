import { cardHref } from '@/lib/design/card-links';
import { ProductCardStyle } from '@lytronix/validators/common';
import type { ProductCard } from '@/lib/api/storefront-api';
import { isNew } from '@/lib/catalogue/browse';
import { money, type Words } from '@/lib/i18n/words';
import { Icon } from '../icon';
import { DesignIcon } from './design-icon';

// STOREFRONT-BUILDER-PLAN SB-10, SB-17, SB-21: the theme's product card, as the sketch draws it, on the designed home
// and on every list (lists in the browser draw it too, so it needs nothing of the server's).

/** A price, struck beside the regular one while it is on sale (SB-21); "from" when its variants differ. */
export function CardPrice({ product, words }: { product: ProductCard; words: Words }) {
  if (product.minPrice === null) return null;
  const ranged = product.maxPrice !== null && product.maxPrice !== product.minPrice;
  const price = money(product.minPrice);
  const regular = product.minRegularPrice ?? null;
  return (
    <span className="sb-pr">
      {ranged ? words.t('from', { p: price }) : price}
      {regular !== null ? <s>{money(regular)}</s> : null}
    </span>
  );
}

/**
 * SB-10: a product card in the theme's style -- its saving, New and Best seller tags, its name and price, "Only N left"
 * or "Ordered N times", and a button to its page (a card can't choose a size or colour, so it never adds to the cart
 * itself). `now` is when the page was made, so the server and the browser agree on New.
 */
export function ThemeCard({
  product,
  style,
  words,
  now,
}: {
  product: ProductCard;
  style: ProductCardStyle;
  words: Words;
  now: number;
}) {
  const saving = product.bestDiscount ?? 0;
  const left = product.left ?? null;
  const ordered = product.ordered ?? 0;
  return (
    <a className={`sb-card sb-${style}`} href={cardHref(product)}>
      <div className="sb-im">
        {product.image ? <img src={product.image.urls.thumbnail} alt="" loading="lazy" /> : null}
        {/* The owner, 2026-11-25: a play mark when the product has a video; the video itself loads on its page. */}
        {product.hasVideo === true ? (
          <span className="sb-vid" role="img" aria-label={words.t('has_video')}>
            <Icon name="play" />
          </span>
        ) : null}
        <div className="sb-tags">
          {saving > 0 ? <span className="sb-tag sb-sale">−{saving}%</span> : null}
          {isNew(product.createdAt, now) ? (
            <span className="sb-tag sb-new">{words.t('new_')}</span>
          ) : null}
          {product.bestSeller === true ? (
            <span className="sb-tag sb-best">{words.t('sb_best')}</span>
          ) : null}
        </div>
      </div>
      <div className="sb-bd">
        <span className="sb-nm">{product.name}</span>
        <CardPrice product={product} words={words} />
        {left !== null ? (
          <span className="sb-left">{words.t('sb_left', { n: left })}</span>
        ) : ordered > 0 ? (
          <span className="sb-sold">{words.t('sb_ordered', { n: ordered })}</span>
        ) : null}
        {style === ProductCardStyle.Photo ? null : (
          <span className="sb-add">
            <DesignIcon name="cart" />
            {words.t('buy_now')}
          </span>
        )}
      </div>
    </a>
  );
}
