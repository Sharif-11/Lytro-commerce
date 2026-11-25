import { cardKey } from '@/lib/design/card-links';
import {
  announcementPairs,
  BannerLayout,
  bannerLayoutFor,
  CategoryTileStyle,
  ProductRowLayout,
  ProductRowSource,
  StorefrontFill,
  type StorefrontBanner,
  type StorefrontSection,
  type StorefrontSectionKind,
  type StorefrontThemeDefinition,
} from '@lytronix/validators';
import type {
  ProductCard,
  PublicCategory,
  PublicShop,
  PublicStorefrontDesign,
  ShopperPaymentMethod,
} from '@/lib/api/storefront-api';
import { barItems } from '@/lib/design/announcement';
import {
  type CollectionFacts,
  type CollectionView,
  collectionViews,
} from '@/lib/design/collections';
import { deliveryRange } from '@/lib/catalogue/browse';
import { money, type Words } from '@/lib/i18n/words';
import { WALLET_NAMES } from '@/lib/order/wallet-names';
import { AnnouncementBar } from './announcement-bar';
import { type CategoryTile, CategoryStrip } from './category-strip';
import { DesignIcon } from './design-icon';
import { type LinkFacts, linkHref, linkShows, offerPath } from '@/lib/design/links';
import { firstLetter } from '@/lib/design/marks';
import { FocusedPhoto, SectionHead } from './design-parts';
import { ThemeCard } from './theme-card';

// STOREFRONT-BUILDER-PLAN SB-8 to SB-10, SB-16: the home's sections other than the hero, as the sketch draws them
// (docs/brand/lytro-storefront-builder.html, `SECTIONS`). Each fills itself from the shop's data until the seller writes
// its own.

type Section<K extends StorefrontSectionKind> = Extract<StorefrontSection, { kind: K }>;

/** The shop's delivery charges as the trust strip says them: the least and most among its zones. */
function deliveryWords(info: PublicShop): string | null {
  const range = deliveryRange(info.deliveryZones);
  if (range === null) return null;
  return range.from === range.to ? money(range.from) : `${money(range.from)}–${money(range.to)}`;
}

/** BL-10: the bar's items two at a time, in the seller's order; nothing to say, and it leaves. Over the header
    (`pinned`, the page's first section), it leaves as the page scrolls. */
export function Announcement({
  section,
  info,
  words,
  pinned = false,
}: {
  section: Section<StorefrontSectionKind.Announcement>;
  info: PublicShop;
  words: Words;
  pinned?: boolean;
}) {
  const items = barItems(section.items, info, words);
  if (items.length === 0) return null;
  return <AnnouncementBar pairs={announcementPairs(items)} pinned={pinned} />;
}

/**
 * SB-9: every top-level category with its picture (or its first product's photo) and how many products it holds.
 * SB-32 (the owner, 2026-11-26: "if a category has no image then skip it from this section and we have category chip
 * after header already"): only the categories with a picture, so no tile is empty; with none, no section. The tiles
 * move on by themselves when they overflow the strip (CategoryStrip).
 */
export function Categories({
  section,
  theme,
  categories,
  words,
}: {
  section: Section<StorefrontSectionKind.Categories>;
  theme: StorefrontThemeDefinition;
  categories: readonly PublicCategory[];
  words: Words;
}) {
  const style = section.style ?? theme.categories;
  const tiles: CategoryTile[] = categories.flatMap((category) => {
    const picture = category.cover ?? category.image;
    if (!picture) return [];
    return [
      {
        id: category.id,
        href: `/c/${category.slug}`,
        name: category.name,
        picture: picture.urls.thumbnail,
        count:
          style === CategoryTileStyle.Circle
            ? words.t('sb_n_products', { n: category.productCount })
            : null,
      },
    ];
  });
  if (tiles.length === 0) return null;
  // The header's menu leads here (`/#categories`).
  return (
    <section className="sb-sec" id="categories">
      <div className="sb-wrap">
        <SectionHead
          style={theme.head}
          title={section.title ?? words.t('sb_shop_by')}
          all={null}
          words={words}
        />
        <CategoryStrip
          className={`sb-cats sb-${style}`}
          tiles={tiles}
          tall={style === CategoryTileStyle.Tall}
        />
      </div>
    </section>
  );
}

/** SB-9: a row's title when the seller gave none, and where its "See all" leads (none for picked products). */
function rowDefaults(
  section: Section<StorefrontSectionKind.Products>,
  design: PublicStorefrontDesign,
  words: Words,
): { title: string; all: string | null } {
  switch (section.source) {
    case ProductRowSource.Newest:
      return { title: words.t('sb_just_in'), all: '/new' };
    case ProductRowSource.OnSale:
      return { title: words.t('sb_on_sale'), all: '/offers' };
    case ProductRowSource.BestSellers:
      return { title: words.t('sb_best_sellers'), all: '/best' };
    case ProductRowSource.Category: {
      const category = design.categories.find((row) => row.id === section.categoryId);
      return { title: category?.name ?? '', all: category ? `/c/${category.slug}` : null };
    }
    case ProductRowSource.Picked:
      return { title: words.t('sb_picked'), all: null };
    // OF-8: an offer's row takes its name, and "See all" opens its page.
    case ProductRowSource.Offer: {
      const offer = (design.offers ?? []).find((row) => row.id === section.offerId);
      return { title: offer?.name ?? '', all: offer ? offerPath(offer.slug) : null };
    }
  }
}

/** SB-9, SB-10: a row of products, a grid or a carousel, in the theme's card; a row with nothing to show leaves. */
export function ProductRow({
  section,
  design,
  theme,
  products,
  words,
  now,
}: {
  section: Section<StorefrontSectionKind.Products>;
  design: PublicStorefrontDesign;
  theme: StorefrontThemeDefinition;
  products: readonly ProductCard[];
  words: Words;
  now: number;
}) {
  if (products.length === 0) return null;
  const { title, all } = rowDefaults(section, design, words);
  return (
    <section className="sb-sec">
      <div className="sb-wrap">
        <SectionHead style={theme.head} title={section.title ?? title} all={all} words={words} />
        <div className={section.layout === ProductRowLayout.Grid ? 'sb-grid' : 'sb-rail'}>
          {products.map((product) => (
            <ThemeCard
              key={cardKey(product)}
              product={product}
              style={theme.card}
              words={words}
              now={now}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/** One banner tile: its photo under a shade, a small line, a big line, a line under it and its button. */
interface BannerView {
  key: string;
  image: { url: string; position?: string };
  kicker: string | null;
  headline: string;
  description: string | null;
  button: string;
  href: string;
}

/** SB-19: the theme's shade a banner's words sit on -- its first for the first banner, its second for the second. */
function shadeOf(at: number): string {
  return at % 2 === 0 ? 'var(--ban-a)' : 'var(--ban-b)';
}

function Banner({ banner, at, compact }: { banner: BannerView; at: number; compact: boolean }) {
  return (
    <a className={compact ? 'sb-ban sb-c' : 'sb-ban'} href={banner.href}>
      <img src={banner.image.url} alt="" style={{ objectPosition: banner.image.position }} />
      <div className="sb-shade" style={{ background: shadeOf(at) }} />
      <div className="sb-cshade" />
      <div className="sb-tx">
        {banner.kicker !== null ? <div className="sb-k">{banner.kicker}</div> : null}
        <b>{banner.headline}</b>
        {banner.description !== null ? <div className="sb-s">{banner.description}</div> : null}
        <span className="sb-btn sb-light">
          {banner.button} <DesignIcon name="arrow" />
        </span>
      </div>
    </a>
  );
}

/** A seller's banner as it shows; null with its photo gone or (SB-16 as amended) its link leading where nothing is now. */
function ownBanner(
  banner: StorefrontBanner,
  design: PublicStorefrontDesign,
  facts: LinkFacts,
  key: string,
): BannerView | null {
  const image = design.images[banner.photo.mediaId];
  if (!image || !linkShows(banner.link, design, facts)) return null;
  return {
    key,
    image: {
      url: image.urls.main,
      position: `${String(banner.photo.focusX)}% ${String(banner.photo.focusY)}%`,
    },
    kicker: banner.kicker,
    headline: banner.headline,
    description: banner.description,
    button: banner.button,
    href: linkHref(banner.link, design),
  };
}

/** BL-9, BL-12: a banner filling itself, for one of the collections the seller picked. */
function collectionBanner(view: CollectionView, words: Words): BannerView {
  return {
    key: view.key,
    image: { url: view.image.urls.main },
    kicker: view.kicker,
    headline: view.headline,
    description: view.description,
    button: words.t('sb_shop'),
    href: view.href,
  };
}

/**
 * SB-8, SB-9, BL-6 to BL-9: up to three offer banners, the seller's or the shop's own, laid out as the seller picked or
 * by their number; on a phone a half-width one is a compact tile (BL-8). None left to show, the section leaves.
 */
export function OfferBanners({
  section,
  design,
  collections,
  words,
}: {
  section: Section<StorefrontSectionKind.OfferBanners>;
  design: PublicStorefrontDesign;
  /** BL-12, BL-13: what the auto banners' collections show. */
  collections: CollectionFacts;
  words: Words;
}) {
  const own =
    section.fill === StorefrontFill.Own
      ? section.banners.flatMap(
          (banner, at) => ownBanner(banner, design, collections, String(at)) ?? [],
        )
      : [];
  // Every own banner hidden, the collections show instead (read for them, `mayAllHide`); none of those, it leaves.
  const banners =
    own.length > 0
      ? own
      : collectionViews(section.collections, collections).map((view) =>
          collectionBanner(view, words),
        );
  if (banners.length === 0) return null;
  const layout = bannerLayoutFor(banners.length, section.layout);
  const compact = (at: number): boolean =>
    layout === BannerLayout.Side || (layout === BannerLayout.BigTwo && at > 0);
  return (
    <section className="sb-sec">
      <div className={`sb-wrap sb-banners sb-${layout} sb-n${String(banners.length)}`}>
        {banners.map((banner, at) => (
          <Banner key={banner.key} banner={banner} at={at} compact={compact(at)} />
        ))}
      </div>
    </section>
  );
}

/**
 * SB-8: one banner across the page; its photo gone, it leaves (SB-16), and (as amended 2026-11-26) while its link leads
 * where nothing is now, coming back by itself when that changes.
 */
export function WideBanner({
  section,
  design,
  facts,
}: {
  section: Section<StorefrontSectionKind.WideBanner>;
  design: PublicStorefrontDesign;
  facts: LinkFacts;
}) {
  const banner = ownBanner(section.banner, design, facts, 'wide');
  if (!banner) return null;
  return (
    <section className="sb-sec">
      <div className="sb-wrap">
        <Banner banner={banner} at={0} compact={false} />
      </div>
    </section>
  );
}

// The trust strip names this many of the shop's wallets, as the sketch does ("bKash, Nagad").
const WALLETS_NAMED = 2;

/** SB-9: cash on delivery (always taken, as the home has always said), the delivery charges, the shop's wallets and
    tracking, from what the shop has set. */
export function Trust({
  info,
  methods,
  words,
}: {
  info: PublicShop;
  methods: readonly ShopperPaymentMethod[];
  words: Words;
}) {
  const delivery = deliveryWords(info);
  const wallets = [...new Set(methods.map((row) => WALLET_NAMES[row.method]))]
    .filter((name): name is string => name !== undefined)
    .slice(0, WALLETS_NAMED);
  const items: {
    icon: 'cash' | 'truck' | 'wallet' | 'pin';
    title: string;
    line: string;
    href?: string;
  }[] = [{ icon: 'cash', title: words.t('sb_cod'), line: words.t('sb_cod_sub') }];
  if (delivery !== null) {
    items.push({ icon: 'truck', title: words.t('sb_nationwide'), line: delivery });
  }
  if (wallets.length > 0) {
    items.push({
      icon: 'wallet',
      title: words.t('sb_pay_by', { w: wallets.join(', ') }),
      line: words.t('sb_or_cod'),
    });
  }
  items.push({
    icon: 'pin',
    title: words.t('sb_track'),
    line: words.t('sb_any_time'),
    href: '/track',
  });
  return (
    <section className="sb-sec">
      <div className="sb-wrap sb-trust">
        {items.map((item) => {
          const inner = (
            <>
              <DesignIcon name={item.icon} />
              <span>
                <b>{item.title}</b>
                {item.line}
              </span>
            </>
          );
          return item.href ? (
            <a key={item.icon} className="sb-it" href={item.href}>
              {inner}
            </a>
          ) : (
            <div key={item.icon} className="sb-it">
              {inner}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** SB-8: what the seller's customers said, in the seller's own words. */
export function Testimonials({
  section,
  theme,
  words,
}: {
  section: Section<StorefrontSectionKind.Testimonials>;
  theme: StorefrontThemeDefinition;
  words: Words;
}) {
  return (
    <section className="sb-sec">
      <div className="sb-wrap">
        <SectionHead
          style={theme.head}
          title={section.title ?? words.t('sb_quotes')}
          all={null}
          words={words}
        />
        <div className="sb-quotes">
          {section.quotes.map((quote, at) => (
            <div key={at} className="sb-q">
              <p>“{quote.text}”</p>
              <div className="sb-who">
                <span className="sb-av">{firstLetter(quote.name)}</span>
                <span>
                  <b>{quote.name}</b>
                  {quote.place}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** SB-8: About the shop, in the seller's words, with a photo when it has one. Not drawn in the sketch: its head and
    text in the theme's own style. */
export function About({
  section,
  design,
  theme,
  words,
}: {
  section: Section<StorefrontSectionKind.About>;
  design: PublicStorefrontDesign;
  theme: StorefrontThemeDefinition;
  words: Words;
}) {
  const image = section.photo ? design.images[section.photo.mediaId] : undefined;
  return (
    <section className="sb-sec">
      <div className="sb-wrap">
        <SectionHead style={theme.head} title={section.title} all={null} words={words} />
        <div className="sb-about-us">
          {section.photo && image ? <FocusedPhoto photo={section.photo} image={image} /> : null}
          <p>{section.text}</p>
        </div>
      </div>
    </section>
  );
}
