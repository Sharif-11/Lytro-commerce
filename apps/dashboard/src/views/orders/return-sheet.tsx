import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOrderSerials, useReturnItems, type ReturnedItem } from '@/api/orders';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { CheckRow } from '@/components/ui/check-row';
import { Chip } from '@/components/ui/chips';
import { Field } from '@/components/ui/field';
import { Quantity } from '@/components/ui/quantity';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatusTag } from '@/components/ui/status-tag';
import { useErrorText } from '@/hooks/use-error-text';
import { useShell } from '@/shell/shell-context';
import type { Order, OrderItem, OrderSerialItem } from '@/types/orders';
import { useOrderWords } from './order-words';

type Back = 'sellable' | 'damaged';

/** A serial-numbered unit's key: its line, and a combo's component by its variant. */
const keyOf = (lineId: string, variantId: string | null) => `${lineId} ${variantId ?? ''}`;

/** The units of an item still out: ordered less those back already. */
const outOf = (item: OrderItem) => Number(item.quantity) - Number(item.returnedQuantity);

/** Each serial that came back, sellable or damaged (INV-14). */
function split(backs: Map<string, Back> | undefined): { sellable: string[]; damaged: string[] } {
  const all = [...(backs ?? new Map<string, Back>()).entries()];
  return {
    sellable: all.filter(([, back]) => back === 'sellable').map(([serial]) => serial),
    damaged: all.filter(([, back]) => back === 'damaged').map(([serial]) => serial),
  };
}

/**
 * Return items (Part 29's `o29-return`, ORD-10, INV-17): each item still out with Sellable and Damaged steppers --
 * sellable units back into stock, damaged ones written off; a combo whole, with a tick for any item in it that came
 * back damaged (CMB-05); a serial-numbered item by its serials, each ticked and marked if damaged (`o29-return-serial`,
 * drawn 2026-10-31); and a note.
 */
export function ReturnSheet({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const errorText = useErrorText();
  const words = useOrderWords();
  const { showToast } = useShell();
  const serials = useOrderSerials(order.id);
  const returns = useReturnItems(order.id);
  const [counts, setCounts] = useState<Map<string, { sellable: number; damaged: number }>>(
    new Map(),
  );
  const [combos, setCombos] = useState<Map<string, number>>(new Map());
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const [backs, setBacks] = useState<Map<string, Map<string, Back>>>(new Map());
  const [note, setNote] = useState('');
  const out = order.items.filter((item) => outOf(item) > 0);
  const serialOf = new Map(
    (serials.data ?? []).map((each) => [
      keyOf(
        each.lineId,
        out.some((item) => item.id === each.lineId && item.components.length > 0)
          ? each.variantId
          : null,
      ),
      each,
    ]),
  );

  /** What each item sends, or null while a serial-numbered part does not add up. */
  const body: ReturnedItem[] | null = (() => {
    const items: ReturnedItem[] = [];
    for (const item of out) {
      if (item.components.length > 0) {
        const back = combos.get(item.id) ?? 0;
        if (back === 0) continue;
        const components: NonNullable<ReturnedItem['components']> = [];
        for (const part of item.components) {
          if (part.variantId === null) continue;
          const key = keyOf(item.id, part.variantId);
          const units = Number(part.quantity) * back;
          if (serialOf.has(key)) {
            const named = split(backs.get(key));
            if (named.sellable.length + named.damaged.length !== units) return null;
            components.push({
              variantId: part.variantId,
              damaged: named.damaged.length,
              serials: named,
            });
          } else if (broken.has(key)) {
            components.push({ variantId: part.variantId, damaged: units });
          }
        }
        items.push({
          lineId: item.id,
          sellable: back,
          damaged: 0,
          ...(components.length > 0 ? { components } : {}),
        });
      } else if (serialOf.has(keyOf(item.id, null))) {
        const named = split(backs.get(keyOf(item.id, null)));
        if (named.sellable.length + named.damaged.length === 0) continue;
        items.push({
          lineId: item.id,
          sellable: named.sellable.length,
          damaged: named.damaged.length,
          serials: named,
        });
      } else {
        const count = counts.get(item.id);
        if (!count || count.sellable + count.damaged === 0) continue;
        items.push({ lineId: item.id, ...count });
      }
    }
    return items;
  })();
  const units = (body ?? []).reduce((sum, item) => sum + item.sellable + item.damaged, 0);

  /** A serial ticked in or out, or its damage changed. */
  const mark = (key: string, serial: string, back: Back | null) => {
    const next = new Map(backs);
    const own = new Map(next.get(key) ?? []);
    if (back === null) own.delete(serial);
    else own.set(serial, back);
    next.set(key, own);
    setBacks(next);
  };

  return (
    <Sheet
      open
      title={t('returnTitle')}
      onClose={onClose}
      footer={
        <Button
          wide
          busy={returns.isPending}
          disabled={body === null || body.length === 0}
          onClick={() => {
            if (!body) return;
            returns.mutate(
              { items: body, ...(note.trim() ? { note: note.trim() } : {}) },
              {
                onSuccess: () => {
                  showToast(t('backToast', { count: units }));
                  onClose();
                },
              },
            );
          }}
        >
          {t('takeBack')}
        </Button>
      }
    >
      <p className="-mt-1 text-[14px] text-fg-muted">{t('returnHelp')}</p>
      {returns.isError ? <Banner tone="bad">{errorText(returns.error)}</Banner> : null}
      {serials.isPending ? (
        <SkeletonRows count={2} />
      ) : (
        <div className="flex flex-col [&>*+*]:border-t [&>*+*]:border-line">
          {out.map((item) => {
            const variant = words.variant(item);
            const left = outOf(item);
            const head = (
              <div className="mb-3 flex items-baseline justify-between gap-3 text-[16px] font-medium">
                <span>
                  {item.productName}
                  {variant ? ` · ${variant}` : null}
                  {item.components.length > 0 ? (
                    <>
                      {' '}
                      <StatusTag tone="neutral">{t('combo')}</StatusTag>
                    </>
                  ) : null}
                </span>
                <span className="num flex-none text-fg-muted">{left}</span>
              </div>
            );
            if (item.components.length > 0) {
              const back = combos.get(item.id) ?? 0;
              return (
                <div key={item.id} className="flex flex-col gap-2 py-3 first:pt-0">
                  {head}
                  <div>
                    <div className="mb-1.5 text-[12px] text-fg-muted">{t('comboBack')}</div>
                    <Quantity
                      value={back}
                      least={0}
                      most={left}
                      label={t('comboBack')}
                      onChange={(next) => {
                        setCombos(new Map(combos).set(item.id, next));
                      }}
                    />
                  </div>
                  <p className="text-[14px] text-fg-muted">{t('comboWhole')}</p>
                  {item.components.map((part) => {
                    const key = keyOf(item.id, part.variantId);
                    const serial = serialOf.get(key);
                    const name = [
                      part.productName,
                      ...part.attributes
                        .filter((each) => each.variantDefining)
                        .map((each) => each.value),
                    ].join(' · ');
                    return serial ? (
                      <SerialBacks
                        key={key}
                        title={name}
                        item={serial}
                        backs={backs.get(key)}
                        disabled={back === 0}
                        onMark={(value, to) => {
                          mark(key, value, to);
                        }}
                      />
                    ) : (
                      // Faded until a combo is coming back, as Part 29 draws the items inside.
                      <div key={key} className={back === 0 ? 'opacity-55' : ''}>
                        <CheckRow
                          checked={broken.has(key)}
                          disabled={back === 0}
                          title={name}
                          onChange={() => {
                            const next = new Set(broken);
                            if (next.has(key)) next.delete(key);
                            else next.add(key);
                            setBroken(next);
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            }
            const serial = serialOf.get(keyOf(item.id, null));
            if (serial) {
              return (
                <div key={item.id} className="py-3 first:pt-0">
                  {head}
                  <SerialBacks
                    title={null}
                    item={serial}
                    backs={backs.get(keyOf(item.id, null))}
                    disabled={false}
                    onMark={(value, to) => {
                      mark(keyOf(item.id, null), value, to);
                    }}
                  />
                </div>
              );
            }
            const count = counts.get(item.id) ?? { sellable: 0, damaged: 0 };
            return (
              <div key={item.id} className="py-3 first:pt-0">
                {head}
                <div className="grid grid-cols-2 gap-3">
                  {(['sellable', 'damaged'] as const).map((kind) => (
                    <div key={kind}>
                      <div className="mb-1.5 text-[12px] text-fg-muted">{t(kind)}</div>
                      <Quantity
                        value={count[kind]}
                        least={0}
                        most={left - (kind === 'sellable' ? count.damaged : count.sellable)}
                        label={`${item.productName} ${t(kind)}`}
                        onChange={(next) => {
                          setCounts(new Map(counts).set(item.id, { ...count, [kind]: next }));
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Field
        label={t('noteOpt')}
        placeholder={t('returnNotePh')}
        value={note}
        onChange={(event) => {
          setNote(event.target.value);
        }}
      />
    </Sheet>
  );
}

/** The serials an item was sent with, each ticked when it came back and marked if damaged (`o29-return-serial`). */
function SerialBacks({
  title,
  item,
  backs,
  disabled,
  onMark,
}: {
  title: string | null;
  item: OrderSerialItem;
  backs: Map<string, Back> | undefined;
  disabled: boolean;
  onMark: (serial: string, back: Back | null) => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const named = split(backs);
  return (
    <div className={disabled ? 'opacity-55' : ''}>
      {title ? <div className="text-[15px] font-medium">{title}</div> : null}
      <p className="mb-1.5 text-[14px] text-fg-muted">
        {t('sentN', { count: item.sent.length })} · {t('backSerialHelp')}
      </p>
      {item.sent.map((serial) => {
        const back = backs?.get(serial) ?? null;
        return (
          <div key={serial} className="flex min-h-12 items-center gap-3">
            <span className="min-w-0 flex-1">
              <CheckRow
                checked={back !== null}
                disabled={disabled}
                title={<span className="num">{serial}</span>}
                onChange={() => {
                  onMark(serial, back === null ? 'sellable' : null);
                }}
              />
            </span>
            {back !== null ? (
              <Chip
                size="sm"
                on={back === 'damaged'}
                disabled={disabled}
                onClick={() => {
                  onMark(serial, back === 'damaged' ? 'sellable' : 'damaged');
                }}
              >
                {t('damaged')}
              </Chip>
            ) : null}
          </div>
        );
      })}
      <p className="mt-1.5 text-[14px] text-fg-muted">
        {t('backSplit', { sellable: named.sellable.length, damaged: named.damaged.length })}
      </p>
    </div>
  );
}
