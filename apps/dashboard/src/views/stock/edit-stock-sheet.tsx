import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SerialStatus,
  STOCK_BATCH_CODE_MAX_LENGTH,
  STOCK_NOTE_MAX_LENGTH,
  StockEditReason,
} from '@lytronix/validators';
import { useProductBatches, useSerials, useSetStock, type StockEdit } from '@/api/stock';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { CheckRow } from '@/components/ui/check-row';
import { Chip } from '@/components/ui/chips';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useErrorText } from '@/hooks/use-error-text';
import { formatDayMonthYear, todayInputValue } from '@/lib/dates';
import type { StockPageProduct } from '@/types/stock';
import { ChoiceList, ChoiceRow } from '../product/choice-list';
import { signed } from '../product/movement-words';
import { useCountedText } from '../product/stock-holders';
import { isMeasured } from '../product/stock-words';
import { lineTitle, type StockLine } from './stock-lines';

/** A typed amount: a whole number, or one with decimals in a measured unit. */
const AMOUNT = /^\d+(\.\d+)?$/;
/** A rise's batch, when it makes a new one. */
const NEW_BATCH = 'new';

/** INV-06: the one-tap reasons, in the sketch's order, with the word each chip says. */
const REASONS: readonly [StockEditReason, string][] = [
  [StockEditReason.NewStock, 'rNew'],
  [StockEditReason.CountedAgain, 'rCount'],
  [StockEditReason.DamagedOrLost, 'rDamaged'],
  [StockEditReason.Other, 'rOther'],
];

/** Whether a reason fits the change: new stock only arrives, damage only takes away (the server's own rule). */
const fits = (reason: StockEditReason, change: number): boolean =>
  !(reason === StockEditReason.NewStock && change < 0) &&
  !(reason === StockEditReason.DamagedOrLost && change > 0);

/**
 * Edit stock (the prototype's `stock-edit`, Part 20's `stock-edit-down-batch`, `-up-batch`, `-down-serial`; INV-06,
 * INV-12, INV-14): the number held now, typed or stepped, why it changed, and a note. On a product kept in batches a
 * fall names the batch it leaves (the soonest to expire unless another is chosen) and a rise the batch it joins, a new
 * one or one held; on a serial-numbered one a fall names the IMEIs leaving, all but those of units that never had one.
 */
export function EditStockSheet({
  product,
  line,
  onClose,
}: {
  product: StockPageProduct | null;
  line: StockLine | null;
  onClose: () => void;
}): React.JSX.Element | null {
  if (!product || !line) return null;
  // Each row's edit starts afresh.
  return (
    <EditStock
      key={`${product.productId}:${line.variantId}`}
      product={product}
      line={line}
      onClose={onClose}
    />
  );
}

function EditStock({
  product,
  line,
  onClose,
}: {
  product: StockPageProduct;
  line: StockLine;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const counted = useCountedText();
  const ids = useId();
  const save = useSetStock(product.productId);
  const held = Number(line.onHand);
  const [typed, setTyped] = useState(String(held));
  const [reason, setReason] = useState<StockEditReason | null>(null);
  const [note, setNote] = useState('');
  const [fromId, setFromId] = useState<string | null>(null);
  const [into, setInto] = useState(NEW_BATCH);
  const [code, setCode] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
  const batches = useProductBatches(product.productId, { enabled: product.batchTracked });
  const serials = useSerials(
    product.productId,
    product.serialTracked ? line.variantId : null,
    SerialStatus.InStock,
  );

  const value = typed.trim();
  const now =
    AMOUNT.test(value) && (isMeasured(product.stockUnit) || Number.isInteger(Number(value)))
      ? Number(value)
      : null;
  // To the thousandth a measured unit counts in, so 0.1 + 0.2 reads as 0.3.
  const change = now === null ? 0 : Math.round((now - held) * 1000) / 1000;
  const chosen = reason !== null && fits(reason, change) ? reason : null;
  const own = (batches.data?.batches ?? []).filter((each) => each.variantId === line.variantId);
  const batchLine = (batch: (typeof own)[number]) =>
    [
      batch.expiresOn ? formatDayMonthYear(batch.expiresOn) : t('batchNoExpiry'),
      counted(batch.quantity, product.stockUnit),
    ].join(' · ');
  // INV-14: units that never had an IMEI may leave unnamed; every other one leaving is named.
  const leavingCount = product.serialTracked && change < 0 ? -change : 0;
  const mustName = Math.max(0, leavingCount - line.missing);
  const named = leaving.size >= mustName && leaving.size <= leavingCount;
  const heldSerials = serials.data?.serials ?? [];

  const step = (by: number) => {
    setTyped(String(Math.max(0, Math.round(((now ?? held) + by) * 1000) / 1000)));
  };

  const submit = () => {
    if (now === null) return;
    const body: StockEdit = {
      onHand: now,
      reason: chosen ?? StockEditReason.Other,
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    if (product.batchTracked && change < 0 && fromId) body.batchId = fromId;
    if (product.batchTracked && change > 0) {
      if (into !== NEW_BATCH) body.batchId = into;
      else if (code.trim() || expiresOn) {
        body.batch = {
          ...(code.trim() ? { batchCode: code.trim() } : {}),
          ...(expiresOn ? { expiresOn } : {}),
        };
      }
    }
    if (leaving.size > 0) {
      body.serials = heldSerials.filter((each) => leaving.has(each.id)).map((each) => each.serial);
    }
    save.mutate({ variantId: line.variantId, body }, { onSuccess: onClose });
  };

  return (
    <Sheet
      open
      title={t('editStockTitle')}
      onClose={onClose}
      footer={
        <Button
          wide
          busy={save.isPending}
          disabled={now === null || change === 0 || !named}
          onClick={submit}
        >
          {t('save')}
        </Button>
      }
    >
      <p className="text-center text-[14px] text-fg-muted">
        {lineTitle(product, line)} · {t('onHandL')} <b className="num">{String(held)}</b>
      </p>
      <div className="flex flex-col items-center gap-1.5">
        <label htmlFor={`${ids}-now`} className="text-[14px] font-medium text-fg-muted">
          {t('newNumber')}
        </label>
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            aria-label={t('stockFewer')}
            disabled={(now ?? held) <= 0}
            onClick={() => {
              step(-1);
            }}
            className="inline-flex size-12 items-center justify-center rounded-full border border-line-strong disabled:opacity-50"
          >
            <Icon name="minus" />
          </button>
          <input
            id={`${ids}-now`}
            inputMode={isMeasured(product.stockUnit) ? 'decimal' : 'numeric'}
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
            }}
            aria-invalid={now === null ? true : undefined}
            className="num min-w-20 bg-transparent text-center text-[40px] font-semibold tracking-[-0.02em] outline-none [field-sizing:content]"
          />
          <button
            type="button"
            aria-label={t('stockMore')}
            onClick={() => {
              step(1);
            }}
            className="inline-flex size-12 items-center justify-center rounded-full border border-line-strong"
          >
            <Icon name="plus" />
          </button>
        </div>
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <span id={`${ids}-why`} className="text-[14px] font-medium text-fg-muted">
          {t('whyChange')}
        </span>
        <div
          role="group"
          aria-labelledby={`${ids}-why`}
          className="flex flex-wrap justify-center gap-2"
        >
          {REASONS.map(([each, word]) => (
            <Chip
              key={each}
              on={chosen === each}
              disabled={!fits(each, change)}
              className="disabled:opacity-50"
              onClick={() => {
                setReason(chosen === each ? null : each);
              }}
            >
              {t(word)}
            </Chip>
          ))}
        </div>
      </div>
      {product.batchTracked && change < 0 && own.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-[14px] font-medium text-fg-muted">{t('fromBatch')}</span>
          <ChoiceList label={t('fromBatch')}>
            {own.map((batch) => (
              <ChoiceRow
                key={batch.id}
                roomy
                on={(fromId ?? own[0]?.id) === batch.id}
                title={<span className="num">{batch.batchCode ?? '—'}</span>}
                sub={<span className="num">{batchLine(batch)}</span>}
                onChoose={() => {
                  setFromId(batch.id);
                }}
              />
            ))}
          </ChoiceList>
          <p className="text-[13px] text-fg-muted">{t('fromBatchHint')}</p>
        </div>
      ) : null}
      {product.batchTracked && change > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-[14px] font-medium text-fg-muted">{t('intoBatch')}</span>
          <ChoiceList label={t('intoBatch')}>
            <ChoiceRow
              roomy
              on={into === NEW_BATCH}
              title={t('newBatch')}
              onChoose={() => {
                setInto(NEW_BATCH);
              }}
            />
            {into === NEW_BATCH ? (
              <div className="grid gap-3 border-b border-line px-4 pb-3 last:border-b-0 sm:grid-cols-2">
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
                  onChange={(event) => {
                    setExpiresOn(event.target.value);
                  }}
                />
              </div>
            ) : null}
            {own.map((batch) => (
              <ChoiceRow
                key={batch.id}
                roomy
                on={into === batch.id}
                title={<span className="num">{batch.batchCode ?? '—'}</span>}
                sub={<span className="num">{batchLine(batch)}</span>}
                onChoose={() => {
                  setInto(batch.id);
                }}
              />
            ))}
          </ChoiceList>
        </div>
      ) : null}
      {mustName > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span id={`${ids}-leaving`} className="text-[14px] font-medium text-fg-muted">
            {t('leavingPick', { count: mustName })}
          </span>
          <div
            role="group"
            aria-labelledby={`${ids}-leaving`}
            className="flex-none overflow-hidden rounded-card border border-line"
          >
            {heldSerials.map((unit) => (
              <div key={unit.id} className="border-b border-line px-4 py-0.5 last:border-b-0">
                <CheckRow
                  checked={leaving.has(unit.id)}
                  disabled={!leaving.has(unit.id) && leaving.size >= leavingCount}
                  onChange={() => {
                    setLeaving((current) => {
                      const next = new Set(current);
                      if (next.has(unit.id)) next.delete(unit.id);
                      else next.add(unit.id);
                      return next;
                    });
                  }}
                  title={<span className="font-mono text-[14px] font-normal">{unit.serial}</span>}
                />
              </div>
            ))}
          </div>
          <p className="text-[13px] text-fg-muted">
            {line.missing > 0 ? t('leavingSomeHint', { missing: line.missing }) : t('leavingHint')}
          </p>
        </div>
      ) : null}
      <Field
        label={t('note')}
        placeholder={t('notePh')}
        value={note}
        maxLength={STOCK_NOTE_MAX_LENGTH}
        onChange={(event) => {
          setNote(event.target.value);
        }}
      />
      {change !== 0 ? (
        <p className="text-center text-[14px] text-fg-muted">
          {t('movementNoteN', { delta: signed(String(change)) })}
        </p>
      ) : null}
      {save.isError ? <Banner tone="bad">{errorText(save.error)}</Banner> : null}
    </Sheet>
  );
}
