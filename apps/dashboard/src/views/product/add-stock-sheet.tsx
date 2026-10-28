import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  STOCK_BATCH_CODE_MAX_LENGTH,
  SUPPLIER_NAME_MAX_LENGTH,
  type SerialFormat,
  type StockUnit,
} from '@lytronix/validators';
import { useAddStock, type StockAddition } from '@/api/stock';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Field, PickField } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useErrorText } from '@/hooks/use-error-text';
import { todayInputValue } from '@/lib/dates';
import { batchBody, keptOf, unitsOf, type SerialLine } from '@/lib/opening';
import { OpeningSerialsSheet } from './opening-serials-sheet';
import type { StockHolder } from './stock-holders';
import { VariantPicker } from './variant-picker';

/** A typed amount, a whole or two-decimal number above zero. */
const AMOUNT = /^\d+(\.\d+)?$/;
const NONE: ReadonlySet<string> = new Set();

/**
 * Add stock (the prototype's `stock-add`, Part 18's `stock-add-serials`; INV-06, INV-10, INV-12, INV-14, PUR-07): stock
 * that arrived for a variant -- picked as "Product · variant" where the product has several -- with what each unit
 * cost and who supplied it (a new name makes the supplier), on a batch-tracked product its batch, on a serial-numbered
 * one its units' serials as Part 16 enters them, fewer leaving the rest for later. Recorded as a purchase received in
 * full; the average cost follows.
 */
export function AddStockSheet({
  open,
  product,
  holders,
  initial,
  unit,
  batch,
  format,
  onClose,
}: {
  open: boolean;
  product: { id: string; name: string };
  holders: readonly StockHolder[];
  /** The variant it opens on; the first when left out. */
  initial: string | null;
  unit: StockUnit;
  /** INV-12: the product counts its stock in batches. */
  batch: boolean;
  /** INV-14: the product's serials' format; null when it has none. */
  format: SerialFormat | null;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const add = useAddStock(product.id);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [cost, setCost] = useState('');
  const [supplier, setSupplier] = useState('');
  const [code, setCode] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [serials, setSerials] = useState<SerialLine[]>([]);
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    if (!open) return;
    setVariantId(initial ?? holders[0]?.variantId ?? null);
    setQuantity('');
    setCost('');
    setSupplier('');
    setCode('');
    setExpiresOn('');
    setSerials([]);
    add.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const holder = holders.find((each) => each.variantId === variantId) ?? holders[0];
  const amount = quantity.trim();
  const valid = AMOUNT.test(amount) && Number(amount) > 0;
  const kept = keptOf(serials).length;
  const units = unitsOf(amount);
  const from = Number(holder?.onHand ?? 0);
  const past = expiresOn !== '' && expiresOn < todayInputValue();
  const name = holder
    ? holders.length > 1
      ? `${product.name} · ${holder.name}`
      : product.name
    : '';

  function submit(): void {
    if (!holder || !valid || past) return;
    const described = batch ? batchBody({ code, expiresOn, unitCost: '' }) : null;
    const body: StockAddition = {
      quantity: Number(amount),
      ...(cost.trim() === '' ? {} : { unitCost: Number(cost.trim()) }),
      ...(supplier.trim() === '' ? {} : { supplierName: supplier.trim() }),
      ...(described ? { batch: described } : {}),
      ...(format && kept > 0 ? { serials: keptOf(serials) } : {}),
    };
    add.mutate({ variantId: holder.variantId, body }, { onSuccess: onClose });
  }

  return (
    <>
      <Sheet
        open={open}
        title={t('addStockTitle')}
        onClose={onClose}
        footer={
          <Button wide busy={add.isPending} disabled={!valid || past} onClick={submit}>
            {t('addN', { n: valid ? String(Number(amount)) : '' })}
          </Button>
        }
      >
        {open ? (
          <div className="flex flex-col gap-3">
            <VariantPicker
              product={product.name}
              holders={holders}
              value={holder?.variantId ?? null}
              onChange={(next) => {
                setVariantId(next);
                setSerials([]);
              }}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={t('quantity')}
                inputMode="decimal"
                className="num"
                value={quantity}
                suffix={t(`su_${unit}`)}
                onChange={(event) => {
                  setQuantity(event.target.value);
                }}
              />
              <Field
                label={t('unitCost')}
                prefix="৳"
                inputMode="decimal"
                className="num"
                value={cost}
                onChange={(event) => {
                  setCost(event.target.value);
                }}
              />
            </div>
            <Field
              label={t('supplierL')}
              value={supplier}
              maxLength={SUPPLIER_NAME_MAX_LENGTH}
              help={t('supplierHint')}
              onChange={(event) => {
                setSupplier(event.target.value);
              }}
            />
            {batch ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label={t('batchCode')}
                  value={code}
                  maxLength={STOCK_BATCH_CODE_MAX_LENGTH}
                  onChange={(event) => {
                    setCode(event.target.value);
                  }}
                />
                <Field
                  label={t('expiry')}
                  type="date"
                  min={todayInputValue()}
                  value={expiresOn}
                  error={past ? t('errExpiryPast') : undefined}
                  onChange={(event) => {
                    setExpiresOn(event.target.value);
                  }}
                />
              </div>
            ) : null}
            {format ? (
              <PickField
                label={t('serialsL')}
                value={kept > 0 ? t('serialsEntered', { kept, units }) : t('serialsLater')}
                chevron="right"
                onPick={() => {
                  setEntering(true);
                }}
              />
            ) : null}
            {valid ? (
              <p className="text-[14px] text-fg-muted">
                {t(format ? 'addStockSerialsHint' : 'addStockHint', {
                  from: String(from),
                  to: String(from + Number(amount)),
                })}
              </p>
            ) : null}
            {add.isError ? <Banner tone="bad">{errorText(add.error)}</Banner> : null}
          </div>
        ) : null}
      </Sheet>
      {format ? (
        <OpeningSerialsSheet
          open={entering}
          name={name}
          units={units}
          format={format}
          lines={serials}
          others={NONE}
          entry={{
            title: t('serialsL'),
            sub: t('serialsSub', { name, count: units }),
            none: t('serialsNoQty'),
            full: t('serialsFullQty', { units }),
          }}
          onDone={(lines) => {
            setSerials(lines);
            setEntering(false);
          }}
          onClose={() => {
            setEntering(false);
          }}
        />
      ) : null}
    </>
  );
}
