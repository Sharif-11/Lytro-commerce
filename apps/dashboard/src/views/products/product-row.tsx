import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { StockState } from '@lytronix/validators';
import { Icon } from '@/components/icon';
import { RowText, RowTrail, rowClass } from '@/components/ui/list-row';
import { StatusTag, type StatusTone } from '@/components/ui/status-tag';
import { useShell } from '@/shell/shell-context';
import type { ProductSummary } from '@/types/catalogue';
import { priceOf } from './product-words';

/** INV-08, CCH-08: a product's stock state as its chip says it. */
const STOCK: Record<StockState, [StatusTone, string]> = {
  [StockState.In]: ['ok', 'inStock'],
  [StockState.Low]: ['warn', 'lowStock'],
  [StockState.Out]: ['bad', 'outStock'],
};

/** INV-08, CCH-08: a product's stock state in its chip (the prototype's `stockChip`). */
export function StockTag({ state }: { state: StockState }): React.JSX.Element {
  const { t } = useTranslation('shop');
  const [tone, label] = STOCK[state];
  return <StatusTag tone={tone}>{t(label)}</StatusTag>;
}

/**
 * One product as every list shows it (the prototype's `prodRow`): its first photo or the drawn tile, the name with
 * Inactive when it is, "n variants · category", the price over its stock chip; an archived one's chip says Archived
 * (Part 13). It opens the product.
 */
export function ProductRow({
  product,
  category,
  archived = false,
}: {
  product: ProductSummary;
  /** Its primary category's name, Uncategorized, or null while the categories load. */
  category: string | null;
  archived?: boolean;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const { slug } = useShell();
  const [tone, label] = archived ? (['neutral', 'plArchived'] as const) : STOCK[product.stockState];
  return (
    <Link
      to="/$shop/products/$productId"
      params={{ shop: slug, productId: product.id }}
      className={rowClass}
    >
      <span className="flex size-12 flex-none items-center justify-center overflow-hidden rounded-button bg-linear-135 from-neutral-100 to-neutral-200 text-neutral-400">
        {product.image ? (
          <img src={product.image.urls.thumbnail} alt="" className="size-full object-cover" />
        ) : (
          <Icon name="image" />
        )}
      </span>
      <RowText
        title={
          <>
            {product.name}{' '}
            {product.active || archived ? null : (
              <StatusTag tone="neutral">{t('inactive')}</StatusTag>
            )}
          </>
        }
        sub={[
          product.variantCount === 1 ? t('variant1') : t('variantsN', { n: product.variantCount }),
          category,
        ]
          .filter(Boolean)
          .join(' · ')}
      />
      <RowTrail>
        <span className="num text-[16px] font-semibold">{priceOf(product)}</span>
        <StatusTag tone={tone}>{t(label)}</StatusTag>
      </RowTrail>
    </Link>
  );
}
