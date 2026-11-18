import { ProductCardStyle, SectionHeadStyle, type StorefrontPhoto } from '@lytronix/validators';
import type { CSSProperties } from 'react';
import type { ImageView, ProductCard } from '@/lib/api/storefront-api';
import { isNew } from '@/lib/catalogue/browse';
import { money, type Words } from '@/lib/i18n/words';
import { DesignIcon } from './design-icon';

// STOREFRONT-BUILDER-PLAN: the parts the designed home's sections share, as the sketch draws them
// (docs/brand/lytro-storefront-builder.html: `head`, the product card, a photo with its focal point).

/** SB-15: a photo the seller placed, cropped around its focal point on a phone and on a wide screen alike. */
export function FocusedPhoto({
  photo,
  image,
  wide,
}: {
  photo: StorefrontPhoto;
  image: ImageView;
  wide?: boolean;
}) {
  const style: CSSProperties = {
    objectPosition: `${String(photo.focusX)}% ${String(photo.focusY)}%`,
  };
  return <img src={wide === false ? image.urls.thumbnail : image.urls.main} alt="" style={style} />;
}

/** The sketch's section heading, in the theme's style; `all` is where "See all" leads, null for none. */
export function SectionHead({
  style,
  title,
  all,
  words,
}: {
  style: SectionHeadStyle;
  title: string;
  all: string | null;
  words: Words;
}) {
  const seeAll =
    all === null ? null : (
      <a className="sb-all" href={all}>
        {words.t('see_all')} →
      </a>
    );
  switch (style) {
    case SectionHeadStyle.Ornament:
    case SectionHeadStyle.Petal: {
      const mark = style === SectionHeadStyle.Ornament ? '◆' : '✿';
      return (
        <div className="sb-sh sb-centre">
          <span className="sb-line" />
          <span className="sb-orn">{mark}</span>
          <h2>{title}</h2>
          <span className="sb-orn">{mark}</span>
          <span className="sb-line" />
        </div>
      );
    }
    case SectionHeadStyle.Leaf:
      return (
        <div className="sb-sh">
          <DesignIcon name="leaf" className="sb-leaf" />
          <h2>{title}</h2>
          {seeAll}
        </div>
      );
    case SectionHeadStyle.Rule:
      return (
        <div className="sb-sh sb-rule">
          <h2>{title}</h2>
          {seeAll}
        </div>
      );
    case SectionHeadStyle.Left:
      return (
        <div className="sb-sh">
          <h2>{title}</h2>
          {seeAll}
        </div>
      );
  }
}

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
    <a className={`sb-card sb-${style}`} href={`/p/${product.slug}`}>
      <div className="sb-im">
        {product.image ? <img src={product.image.urls.thumbnail} alt="" loading="lazy" /> : null}
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
