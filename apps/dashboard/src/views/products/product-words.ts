import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { useCategories } from '@/api/catalogue';
import type { ProductSummary } from '@/types/catalogue';

/** A product's price as a list shows it: one price, or its lowest and highest. */
export function priceOf(product: ProductSummary): string {
  const low = product.minPrice ?? product.basePrice;
  const high = product.maxPrice;
  return high && high !== low
    ? `${formatTaka(low)}–${formatTaka(high).replace('৳', '')}`
    : formatTaka(low);
}

/** A product's primary category by name: Uncategorized when it has none, null while the categories load. */
export function useCategoryName(): (id: string | null) => string | null {
  const { t } = useTranslation('shop');
  const categories = useCategories();
  return (id) =>
    id === null
      ? t('uncategorized')
      : (categories.data?.find((each) => each.id === id)?.name ?? null);
}
