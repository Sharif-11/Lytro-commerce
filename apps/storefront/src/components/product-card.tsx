import { StockState } from '@lytronix/validators/enums';
import type { ProductCard as Card } from '@/lib/api/storefront-api';
import { money, type Words } from '@/lib/i18n/words';

/** PRD-09: a product as a list shows it, as the prototype's card draws it: photo, name, price or "from", stock tag. */
export function ProductCard({ product, words }: { product: Card; words: Words }) {
  const out = product.stockState === StockState.Out;
  const ranged = product.maxPrice !== null && product.maxPrice !== product.minPrice;
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
    </a>
  );
}
