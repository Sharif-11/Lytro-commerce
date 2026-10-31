import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { CallOutcome, CancelReason } from '@lytronix/validators';
import {
  useCancelOrder,
  useDeleteOrder,
  useDeliver,
  useHandOver,
  useLogCall,
  useOrderSerials,
  useSetOverride,
} from '@/api/orders';
import { Icon, type IconName } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chips';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { RadioMark } from '@/components/ui/kv';
import { RowList } from '@/components/ui/list-row';
import { Sheet } from '@/components/ui/sheet';
import { useErrorText } from '@/hooks/use-error-text';
import { dayKey } from '@/lib/dates';
import { bangladeshiPhone } from '@/lib/phone';
import { useShell } from '@/shell/shell-context';
import type { Order, OrderPayment } from '@/types/orders';
import { PrintSheet } from './labels';
import { CANCEL_REASONS, useOrderWords } from './order-words';
import { RecordPaymentSheet, VoidSheet } from './payment-sheets';
import { ReturnSheet } from './return-sheet';
import { HandOverSerialSheet, ShipSheet } from './ship-sheet';
import type { OrderChoices } from './order-choices';

/** The sheet or dialog over the order. A call's note goes with it to Call later or Cancel, and back. */
export type OrderSheet =
  | { kind: 'call'; note?: string }
  | { kind: 'later'; fromCall: boolean; note: string }
  | { kind: 'cancel'; fromCall: boolean; note: string }
  | { kind: 'menu' }
  | { kind: 'delete' }
  | { kind: 'deliver' }
  | { kind: 'handover' }
  | { kind: 'ship' }
  | { kind: 'return' }
  | { kind: 'pay' }
  | { kind: 'void'; payment: OrderPayment }
  | { kind: 'print' };

/** The sheet the order page has open, made afresh each time it opens: a new call is not the last one. */
export function OrderSheets({
  order,
  open,
  can,
  onOpen,
  onShipped,
  onClose,
}: {
  order: Order;
  open: OrderSheet | null;
  can: OrderChoices;
  onOpen: (sheet: OrderSheet) => void;
  /** Shipped: its reply, which may name the month's limit passed (QTA-03). */
  onShipped: (shipped: Order) => void;
  onClose: () => void;
}): React.JSX.Element | null {
  switch (open?.kind) {
    case 'call':
      return <CallSheet order={order} note={open.note ?? ''} onOpen={onOpen} onClose={onClose} />;
    case 'later':
      return <LaterSheet order={order} open={open} onOpen={onOpen} onClose={onClose} />;
    case 'cancel':
      return <CancelSheet order={order} open={open} onClose={onClose} />;
    case 'menu':
      return <MenuSheet order={order} can={can} onOpen={onOpen} onClose={onClose} />;
    case 'delete':
      return <DeleteDialog order={order} onClose={onClose} />;
    case 'deliver':
      return <DeliverDialog order={order} onClose={onClose} />;
    case 'handover':
      return <HandOver order={order} onClose={onClose} />;
    case 'ship':
      return <ShipSheet order={order} onShipped={onShipped} onClose={onClose} />;
    case 'return':
      return <ReturnSheet order={order} onClose={onClose} />;
    case 'pay':
      return <RecordPaymentSheet order={order} onClose={onClose} />;
    case 'void':
      return <VoidSheet order={order} payment={open.payment} onClose={onClose} />;
    case 'print':
      return <PrintSheet orders={[order]} onClose={onClose} />;
    default:
      return null;
  }
}

/** One of a sheet's choices (the prototype's `.row` with a lead and a `.radio`). */
function ChoiceRow({
  icon,
  colour,
  title,
  sub,
  on,
  onClick,
}: {
  icon?: IconName;
  colour?: string;
  title: string;
  sub?: string;
  on?: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      role={on === undefined ? undefined : 'radio'}
      aria-checked={on}
      onClick={onClick}
      className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left"
    >
      {icon ? (
        <span
          className={`flex size-10 flex-none items-center justify-center rounded-button bg-neutral-100 ${colour ?? 'text-fg-muted'}`}
        >
          <Icon name={icon} />
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[16px] font-medium">{title}</span>
        {sub ? <span className="text-[14px] text-fg-muted">{sub}</span> : null}
      </span>
      {on === undefined ? null : <RadioMark on={on} />}
    </button>
  );
}

/** How did the call go? (Part 29's `o29-call`, ORD-51): Confirmed or No answer saved here; Call later and Cancel go on. */
function CallSheet({
  order,
  note: noted,
  onOpen,
  onClose,
}: {
  order: Order;
  note: string;
  onOpen: (sheet: OrderSheet) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const errorText = useErrorText();
  const { showToast } = useShell();
  const log = useLogCall(order.id);
  const [outcome, setOutcome] = useState<CallOutcome.Confirmed | CallOutcome.NoAnswer>(
    CallOutcome.Confirmed,
  );
  const [note, setNote] = useState(noted);
  const firstName = (order.customerName ?? '').split(' ')[0] ?? '';
  return (
    <Sheet
      open
      title={t('howWent')}
      onClose={onClose}
      footer={
        <Button
          wide
          busy={log.isPending}
          onClick={() => {
            log.mutate(
              { outcome, ...(note.trim() ? { note: note.trim() } : {}) },
              {
                onSuccess: () => {
                  showToast(
                    outcome === CallOutcome.Confirmed
                      ? t('confirmedToast', { number: order.orderNumber })
                      : t('noAnswerToast'),
                  );
                  onClose();
                },
              },
            );
          }}
        >
          {t('saveCall')}
        </Button>
      }
    >
      <p className="-mt-1 text-[14px] text-fg-muted">
        {t('howWentSub', {
          name: firstName,
          phone: order.customerPhone ? bangladeshiPhone.grouped(order.customerPhone) : '',
        })}
      </p>
      {log.isError ? <Banner tone="bad">{errorText(log.error)}</Banner> : null}
      <RowList role="radiogroup" aria-label={t('howWent')}>
        <ChoiceRow
          icon="check"
          colour="text-success"
          title={t('outConfirmed')}
          sub={t('outConfirmedH')}
          on={outcome === CallOutcome.Confirmed}
          onClick={() => {
            setOutcome(CallOutcome.Confirmed);
          }}
        />
        <ChoiceRow
          icon="phone"
          colour="text-warning"
          title={t('outNoAnswer')}
          sub={t('outNoAnswerH')}
          on={outcome === CallOutcome.NoAnswer}
          onClick={() => {
            setOutcome(CallOutcome.NoAnswer);
          }}
        />
        <ChoiceRow
          icon="clock"
          colour="text-info"
          title={t('outLater')}
          sub={t('outLaterH')}
          on={false}
          onClick={() => {
            onOpen({ kind: 'later', fromCall: true, note });
          }}
        />
        <ChoiceRow
          icon="x"
          colour="text-danger"
          title={t('outCancel')}
          sub={t('outCancelH')}
          on={false}
          onClick={() => {
            onOpen({ kind: 'cancel', fromCall: true, note });
          }}
        />
      </RowList>
      <Field
        label={t('noteOpt')}
        placeholder={t('callNotePh')}
        value={note}
        onChange={(event) => {
          setNote(event.target.value);
        }}
      />
    </Sheet>
  );
}

const HOUR_MS = 60 * 60 * 1000;

/** A time on Dhaka's clock (UTC+6, no daylight saving), `days` from today. */
function dhakaAt(days: number, hour: number): Date {
  const [year, month, day] = dayKey(new Date().toISOString()).split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days, hour - 6));
}

/** The call-back times offered (Part 29's `o29-call-later`): the ones still ahead today, tomorrow morning, or one picked. */
function useCallBackTimes(): { key: string; word: string; at: Date }[] {
  const { t } = useTranslation('orders');
  const words = useOrderWords();
  const now = Date.now();
  const four = dhakaAt(0, 16);
  const six = dhakaAt(0, 18);
  return [
    { key: 'hour', word: t('in1h'), at: new Date(now + HOUR_MS) },
    ...(four.getTime() - now > HOUR_MS
      ? [{ key: 'four', word: t('todayAt', { time: words.time(four.toISOString()) }), at: four }]
      : []),
    ...(six.getTime() - now > HOUR_MS ? [{ key: 'six', word: t('evening'), at: six }] : []),
    { key: 'tomorrow', word: t('tomorrow'), at: dhakaAt(1, 10) },
  ];
}

/** Call later (Part 29's `o29-call-later`, `o29-hold`): a time to call back, the order on hold till then. */
function LaterSheet({
  order,
  open,
  onOpen,
  onClose,
}: {
  order: Order;
  open: { fromCall: boolean; note: string };
  onOpen: (sheet: OrderSheet) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const errorText = useErrorText();
  const log = useLogCall(order.id);
  const times = useCallBackTimes();
  const [picked, setPicked] = useState<string | null>(null);
  const [own, setOwn] = useState('');
  const [note, setNote] = useState(open.note);
  const at =
    picked === 'own'
      ? own
        ? new Date(own)
        : null
      : (times.find((each) => each.key === picked)?.at ?? null);
  return (
    <Sheet
      open
      title={t('outLater')}
      onClose={onClose}
      onBack={
        open.fromCall
          ? () => {
              onOpen({ kind: 'call', note });
            }
          : undefined
      }
      footer={
        <Button
          wide
          busy={log.isPending}
          disabled={at === null || at.getTime() <= Date.now()}
          onClick={() => {
            if (at === null) return;
            log.mutate(
              {
                outcome: CallOutcome.CallBackLater,
                callBackAt: at.toISOString(),
                ...(note.trim() ? { note: note.trim() } : {}),
              },
              { onSuccess: onClose },
            );
          }}
        >
          {t('saveCall')}
        </Button>
      }
    >
      <div>
        <h3 className="mb-2.5 text-[16px] font-semibold">{t('when')}</h3>
        <div className="flex flex-wrap gap-2">
          {times.map((each) => (
            <Chip
              key={each.key}
              on={picked === each.key}
              onClick={() => {
                setPicked(each.key);
              }}
            >
              {each.word}
            </Chip>
          ))}
          <Chip
            on={picked === 'own'}
            onClick={() => {
              setPicked('own');
            }}
          >
            <Icon name="calendar" size={16} />
            {t('pickTime')}
          </Chip>
        </div>
      </div>
      {picked === 'own' ? (
        <Field
          label={t('pickTime')}
          type="datetime-local"
          value={own}
          onChange={(event) => {
            setOwn(event.target.value);
          }}
        />
      ) : null}
      <p className="text-[14px] text-fg-muted">{t('outLaterH')}</p>
      {log.isError ? <Banner tone="bad">{errorText(log.error)}</Banner> : null}
      <Field
        label={t('noteOpt')}
        value={note}
        onChange={(event) => {
          setNote(event.target.value);
        }}
      />
    </Sheet>
  );
}

/** Cancel the order? (Part 29's `o29-cancel`, ORD-52): the reason, Other with a note; the stock it holds let go. */
function CancelSheet({
  order,
  open,
  onClose,
}: {
  order: Order;
  open: { fromCall: boolean; note: string };
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const errorText = useErrorText();
  const words = useOrderWords();
  const log = useLogCall(order.id);
  const cancel = useCancelOrder(order.id);
  const [reason, setReason] = useState<CancelReason | null>(null);
  const [note, setNote] = useState(open.note);
  const sending = open.fromCall ? log : cancel;
  const needsNote = reason === CancelReason.Other && note.trim() === '';
  return (
    <Sheet
      open
      title={t('cancelTitle')}
      onClose={onClose}
      footer={
        <>
          <Button tone="outline" onClick={onClose}>
            {t('keep')}
          </Button>
          <Button
            tone="danger"
            busy={sending.isPending}
            disabled={reason === null || needsNote}
            onClick={() => {
              if (reason === null) return;
              const extra = note.trim() ? { note: note.trim() } : {};
              if (open.fromCall) {
                log.mutate(
                  { outcome: CallOutcome.Cancelled, reason, ...extra },
                  { onSuccess: onClose },
                );
              } else {
                cancel.mutate({ reason, ...extra }, { onSuccess: onClose });
              }
            }}
          >
            {t('cancelIt')}
          </Button>
        </>
      }
    >
      <p className="-mt-1 text-[14px] text-fg-muted">{t('cancelHelp')}</p>
      {sending.isError ? <Banner tone="bad">{errorText(sending.error)}</Banner> : null}
      <RowList role="radiogroup" aria-label={t('cancelTitle')}>
        {CANCEL_REASONS.map((why) => (
          <button
            key={why}
            type="button"
            role="radio"
            aria-checked={reason === why}
            onClick={() => {
              setReason(why);
            }}
            className="flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left"
          >
            <RadioMark on={reason === why} />
            <span className="text-[16px] font-medium">{words.reason(why)}</span>
          </button>
        ))}
      </RowList>
      <Field
        label={t('noteOpt')}
        value={note}
        help={t('otherNeedsNote')}
        onChange={(event) => {
          setNote(event.target.value);
        }}
      />
    </Sheet>
  );
}

/** The more menu (Part 29's `o29-menu`): hold or release it, edit it, print its label, cancel it, delete a mistake. */
function MenuSheet({
  order,
  can,
  onOpen,
  onClose,
}: {
  order: Order;
  can: OrderChoices;
  onOpen: (sheet: OrderSheet) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const errorText = useErrorText();
  const navigate = useNavigate();
  const { slug } = useShell();
  const release = useSetOverride(order.id);
  return (
    <Sheet open title={t('menuTitle', { number: order.orderNumber })} onClose={onClose}>
      {release.isError ? <Banner tone="bad">{errorText(release.error)}</Banner> : null}
      <RowList>
        {can.hold ? (
          <MenuRow
            icon="clock"
            title={t('mHold')}
            onClick={() => {
              onOpen({ kind: 'later', fromCall: false, note: '' });
            }}
          />
        ) : null}
        {can.release ? (
          <MenuRow
            icon="clock"
            title={t('mRelease')}
            onClick={() => {
              release.mutate(null, { onSuccess: onClose });
            }}
          />
        ) : null}
        {can.edit ? (
          <MenuRow
            icon="pencil"
            title={t('mEdit')}
            sub={t('mEditSub')}
            onClick={() => {
              void navigate({
                to: '/$shop/orders/$orderId/edit',
                params: { shop: slug, orderId: order.id },
              });
            }}
          />
        ) : null}
        {can.print ? (
          <MenuRow
            icon="printer"
            title={t('mPrint')}
            onClick={() => {
              onOpen({ kind: 'print' });
            }}
          />
        ) : null}
        {can.cancel ? (
          <MenuRow
            icon="x"
            danger
            title={t('mCancel')}
            onClick={() => {
              onOpen({ kind: 'cancel', fromCall: false, note: '' });
            }}
          />
        ) : null}
        {can.delete ? (
          <MenuRow
            icon="trash"
            danger
            title={t('mDelete')}
            sub={t('mDeleteSub')}
            onClick={() => {
              onOpen({ kind: 'delete' });
            }}
          />
        ) : null}
      </RowList>
    </Sheet>
  );
}

function MenuRow({
  icon,
  title,
  sub,
  danger = false,
  onClick,
}: {
  icon: IconName;
  title: string;
  sub?: string;
  danger?: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
    >
      <span
        className={`flex size-10 flex-none items-center justify-center rounded-button bg-neutral-100 ${danger ? 'text-danger' : 'text-fg-muted'}`}
      >
        <Icon name={icon} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`text-[16px] font-medium ${danger ? 'text-danger-text' : ''}`}>
          {title}
        </span>
        {sub ? <span className="text-[14px] text-fg-muted">{sub}</span> : null}
      </span>
    </button>
  );
}

/** Delete the order? (Part 29's `o29-delete`, ORD-12): a mistake before it ships or is paid; its number never comes back. */
function DeleteDialog({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const errorText = useErrorText();
  const navigate = useNavigate();
  const { slug, showToast } = useShell();
  const remove = useDeleteOrder(order.id);
  return (
    <Dialog
      open
      title={t('deleteTitle', { number: order.orderNumber })}
      onClose={onClose}
      actions={
        <>
          <Button tone="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            tone="danger"
            busy={remove.isPending}
            onClick={() => {
              remove.mutate(undefined, {
                onSuccess: () => {
                  showToast(t('deletedToast', { number: order.orderNumber }));
                  onClose();
                  void navigate({ to: '/$shop/orders', params: { shop: slug } });
                },
              });
            }}
          >
            {t('deleteIt')}
          </Button>
        </>
      }
    >
      {t('deleteP')}
      {remove.isError ? (
        <div className="mt-3">
          <Banner tone="bad">{errorText(remove.error)}</Banner>
        </div>
      ) : null}
    </Dialog>
  );
}

/** Mark it delivered? (Part 29's `o29-deliver`, ORD-42): what is due recorded as cash on delivery. */
function DeliverDialog({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const errorText = useErrorText();
  const { showToast } = useShell();
  const deliver = useDeliver(order.id);
  const due = Number(order.due);
  return (
    <Dialog
      open
      title={t('deliverTitle')}
      onClose={onClose}
      actions={
        <>
          <Button tone="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            busy={deliver.isPending}
            onClick={() => {
              deliver.mutate(undefined, {
                onSuccess: () => {
                  showToast(
                    due > 0
                      ? t('deliveredToast', { amount: formatTaka(due) })
                      : t('deliveredPaidToast', { number: order.orderNumber }),
                  );
                  onClose();
                },
              });
            }}
          >
            {t('deliveredBtn')}
          </Button>
        </>
      }
    >
      {due > 0 ? t('deliverP', { amount: formatTaka(due) }) : t('deliverPaid')}
      {deliver.isError ? (
        <div className="mt-3">
          <Banner tone="bad">{errorText(deliver.error)}</Banner>
        </div>
      ) : null}
    </Dialog>
  );
}

/** Handing it over? (Part 29's `o29-handover`): a counter order's cash taken, delivered and paid in one step. */
/** Hand over (Part 29's `o29-handover`): a dialog, or a sheet asking the IMEIs when an item needs them (INV-14). */
function HandOver({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}): React.JSX.Element | null {
  const serials = useOrderSerials(order.id);
  if (serials.isPending) return null;
  const items = serials.data ?? [];
  return items.length > 0 ? (
    <HandOverSerialSheet order={order} items={items} onClose={onClose} />
  ) : (
    <HandOverDialog order={order} onClose={onClose} />
  );
}

function HandOverDialog({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const errorText = useErrorText();
  const { showToast } = useShell();
  const handOver = useHandOver(order.id);
  const due = Number(order.due);
  const firstName = (order.customerName ?? '').split(' ')[0] ?? '';
  return (
    <Dialog
      open
      title={firstName ? t('handOverTitle', { name: firstName }) : t('handOverTitleNone')}
      onClose={onClose}
      actions={
        <>
          <Button tone="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            busy={handOver.isPending}
            onClick={() => {
              handOver.mutate(
                {},
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
        </>
      }
    >
      {due > 0 ? t('handOverP', { amount: formatTaka(due) }) : t('handOverPaid')}
      {handOver.isError ? (
        <div className="mt-3">
          <Banner tone="bad">{errorText(handOver.error)}</Banner>
        </div>
      ) : null}
    </Dialog>
  );
}
