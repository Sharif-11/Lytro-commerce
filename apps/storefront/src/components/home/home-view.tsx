import { cardKey } from '@/lib/design/card-links';
import type { ReactNode } from 'react';
import type { ProductCard as Card, ProductPage } from '@/lib/api/storefront-api';
import { deliveryRange, heroLine } from '@/lib/catalogue/browse';
import type { DesignedHomeReads } from '@/lib/design/home-reads';
import { money } from '@/lib/i18n/words';
import { loadFrame, type OpenShopPage, type PageFrame, storefrontApi } from '@/lib/storefront';
import { StorefrontSectionKind } from '@lytronix/validators';
import { DesignedHome, loadDesignedHome } from '../design/designed-home';
import { Announcement } from '../design/sections';
import { Icon } from '../icon';
import { ProductCard } from '../product-card';
import { ShopShell } from '../shop-shell';
import { InstallCard } from './install-card';

// The home's "New arrivals": a grid of four (STOREFRONT-DESIGN §2).
const NEW_ON_HOME = 4;

/** What the home reads besides the shop: its frame, and its designed sections' reads (STOREFRONT-BUILDER-PLAN) or,
    from an older server that sends no design, its newest four. */
export interface HomeReads {
  frame: PageFrame;
  newest: ProductPage | null;
  designed: DesignedHomeReads | null;
}

/** The home's reads, made by the page itself (home and /cart), so a server too busy for them shows the busy page
    (Slice 9.10) rather than failing inside the view. */
export async function loadHome(page: OpenShopPage): Promise<HomeReads> {
  const design = page.info.design;
  if (design) {
    const [frame, designed] = await Promise.all([loadFrame(page), loadDesignedHome(page, design)]);
    return { frame, newest: null, designed };
  }
  const [frame, newest] = await Promise.all([
    loadFrame(page),
    storefrontApi.products(page.shop, page.shopper, { sort: 'newest', limit: NEW_ON_HOME }),
  ]);
  return { frame, newest, designed: null };
}

/** D9-32: every product the home shows, so a change to any of them purges it from the edge. */
export function homeProducts(home: HomeReads): Card[] {
  if (!home.designed) return home.newest?.products ?? [];
  const { rows, heroes, collections } = home.designed;
  // BL-12: a tile's or a banner's collection, all it read, since its photo may move to any of them.
  return [...rows.values(), ...heroes.values(), ...collections.values()].flat();
}

/** STOREFRONT-DESIGN §2, Slice 12b's read: the home from the shop's own data only -- the hero (Welcome, its name, its
    first categories), the trust strip (cash on delivery, its delivery charges), its categories and its newest four,
    and the app offered after a first order. Bestsellers and the wallet marks wait for their phases. `/cart` is this page
    with the cart open. */
export function HomeView({
  page,
  home,
  startCartOpen,
  notice,
}: {
  page: OpenShopPage;
  home: HomeReads;
  startCartOpen?: boolean;
  /** A line over the page: the draft's preview says it is one (SB-12). */
  notice?: ReactNode;
}) {
  const { frame, newest } = home;
  const { words } = page;
  const design = page.info.design;
  if (design && home.designed) {
    // SB-8: an announcement first on the page sits over the header, as the sketch draws it.
    const [first, ...rest] = design.sections;
    const leading = first?.kind === StorefrontSectionKind.Announcement ? first : null;
    return (
      <ShopShell
        page={page}
        frame={frame}
        startCartOpen={startCartOpen}
        full
        notice={notice}
        above={
          leading ? (
            <Announcement section={leading} info={page.info} words={words} pinned />
          ) : undefined
        }
      >
        <DesignedHome
          info={page.info}
          design={leading ? { ...design, sections: rest } : design}
          frame={frame}
          reads={home.designed}
          words={words}
        />
        <InstallCard language={words.language} shopName={page.info.name} />
      </ShopShell>
    );
  }
  const now = Date.now();
  const line = heroLine(frame.categories, words);
  const range = deliveryRange(page.info.deliveryZones);
  const products = newest?.products ?? [];
  return (
    <ShopShell page={page} frame={frame} startCartOpen={startCartOpen}>
      <section className="hero">
        <span className="eyebrow" style={{ color: 'inherit', opacity: 0.85 }}>
          {words.t('hero_welcome')}
        </span>
        <h1>{page.info.name}</h1>
        {line !== null ? <p>{line}</p> : null}
        <a className="cta" href="/new">
          {words.t('hero_cta')} <Icon name="chev" />
        </a>
      </section>
      <div className="trust">
        <span>
          <Icon name="cash" />
          {words.t('trust_cod')}
        </span>
        {range !== null ? (
          <span>
            <Icon name="truck" />
            {words.t('trust_deliv', {
              r:
                range.from === range.to
                  ? money(range.from)
                  : `${money(range.from)}–${money(range.to)}`,
            })}
          </span>
        ) : null}
      </div>
      {frame.categories.length > 0 ? (
        <section className="sec" id="categories">
          <div className="sechead">
            <h2>{words.t('shop_by')}</h2>
          </div>
          <div className="cats">
            {frame.categories.map((category) => (
              <a key={category.id} className="cat" href={`/c/${category.slug}`}>
                <span className="img">
                  {category.image ? (
                    <img src={category.image.urls.thumbnail} alt="" loading="lazy" />
                  ) : (
                    Array.from(category.name.trim())[0]
                  )}
                </span>
                <span>{category.name}</span>
              </a>
            ))}
          </div>
        </section>
      ) : null}
      <section className="sec">
        <div className="sechead">
          <h2>{words.t('new_in')}</h2>
          {products.length > 0 ? (
            <a className="lnk" href="/new">
              {words.t('see_all')}
              <Icon name="chev" />
            </a>
          ) : null}
        </div>
        {products.length > 0 ? (
          <div className="grid">
            {products.map((product) => (
              <ProductCard key={cardKey(product)} product={product} words={words} now={now} />
            ))}
          </div>
        ) : (
          <p className="sub">{words.t('no_results')}</p>
        )}
      </section>
      <InstallCard language={words.language} shopName={page.info.name} />
    </ShopShell>
  );
}
