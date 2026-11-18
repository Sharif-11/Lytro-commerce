import { StorefrontSectionKind, type StorefrontSection } from '@lytronix/validators';
import type {
  ProductPage,
  ProductQuery,
  PublicShop,
  PublicStorefrontDesign,
} from '@/lib/api/storefront-api';
import { designLook } from '@/lib/design/design-look';
import {
  type DesignedHomeReads,
  HERO_AUTO_SLIDES,
  homeReadPlan,
  queryKey,
} from '@/lib/design/home-reads';
import type { Words } from '@/lib/i18n/words';
import { type OpenShopPage, type PageFrame, storefrontApi } from '@/lib/storefront';
import { Hero } from './hero';
import {
  About,
  Announcement,
  Categories,
  OfferBanners,
  ProductRow,
  Testimonials,
  Trust,
  WideBanner,
} from './sections';

// STOREFRONT-BUILDER-PLAN SB-1, SB-8, SB-9: the home page as the shop designed it -- its theme's look, its sections in
// order, each filling itself from the shop's data until the seller writes its own.

const NO_PRODUCTS: ProductPage = { products: [], nextCursor: null };

/** The reads the design's sections need, made by the page itself so a busy server shows the busy page (Slice 9.10). One
    request asked once, however many sections ask it; the auto hero reads the newest only when nothing is on sale. */
export async function loadDesignedHome(
  page: OpenShopPage,
  design: PublicStorefrontDesign,
): Promise<DesignedHomeReads> {
  const plan = homeReadPlan(design);
  const reads = new Map<string, Promise<ProductPage>>();
  const read = (query: ProductQuery): Promise<ProductPage> => {
    const key = queryKey(query);
    let reading = reads.get(key);
    if (!reading) {
      reading = storefrontApi
        .products(page.shop, page.shopper, query)
        .then((list) => list ?? NO_PRODUCTS);
      reads.set(key, reading);
    }
    return reading;
  };
  const onSale = { sort: 'discount', onSale: true, inStock: true } as const;
  const newest = { sort: 'newest', inStock: true } as const;
  const [rows, hero, offers, methods] = await Promise.all([
    Promise.all(
      // DC-1: the rows spread designs when the shop has design cards on; the auto hero and banners stay a product each.
      plan.rows.map(
        async (row) =>
          [
            row.sectionId,
            (await read({ ...row.query, designs: design.designCards === true })).products,
          ] as const,
      ),
    ),
    plan.hero
      ? read({ ...onSale, limit: HERO_AUTO_SLIDES }).then(async (sale) =>
          sale.products.length > 0
            ? sale.products
            : (await read({ ...newest, limit: HERO_AUTO_SLIDES })).products,
        )
      : Promise.resolve([]),
    plan.offers
      ? Promise.all([read({ ...onSale, limit: 1 }), read({ ...newest, limit: 1 })]).then(
          ([sale, latest]) => ({
            saving: sale.products[0] ?? null,
            newest: latest.products[0] ?? null,
          }),
        )
      : Promise.resolve({ saving: null, newest: null }),
    plan.methods ? storefrontApi.paymentMethods(page.shop, page.shopper) : Promise.resolve([]),
  ]);
  return { rows: new Map(rows), hero, offers, methods };
}

function DesignedSection({
  section,
  info,
  design,
  frame,
  reads,
  words,
  now,
  look,
}: {
  section: StorefrontSection;
  info: PublicShop;
  design: PublicStorefrontDesign;
  frame: PageFrame;
  reads: DesignedHomeReads;
  words: Words;
  now: number;
  look: ReturnType<typeof designLook>;
}) {
  const theme = look.theme;
  switch (section.kind) {
    case StorefrontSectionKind.Announcement:
      return <Announcement section={section} info={info} words={words} />;
    case StorefrontSectionKind.Hero:
      return (
        <Hero section={section} design={design} theme={theme} products={reads.hero} words={words} />
      );
    case StorefrontSectionKind.Categories:
      return (
        <Categories section={section} theme={theme} categories={frame.categories} words={words} />
      );
    case StorefrontSectionKind.Products:
      return (
        <ProductRow
          section={section}
          design={design}
          theme={theme}
          products={reads.rows.get(section.id) ?? []}
          words={words}
          now={now}
        />
      );
    case StorefrontSectionKind.OfferBanners:
      return <OfferBanners section={section} design={design} offers={reads.offers} words={words} />;
    case StorefrontSectionKind.WideBanner:
      return <WideBanner section={section} design={design} />;
    case StorefrontSectionKind.Trust:
      return <Trust info={info} methods={reads.methods} words={words} />;
    case StorefrontSectionKind.Testimonials:
      return <Testimonials section={section} theme={theme} words={words} />;
    case StorefrontSectionKind.About:
      return <About section={section} design={design} theme={theme} words={words} />;
  }
}

/** The designed home's body: the theme's look on its root, its faces' stylesheet hoisted, its sections in order. */
export function DesignedHome({
  info,
  design,
  frame,
  reads,
  words,
}: {
  info: PublicShop;
  design: PublicStorefrontDesign;
  frame: PageFrame;
  reads: DesignedHomeReads;
  words: Words;
}) {
  const look = designLook(design, info.brand);
  const now = Date.now();
  return (
    <div className="sfb" style={look.variables} data-theme={design.theme}>
      {look.fontsUrl ? (
        <>
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link rel="stylesheet" href={look.fontsUrl} precedence="default" />
        </>
      ) : null}
      {design.sections.map((section) => (
        <DesignedSection
          key={section.id}
          section={section}
          info={info}
          design={design}
          frame={frame}
          reads={reads}
          words={words}
          now={now}
          look={look}
        />
      ))}
    </div>
  );
}
