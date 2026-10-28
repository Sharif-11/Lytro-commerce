import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ItemCondition, ProductFormField, SerialFormat, StockTracking } from '@lytronix/validators';
import { Icon } from '@/components/icon';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { switchBatches, switchSerials, type ProductSettings } from '@/lib/product-settings';
import type { ProductDefaults } from '@/types/attribute';
import { useFieldNames } from './stock-words';
import { Segments } from './value-sheet';

/** A switch with its words beside it (the prototype's `pfSw`). */
export function SwitchLine({
  on,
  label,
  name,
  hint,
  readOnly,
  onChange,
}: {
  on: boolean;
  label: ReactNode;
  name: string;
  hint?: ReactNode;
  readOnly: boolean;
  onChange: (on: boolean) => void;
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-3 py-1">
      <Switch checked={on} disabled={readOnly} label={name} onChange={onChange} />
      <span className="flex flex-col">
        <span className="text-[15px] font-medium">{label}</span>
        {hint ? <span className="text-[13px] text-fg-muted">{hint}</span> : null}
      </span>
    </div>
  );
}

/** FED-02: the condition, as three side by side. */
export function ConditionChoice({
  value,
  readOnly,
  onChange,
}: {
  value: ItemCondition;
  readOnly: boolean;
  onChange: (condition: ItemCondition) => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[14px] font-medium text-fg-muted">{t('conditionL')}</span>
      <Segments
        label={t('conditionL')}
        value={value}
        choices={[
          { value: ItemCondition.New, label: t('condNew') },
          { value: ItemCondition.Used, label: t('condUsed') },
          { value: ItemCondition.Refurbished, label: t('condRefurb') },
        ]}
        onChange={(next) => {
          if (!readOnly) onChange(next);
        }}
      />
      <p className="text-[13px] text-fg-muted">{t('condHint')}</p>
    </div>
  );
}

/** PRD-17: the chart field, what the product shows, and the way into its sheet. */
export function ChartField({
  text,
  onOpen,
}: {
  text: string;
  onOpen: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[14px] font-medium text-fg-muted">{t('sizeChart')}</span>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={onOpen}
        className="flex h-12 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-left text-[16px]"
      >
        <span className="min-w-0 flex-1 truncate">{text}</span>
        <span className="text-[14px] font-semibold text-primary">{t('chartView')}</span>
      </button>
    </div>
  );
}

/**
 * What the shop type shows up front (PST-05, the prototype's `pfUpfront`): its serial switch with the serials' kind,
 * the condition, the batch switch, made to order, and the size chart, each as its type lists it; a type listing none
 * says everything sits under More settings. Weight, low stock, the delivery charge and the policy are always in Stock
 * and delivery.
 */
export function UpfrontCard({
  title,
  fields,
  settings,
  chartText,
  readOnly,
  onSettings,
  onTracking,
  onChart,
}: {
  title: string;
  fields: readonly ProductFormField[];
  settings: ProductSettings;
  chartText: string;
  readOnly: boolean;
  onSettings: (patch: Partial<ProductSettings>) => void;
  onTracking: (tracking: StockTracking) => void;
  onChart: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const titleId = useId();
  const imei = settings.serialFormat === SerialFormat.Imei;
  const blocks: ReactNode[] = [];
  if (fields.includes(ProductFormField.SerialTracked)) {
    blocks.push(
      <SwitchLine
        key="serials"
        on={settings.serialTracked}
        name={t('serialSwitch')}
        label={
          <>
            {t('serialSwitch')} · <b>{imei ? t('imei') : t('anyCode')}</b>
          </>
        }
        hint={imei ? t('serialHintImei') : t('serialHintAny')}
        readOnly={readOnly}
        onChange={(on) => {
          onSettings(switchSerials(on));
        }}
      />,
    );
  }
  if (fields.includes(ProductFormField.ItemCondition)) {
    blocks.push(
      <ConditionChoice
        key="condition"
        value={settings.condition}
        readOnly={readOnly}
        onChange={(condition) => {
          onSettings({ condition });
        }}
      />,
    );
  }
  if (fields.includes(ProductFormField.BatchTracked)) {
    blocks.push(
      <SwitchLine
        key="batches"
        on={settings.batchTracked}
        name={t('batchSwitch')}
        label={t('batchSwitch')}
        hint={t('batchHint')}
        readOnly={readOnly}
        onChange={(on) => {
          onSettings(switchBatches(on));
        }}
      />,
    );
  }
  if (fields.includes(ProductFormField.StockTracking)) {
    blocks.push(
      <SwitchLine
        key="tracking"
        on={settings.stockTracking === StockTracking.NotTracked}
        name={t('mtoSwitch')}
        label={t('mtoSwitch')}
        hint={t('mtoHint')}
        readOnly={readOnly}
        onChange={(on) => {
          onTracking(on ? StockTracking.NotTracked : StockTracking.Tracked);
        }}
      />,
    );
  }
  if (fields.includes(ProductFormField.SizeChart)) {
    blocks.push(<ChartField key="chart" text={chartText} onOpen={onChart} />);
  }
  if (blocks.length === 0) {
    return (
      <Card className="border-dashed">
        <p className="text-[14px] text-fg-muted">{t('noUpfront')}</p>
      </Card>
    );
  }
  return (
    <Card role="region" aria-labelledby={titleId} className="flex flex-col gap-2">
      <h3 id={titleId} className="text-[17px] font-semibold">
        {title}
      </h3>
      {blocks}
    </Card>
  );
}

/** One line of what the type sets: its name, and what it sets (the prototype's `.pf-why .r`). */
function WhyRow({ name, value }: { name: string; value: string }): React.JSX.Element {
  return (
    <div className="flex justify-between gap-3 border-t border-line py-2 text-[14px] first:border-t-0">
      <span className="text-fg-muted">{name}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

/**
 * What this shop type sets (the prototype's `pfWhy`; PST-02, PST-05): a starting point only -- the unit, counted or made
 * to order, batches, serials and their kind, the low-stock alert, the suggested attributes and what shows up front.
 */
export function WhyCard({
  defaults,
  suggested,
}: {
  defaults: ProductDefaults;
  /** The suggested attributes, by name. */
  suggested: readonly string[];
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const fieldName = useFieldNames();
  const kind = defaults.serialFormat === SerialFormat.Imei ? t('imei') : t('anyCode');
  return (
    <Card>
      <h3 className="text-[17px] font-semibold">{t('whyTitle')}</h3>
      <p className="mt-1 mb-2 text-[14px] text-fg-muted">{t('whyHint')}</p>
      <div className="flex flex-col gap-2">
        <WhyRow name={t('whyUnit')} value={t(`unitName_${defaults.stockUnit}`)} />
        <WhyRow
          name={t('whyStock')}
          value={
            defaults.stockTracking === StockTracking.NotTracked
              ? t('madeToOrderShort')
              : t('counted')
          }
        />
        <WhyRow name={t('whyBatches')} value={defaults.batchTracked ? t('on') : t('off')} />
        <WhyRow
          name={t('whySerials')}
          value={defaults.serialTracked ? `${t('on')} · ${kind}` : t('off')}
        />
        <WhyRow name={t('whyLow')} value={String(Number(defaults.lowStockThreshold))} />
        <WhyRow
          name={t('whySuggested')}
          value={suggested.length > 0 ? suggested.join(' · ') : t('nothing')}
        />
        <WhyRow
          name={t('whyUpfront')}
          value={
            defaults.upFrontFields.length > 0
              ? defaults.upFrontFields.map((field) => fieldName[field]).join(' · ')
              : t('nothing')
          }
        />
      </div>
    </Card>
  );
}

/**
 * The defaults line (the prototype's `pf-defaults`): which type's defaults the form started from; on a new product,
 * "change" opens the category picker, since a category may behave like another type (PST-06). A saved product never
 * follows its category again, so its line has no "change" (agreed 2026-10-27).
 */
export function DefaultsLine({
  type,
  onChange,
}: {
  type: string;
  onChange: (() => void) | null;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-50 px-3 text-[13px] font-semibold text-brand-900">
        <Icon name="layers" size={16} />
        {t('defaultsFrom')}: {type}
      </span>
      {onChange ? (
        <button
          type="button"
          className="text-[14px] font-medium text-primary underline"
          onClick={onChange}
        >
          {t('changeDefaults')}
        </button>
      ) : null}
    </div>
  );
}

/** PST-06: the category chose another type's defaults, said with what moved, and Undo. */
export function TypeBanner({
  text,
  onUndo,
}: {
  text: string;
  onUndo: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  // The prototype's `.pf-banner`: lighter than a page's info banner, with a hairline, its link in the primary colour.
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-[8px] border border-brand-200 bg-brand-50 px-3.5 py-3 text-[14px] leading-[1.5]"
    >
      <span className="mt-0.5">
        <Icon name="info" />
      </span>
      <span className="flex-1">{text}</span>
      <button type="button" className="whitespace-nowrap text-primary underline" onClick={onUndo}>
        {t('undo')}
      </button>
    </div>
  );
}
