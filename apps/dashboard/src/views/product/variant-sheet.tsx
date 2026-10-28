import { useTranslation } from 'react-i18next';
import { SKU_MAX_LENGTH } from '@lytronix/validators';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import type { ProductSettings } from '@/lib/product-settings';
import type { VariantRow } from '@/lib/variant-matrix';
import { AdjustRow } from './stock-delivery-card';

/**
 * The variant sheet (Part 15's `sh-variant`, agreed in the 11.7b read; ATR-05, ATR-13): what one variant sets for
 * itself -- its SKU and barcode, its weight and delivery charge (empty follows the product, shown as the hint), whether
 * its charge grows with its weight, and whether it is on sale. Opened from its name in the table; what is typed applies
 * as it is typed, and Save keeps it.
 */
export function VariantSheet({
  row,
  name,
  settings,
  readOnly,
  onChange,
  onClose,
}: {
  /** The variant being set; null while the sheet is shut. */
  row: VariantRow | null;
  name: string;
  /** The product's own settings, which an empty field follows. */
  settings: ProductSettings;
  readOnly: boolean;
  onChange: (patch: Partial<VariantRow>) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const weighed = row !== null && (row.weightKg.trim() !== '' || settings.weightKg.trim() !== '');
  return (
    <Sheet
      open={row !== null}
      title={name}
      onClose={onClose}
      footer={
        <Button wide onClick={onClose}>
          {t('done')}
        </Button>
      }
    >
      {row ? (
        <div className="flex flex-col gap-3">
          <p className="text-[14px] text-fg-muted">{t('variantHint')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t('skuCol')}
              value={row.sku}
              maxLength={SKU_MAX_LENGTH}
              readOnly={readOnly}
              onChange={(event) => {
                onChange({ sku: event.target.value });
              }}
            />
            <Field
              label={t('barcode')}
              value={row.barcode}
              // As drawn: a Bangladeshi EAN-13 shows what goes here.
              placeholder="8941100500123"
              maxLength={SKU_MAX_LENGTH}
              readOnly={readOnly}
              onChange={(event) => {
                onChange({ barcode: event.target.value });
              }}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t('weightKg')}
              inputMode="decimal"
              className="num"
              value={row.weightKg}
              placeholder={
                settings.weightKg.trim() === ''
                  ? '0.00'
                  : t('productOwn', { value: settings.weightKg })
              }
              readOnly={readOnly}
              onChange={(event) => {
                onChange({ weightKg: event.target.value });
              }}
            />
            <Field
              label={t('deliveryCharge')}
              prefix="৳"
              inputMode="decimal"
              className="num"
              value={row.deliveryCharge}
              placeholder={
                settings.deliveryCharge.trim() === ''
                  ? t('followsZone')
                  : t('productOwn', { value: settings.deliveryCharge })
              }
              readOnly={readOnly}
              onChange={(event) => {
                onChange({ deliveryCharge: event.target.value });
              }}
            />
          </div>
          {weighed ? (
            <AdjustRow
              on={row.adjustByWeight ?? settings.adjustByWeight}
              readOnly={readOnly}
              onChange={(adjustByWeight) => {
                onChange({ adjustByWeight });
              }}
            />
          ) : null}
          <div className="flex min-h-10 items-center gap-3">
            <Switch
              checked={row.active}
              disabled={readOnly}
              label={t('onSale')}
              onChange={(active) => {
                onChange({ active });
              }}
            />
            <span className="flex flex-col">
              <span className="text-[15px] font-medium">{t('onSale')}</span>
              <span className="text-[13px] text-fg-muted">{t('onSaleHint')}</span>
            </span>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
