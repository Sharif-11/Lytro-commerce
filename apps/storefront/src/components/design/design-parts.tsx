import { SectionHeadStyle, type StorefrontPhoto } from '@lytronix/validators';
import type { CSSProperties } from 'react';
import type { ImageView } from '@/lib/api/storefront-api';
import type { Words } from '@/lib/i18n/words';
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
