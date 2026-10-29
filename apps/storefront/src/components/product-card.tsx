import { StockState } from '@lytronix/validators/enums';
import type { ProductCard as Card } from '@/lib/api/storefront-api';
import { isNew } from '@/lib/catalogue/browse';
import { money, type Words } from '@/lib/i18n/words';
import { Icon } from './icon';

// A card shows this many swatches, then how many more there are.
const SWATCHES_SHOWN = 5;

/** PRD-09: a product as a list shows it, as the prototype's card draws it: photo, one tag (sold out, few left, or New
    for one added in the last PRODUCT_NEW_DAYS), name, price or "from", and its colour swatches (ATR-18). `now` is
    when the page was made, so the server and the browser agree on New. */
export function ProductCard({ product, words, now }: { product: Card; words: Words; now: number }) {
  const out = product.stockState === StockState.Out;
  const ranged = product.maxPrice !== null && product.maxPrice !== product.minPrice;
  const more = product.swatches.length - SWATCHES_SHOWN;
  return (
    <a className={`card${out ? ' out' : ''}`} href={`/p/${product.slug}`}>
      <div className="img">
        {product.image ? (
          <img src={product.image.urls.thumbnail} alt="" loading="lazy" />
        ) : (
          <span className="ph">{Array.from(product.name.trim())[0]}</span>
        )}
        {out ? (
          <span className="tag out">{words.t('out')}</span>
        ) : product.stockState === StockState.Low ? (
          <span className="tag low">{words.t('low')}</span>
        ) : isNew(product.createdAt, now) ? (
          <span className="tag">
            <Icon name="sparkle" />
            {words.t('new_')}
          </span>
        ) : null}
      </div>
      <div className="nm">{product.name}</div>
      {product.minPrice !== null ? (
        <div className="pr">
          <span className="price">
            {ranged ? words.t('from', { p: money(product.minPrice) }) : money(product.minPrice)}
          </span>
        </div>
      ) : null}
      {product.swatches.length > 0 ? (
        <div className="sw" aria-label={product.swatches.map((swatch) => swatch.value).join(', ')}>
          {product.swatches.slice(0, SWATCHES_SHOWN).map((swatch) => (
            <i
              key={swatch.id}
              style={
                swatch.swatchImage
                  ? { backgroundImage: `url(${swatch.swatchImage.urls.thumbnail})` }
                  : { background: swatch.swatchColor ?? undefined }
              }
            />
          ))}
          {more > 0 ? <span className="more">+{more}</span> : null}
        </div>
      ) : null}
    </a>
  );
}
