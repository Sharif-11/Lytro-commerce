import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icon';
import { ProductShareBody } from '@/components/product-share/product-share';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import type { ProductDetail } from '@/types/product';

/**
 * After a new product's first save (the owner, 2026-11-25: "after saving a product we want the seller share the
 * product"; the sketch's `pq-saved`): the product's share sheet body, the same one the products list and the product's
 * page open (§7.4c), under "Product saved", then Add another product or Go to the product. Editing a saved product shows
 * no sheet.
 */
export function SavedSheet({
  product,
  onAnother,
  onProduct,
  onClose,
}: {
  product: ProductDetail | null;
  onAnother: () => void;
  onProduct: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  return (
    <Sheet
      open={product !== null}
      title={t('qsTitle')}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2">
          <Button wide tone="outline" onClick={onAnother}>
            <Icon name="plus" />
            {t('qsAnother')}
          </Button>
          <Button wide tone="ghost" onClick={onProduct}>
            {t('qsToProduct')}
          </Button>
        </div>
      }
    >
      {product ? <ProductShareBody product={product} /> : null}
    </Sheet>
  );
}
