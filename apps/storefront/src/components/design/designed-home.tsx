import {
  PUBLIC_PAGE_SIZE,
  STOREFRONT_ALL_PRODUCTS_PAGE,
  StorefrontSectionKind,
  type StorefrontCollection,
  type StorefrontSection,
} from '@lytronix/validators';
import type {
  ProductCard,
  ProductPage,
  ProductQuery,
  PublicShop,
  PublicStorefrontDesign,
} from '@/lib/api/storefront-api';
import { designLook } from '@/lib/design/design-look';
import { type CollectionFacts, collectionKey, collectionQuery } from '@/lib/design/collections';
import { ProductListBatch } from '@/lib/api/product-list-batch';
import {
  allProductsAt,
  type DesignedHomeReads,
  fallbackReads,
  homeLayout,
  homeReadPlan,
} from '@/lib/design/home-reads';
import type { Words } from '@/lib/i18n/words';
import { type OpenShopPage, type PageFrame, storefrontApi } from '@/lib/storefront';
import { EmptyHome } from '../catalogue/empty-state';
import { AllProductsGrid } from './all-products';
import { SectionHead } from './design-parts';
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
    request asked once, however many sections ask it; an auto hero reads the newest only when its own source is empty,
    and the standard collections are read only when one a tile or banner shows is (BL-13). Load fix 3: the lists go to
    the server together (ProductListBatch): the rows, heroes and tiles in one call, and what those leave to read (an
    empty hero's newest, a tile's fallback) in a second, only when there is any. */
export async function loadDesignedHome(
  page: OpenShopPage,
  design: PublicStorefrontDesign,
): Promise<DesignedHomeReads> {
  const plan = homeReadPlan(design);
  const lists = new ProductListBatch((queries) =>
    storefrontApi.productLists(page.shop, page.shopper, queries),
  );
  const read = async (query: ProductQuery): Promise<ProductPage> =>
    (await lists.read(query)) ?? NO_PRODUCTS;
  const readCollections = (collections: readonly StorefrontCollection[]) =>
    Promise.all(
      collections.map(async (collection) => {
        const query = collectionQuery(collection, design.categories);
        const products = query ? (await read(query)).products : [];
        return [collectionKey(collection), products] as const;
      }),
    );
  // The tiles' fallbacks follow straight on from their own reads, beside the heroes' fallbacks, so both share a call.
  const readAllCollections = async (): Promise<Map<string, ProductCard[]>> => {
    const collections = new Map<string, ProductCard[]>(await readCollections(plan.collections));
    for (const [key, products] of await readCollections(fallbackReads(plan, collections))) {
      collections.set(key, products);
    }
    return collections;
  };
  // DC-1: the rows and "সব প্রোডাক্ট" spread designs when the shop has design cards on; the auto hero and banners stay a
  // product each.
  const designs = design.designCards === true;
  const [rows, all, heroes, collections, methods] = await Promise.all([
    Promise.all(
      plan.rows.map(
        async (row) => [row.sectionId, (await read({ ...row.query, designs })).products] as const,
      ),
    ),
    // SB-32: in the same call as the rows.
    read({ ...plan.all, designs }),
    Promise.all(
      plan.heroes.map(async (hero) => {
        const products = (await read(hero.query)).products;
        return [
          hero.sectionId,
          products.length > 0 || !hero.fallback ? products : (await read(hero.fallback)).products,
        ] as const;
      }),
    ),
    readAllCollections(),
    plan.methods ? storefrontApi.paymentMethods(page.shop, page.shopper) : Promise.resolve([]),
  ]);
  // SB-32: nothing twice, no row short of its fill, and everything else in "সব প্রোডাক্ট".
  const laid = homeLayout(design, new Map(rows), all);
  return { rows: laid.rows, all: laid.all, heroes: new Map(heroes), collections, methods };
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
  // BL-12: what the tiles and the auto banners draw from.
  const collections: CollectionFacts = {
    lists: reads.collections,
    categories: frame.categories,
    sale: info.sale ?? { products: 0, bestDiscount: 0 },
    words,
  };
  switch (section.kind) {
    case StorefrontSectionKind.Announcement:
      return <Announcement section={section} info={info} words={words} />;
    case StorefrontSectionKind.Hero:
      return (
        <Hero
          section={section}
          design={design}
          theme={theme}
          products={reads.heroes.get(section.id) ?? []}
          collections={collections}
          words={words}
        />
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
      return (
        <OfferBanners section={section} design={design} collections={collections} words={words} />
      );
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
  bare = false,
}: {
  info: PublicShop;
  design: PublicStorefrontDesign;
  frame: PageFrame;
  reads: DesignedHomeReads;
  words: Words;
  /** SB-33 (em-home-empty): no product yet -- "coming soon" in the hero's place, the ways to reach the shop, the trust
      strip; no section that would draw nothing. */
  bare?: boolean;
}) {
  const look = designLook(design, info.brand);
  const sections = bare
    ? design.sections.filter((section) => section.kind === StorefrontSectionKind.Trust)
    : design.sections;
  const now = Date.now();
  // SB-33: an empty shop's home has no "সব প্রোডাক্ট" (it would draw nothing); SB-32 places it otherwise.
  const at = bare ? -1 : allProductsAt(sections);
  const all = (
    <AllProductsSection
      key="all-products"
      info={info}
      design={design}
      reads={reads}
      words={words}
      now={now}
      look={look}
    />
  );
  return (
    <div className="sfb" style={look.variables} data-theme={design.theme}>
      {look.fontsUrl ? (
        <>
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link rel="stylesheet" href={look.fontsUrl} precedence="default" />
        </>
      ) : null}
      {bare ? <EmptyHome shop={info} words={words} /> : null}
      {sections.flatMap((section, index) => [
        ...(index === at ? [all] : []),
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
        />,
      ])}
      {at === sections.length ? all : null}
    </div>
  );
}

/** SB-32: "সব প্রোডাক্ট · Nটি", See all to every product, its first twelve and its button; nothing left, no section. */
function AllProductsSection({
  info,
  design,
  reads,
  words,
  now,
  look,
}: {
  info: PublicShop;
  design: PublicStorefrontDesign;
  reads: DesignedHomeReads;
  words: Words;
  now: number;
  look: ReturnType<typeof designLook>;
}) {
  if (reads.all.shown.length === 0) return null;
  const count = info.productCount;
  return (
    <section className="sb-sec" id="all-products">
      <div className="sb-wrap">
        <SectionHead
          style={look.theme.head}
          title={
            <>
              {words.t('sb_all')}
              {count !== undefined ? (
                <span className="sb-n">{words.t('sb_all_count', { n: count })}</span>
              ) : null}
            </>
          }
          all="/new"
          words={words}
        />
        <AllProductsGrid
          language={words.language}
          style={look.theme.card}
          now={now}
          all={reads.all}
          pageSize={STOREFRONT_ALL_PRODUCTS_PAGE}
          productCount={count}
          query={{
            sort: 'featured',
            designs: design.designCards === true,
            limit: PUBLIC_PAGE_SIZE,
          }}
        />
      </div>
    </section>
  );
}
