import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { COMBO_PART_QUANTITY_MAX, ProductKind, type StockUnit } from '@lytronix/validators';
import { useOrderPicker, useOrderPickerProduct } from '@/api/orders';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { CheckRow } from '@/components/ui/check-row';
import { Field } from '@/components/ui/field';
import { RowList } from '@/components/ui/list-row';
import { Quantity } from '@/components/ui/quantity';
import { SearchField } from '@/components/ui/search-field';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatusTag } from '@/components/ui/status-tag';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useErrorText } from '@/hooks/use-error-text';
import type { ComboPart } from '@/lib/product-form';
import { Thumb } from '@/views/orders/item-sheets';
import { optionsText } from '@/views/orders/order-words';
import { isMeasured } from './stock-words';

const TYPING_REST_MS = 250;

/** A measured quantity as typed: more than none, at most the most, to three places. */
const QUANTITY = /^\d+(\.\d{1,3})?$/;
const quantityFits = (typed: string): boolean => {
  const value = Number(typed.trim());
  return QUANTITY.test(typed.trim()) && value > 0 && value <= COMBO_PART_QUANTITY_MAX;
};

/**
 * Adding or changing a part (TENANT-DASHBOARD-DESIGN §7.33, `sh-k31-part`, `sh-k31-part-edit`; CMB-01): which product,
 * unless it is a part already being changed, then which of its variants and how many.
 */
export function PartSheets({
  part,
  onSave,
  onRemove,
  onClose,
}: {
  /** The part being changed; null to add one. */
  part: ComboPart | null;
  onSave: (part: ComboPart) => void;
  onRemove: (() => void) | null;
  onClose: () => void;
}): React.JSX.Element {
  const [item, setItem] = useState<{ id: string; name: string } | null>(
    part ? { id: part.productId, name: part.productName } : null,
  );
  // Kept while a product is open, so going back finds the search as it was.
  const [typed, setTyped] = useState('');
  if (!item) {
    return <PickSheet typed={typed} onType={setTyped} onPick={setItem} onClose={onClose} />;
  }
  return (
    <TickSheet
      item={item}
      part={part}
      onSave={onSave}
      onRemove={onRemove}
      onBack={
        part
          ? undefined
          : () => {
              setItem(null);
            }
      }
      onClose={onClose}
    />
  );
}

/** Which product (`sh-k31-part`): found by name; a combo is there, greyed, because it can't go inside another. */
function PickSheet({
  typed,
  onType,
  onPick,
  onClose,
}: {
  typed: string;
  onType: (typed: string) => void;
  onPick: (item: { id: string; name: string }) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const { t: words } = useTranslation('orders');
  const errorText = useErrorText();
  const search = useDebouncedValue(typed.trim(), TYPING_REST_MS);
  const found = useOrderPicker(search);
  const items = (found.data?.pages ?? []).flatMap((page) => page.products);
  return (
    <Sheet open title={t('comboPickProduct')} onClose={onClose}>
      <SearchField
        value={typed}
        onChange={onType}
        placeholder={words('searchProduct')}
        label={words('searchProduct')}
      />
      {found.isError ? <Banner tone="bad">{errorText(found.error)}</Banner> : null}
      {found.isPending ? (
        <SkeletonRows count={4} />
      ) : items.length === 0 ? (
        <p className="text-[14px] text-fg-muted">{words('noProducts')}</p>
      ) : (
        <RowList className="mt-2">
          {items.map((item) =>
            item.kind === ProductKind.Combo ? (
              <div
                key={item.id}
                aria-disabled="true"
                className="flex min-h-16 w-full items-center gap-3 px-4 py-3 opacity-55"
              >
                <Thumb image={item.image} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[16px] font-medium">
                    {item.name} <StatusTag tone="neutral">{t('comboTag')}</StatusTag>
                  </span>
                  <span className="text-[14px] text-fg-muted">{t('comboNotInside')}</span>
                </span>
              </div>
            ) : (
              <button
                key={item.id}
                type="button"
                className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left"
                onClick={() => {
                  onPick({ id: item.id, name: item.name });
                }}
              >
                <Thumb image={item.image} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[16px] font-medium">{item.name}</span>
                  <span className="text-[14px] text-fg-muted">
                    {optionsText(item.optionNames) || t('variant1')}
                  </span>
                </span>
                <span className="num flex-none text-[16px] font-semibold">
                  {formatTaka(item.minPrice)}
                </span>
              </button>
            ),
          )}
        </RowList>
      )}
      {found.hasNextPage ? (
        <Button
          tone="outline"
          wide
          busy={found.isFetchingNextPage}
          onClick={() => {
            void found.fetchNextPage();
          }}
        >
          {words('showMore')}
        </Button>
      ) : null}
    </Sheet>
  );
}

/**
 * Which can go in (`sh-k31-part-variants`, `sh-k31-part-fixed`): its variants ticked, each with how many are left or that
 * it's off sale; the sheet says what the ticks make of it. Part of a unit only for a measured product's one variant
 * (`sh-k31-part-measured`, UOM-03); a choice counts whole units, the customer picking one for each.
 */
function TickSheet({
  item,
  part,
  onSave,
  onRemove,
  onBack,
  onClose,
}: {
  item: { id: string; name: string };
  part: ComboPart | null;
  onSave: (part: ComboPart) => void;
  onRemove: (() => void) | null;
  onBack: (() => void) | undefined;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const found = useOrderPickerProduct(item.id);
  const variants = found.data?.variants ?? [];
  const [ticked, setTicked] = useState<ReadonlySet<string>>(
    new Set(part?.variants.map((each) => each.variantId) ?? []),
  );
  const [quantity, setQuantity] = useState(part?.quantity ?? '1');
  const unit: StockUnit | undefined = found.data?.stockUnit;

  // A product with one variant has only that one to go in.
  useEffect(() => {
    const only = variants.length === 1 ? variants[0] : undefined;
    if (only) setTicked(new Set([only.variantId]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found.data]);

  const chosen = variants.filter((each) => ticked.has(each.variantId));
  const typedPart = chosen.length === 1 && unit !== undefined && isMeasured(unit);
  const whole = Math.min(
    COMBO_PART_QUANTITY_MAX,
    Math.max(1, Math.ceil(Number(quantity.trim()) || 1)),
  );
  const fits = typedPart ? quantityFits(quantity) : true;

  const left = (available: string | null): string | null => {
    if (available === null) return null;
    const count = Number(available);
    return unit !== undefined && isMeasured(unit)
      ? t('comboLeftUnit', { n: count, unit: t(`su_${unit}`) })
      : t('comboLeft', { count });
  };

  return (
    <Sheet
      open
      title={t('comboTickT', { name: item.name })}
      onClose={onClose}
      onBack={onBack}
      footer={
        <Button
          wide
          disabled={chosen.length === 0 || !fits}
          onClick={() => {
            if (unit === undefined) return;
            onSave({
              productId: item.id,
              productName: found.data?.name ?? item.name,
              stockUnit: unit,
              quantity: typedPart ? quantity.trim() : String(whole),
              variants: chosen.map((each) => ({
                variantId: each.variantId,
                label: each.label,
              })),
            });
          }}
        >
          {part ? t('save') : t('comboAddToCombo')}
        </Button>
      }
    >
      <p className="-mt-1 mb-3 text-[14px]">{t('comboTickHelp')}</p>
      {found.isError ? <Banner tone="bad">{errorText(found.error)}</Banner> : null}
      {found.isPending ? <SkeletonRows count={3} /> : null}
      {variants.map((variant) => (
        <CheckRow
          key={variant.variantId}
          checked={ticked.has(variant.variantId)}
          title={variant.label || t('comboOneVariant')}
          sub={
            [left(variant.available), variant.onSale ? null : t('comboOffSale')]
              .filter(Boolean)
              .join(' · ') || undefined
          }
          onChange={() => {
            setTicked((now) => {
              const next = new Set(now);
              if (next.has(variant.variantId)) next.delete(variant.variantId);
              else next.add(variant.variantId);
              return next;
            });
          }}
        />
      ))}
      {chosen.length > 0 ? (
        <div className="my-2.5">
          <Banner tone="info">
            {chosen.length === 1 ? t('comboTickedOne') : t('comboTicked', { n: chosen.length })}
          </Banner>
        </div>
      ) : null}
      {found.isSuccess ? (
        typedPart ? (
          <Field
            label={t('comboQty')}
            inputMode="decimal"
            className="num"
            value={quantity}
            suffix={t(`su_${unit}`)}
            error={quantity.trim() !== '' && !fits ? t('comboQtyBad') : undefined}
            onChange={(event) => {
              setQuantity(event.target.value);
            }}
          />
        ) : (
          <div className="flex min-h-12 items-center justify-between gap-3">
            <span className="text-[15px] font-medium">{t('comboQty')}</span>
            <Quantity
              value={whole}
              most={COMBO_PART_QUANTITY_MAX}
              label={t('comboQty')}
              onChange={(value) => {
                setQuantity(String(value));
              }}
            />
          </div>
        )
      ) : null}
      {onRemove ? (
        <div className="mt-1">
          <Button tone="ghost" size="sm" onClick={onRemove}>
            <span className="text-danger">{t('comboRemovePart')}</span>
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
}
