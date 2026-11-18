import {
  HeroDesign,
  StorefrontFill,
  type StorefrontPhoto,
  type StorefrontSection,
  type StorefrontSectionKind,
  type StorefrontThemeDefinition,
} from '@lytronix/validators';
import type { ReactNode } from 'react';
import type { ImageView, ProductCard, PublicStorefrontDesign } from '@/lib/api/storefront-api';
import { money, type Words } from '@/lib/i18n/words';
import { DesignIcon } from './design-icon';
import { linkHref } from '@/lib/design/links';
import { FocusedPhoto } from './design-parts';
import { HeroRotator } from './hero-rotator';

// STOREFRONT-BUILDER-PLAN SB-8, SB-9, SB-15: the hero, as the sketch draws it -- an overlay, a split, or a slide with two
// tiles beside it. The seller's own slides, each with its photo's focal point; or, filling itself, the shop's biggest
// savings (the newest products with nothing on sale), each with its own photo, so an offer that ends leaves.

type HeroSection = Extract<StorefrontSection, { kind: StorefrontSectionKind.Hero }>;

/** One slide, the seller's or one of the shop's products. */
interface Slide {
  image: ImageView;
  photo: StorefrontPhoto | null;
  kicker: string | null;
  headline: string;
  description: string | null;
  button: string;
  href: string;
  /** A product's saving ("−20%") and its price, struck beside its regular one. */
  badge: string | null;
  price: { now: string; regular: string | null } | null;
}

function ownSlides(section: HeroSection, design: PublicStorefrontDesign): Slide[] {
  return section.slides.flatMap((slide): Slide[] => {
    const image = design.images[slide.photo.mediaId];
    if (!image) return [];
    return [
      {
        image,
        photo: slide.photo,
        kicker: slide.kicker,
        headline: slide.headline,
        description: slide.description,
        button: slide.button,
        href: linkHref(slide.link, design),
        badge: null,
        price: null,
      },
    ];
  });
}

function productSlides(products: readonly ProductCard[], words: Words): Slide[] {
  return products.flatMap((product): Slide[] => {
    if (!product.image || product.minPrice === null) return [];
    const saving = product.bestDiscount ?? 0;
    return [
      {
        image: product.image,
        photo: null,
        kicker: saving > 0 ? null : words.t('sb_new_kick'),
        headline: product.name,
        description: null,
        button: words.t('buy_now'),
        href: `/p/${product.slug}`,
        badge: saving > 0 ? `−${String(saving)}%` : null,
        price: { now: money(product.minPrice), regular: product.minRegularPrice ?? null },
      },
    ];
  });
}

function Picture({ slide }: { slide: Slide }) {
  return slide.photo ? (
    <FocusedPhoto photo={slide.photo} image={slide.image} />
  ) : (
    <img src={slide.image.urls.main} alt="" />
  );
}

function SlideWords({ slide, button }: { slide: Slide; button: ReactNode }) {
  return (
    <div className="sb-tx">
      {slide.badge !== null ? <span className="sb-badge">{slide.badge}</span> : null}
      {slide.kicker !== null ? <div className="sb-kick">{slide.kicker}</div> : null}
      <h1>{slide.headline}</h1>
      {slide.description !== null ? <p>{slide.description}</p> : null}
      {slide.price !== null ? (
        <div className="sb-price">
          {slide.price.now}
          {slide.price.regular !== null ? <s>{money(slide.price.regular)}</s> : null}
        </div>
      ) : null}
      {button}
    </div>
  );
}

function Button({ slide }: { slide: Slide }) {
  return (
    <a className="sb-btn" href={slide.href}>
      {slide.button} <DesignIcon name="arrow" />
    </a>
  );
}

function OverlaySlide({ slide }: { slide: Slide }) {
  return (
    <div className="sb-slide">
      <Picture slide={slide} />
      <div className="sb-shade" />
      <SlideWords slide={slide} button={<Button slide={slide} />} />
    </div>
  );
}

function SplitSlide({ slide }: { slide: Slide }) {
  return (
    <div className="sb-slide">
      <div className="sb-ph">
        <Picture slide={slide} />
      </div>
      <SlideWords
        slide={slide}
        button={
          <div>
            <Button slide={slide} />
          </div>
        }
      />
    </div>
  );
}

function Tile({ slide }: { slide: Slide }) {
  return (
    <a className="sb-tile" href={slide.href}>
      <Picture slide={slide} />
      <div className="sb-shade" />
      <div className="sb-tx">
        <b>{slide.headline}</b>
        {slide.badge ?? slide.kicker ?? slide.price?.now ?? ''}
      </div>
    </a>
  );
}

export function Hero({
  section,
  design,
  theme,
  products,
  words,
}: {
  section: HeroSection;
  design: PublicStorefrontDesign;
  theme: StorefrontThemeDefinition;
  /** SB-9: the products a hero filling itself shows. */
  products: readonly ProductCard[];
  words: Words;
}) {
  const own = section.fill === StorefrontFill.Own ? ownSlides(section, design) : [];
  // An own hero whose every photo has gone fills itself again, so the home never opens on a hole (SB-16).
  const slides = own.length > 0 ? own : productSlides(products, words);
  const [first, ...rest] = slides;
  if (!first) return null;
  const kind = section.design ?? theme.hero;
  if (kind === HeroDesign.SlideTiles) {
    return (
      <section className="sb-hero sb-overlay sb-auto">
        <OverlaySlide slide={first} />
        {rest.length > 0 ? (
          <div className="sb-tiles">
            {rest.slice(0, 2).map((slide, at) => (
              <Tile key={at} slide={slide} />
            ))}
          </div>
        ) : null}
      </section>
    );
  }
  const Draw = kind === HeroDesign.Overlay ? OverlaySlide : SplitSlide;
  return (
    <section className={kind === HeroDesign.Overlay ? 'sb-hero sb-overlay' : 'sb-hero sb-split'}>
      <HeroRotator
        label={first.headline}
        slides={slides.map((slide, at) => (
          <Draw key={at} slide={slide} />
        ))}
      />
    </section>
  );
}
