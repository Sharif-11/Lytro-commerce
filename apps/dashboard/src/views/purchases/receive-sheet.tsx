import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PURCHASE_REASON_MAX_LENGTH,
  STOCK_BATCH_CODE_MAX_LENGTH,
  STOCK_NOTE_MAX_LENGTH,
} from '@lytronix/validators';
import { useReceive, type ReceivedItem } from '@/api/purchases';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useErrorText } from '@/hooks/use-error-text';
import { todayInputValue } from '@/lib/dates';
import { batchBody, keptOf, unitsOf, type SerialLine } from '@/lib/opening';
import type { Purchase, PurchaseItem } from '@/types/purchasing';
import { OpeningSerialsSheet } from '../product/opening-serials-sheet';
import { useAmountText } from '../product/stock-holders';
import { AMOUNT, costOk, unitOf } from './purchase-lines';
import { purchaseNumber, usePurchaseWords } from './purchase-words';

/** One item of a delivery as typed. */
interface Arrival {
  accepted: string;
  rejected: string;
  reason: string;
  cost: string;
  code: string;
  expiresOn: string;
  serials: SerialLine[];
}

const typedNumber = (typed: string): number | null =>
  AMOUNT.test(typed.trim()) ? Number(typed.trim()) : null;

/** An item's arrival can be sent: amounts typed, no more than outstanding, a reason for any rejected, a later expiry. */
function arrivalOk(item: PurchaseItem, arrival: Arrival): boolean {
  const accepted = typedNumber(arrival.accepted);
  const rejected = typedNumber(arrival.rejected === '' ? '0' : arrival.rejected);
  if (accepted === null || rejected === null) return false;
  if (accepted + rejected > Number(item.outstanding)) return false;
  if (rejected > 0 && arrival.reason.trim() === '') return false;
  if (arrival.expiresOn !== '' && arrival.expiresOn < todayInputValue()) return false;
  return costOk(arrival.cost);
}

const sent = (arrival: Arrival): boolean =>
  (typedNumber(arrival.accepted) ?? 0) + (typedNumber(arrival.rejected) ?? 0) > 0;

/**
 * It arrived (the prototype's `sh-receive`, Part 21's `sh-receive-full`; PUR-04, INV-12, INV-14): each outstanding item,
 * accepted filled with what is outstanding, rejected with its reason once above nothing, the unit cost (cleared is not
 * known), a batch's code and expiry on a product kept in batches, and IMEIs on a serial-numbered one, entered as Add
 * stock enters them, the rest addable later. An item left at nothing is not sent.
 */
export function ReceiveSheet({
  open,
  purchase,
  onClose,
}: {
  open: boolean;
  purchase: Purchase;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const amount = useAmountText();
  const words = usePurchaseWords();
  const receive = useReceive(purchase.id);
  const items = purchase.items.filter((item) => Number(item.outstanding) > 0);
  const [arrivals, setArrivals] = useState<Record<string, Arrival>>({});
  const [note, setNote] = useState('');
  const [entering, setEntering] = useState<PurchaseItem | null>(null);

  useEffect(() => {
    if (!open) return;
    setArrivals(
      Object.fromEntries(
        items.map((item) => [
          item.id,
          {
            accepted: String(Number(item.outstanding)),
            rejected: '0',
            reason: '',
            cost:
              item.unitCost === undefined || item.unitCost === null
                ? ''
                : String(Number(item.unitCost)),
            code: '',
            expiresOn: '',
            serials: [],
          },
        ]),
      ),
    );
    setNote('');
    receive.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const change = (itemId: string, next: Partial<Arrival>) => {
    setArrivals((now) => {
      const was = now[itemId];
      return was ? { ...now, [itemId]: { ...was, ...next } } : now;
    });
  };

  const typed = items.flatMap((item) => {
    const arrival = arrivals[item.id];
    return arrival ? [{ item, arrival }] : [];
  });
  const going = typed.filter(({ arrival }) => sent(arrival));
  const ready = going.length > 0 && typed.every(({ item, arrival }) => arrivalOk(item, arrival));

  function submit(): void {
    if (!ready) return;
    const body: ReceivedItem[] = going.map(({ item, arrival }) => {
      const accepted = typedNumber(arrival.accepted) ?? 0;
      const rejected = typedNumber(arrival.rejected) ?? 0;
      const batch =
        item.batchTracked && accepted > 0
          ? batchBody({ code: arrival.code, expiresOn: arrival.expiresOn, unitCost: '' })
          : null;
      const serials = item.serialTracked && accepted > 0 ? keptOf(arrival.serials) : [];
      return {
        itemId: item.id,
        accepted,
        ...(rejected > 0 ? { rejected, rejectReason: arrival.reason.trim() } : {}),
        unitCost: arrival.cost.trim() === '' ? null : Number(arrival.cost.trim()),
        ...(batch ? { batch } : {}),
        ...(serials.length > 0 ? { serials } : {}),
      };
    });
    receive.mutate(
      { items: body, ...(note.trim() === '' ? {} : { note: note.trim() }) },
      { onSuccess: onClose },
    );
  }

  const enteringArrival = entering ? arrivals[entering.id] : undefined;
  const enteringName = entering ? words.item(purchase, entering) : '';
  const enteringUnits = enteringArrival ? unitsOf(enteringArrival.accepted) : 0;
  // A serial typed for another item of this delivery is flagged as twice.
  const others = new Set(
    typed
      .filter(({ item }) => item.id !== entering?.id)
      .flatMap(({ arrival }) => keptOf(arrival.serials)),
  );

  return (
    <>
      <Sheet
        open={open && entering === null}
        title={t('rcvTitle')}
        onClose={onClose}
        footer={
          <Button wide busy={receive.isPending} disabled={!ready} onClick={submit}>
            {t('rcvBtn')}
          </Button>
        }
      >
        {open ? (
          <>
            <p className="text-[14px] text-fg-muted">
              {[purchaseNumber(purchase.number), purchase.supplier?.name ?? t('noSupplier')]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {typed.map(({ item, arrival }) => {
              const name = words.item(purchase, item);
              const rejected = typedNumber(arrival.rejected) ?? 0;
              const past = arrival.expiresOn !== '' && arrival.expiresOn < todayInputValue();
              const kept = keptOf(arrival.serials).length;
              return (
                <div
                  key={item.id}
                  className="flex flex-none flex-col gap-2 rounded-card border border-line bg-surface p-3"
                >
                  <div className="font-semibold">
                    {name}{' '}
                    <span className="num text-[14px] font-normal text-fg-muted">
                      · {t('poOutstanding')} {amount(item.outstanding, unitOf(item))}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field
                      label={t('rcvAccepted')}
                      inputMode="decimal"
                      className="num"
                      value={arrival.accepted}
                      onChange={(event) => {
                        change(item.id, { accepted: event.target.value });
                      }}
                    />
                    <Field
                      label={t('rcvRejected')}
                      inputMode="decimal"
                      className="num"
                      value={arrival.rejected}
                      onChange={(event) => {
                        change(item.id, { rejected: event.target.value });
                      }}
                    />
                  </div>
                  {rejected > 0 ? (
                    <Field
                      label={t('rcvReason')}
                      placeholder={t('rcvReasonPh')}
                      maxLength={PURCHASE_REASON_MAX_LENGTH}
                      value={arrival.reason}
                      onChange={(event) => {
                        change(item.id, { reason: event.target.value });
                      }}
                    />
                  ) : null}
                  {item.batchTracked ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Field
                        label={t('rcvBatch')}
                        maxLength={STOCK_BATCH_CODE_MAX_LENGTH}
                        value={arrival.code}
                        onChange={(event) => {
                          change(item.id, { code: event.target.value });
                        }}
                      />
                      <Field
                        label={t('rcvExpiry')}
                        type="date"
                        min={todayInputValue()}
                        value={arrival.expiresOn}
                        error={past ? t('errExpiryPast') : undefined}
                        onChange={(event) => {
                          change(item.id, { expiresOn: event.target.value });
                        }}
                      />
                    </div>
                  ) : null}
                  <Field
                    label={t('unitCost')}
                    prefix="৳"
                    inputMode="decimal"
                    className="num"
                    value={arrival.cost}
                    onChange={(event) => {
                      change(item.id, { cost: event.target.value });
                    }}
                  />
                  {item.serialTracked ? (
                    <div className="flex min-h-12 items-center gap-3">
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="num text-[15px] font-medium">
                          {t('rcvImeis', { total: unitsOf(arrival.accepted), entered: kept })}
                        </span>
                        <span className="text-[14px] text-fg-muted">{t('rcvImeiLater')}</span>
                      </span>
                      <Button
                        tone="outline"
                        size="xs"
                        onClick={() => {
                          setEntering(item);
                        }}
                      >
                        {t('rcvEnterImeis')}
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
            <Field
              label={t('rcvNote')}
              placeholder="—"
              maxLength={STOCK_NOTE_MAX_LENGTH}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
              }}
            />
            <p className="text-[14px] text-fg-muted">{t('rcvHelp')}</p>
            {receive.isError ? <Banner tone="bad">{errorText(receive.error)}</Banner> : null}
          </>
        ) : null}
      </Sheet>
      {entering && enteringArrival ? (
        <OpeningSerialsSheet
          open
          name={enteringName}
          units={enteringUnits}
          format={entering.serialFormat}
          lines={enteringArrival.serials}
          others={others}
          entry={{
            title: t('serialsL'),
            sub: t('serialsSub', { name: enteringName, count: enteringUnits }),
            none: t('serialsNoQty'),
            full: t('serialsFullQty', { units: enteringUnits }),
          }}
          onDone={(lines) => {
            change(entering.id, { serials: lines });
            setEntering(null);
          }}
          onClose={() => {
            setEntering(null);
          }}
        />
      ) : null}
    </>
  );
}
