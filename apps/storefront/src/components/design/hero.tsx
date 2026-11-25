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
import {
  type CollectionFacts,
  type CollectionView,
  collectionViews,
} from '@/lib/design/collections';
import { money, type Words } from '@/lib/i18n/words';
import { DesignIcon } from './design-icon';
import { type LinkFacts, linkHref, linkShows } from '@/lib/design/links';
import { FocusedPhoto } from './design-parts';
import { HeroRotator } from './hero-rotator';

// STOREFRONT-BUILDER-PLAN SB-8, SB-9, SB-15, BL-2 to BL-5: the hero, as the sketch draws it -- an overlay, a split, or a
// rotating slide with two tiles beside it. The seller's own slides, each with its photo's focal point; or, filling
// itself, three of its source's products (the offers, the newest or the best sellers), each with its own photo, so an
// offer that ends leaves.

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

/** The seller's slides that show: each with its photo, and (SB-16 as amended) its link leading somewhere now. */
function ownSlides(
  section: HeroSection,
  design: PublicStorefrontDesign,
  facts: LinkFacts,
): Slide[] {
  return section.slides.flatMap((slide): Slide[] => {
    const image = design.images[slide.photo.mediaId];
    if (!image || !linkShows(slide.link, design, facts)) return [];
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

function Button({ slide, light = false }: { slide: Slide; light?: boolean }) {
  return (
    <a className={light ? 'sb-btn sb-light' : 'sb-btn'} href={slide.href}>
      {slide.button} <DesignIcon name="arrow" />
    </a>
  );
}

function OverlaySlide({ slide, light = false }: { slide: Slide; light?: boolean }) {
  return (
    <div className="sb-slide">
      <Picture slide={slide} />
      <div className="sb-shade" />
      <SlideWords slide={slide} button={<Button slide={slide} light={light} />} />
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

/** BL-3, BL-12: a tile beside the slide: a collection of the shop's, and the way to its page. */
function Tile({ view }: { view: CollectionView }) {
  return (
    <a className="sb-tile" href={view.href}>
      <img src={view.image.urls.main} alt="" />
      <div className="sb-shade" />
      <div className="sb-tx">
        <span className="sb-k">{view.kicker}</span>
        <b>{view.headline} →</b>
      </div>
    </a>
  );
}

export function Hero({
  section,
  design,
  theme,
  products,
  collections,
  words,
}: {
  section: HeroSection;
  design: PublicStorefrontDesign;
  theme: StorefrontThemeDefinition;
  /** SB-9, BL-3: the products a hero filling itself shows. */
  products: readonly ProductCard[];
  /** BL-3, BL-12: what the tiles' collections show. */
  collections: CollectionFacts;
  words: Words;
}) {
  const own = section.fill === StorefrontFill.Own ? ownSlides(section, design, collections) : [];
  // An own hero whose every photo has gone, or (SB-16 as amended) every link leads where nothing is now, fills itself
  // again from its source, read for it (`mayAllHide`), so the home never opens on a hole.
  const slides = own.length > 0 ? own : productSlides(products, words);
  const [first] = slides;
  if (!first) return null;
  const kind = section.design ?? theme.hero;
  if (kind === HeroDesign.SlideTiles) {
    // BL-2, BL-12: the slide rotates; each tile's photo passes over the products the slides show.
    const tiles = collectionViews(
      section.tiles,
      collections,
      products.map((product) => product.id),
    );
    return (
      <section className="sb-hero sb-overlay sb-auto">
        <HeroRotator
          label={first.headline}
          slides={slides.map((slide, at) => (
            <OverlaySlide key={at} slide={slide} light />
          ))}
        />
        {tiles.length > 0 ? (
          <div className="sb-tiles">
            {tiles.map((view) => (
              <Tile key={view.key} view={view} />
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
