import { deliveryRange, heroLine } from '@/lib/catalogue/browse';
import { money } from '@/lib/i18n/words';
import { loadFrame, type OpenShopPage, storefrontApi } from '@/lib/storefront';
import { Icon } from '../icon';
import { ProductCard } from '../product-card';
import { ShopShell } from '../shop-shell';

// The home's "New arrivals": a grid of four (STOREFRONT-DESIGN §2).
const NEW_ON_HOME = 4;

/** STOREFRONT-DESIGN §2, Slice 12b's read: the home from the shop's own data only -- the hero (Welcome, its name, its
    first categories), the trust strip (cash on delivery, its delivery charges), its categories and its newest four.
    Bestsellers and the wallet marks wait for their phases. `/cart` is this page with the cart open. */
export async function HomeView({
  page,
  startCartOpen,
}: {
  page: OpenShopPage;
  startCartOpen?: boolean;
}) {
  const [frame, newest] = await Promise.all([
    loadFrame(page),
    storefrontApi.products(page.shop, page.shopper, { sort: 'newest', limit: NEW_ON_HOME }),
  ]);
  const { words } = page;
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
              <ProductCard key={product.id} product={product} words={words} now={now} />
            ))}
          </div>
        ) : (
          <p className="sub">{words.t('no_results')}</p>
        )}
      </section>
    </ShopShell>
  );
}
