import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { COMBO_PARTS_MAX, ProductKind } from '@lytronix/validators';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Kv } from '@/components/ui/kv';
import { RowList } from '@/components/ui/list-row';
import type { ComboPart } from '@/lib/product-form';
import type { ProductSettings } from '@/lib/product-settings';
import type { ComboIssue, ProductDefaults } from '@/types/attribute';
import type { ComboQuote } from '@/types/product';
import { PartSheets } from './combo-part-sheets';
import { PolicyField } from './policy-field';
import { isMeasured } from './stock-words';
import { Segments } from './value-sheet';

/** New product's first choice (TENANT-DASHBOARD-DESIGN §7.33, `k31-new`, `k31-combo`; CMB-01): chosen once, for good. */
export function KindCard({
  value,
  onChange,
}: {
  value: ProductKind;
  onChange: (kind: ProductKind) => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  return (
    <Card className="flex flex-col gap-2.5">
      <Segments
        label={t('comboKindLabel')}
        value={value}
        choices={[
          { value: ProductKind.Standard, label: t('comboKindProduct') },
          { value: ProductKind.Combo, label: t('comboKindCombo') },
        ]}
        onChange={onChange}
      />
      <p className="text-[14px] text-fg-muted">{t('comboKindHelp')}</p>
    </Card>
  );
}

const OUT: Record<ComboIssue['reason'], string> = {
  part_archived: 'comboOutArchived',
  part_off_sale: 'comboOutOffSale',
  part_retired: 'comboOutRetired',
  no_choice_left: 'comboOutChoice',
};

/** Why the combo is out of stock, each part with its fix (`k31-combo-out` and its reasons; CMB-08). */
export function ComboOutBanners({
  issues,
}: {
  issues: readonly ComboIssue[];
}): React.JSX.Element | null {
  const { t } = useTranslation('shop');
  if (issues.length === 0) return null;
  return (
    <>
      {issues.map((issue) => (
        <Banner key={issue.position} tone="bad">
          {t(OUT[issue.reason], { part: issue.productName })}
        </Banner>
      ))}
    </>
  );
}

/** A variant's options as the sketch says them; the combo's read joins them with a slash, the picker's with a dot. */
const dotted = (label: string): string => label.split(' / ').join(' · ');

/**
 * What's inside (`k31-combo`, `k31-combo-empty`; CMB-01, CMB-02, CMB-06): each part with its photo, "Always this one" or
 * what the customer picks, how many and what it adds; then what they cost bought apart, what the customer saves and how
 * many it can make. A part opens to be changed. The figures are whatever this person may see of them.
 */
export function ComboPartsCard({
  parts,
  quote,
  canMake,
  readOnly,
  needsPart,
  refused,
  onChange,
}: {
  parts: readonly ComboPart[];
  /** Whoever may edit products: what the parts come to as they stand here. */
  quote: ComboQuote | undefined;
  /** How many it can make and what limits it, from the quote or the product's stock. */
  canMake: Pick<ComboQuote, 'canMake' | 'limitedBy' | 'issues'> | undefined;
  readOnly: boolean;
  /** Save was tried with nothing inside. */
  needsPart: boolean;
  /** What the server said of the parts it refused, by their place in the list. */
  refused: ReadonlyMap<number, string>;
  onChange: (parts: ComboPart[]) => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const [sheet, setSheet] = useState<'new' | number | null>(null);
  const out = (canMake?.issues.length ?? 0) > 0;
  return (
    <Card flush>
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
        <h2 className="text-[17px] font-semibold">{t('comboInside')}</h2>
        {readOnly || parts.length >= COMBO_PARTS_MAX ? null : (
          <Button
            tone="outline"
            size="sm"
            onClick={() => {
              setSheet('new');
            }}
          >
            <Icon name="plus" />
            {t('comboAddPart')}
          </Button>
        )}
      </div>
      {parts.length === 0 ? (
        <p className={`px-4 pb-4 text-[14px] ${needsPart ? 'text-danger' : 'text-fg-muted'}`}>
          {needsPart ? t('comboNeedPart') : t('comboNoParts')}
        </p>
      ) : (
        <>
          <RowList>
            {parts.map((part, index) => {
              const figures = quote?.parts.find((each) => each.position === index + 1);
              const only = part.variants.length === 1 ? part.variants[0] : undefined;
              const inside = (
                <>
                  <span className="flex size-12 flex-none items-center justify-center overflow-hidden rounded-button bg-linear-135 from-neutral-100 to-neutral-200 text-neutral-400">
                    {figures?.image ? (
                      <img
                        src={figures.image.urls.thumbnail}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <Icon name="image" />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[16px] font-medium">
                      {only?.label
                        ? `${part.productName} · ${dotted(only.label)}`
                        : part.productName}
                    </span>
                    <span className="text-[14px] text-fg-muted">
                      {only
                        ? t('comboFixed')
                        : t('comboChoice', {
                            list: part.variants.map((each) => dotted(each.label)).join(', '),
                          })}
                    </span>
                    <span className="truncate text-[14px] text-fg-muted">
                      {isMeasured(part.stockUnit)
                        ? t('comboEachUnit', {
                            n: Number(part.quantity),
                            unit: t(`su_${part.stockUnit}`),
                          })
                        : t('comboEach', { count: Number(part.quantity) })}
                      {figures ? (
                        <>
                          {' · '}
                          <span className="num">{formatTaka(figures.price)}</span>
                        </>
                      ) : null}
                    </span>
                    {refused.has(index) ? (
                      <span className="text-[14px] text-danger">{refused.get(index)}</span>
                    ) : null}
                  </span>
                </>
              );
              return readOnly ? (
                <div
                  key={`${part.productId}-${String(index)}`}
                  className="flex min-h-16 items-start gap-3 px-4 py-3"
                >
                  {inside}
                </div>
              ) : (
                <button
                  key={`${part.productId}-${String(index)}`}
                  type="button"
                  aria-label={t('comboChangePart', { name: part.productName })}
                  className="flex min-h-16 w-full items-start gap-3 px-4 py-3 text-left"
                  onClick={() => {
                    setSheet(index);
                  }}
                >
                  {inside}
                  <Icon name="pencil" />
                </button>
              );
            })}
          </RowList>
          {quote || canMake ? (
            <div className="border-t border-line px-4 py-3">
              {quote ? <Kv label={t('comboApart')} value={formatTaka(quote.partsValue)} /> : null}
              {quote?.saving ? (
                <Kv
                  label={t('comboSaves')}
                  value={<span className="text-success">{formatTaka(quote.saving)}</span>}
                />
              ) : null}
              {out ? (
                <Kv label={t('comboCanMakeNow')} value={<span className="text-danger">0</span>} />
              ) : canMake?.canMake === null || canMake === undefined ? null : (
                <Kv label={t('comboCanMakeNow')} value={canMake.canMake} />
              )}
              {canMake?.limitedBy ? (
                <div className="mt-0.5 text-[14px] text-fg-muted">
                  {t('comboLimited', {
                    part: canMake.limitedBy.productName,
                    count: Number(canMake.limitedBy.available),
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
      {sheet !== null ? (
        <PartSheets
          part={sheet === 'new' ? null : (parts[sheet] ?? null)}
          onSave={(part) => {
            onChange(
              sheet === 'new'
                ? [...parts, part]
                : parts.map((each, at) => (at === sheet ? part : each)),
            );
            setSheet(null);
          }}
          onRemove={
            sheet === 'new'
              ? null
              : () => {
                  onChange(parts.filter((_, at) => at !== sheet));
                  setSheet(null);
                }
          }
          onClose={() => {
            setSheet(null);
          }}
        />
      ) : null}
    </Card>
  );
}

/**
 * A combo's stock and delivery (`k31-combo`; CMB-07): it holds no stock of its own and takes no add-ons; its weight comes
 * from its items unless typed; its delivery charge and payment policy are its own.
 */
export function ComboDeliveryCard({
  settings,
  weightKg,
  shopDefault,
  readOnly,
  errors,
  onSettings,
}: {
  settings: ProductSettings;
  /** What its items weigh, when every one has a weight. */
  weightKg: string | null;
  shopDefault: ProductDefaults['shopPaymentPolicy'] | null;
  readOnly: boolean;
  errors: Partial<Record<'weight' | 'charge' | 'policy', string>>;
  onSettings: (patch: Partial<ProductSettings>) => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const fromItems = weightKg === null ? null : String(Number(weightKg));
  return (
    <Card className="flex flex-col gap-3">
      <h3 className="text-[17px] font-semibold">{t('stockDelivery')}</h3>
      <p className="text-[14px] text-fg-muted">{t('comboNoStock')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={t('weightKg')}
          inputMode="decimal"
          className="num"
          placeholder={fromItems ?? '0.00'}
          help={fromItems === null ? undefined : t('comboWeightAuto', { w: fromItems })}
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
      <PolicyField
        settings={settings}
        shopDefault={shopDefault}
        readOnly={readOnly}
        error={errors.policy}
        onSettings={onSettings}
      />
    </Card>
  );
}
