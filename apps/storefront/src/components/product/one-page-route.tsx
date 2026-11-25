import { StorefrontSectionKind } from '@lytronix/validators';
import { PaymentPolicy } from '@lytronix/validators/enums';
import type {
  ProductCard as Card,
  PublicProduct,
  ShopperPaymentMethod,
} from '@/lib/api/storefront-api';
import { categoryById, findCategory } from '@/lib/catalogue/browse';
import { cardKey, productPath, spreadsDesigns } from '@/lib/design/card-links';
import { pageTheme } from '@/lib/design/design-look';
import { productOpening } from '@/lib/product/opening';
import { shopChatOf } from '@/lib/shop/shop-chat';
import { loadFrame, type OpenShopPage, type PageFrame, storefrontApi } from '@/lib/storefront';
import { Announcement } from '../design/sections';
import { ThemeCard } from '../design/theme-card';
import { EdgeMark } from '../edge-mark';
import { ProductCard } from '../product-card';
import { ShopShell } from '../shop-shell';
import { OnePageView } from './one-page-view';

// Slice 12b's read: more from the shop shows up to eight from the product's main category.
const MORE_FROM_SHOP = 8;

/** What the one product page reads, made by the page itself (/p/ and /l/ alike) so a busy server shows the busy page. */
export interface OnePageData {
  product: PublicProduct;
  opening: Awaited<ReturnType<typeof productOpening>>;
  frame: PageFrame;
  primary: { name: string; slug: string } | null;
  current: string | undefined;
  more: Card[];
  methods: ShopperPaymentMethod[];
}

export async function loadOnePage(
  page: OpenShopPage,
  product: PublicProduct,
  v: string | string[] | undefined,
): Promise<OnePageData> {
  // WAL-06: only a product paid for first needs to know how this shop can be paid.
  const [opening, frame, methods] = await Promise.all([
    productOpening(page, product, v),
    loadFrame(page),
    product.paymentPolicy === PaymentPolicy.None
      ? Promise.resolve([])
      : storefrontApi.paymentMethods(page.shop, page.shopper),
  ]);
  // Its main category, when the shop shows it: the way back, the header link it lights, and more from the shop.
  const primary = categoryById(frame.categories, product.primaryCategoryId);
  const found = primary ? findCategory(frame.categories, primary.slug) : null;
  const related = primary
    ? await storefrontApi.products(page.shop, page.shopper, {
        category: primary.slug,
        designs: spreadsDesigns(page.info),
        limit: MORE_FROM_SHOP + 1,
      })
    : null;
  const more = (related?.products ?? [])
    .filter((card) => card.id !== product.id)
    .slice(0, MORE_FROM_SHOP);
  return {
    product,
    opening,
    frame,
    primary: primary ? { name: primary.name, slug: primary.slug } : null,
    current: found?.top.slug,
    more,
    methods,
  };
}

/**
 * The one product page in the shop's own frame -- its header with the categories, the announcement over it as the
 * home has it, its footer -- with more from the shop after the page (the owner, 2026-11-24: "the landing page is product
 * detail page. so we should include website header and category here").
 */
export function OnePageInShop({
  page,
  data,
  source,
  linkedDesignId,
}: {
  page: OpenShopPage;
  data: OnePageData;
  source: 'storefront' | 'landing_page';
  linkedDesignId: string | null;
}) {
  const { product, opening, frame, primary, more } = data;
  const { words } = page;
  const now = Date.now();
  const theme = pageTheme(page.info);
  // SB-8: the shop's announcement over its header, as the home shows it.
  const leading = page.info.design?.sections[0];
  const announcement =
    leading?.kind === StorefrontSectionKind.Announcement ? (
      <Announcement section={leading} info={page.info} words={words} pinned />
    ) : undefined;
  return (
    <ShopShell
      page={page}
      frame={frame}
      back={primary ? `/c/${primary.slug}` : '/'}
      title={product.name}
      current={data.current}
      above={announcement}
    >
      <EdgeMark page={page} products={[product, ...more]} />
      <OnePageView
        language={words.language}
        shopName={page.info.name}
        shopPhone={page.info.contact.phone}
        product={product}
        category={primary ? { name: primary.name, href: `/c/${primary.slug}` } : null}
        zones={page.info.deliveryZones}
        chat={shopChatOf(page.info.contact)}
        linkedVariantId={opening.linkedVariantId}
        linkedDesignId={linkedDesignId}
        areaId={opening.areaId}
        initialEstimate={opening.estimate}
        openInBrowser={opening.openInBrowser}
        methods={data.methods}
        source={source}
        storefrontOn
        shareUrl={`${page.shop.publicOrigin}${productPath(product.id)}`}
      />
      {more.length > 0 ? (
        <section className="sec pp-sec">
          <div className="sechead">
            <h2>{words.t('pp_more_shop')}</h2>
            {primary ? (
              <a className="lnk" href={`/c/${primary.slug}`}>
                {words.t('see_all')}
              </a>
            ) : null}
          </div>
          {theme ? (
            // STOREFRONT-BUILDER-PLAN SB-17: a designed shop's cards are its theme's.
            <div className="sfb sfb-list" style={theme.variables}>
              <div className="sb-rail">
                {more.map((card) => (
                  <ThemeCard
                    key={cardKey(card)}
                    product={card}
                    style={theme.card}
                    words={words}
                    now={now}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="rail">
              {more.map((card) => (
                <ProductCard key={cardKey(card)} product={card} words={words} now={now} />
              ))}
            </div>
          )}
          <a className="btn ghost block pp-all" href="/new">
            {words.t('pp_all')}
          </a>
        </section>
      ) : null}
    </ShopShell>
  );
}
