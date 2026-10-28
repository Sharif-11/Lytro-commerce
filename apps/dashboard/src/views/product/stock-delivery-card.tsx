import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StockTracking, StockUnit } from '@lytronix/validators';
import { useDeliverySettings } from '@/api/shop-setup';
import { Card } from '@/components/ui/card';
import { Field, PickField, SelectField } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import type { ProductForm } from '@/lib/product-form';
import type { ProductSettings } from '@/lib/product-settings';
import type { ProductDefaults } from '@/types/attribute';
import type { ProductDetail } from '@/types/product';
import { ChoiceList, ChoiceRow } from './choice-list';
import { PolicySheet } from './policy-sheet';
import { isMeasured, usePolicyWords } from './stock-words';
import { ZonesSheet } from './zones-sheet';

const UNITS = Object.values(StockUnit);

/** PRD-16: with a weight, a switch says whether the charge grows with it (Part 15). */
export function AdjustRow({
  on,
  readOnly,
  onChange,
}: {
  on: boolean;
  readOnly: boolean;
  onChange: (on: boolean) => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  return (
    <div className="flex min-h-10 items-center gap-3">
      <Switch checked={on} disabled={readOnly} label={t('adjustByWeight')} onChange={onChange} />
      <span className="flex flex-col">
        <span className="text-[15px] font-medium">{t('adjustByWeight')}</span>
        <span className="text-[13px] text-fg-muted">{t('adjustHint')}</span>
      </span>
    </div>
  );
}

/**
 * Stock and delivery (TENANT-DASHBOARD-DESIGN §7.4's third card, the prototype's `pfStock` and Part 15): counted or made
 * to order (INV-02, through `onTracking`, which asks first when stock is held), the unit and the low-stock alert
 * (UOM-01, INV-08), a new product's opening stock when it has no options (INV-03), the weight and delivery charge with
 * Adjust by weight (PRD-16), where it delivers (DLV-07) and its payment policy (PRD-08).
 */
export function StockDeliveryCard({
  form,
  product,
  shopDefault,
  readOnly,
  errors,
  onTracking,
  onSettings,
  onChange,
}: {
  form: ProductForm;
  product: ProductDetail | null;
  shopDefault: ProductDefaults['shopPaymentPolicy'] | null;
  readOnly: boolean;
  /** What the form or the server found wrong, by field. */
  errors: Partial<
    Record<'unit' | 'low' | 'opening' | 'weight' | 'charge' | 'zones' | 'policy', string>
  >;
  onTracking: (tracking: StockTracking) => void;
  onSettings: (patch: Partial<ProductSettings>) => void;
  onChange: (patch: Partial<ProductForm>) => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation('shop');
  const titleId = useId();
  const policies = usePolicyWords();
  const delivery = useDeliverySettings();
  const [zonesOpen, setZonesOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const settings = form.settings;
  const tracked = settings.stockTracking === StockTracking.Tracked;
  const opening =
    product === null &&
    tracked &&
    form.splits.length === 0 &&
    !settings.batchTracked &&
    !settings.serialTracked;

  const zoneNames = (delivery.data?.zones ?? [])
    .filter((zone) => form.deliveryZoneIds.includes(zone.id))
    .map((zone) => (i18n.language === 'bn' ? zone.label.bn : zone.label.en));
  const deliversTo =
    form.deliveryZoneIds.length === 0
      ? t('everywhere')
      : zoneNames.length > 0
        ? zoneNames.join(', ')
        : t('zonesN', { count: form.deliveryZoneIds.length });
  const policy =
    settings.paymentPolicy === null
      ? `${t('policyShop')} · ${
          shopDefault
            ? policies.short(shopDefault.defaultPaymentPolicy, shopDefault.defaultAdvanceAmount)
            : ''
        }`
      : policies.short(settings.paymentPolicy, settings.advanceAmount);
  return (
    <Card role="region" aria-labelledby={titleId} className="flex flex-col gap-3">
      <h3 id={titleId} className="text-[17px] font-semibold">
        {t('stockDelivery')}
      </h3>
      <ChoiceList label={t('stockDelivery')} bare>
        <ChoiceRow
          bare
          on={tracked}
          disabled={readOnly}
          title={t('tracked')}
          onChoose={() => {
            onTracking(StockTracking.Tracked);
          }}
        />
        <ChoiceRow
          bare
          on={!tracked}
          disabled={readOnly}
          title={t('madeToOrder')}
          onChoose={() => {
            onTracking(StockTracking.NotTracked);
          }}
        />
      </ChoiceList>
      {tracked ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label={t('unitField')}
            value={settings.stockUnit}
            disabled={readOnly}
            help={isMeasured(settings.stockUnit) ? t('measuredHint') : undefined}
            error={errors.unit}
            options={UNITS.map((unit) => ({ value: unit, label: t(`unitName_${unit}`) }))}
            onChange={(event) => {
              const stockUnit = new Map<string, StockUnit>(UNITS.map((unit) => [unit, unit])).get(
                event.target.value,
              );
              if (stockUnit) onSettings({ stockUnit });
            }}
          />
          <Field
            label={t('lowAt')}
            inputMode="decimal"
            className="num"
            value={settings.lowStockThreshold}
            error={errors.low}
            readOnly={readOnly}
            onChange={(event) => {
              onSettings({ lowStockThreshold: event.target.value });
            }}
          />
        </div>
      ) : null}
      {opening ? (
        <Field
          label={t('openingStockL')}
          inputMode="decimal"
          className="num"
          value={form.openingStock}
          suffix={t(`su_${settings.stockUnit}`)}
          help={t('openingHint')}
          error={errors.opening}
          onChange={(event) => {
            onChange({ openingStock: event.target.value });
          }}
        />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={t('weightKg')}
          inputMode="decimal"
          className="num"
          placeholder="0.00"
          value={settings.weightKg}
          error={errors.weight}
          readOnly={readOnly}
          onChange={(event) => {
            onSettings({ weightKg: event.target.value });
          }}
        />
        <Field
          label={t('deliveryCharge')}
          prefix="৳"
          inputMode="decimal"
          className="num"
          placeholder={t('followsZone')}
          value={settings.deliveryCharge}
          error={errors.charge}
          readOnly={readOnly}
          onChange={(event) => {
            onSettings({ deliveryCharge: event.target.value });
          }}
        />
      </div>
      {settings.weightKg.trim() !== '' ? (
        <AdjustRow
          on={settings.adjustByWeight}
          readOnly={readOnly}
          onChange={(adjustByWeight) => {
            onSettings({ adjustByWeight });
          }}
        />
      ) : null}
      <PickField
        label={t('deliversTo')}
        value={deliversTo}
        error={errors.zones}
        disabled={readOnly}
        onPick={() => {
          setZonesOpen(true);
        }}
      />
      <PickField
        label={t('payPolicy')}
        value={policy}
        error={errors.policy}
        disabled={readOnly}
        onPick={() => {
          setPolicyOpen(true);
        }}
      />
      <ZonesSheet
        open={zonesOpen}
        chosen={form.deliveryZoneIds}
        onDone={(deliveryZoneIds) => {
          setZonesOpen(false);
          onChange({ deliveryZoneIds });
        }}
        onClose={() => {
          setZonesOpen(false);
        }}
      />
      <PolicySheet
        open={policyOpen}
        policy={settings.paymentPolicy}
        advance={settings.advanceAmount}
        shopDefault={shopDefault}
        onDone={(paymentPolicy, advanceAmount) => {
          setPolicyOpen(false);
          onSettings({ paymentPolicy, advanceAmount });
        }}
        onClose={() => {
          setPolicyOpen(false);
        }}
      />
    </Card>
  );
}
