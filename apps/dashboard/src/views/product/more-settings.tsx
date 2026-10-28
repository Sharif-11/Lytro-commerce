import { useTranslation } from 'react-i18next';
import {
  ItemCondition,
  ProductFormField,
  SerialFormat,
  SKU_MAX_LENGTH,
  StockTracking,
} from '@lytronix/validators';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Field, SelectField } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { switchBatches, switchSerials, type ProductSettings } from '@/lib/product-settings';
import type { SingleVariant } from '@/lib/product-form';
import { ChartField, SwitchLine } from './type-cards';

/**
 * More settings (TENANT-DASHBOARD-DESIGN §7.4's fourth card, collapsed; PST-05): whatever the shop type does not show up
 * front -- the size chart, the condition, the serial and batch switches -- a product with no options' SKU and barcode
 * (agreed 2026-10-28), whether it is on sale, and on a saved product Duplicate (PRD-18), Archive and Delete for good
 * (PRD-13).
 */
export function MoreSettings({
  active,
  upFront,
  settings,
  single,
  chartText,
  readOnly,
  busy,
  onActive,
  onSettings,
  onSingle,
  onChart,
  onDuplicate,
  onRemove,
}: {
  active: boolean;
  /** PST-05: the fields the shop type shows up front, which are not repeated here. */
  upFront: readonly ProductFormField[];
  settings: ProductSettings;
  /** A product with no options: its one variant; null once options split it. */
  single: SingleVariant | null;
  chartText: string;
  readOnly: boolean;
  /** Duplicate is under way. */
  busy: boolean;
  onActive: (active: boolean) => void;
  onSettings: (patch: Partial<ProductSettings>) => void;
  onSingle: (patch: Partial<SingleVariant>) => void;
  onChart: () => void;
  /** Duplicate, Archive and Delete for good, on a saved product; null on a new one. */
  onDuplicate: (() => void) | null;
  onRemove: ((how: 'archive' | 'hard') => void) | null;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const counted = settings.stockTracking === StockTracking.Tracked;
  const imei = settings.serialFormat === SerialFormat.Imei;
  return (
    <details className="group rounded-card border border-line bg-surface p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between font-semibold [&::-webkit-details-marker]:hidden">
        {t('moreSettings')}
        <span className="transition-transform group-open:rotate-180">
          <Icon name="down" />
        </span>
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        {upFront.includes(ProductFormField.SizeChart) ? null : (
          <ChartField text={chartText} onOpen={onChart} />
        )}
        {upFront.includes(ProductFormField.ItemCondition) ? null : (
          <SelectField
            label={t('condition')}
            value={settings.condition}
            disabled={readOnly}
            options={[
              { value: ItemCondition.New, label: t('condNew') },
              { value: ItemCondition.Used, label: t('condUsed') },
              { value: ItemCondition.Refurbished, label: t('condRefurb') },
            ]}
            onChange={(event) => {
              const condition = new Map<string, ItemCondition>(
                Object.values(ItemCondition).map((each) => [each, each]),
              ).get(event.target.value);
              if (condition) onSettings({ condition });
            }}
          />
        )}
        {upFront.includes(ProductFormField.SerialTracked) || !counted ? null : (
          <SwitchLine
            on={settings.serialTracked}
            name={t('serialSwitch')}
            label={t('serialSwitch')}
            hint={
              settings.serialTracked ? (imei ? t('serialHintImei') : t('serialHintAny')) : undefined
            }
            readOnly={readOnly}
            onChange={(on) => {
              onSettings(switchSerials(on));
            }}
          />
        )}
        {upFront.includes(ProductFormField.BatchTracked) || !counted ? null : (
          <SwitchLine
            on={settings.batchTracked}
            name={t('batchSwitch')}
            label={t('batchSwitch')}
            readOnly={readOnly}
            onChange={(on) => {
              onSettings(switchBatches(on));
            }}
          />
        )}
        {single ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t('skuCol')}
              value={single.sku}
              maxLength={SKU_MAX_LENGTH}
              readOnly={readOnly}
              onChange={(event) => {
                onSingle({ sku: event.target.value });
              }}
            />
            <Field
              label={t('barcode')}
              value={single.barcode}
              maxLength={SKU_MAX_LENGTH}
              readOnly={readOnly}
              onChange={(event) => {
                onSingle({ barcode: event.target.value });
              }}
            />
          </div>
        ) : null}
        <div className="flex min-h-10 items-center gap-3">
          <Switch checked={active} disabled={readOnly} onChange={onActive} label={t('active')} />
          <span className="text-[15px] font-medium">{t('active')}</span>
        </div>
        {readOnly || !onDuplicate || !onRemove ? null : (
          <div className="flex flex-wrap gap-2">
            <Button tone="outline" size="sm" busy={busy} onClick={onDuplicate}>
              <Icon name="copy" />
              {t('duplicate')}
            </Button>
            <Button
              tone="outline"
              size="sm"
              onClick={() => {
                onRemove('archive');
              }}
            >
              {t('archiveOpt')}
            </Button>
            <Button
              tone="outline"
              size="sm"
              onClick={() => {
                onRemove('hard');
              }}
            >
              <span className="text-danger-text">{t('deleteForever')}</span>
            </Button>
          </div>
        )}
      </div>
    </details>
  );
}
