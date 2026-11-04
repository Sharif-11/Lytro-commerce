import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { formatTaka } from '@lytronix/ui';
import { Permission, SerialFormat } from '@lytronix/validators';
import { useCouriers, useHandOver, useOrderSerials, useShip, type SentSerials } from '@/api/orders';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chips';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useErrorText } from '@/hooks/use-error-text';
import { addSerials, splitList, type SerialLine } from '@/lib/opening';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import type { Order, OrderSerialItem } from '@/types/orders';
import { SerialScanner } from '../product/serial-scanner';

/** A serial-numbered part's key: its line, and a combo's component by its variant. */
const keyOf = (item: Pick<OrderSerialItem, 'lineId' | 'variantId'>) =>
  `${item.lineId} ${item.variantId}`;

/** The serials picked, as ship and hand-over send them: a combo's by its component's variant, any other by its line. */
function sentOf(
  order: Order,
  items: OrderSerialItem[],
  picked: Map<string, string[]>,
): SentSerials[] {
  return items.map((item) => {
    const combo = order.items.some((line) => line.id === item.lineId && line.components.length > 0);
    return {
      lineId: item.lineId,
      ...(combo ? { variantId: item.variantId } : {}),
      serials: picked.get(keyOf(item)) ?? [],
    };
  });
}

/** Every serial-numbered unit has its serial (INV-14). */
const allPicked = (items: OrderSerialItem[], picked: Map<string, string[]>) =>
  items.every((item) => (picked.get(keyOf(item)) ?? []).length === Number(item.quantity));

/**
 * INV-23 (Part 34's `o29-ship-entry`): a serial by the camera, a pasted list, or typed, a USB or Bluetooth scanner typing
 * too. Each one goes through the same check as opening stock, then must be one this item holds; a bad one is named under
 * the box, and the good ones are picked.
 */
function SerialEntry({
  item,
  chosen,
  units,
  onChosen,
}: {
  item: OrderSerialItem;
  chosen: string[];
  units: number;
  onChosen: (next: string[]) => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const { t: shopWords } = useTranslation('shop');
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  /** What was entered, picked as far as it goes; true when all of it was taken. */
  function take(entered: string[]): boolean {
    const held: SerialLine[] = chosen.map((code) => ({ code, flag: null }));
    const { lines, rest } = addSerials(held, entered, item.serialFormat, units, new Set());
    const found = lines.slice(held.length);
    const next = [...chosen];
    let refused: string | null = rest.length > 0 ? t('serialsAllPicked', { count: units }) : null;
    for (const line of found) {
      if (line.flag) refused = `${line.code}: ${shopWords(`flag_${line.flag}`)}`;
      else if (item.inStock.includes(line.code)) next.push(line.code);
      else refused = t('serialNotInStock', { serial: line.code });
    }
    if (next.length > chosen.length) onChosen(next);
    setProblem(refused);
    if (refused === null) setTyped('');
    return next.length > chosen.length;
  }

  return (
    <div className="mb-2.5">
      <Field
        label={t('serialEntry')}
        value={typed}
        inputMode={item.serialFormat === SerialFormat.Imei ? 'numeric' : undefined}
        enterKeyHint="done"
        help={problem ? undefined : t('serialEntryHelp')}
        error={problem ?? undefined}
        suffix={
          <button
            type="button"
            aria-label={t('serialScan')}
            aria-pressed={scanning}
            className="flex size-9 items-center justify-center text-primary"
            onClick={() => {
              setScanning(!scanning);
            }}
          >
            <Icon name="scan" />
          </button>
        }
        onChange={(event) => {
          setTyped(event.target.value);
          setProblem(null);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          take(splitList(typed));
        }}
        onPaste={(event) => {
          const pasted = splitList(event.clipboardData.getData('text'));
          if (pasted.length < 2) return;
          event.preventDefault();
          take(pasted);
        }}
      />
      {scanning ? (
        <div className="mt-2">
          <SerialScanner onCode={(raw) => take([raw])} />
        </div>
      ) : null}
    </div>
  );
}

/** PYG-03 (Part 34's `o29-ship-balance`): a shipment the balance can't pay the fee for offers Add balance. */
function ShipRefusal({ error }: { error: unknown }): React.JSX.Element {
  const { t } = useTranslation('orders');
  const errorText = useErrorText();
  const { slug, viewer } = useShell();
  if (!(error instanceof ApiClientError && error.code === 'quota_exceeded')) {
    return <Banner tone="bad">{errorText(error)}</Banner>;
  }
  return (
    <Banner
      tone="bad"
      action={
        allows(viewer, [Permission.BalanceManage]) ? (
          <Link to="/$shop/balance" params={{ shop: slug }} className="font-semibold text-primary">
            {t('addBalance')}
          </Link>
        ) : undefined
      }
    >
      <b>{t('lowBalanceT')}</b>
      <br />
      {t('lowBalanceP')}
    </Banner>
  );
}

/**
 * The IMEI of each unit sent (Part 29's `o29-ship-serial`, INV-14): per serial-numbered item, its serials in stock as
 * chips, one picked for each unit, and how many are picked.
 */
function SerialPicks({
  items,
  picked,
  onPick,
}: {
  items: OrderSerialItem[];
  picked: Map<string, string[]>;
  onPick: (next: Map<string, string[]>) => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  return (
    <>
      {items.map((item) => {
        const key = keyOf(item);
        const units = Number(item.quantity);
        const chosen = picked.get(key) ?? [];
        return (
          <div key={key}>
            <h3 className="mb-1 text-[16px] font-semibold">{t('serialsTitle')}</h3>
            <p className="mb-2 text-[14px] text-fg-muted">
              {item.productName} · {t('unitsN', { count: units })} · {t('serialsHelp')}
            </p>
            <SerialEntry
              item={item}
              chosen={chosen}
              units={units}
              onChosen={(serials) => {
                const next = new Map(picked);
                next.set(key, serials);
                onPick(next);
              }}
            />
            <div className="flex flex-wrap gap-2">
              {item.inStock.map((serial) => {
                const on = chosen.includes(serial);
                return (
                  <Chip
                    key={serial}
                    on={on}
                    className="num"
                    disabled={!on && chosen.length >= units}
                    onClick={() => {
                      const next = new Map(picked);
                      next.set(
                        key,
                        on ? chosen.filter((each) => each !== serial) : [...chosen, serial],
                      );
                      onPick(next);
                    }}
                  >
                    {serial}
                  </Chip>
                );
              })}
            </div>
            <p className="mt-2 text-[14px] text-fg-muted">
              {t('pickedOf', { count: chosen.length, of: units })}
            </p>
          </div>
        );
      })}
    </>
  );
}

/**
 * Mark shipped (Part 29's `o29-ship`, ORD-09): the courier typed or picked from the shop's recent ones, a tracking code
 * or link, and each serial-numbered unit's serial; shipping takes the stock out and counts as one of the month's
 * orders (QTA-01). Courier booking from Lytro is Phase 6's, so not shown.
 */
export function ShipSheet({
  order,
  onShipped,
  onClose,
}: {
  order: Order;
  onShipped: (shipped: Order) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const { showToast } = useShell();
  const couriers = useCouriers();
  const serials = useOrderSerials(order.id);
  const ship = useShip(order.id);
  const [courier, setCourier] = useState('');
  const [code, setCode] = useState('');
  const [link, setLink] = useState('');
  const [picked, setPicked] = useState<Map<string, string[]>>(new Map());
  const items = serials.data ?? [];
  const ready =
    courier.trim() !== '' &&
    (code.trim() !== '' || link.trim() !== '') &&
    serials.isSuccess &&
    allPicked(items, picked);
  return (
    <Sheet
      open
      title={t('markShipped')}
      onClose={onClose}
      footer={
        <Button
          wide
          busy={ship.isPending}
          disabled={!ready}
          onClick={() => {
            ship.mutate(
              {
                courierName: courier.trim(),
                ...(code.trim() ? { trackingCode: code.trim() } : {}),
                ...(link.trim() ? { trackingLink: link.trim() } : {}),
                ...(items.length > 0 ? { serials: sentOf(order, items, picked) } : {}),
              },
              {
                onSuccess: (shipped) => {
                  showToast(
                    t('shippedToast', {
                      courier: courier.trim(),
                      code: code.trim() || link.trim(),
                    }),
                  );
                  onShipped(shipped);
                },
              },
            );
          }}
        >
          <Icon name="truck" />
          {t('markShipped')}
        </Button>
      }
    >
      {ship.isError ? <ShipRefusal error={ship.error} /> : null}
      <Field
        label={t('courier')}
        placeholder={t('courierPh')}
        value={courier}
        onChange={(event) => {
          setCourier(event.target.value);
        }}
      />
      {couriers.data && couriers.data.length > 0 ? (
        <div className="-mt-1 flex flex-wrap gap-2">
          {couriers.data.map((name) => (
            <Chip
              key={name}
              on={courier.trim() === name}
              onClick={() => {
                setCourier(name);
              }}
            >
              {name}
            </Chip>
          ))}
        </div>
      ) : null}
      <Field
        label={t('trackCode')}
        value={code}
        onChange={(event) => {
          setCode(event.target.value);
        }}
      />
      <Field
        label={t('trackLink')}
        type="url"
        placeholder="https://"
        help={t('trackHelp')}
        value={link}
        onChange={(event) => {
          setLink(event.target.value);
        }}
      />
      <p className="text-[14px] text-fg-muted">{t('shipInfo')}</p>
      {serials.isPending ? (
        <SkeletonRows count={1} />
      ) : (
        <SerialPicks items={items} picked={picked} onPick={setPicked} />
      )}
    </Sheet>
  );
}

/**
 * Hand over with IMEIs (Part 29's `o29-handover-serial`, drawn 2026-10-31): a counter order whose items need serials
 * picks the IMEI of each unit handed over, its cash taken in the same step.
 */
export function HandOverSerialSheet({
  order,
  items,
  onClose,
}: {
  order: Order;
  items: OrderSerialItem[];
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const { showToast } = useShell();
  const handOver = useHandOver(order.id);
  const [picked, setPicked] = useState<Map<string, string[]>>(new Map());
  const due = Number(order.due);
  return (
    <Sheet
      open
      title={t('handOver')}
      onClose={onClose}
      footer={
        <Button
          wide
          busy={handOver.isPending}
          disabled={!allPicked(items, picked)}
          onClick={() => {
            handOver.mutate(
              { serials: sentOf(order, items, picked) },
              {
                onSuccess: () => {
                  showToast(t('handedToast', { amount: formatTaka(due) }));
                  onClose();
                },
              },
            );
          }}
        >
          {t('handOver')}
        </Button>
      }
    >
      <p className="-mt-1 text-[14px] text-fg-muted">
        {t('handOverSerialHelp', { amount: formatTaka(due) })}
      </p>
      {handOver.isError ? <ShipRefusal error={handOver.error} /> : null}
      <SerialPicks items={items} picked={picked} onPick={setPicked} />
    </Sheet>
  );
}
