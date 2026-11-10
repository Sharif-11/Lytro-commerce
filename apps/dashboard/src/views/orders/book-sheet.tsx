import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { formatTaka } from '@lytronix/ui';
import {
  CourierConnectionState,
  CourierKey,
  PARCEL_NOTE_MAX_LENGTH,
  Permission,
  SmsEvent,
} from '@lytronix/validators';
import { useBookOrder, useCancelBooking, useCourierAreas, useSettleParcel } from '@/api/couriers';
import { useLocations } from '@/api/delivery';
import { ORDERS_QUERY_KEY, useOrderSerials } from '@/api/orders';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { CheckRow } from '@/components/ui/check-row';
import { Chip } from '@/components/ui/chips';
import { Dialog } from '@/components/ui/dialog';
import { AreaField, Field } from '@/components/ui/field';
import { Kv, RadioMark } from '@/components/ui/kv';
import { RowList } from '@/components/ui/list-row';
import { SearchField } from '@/components/ui/search-field';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatusTag } from '@/components/ui/status-tag';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useErrorText } from '@/hooks/use-error-text';
import { courierName } from '@/lib/couriers';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import type { CourierAdapter, CourierAreaChoice, CourierConnection } from '@/types/couriers';
import type { Order } from '@/types/orders';
import { useOrderWords } from './order-words';
import { allPicked, sentOf } from './serials-sent';
import { SerialPicks, ShipRefusal } from './ship-sheet';
import { SmsLine } from '@/views/sms/sms-line';

/** What a booking's failure is, from the server's answer: each has its own banner (Part 36's `sh-c36-book-*`). */
type BookFailure =
  | { kind: 'refused'; message: string | null }
  | { kind: 'down' }
  | { kind: 'lost' }
  | { kind: 'other'; error: unknown };

function failureOf(error: unknown): BookFailure | null {
  if (!error) return null;
  if (error instanceof ApiClientError) {
    if (error.code === 'service_unavailable') {
      return error.details.parcelState === 'unknown' ? { kind: 'lost' } : { kind: 'down' };
    }
    if (error.code === 'conflict' && 'courierMessage' in error.details) {
      const said = error.details.courierMessage;
      return { kind: 'refused', message: typeof said === 'string' ? said : null };
    }
  }
  return { kind: 'other', error };
}

/** The order's items weighed, where every one has a weight; null where some don't. */
function weightOf(order: Order): { kg: number | null; missing: number } {
  const missing = order.items.filter((item) => item.weightKg === null).length;
  if (missing > 0) return { kg: null, missing };
  const kg = order.items.reduce(
    (sum, item) => sum + Number(item.weightKg ?? 0) * Number(item.quantity),
    0,
  );
  return { kg, missing: 0 };
}

/** A whole number of kilograms or up to three decimals, as a field shows it: "1.2", not "1.200". */
const kgText = (kg: number): string => String(Math.round(kg * 1000) / 1000);

/** One choice in a list (the prototype's `.row` with a `.radio`): an area, a store, a way it went. */
function RadioRow({
  on,
  title,
  sub,
  tag,
  onClick,
}: {
  on: boolean;
  title: string;
  sub?: string;
  tag?: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`flex w-full gap-3 py-2.5 text-left ${sub ? 'min-h-14 items-start' : 'min-h-12 items-center'}`}
    >
      <RadioMark on={on} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-medium">
          {title}
          {tag ? (
            <>
              {' '}
              <StatusTag tone="neutral">{tag}</StatusTag>
            </>
          ) : null}
        </span>
        {sub ? <span className="text-[14px] text-fg-muted">{sub}</span> : null}
      </span>
    </button>
  );
}

/** The thana's one area named after it: the server takes it by itself (CUS-12), so nothing is asked. */
function onlyAreaOf(thana: CourierAreaChoice[]): CourierAreaChoice | null {
  const [only] = thana;
  return thana.length === 1 && only && !only.suggested ? only : null;
}

/**
 * CUS-12 (Part 36's `sh-c36-book-redx*`): the courier's area for this order. The thana's areas first, a likely one marked; the
 * thana's one area named after it is chosen by the server itself; a search of the district for the rest.
 */
function AreaPicker({
  courier,
  order,
  chosen,
  missing,
  onChoose,
}: {
  courier: CourierKey;
  order: Order;
  chosen: string | null;
  missing: boolean;
  onChoose: (areaCode: string | null) => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const words = useOrderWords();
  const locations = useLocations();
  const [searching, setSearching] = useState(false);
  const [typed, setTyped] = useState('');
  const q = useDebouncedValue(typed.trim(), 300);
  const areas = useCourierAreas(courier, order.id, searching ? q : '');
  const thana = areas.data?.thana ?? [];
  const only = searching ? null : onlyAreaOf(thana);
  const zillaName = (() => {
    const zilla = locations.data?.zillas.find((each) => each.id === order.location?.zillaId);
    return zilla ? words.named(zilla) : '';
  })();
  const label = t('crArea');
  if (only) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[14px] font-medium text-fg-muted">{label}</span>
        <div className="flex h-12 items-center rounded-control border border-line-strong bg-surface px-3 text-[16px]">
          {only.name}
        </div>
        <p className="text-[13px] text-fg-muted">{t('crAreaAuto')}</p>
      </div>
    );
  }
  const rows = (list: CourierAreaChoice[]) => (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex flex-col [&>*+*]:border-t [&>*+*]:border-line"
    >
      {list.map((area) => (
        <RadioRow
          key={area.areaCode}
          on={chosen === area.areaCode}
          title={area.name}
          tag={area.suggested ? t('crAreaSuggested') : undefined}
          onClick={() => {
            onChoose(area.areaCode);
          }}
        />
      ))}
    </div>
  );
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[14px] font-medium text-fg-muted">{label}</span>
      {searching || !order.location ? (
        <>
          <SearchField
            value={typed}
            onChange={setTyped}
            autoFocus
            placeholder={t('crAreaSearch', { z: zillaName })}
            label={t('crAreaSearch', { z: zillaName })}
          />
          {areas.isPending ? <SkeletonRows count={2} /> : rows(areas.data?.zilla ?? [])}
        </>
      ) : (
        <>
          <p className="mb-1 text-[14px] text-fg-muted">
            {t('crAreaIn', { p: words.named(order.location) })}
          </p>
          {areas.isPending ? <SkeletonRows count={2} /> : rows(thana)}
          <button
            type="button"
            className="mt-1.5 inline-flex items-center gap-1.5 self-start font-semibold text-primary"
            onClick={() => {
              setSearching(true);
            }}
          >
            <Icon name="search" size={16} />
            {t('crAreaSearch', { z: zillaName })}
          </button>
        </>
      )}
      {missing ? <p className="text-[13px] font-medium text-danger">{t('crAreaNeed')}</p> : null}
    </div>
  );
}

/**
 * Book courier (Part 36's `sh-c36-book`, CRR-05 to CRR-10): only what its courier needs. The connected couriers as chips with the
 * default chosen; the cash to collect, locked, being what the order has due (CRR-06), with Pathao's whole taka; a weight where
 * the courier takes one, from the items, or 0.5 kg where some have none; RedX's area; the store a Pathao parcel leaves from; the
 * serials, as Ship asks them; a note. Booking takes the stock out and counts as this month's order. Sent once per key, so a
 * second tap never books twice.
 */
export function BookSheet({
  order,
  connections,
  adapters,
  onClose,
}: {
  order: Order;
  connections: CourierConnection[];
  adapters: CourierAdapter[];
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const { slug, viewer, showToast } = useShell();
  const serials = useOrderSerials(order.id);
  const book = useBookOrder(order.id);
  const [key] = useState(() => crypto.randomUUID());
  const first = connections.find((each) => each.isDefault) ?? connections[0];
  const [courier, setCourier] = useState<CourierKey | undefined>(first?.courierKey);
  const weighed = weightOf(order);
  const [weight, setWeight] = useState(kgText(weighed.kg ?? 0.5));
  const [area, setArea] = useState<string | null>(null);
  const [areaMissing, setAreaMissing] = useState(false);
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState<Map<string, string[]>>(new Map());
  const items = serials.data ?? [];

  const connection = connections.find((each) => each.courierKey === courier);
  const adapter = adapters.find((each) => each.key === courier);
  // The thana's areas, as the picker reads them: the area is asked unless the server takes the thana's one by itself.
  const areas = useCourierAreas(courier ?? CourierKey.RedX, order.id, '', {
    enabled: courier !== undefined && adapter?.needsArea === true,
  });
  const areaAsked = adapter?.needsArea === true && onlyAreaOf(areas.data?.thana ?? []) === null;
  const name = courier ? courierName(courier) : '';
  const due = Number(order.due);
  const failure = failureOf(book.error);
  const loginEnded = connection?.state === CourierConnectionState.LoginRefused;
  const mayFix = allows(viewer, [Permission.CouriersManage]);
  const kg = Number(weight);
  const ready =
    courier !== undefined &&
    !loginEnded &&
    serials.isSuccess &&
    allPicked(items, picked) &&
    (!adapter?.takesWeight || kg > 0);

  const send = (): void => {
    if (!courier) return;
    if (areaAsked && area === null) {
      setAreaMissing(true);
      return;
    }
    book.mutate(
      {
        key,
        body: {
          courierKey: courier,
          ...(adapter?.takesWeight ? { weightKg: kg } : {}),
          ...(areaAsked && area !== null ? { areaCode: area } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(items.length > 0 ? { serials: sentOf(order, items, picked) } : {}),
        },
      },
      {
        onSuccess: (booked) => {
          showToast(t('crBooked', { c: name, k: booked.parcel?.consignmentId ?? '' }));
          onClose();
        },
        onError: (error) => {
          // A lost answer leaves a parcel that may exist: the order shows it, and Settle it is its next step (D6-11).
          if (failureOf(error)?.kind === 'lost') {
            void queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEY });
            onClose();
          }
        },
      },
    );
  };

  return (
    <Sheet
      open
      title={t('crBookT')}
      onClose={onClose}
      footer={
        <Button wide busy={book.isPending} disabled={!ready} onClick={send}>
          <Icon name="truck" />
          {t('crBookWith', { c: name })}
        </Button>
      }
    >
      {loginEnded ? (
        <Banner
          tone="bad"
          action={
            mayFix && courier ? (
              <Link
                to="/$shop/settings/couriers/$courierKey"
                params={{ shop: slug, courierKey: courier }}
                className="text-primary"
              >
                {t('crLogInAgain')}
              </Link>
            ) : undefined
          }
        >
          {t('crLoginNeeded')}
        </Banner>
      ) : null}
      {failure?.kind === 'refused' ? (
        <Banner tone="bad">
          {failure.message
            ? t('crRefusedB', { c: name, m: failure.message })
            : t('crRefusedNone', { c: name })}
        </Banner>
      ) : failure?.kind === 'down' ? (
        <Banner tone="warn">{t('crNotAnswering', { c: name })}</Banner>
      ) : failure?.kind === 'other' ? (
        failure.error instanceof ApiClientError && failure.error.code === 'quota_exceeded' ? (
          <ShipRefusal error={failure.error} />
        ) : (
          <Banner tone="bad">{errorText(failure.error)}</Banner>
        )
      ) : null}
      <div className="flex flex-col gap-1.5">
        <span className="text-[14px] font-medium text-fg-muted">{t('crCard')}</span>
        <div role="radiogroup" aria-label={t('crCard')} className="flex flex-wrap gap-2">
          {connections.map((each) => (
            <Chip
              key={each.courierKey}
              role="radio"
              aria-checked={courier === each.courierKey}
              on={courier === each.courierKey}
              onClick={() => {
                setCourier(each.courierKey);
                setArea(null);
                setAreaMissing(false);
                book.reset();
              }}
            >
              {each.name}
            </Chip>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[14px] font-medium text-fg-muted">{t('crCod')}</span>
        <div className="flex h-12 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-[16px]">
          <span className="num min-w-0 flex-1">{formatTaka(order.due)}</span>
          <span className="text-fg-muted">
            <Icon name="lock" />
          </span>
        </div>
        <p className="text-[13px] text-fg-muted">{t('crCodD')}</p>
        {courier === CourierKey.Pathao && !Number.isInteger(due) ? (
          <p className="text-[13px] text-neutral-700">
            {t('crWholeTaka', { a: formatTaka(Math.ceil(due)) })}
          </p>
        ) : null}
      </div>
      {adapter?.takesWeight ? (
        <Field
          label={t('crWeight')}
          inputMode="decimal"
          value={weight}
          suffix={<span className="text-[14px] font-normal">kg</span>}
          help={
            weighed.missing > 0 ? t('crWeightCheck', { count: weighed.missing }) : t('crWeightFrom')
          }
          onChange={(event) => {
            setWeight(event.target.value.replace(',', '.'));
          }}
        />
      ) : null}
      {adapter?.needsArea && courier ? (
        <AreaPicker
          key={courier}
          courier={courier}
          order={order}
          chosen={area}
          missing={areaMissing}
          onChoose={(code) => {
            setArea(code);
            setAreaMissing(false);
          }}
        />
      ) : null}
      {adapter?.hasStores && connection?.pickupStore ? (
        <div className="pt-1 pb-2.5">
          <Kv
            label={t('crFrom')}
            value={<span className="font-normal">{connection.pickupStore.name}</span>}
          />
        </div>
      ) : null}
      {serials.isPending ? (
        <SkeletonRows count={1} />
      ) : (
        <SerialPicks items={items} picked={picked} onPick={setPicked} />
      )}
      <AreaField
        label={t('crNote')}
        placeholder={t('crNotePh')}
        maxLength={PARCEL_NOTE_MAX_LENGTH}
        value={note}
        onChange={(event) => {
          setNote(event.target.value);
        }}
      />
      <p className="text-[14px] text-fg-muted">{t('crBookInfo')}</p>
      {/* Part 37's `p37-o-book` (D7-20): the shipped SMS goes when the courier picks it up. */}
      <SmsLine event={SmsEvent.OrderShipped} words="p37LineBook" values={{ c: name }} />
    </Sheet>
  );
}

/**
 * Settle it (Part 36's `sh-c36-settle`, D6-11): after a lost answer, from what the courier's panel shows. Booked, with its
 * consignment ID, and the order is booked and its stock goes out; not made, and the order stays as it was, to book again.
 */
export function SettleSheet({
  order,
  courier,
  onClose,
}: {
  order: Order;
  courier: CourierKey;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const errorText = useErrorText();
  const settle = useSettleParcel(order.id);
  const [made, setMade] = useState(true);
  const [consignment, setConsignment] = useState('');
  const [code, setCode] = useState('');
  return (
    <Sheet
      open
      title={t('crSettleT', { c: courierName(courier) })}
      onClose={onClose}
      footer={
        <Button
          wide
          busy={settle.isPending}
          disabled={made && consignment.trim() === ''}
          onClick={() => {
            settle.mutate(
              made
                ? {
                    outcome: 'booked',
                    consignmentId: consignment.trim(),
                    ...(code.trim() ? { trackingCode: code.trim() } : {}),
                  }
                : { outcome: 'not_booked' },
              { onSuccess: onClose },
            );
          }}
        >
          {t('crSettle')}
        </Button>
      }
    >
      {settle.isError ? <Banner tone="bad">{errorText(settle.error)}</Banner> : null}
      <RowList role="radiogroup" aria-label={t('crSettleT', { c: courierName(courier) })}>
        <RadioRow
          on={made}
          title={t('crSettleYes')}
          sub={t('crSettleYesD')}
          onClick={() => {
            setMade(true);
          }}
        />
        <RadioRow
          on={!made}
          title={t('crSettleNo')}
          sub={t('crSettleNoD')}
          onClick={() => {
            setMade(false);
          }}
        />
      </RowList>
      {made ? (
        <>
          <Field
            label={t('crConsignment')}
            value={consignment}
            onChange={(event) => {
              setConsignment(event.target.value);
            }}
          />
          <Field
            label={`${t('trackCode')}${t('crTrackOpt')}`}
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
            }}
          />
        </>
      ) : null}
    </Sheet>
  );
}

/** A courier with no cancel call is confirmed from its panel; any other is asked, and no clear answer comes to the same. */
function confirmNeeded(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    error.code === 'conflict' &&
    'courierKey' in error.details &&
    error.details.courierNotAnswering === true
  );
}

/**
 * Cancel the booking (Part 36's `sh-c36-cancel-sf`, `dlg-c36-cancel-redx`, `sh-c36-cancel-redx-noanswer`; CRR-28): the order stays,
 * to book again or ship by hand; the fee and this month's count stay. Steadfast and Pathao have no cancel call, so staff confirm
 * they cancelled it in the courier's panel; RedX is asked, and no clear answer means confirming from its panel too.
 */
export function CancelBookingSheet({
  order,
  courier,
  canCancel,
  onClose,
}: {
  order: Order;
  courier: CourierKey;
  canCancel: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const errorText = useErrorText();
  const { showToast } = useShell();
  const cancel = useCancelBooking(order.id);
  const [ticked, setTicked] = useState(false);
  const c = courierName(courier);
  const noAnswer = confirmNeeded(cancel.error);
  const done = (): void => {
    showToast(t('crCbDone'));
    onClose();
  };
  const keep = (
    <Button tone="outline" onClick={onClose}>
      {t('crKeep')}
    </Button>
  );

  if (canCancel && !noAnswer) {
    return (
      <Dialog
        open
        title={t('crCbRedxT', { c })}
        onClose={onClose}
        actions={
          <>
            {keep}
            <Button
              tone="danger"
              busy={cancel.isPending}
              onClick={() => {
                cancel.mutate({}, { onSuccess: done });
              }}
            >
              {t('crCancelBooking')}
            </Button>
          </>
        }
      >
        {t('crCbRedxD', { c })}
        {cancel.isError ? (
          <div className="mt-3">
            <Banner tone="bad">{errorText(cancel.error)}</Banner>
          </div>
        ) : null}
      </Dialog>
    );
  }
  return (
    <Sheet
      open
      title={canCancel ? t('crCbRedxT', { c }) : t('crCbSfT', { c })}
      onClose={onClose}
      footer={
        <>
          {keep}
          <Button
            tone="danger"
            busy={cancel.isPending}
            disabled={!ticked}
            onClick={() => {
              cancel.mutate({ courierCancelled: true }, { onSuccess: done });
            }}
          >
            {t('crCancelBooking')}
          </Button>
        </>
      }
    >
      {noAnswer ? (
        <Banner tone="warn">{t('crCbNoAnswer', { c })}</Banner>
      ) : (
        <p className="text-[16px]">{t('crCbSfD', { c })}</p>
      )}
      {cancel.isError && !noAnswer ? <Banner tone="bad">{errorText(cancel.error)}</Banner> : null}
      <CheckRow
        checked={ticked}
        onChange={() => {
          setTicked(!ticked);
        }}
        title={noAnswer ? t('crCbRedxConfirm', { c }) : t('crCbConfirm', { c })}
      />
    </Sheet>
  );
}
