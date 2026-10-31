import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { formatTaka } from '@lytronix/ui';
import { FulfilmentType, PaymentMethod, Permission } from '@lytronix/validators';
import { useLocations } from '@/api/delivery';
import {
  useCreateOrder,
  useKnownCustomer,
  useOrder,
  useOrderQuote,
  useUpdateOrder,
  type OrderBody,
} from '@/api/orders';
import { Icon } from '@/components/icon';
import { ActionBar } from '@/components/ui/action-bar';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chips';
import { Field, PickField } from '@/components/ui/field';
import { Kv } from '@/components/ui/kv';
import { RowList } from '@/components/ui/list-row';
import { Quantity } from '@/components/ui/quantity';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatusTag } from '@/components/ui/status-tag';
import { Switch } from '@/components/ui/switch';
import { Taka } from '@/components/ui/taka';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useErrorText } from '@/hooks/use-error-text';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { Locations } from '@/types/delivery';
import type { Order, OrderQuote } from '@/types/orders';
import { AreaPickSheet } from '../delivery/area-pick-sheet';
import { Segments } from '../product/value-sheet';
import { AddItemSheets, PriceSheet } from './item-sheets';
import {
  amountOf,
  createOf,
  draftOf,
  editOf,
  EMPTY_DRAFT,
  phoneOf,
  quoteOf,
  type DraftLine,
  type LineWords,
  type OrderDraft,
} from './order-draft';
import { useOrderWords } from './order-words';

const PRICING_REST_MS = 300;

/** ORD-22's ways in, as New order's chips list them; cash on delivery is never typed. */
const PAID_BY = [
  PaymentMethod.Cash,
  PaymentMethod.Bkash,
  PaymentMethod.Nagad,
  PaymentMethod.Rocket,
  PaymentMethod.Upay,
  PaymentMethod.Bank,
] as const;

/** New order (TENANT-DASHBOARD-DESIGN §7.31, Part 29's `order-new`; ORD-01, ORD-06, ORD-07, ORD-22, MNU-04). */
export function NewOrderView(): React.JSX.Element {
  return <OrderEditor order={null} />;
}

/** Edit order (Part 29's `o29-edit`, ORD-11): the same form, as the order now is, until it ships. */
export function EditOrderView({ orderId }: { orderId: string }): React.JSX.Element {
  const errorText = useErrorText();
  const order = useOrder(orderId);
  if (order.data) return <OrderEditor order={order.data} />;
  return (
    <ShellPage>
      {order.isError ? (
        <Banner tone="bad">{errorText(order.error)}</Banner>
      ) : (
        <Card flush>
          <SkeletonRows count={4} />
        </Card>
      )}
    </ShellPage>
  );
}

/** The variant a stock refusal names (NotEnoughStockForOrder, NotEnoughStockForCombo), or null. */
function shortOf(problem: unknown): string | null {
  if (!(problem instanceof ApiClientError) || problem.status !== 409) return null;
  const variantId = problem.details['variantId'];
  return typeof variantId === 'string' ? variantId : null;
}

/** "Dhaka · Mirpur": a thana with its district, in the reader's language. */
function placeOf(locations: Locations | undefined, id: number | null, bn: boolean) {
  if (id === null || !locations) return null;
  for (const zilla of locations.zillas) {
    const thana = zilla.thanas.find((each) => each.id === id);
    if (thana) {
      const [district, area] = bn ? [zilla.nameBn, thana.nameBn] : [zilla.nameEn, thana.nameEn];
      return { zilla: district, thana: area, text: `${district} · ${area}` };
    }
  }
  return null;
}

/** A row of words with a switch at its end (the prototype's `.row` with `.switch`). */
function SwitchRow({
  label,
  sub,
  checked,
  onChange,
}: {
  label: string;
  sub?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}): React.JSX.Element {
  return (
    <div className="flex min-h-11 items-center gap-3">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-medium">{label}</span>
        {sub ? <span className="text-[14px] text-fg-muted">{sub}</span> : null}
      </span>
      <Switch checked={checked} label={label} onChange={onChange} />
    </div>
  );
}

function CardTitle({ children }: { children: ReactNode }): React.JSX.Element {
  return <h3 className="mb-1 text-[17px] font-semibold">{children}</h3>;
}

/**
 * The form (agreed in the a3 read, 2026-10-31): the customer's phone, a known one offering their last address; how it
 * reaches them; the items, each added from Add an item with its quantity and Change price; the order's discount, the
 * delivery charge by hand, a payment received already and Already confirmed on the phone; a note. The totals are the
 * server's quote of what is typed. Saved, the order's page opens; a shortfall marks its line and nothing is saved.
 */
function OrderEditor({ order }: { order: Order | null }): React.JSX.Element {
  const { t, i18n } = useTranslation('orders');
  const words = useOrderWords();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const { slug, viewer, showToast } = useShell();
  const bn = i18n.language === 'bn';
  const mayPay = allows(viewer, [Permission.PaymentsManage]);
  const mayLookUp = allows(viewer, [Permission.CustomersRead]);
  const lineWords: LineWords = (item) => ({
    label: words.variant(item),
    choiceText: item.components.length > 0 ? words.inside(item) : null,
    modifierText:
      item.modifiers.length > 0
        ? item.modifiers
            .map((each) =>
              Number(each.priceChange) === 0
                ? each.optionName
                : `${each.optionName} +${formatTaka(each.priceChange)}`,
            )
            .join(', ')
        : null,
  });
  const [draft, setDraft] = useState<OrderDraft>(() =>
    order ? draftOf(order, lineWords) : EMPTY_DRAFT,
  );
  const [adding, setAdding] = useState(false);
  const [pricing, setPricing] = useState<DraftLine | null>(null);
  const [placing, setPlacing] = useState(false);
  const [problem, setProblem] = useState<unknown>(null);
  // D4-8: one key for this order however often Create is pressed; a new one once the server has refused it.
  const key = useRef(crypto.randomUUID());
  const create = useCreateOrder();
  const update = useUpdateOrder(order?.id ?? '');
  const locations = useLocations();
  const counter = draft.type !== FulfilmentType.Delivery;
  const set = (patch: Partial<OrderDraft>) => {
    setDraft((now) => ({ ...now, ...patch }));
  };

  // D4-9: priced once the typing rests, from what the server would make of it.
  const typed = JSON.stringify(quoteOf(draft));
  const resting = useDebouncedValue(typed, PRICING_REST_MS);
  const quote = useOrderQuote(JSON.parse(resting) as OrderBody | null);
  const priced = draft.lines.length > 0 ? quote.data : undefined;

  // CUS-01: a whole number a customer already has fills their name and offers their last address.
  const known = useKnownCustomer(order === null && mayLookUp ? phoneOf(draft.phone) : null);
  const customer = phoneOf(draft.phone) === null ? undefined : known.data;
  useEffect(() => {
    if (customer?.name && draft.name.trim() === '') set({ name: customer.name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id]);

  const problems = problem instanceof ApiClientError ? problem.fieldProblems() : {};
  const short = shortOf(problem);
  const shortLine = draft.lines.find((line) => line.variantId === short);
  const placed = placeOf(locations.data, draft.locationId, bn);
  const lastPlace = customer?.lastAddress
    ? placeOf(locations.data, customer.lastAddress.locationId, bn)
    : null;
  const noDelivery = priced?.warnings.some((each) => each.code === 'zone_no_delivery') ?? false;
  const placedFields = [
    'customerName',
    'phone',
    'locationId',
    'deliveryAddress',
    'tableRef',
    'deliveryCharge',
    'discount',
    'notes',
    'payment.amount',
    'payment.senderNumber',
    'payment.transactionId',
  ];
  const unplaced =
    problem !== null &&
    short === null &&
    !Object.keys(problems).some((field) => placedFields.includes(field));

  const change = (line: DraftLine, patch: Partial<DraftLine>) => {
    set({
      lines: draft.lines.map((each) => (each.key === line.key ? { ...each, ...patch } : each)),
    });
  };

  async function submit(): Promise<void> {
    setProblem(null);
    try {
      if (order) {
        const body = editOf(order, draft);
        if (body) await update.mutateAsync(body);
        void navigate({
          to: '/$shop/orders/$orderId',
          params: { shop: slug, orderId: order.id },
        });
        return;
      }
      const made = await create.mutateAsync({ body: createOf(draft, counter), key: key.current });
      showToast(t('created', { number: made.orderNumber }));
      void navigate({ to: '/$shop/orders/$orderId', params: { shop: slug, orderId: made.id } });
    } catch (error) {
      setProblem(error);
      if (error instanceof ApiClientError) key.current = crypto.randomUUID();
    }
  }

  const shortText = shortLine
    ? shortLine.available !== null && Number(shortLine.available) > 0
      ? t('shortT', { count: Number(shortLine.available), product: shortLine.productName })
      : t('shortNone', { product: shortLine.productName })
    : null;

  return (
    <ShellPage title={order ? t('editTitle') : t('newOrder')}>
      {short !== null ? <Banner tone="bad">{shortText ?? errorText(problem)}</Banner> : null}
      {unplaced ? <Banner tone="bad">{errorText(problem)}</Banner> : null}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="flex flex-col gap-3">
            <CardTitle>{t('customer')}</CardTitle>
            <Field
              label={t('phone')}
              prefix="+880"
              inputMode="tel"
              autoComplete="off"
              value={draft.phone}
              error={problems.phone}
              onChange={(event) => {
                set({ phone: event.target.value });
              }}
            />
            {customer ? (
              <Banner
                tone="info"
                icon="user"
                dense
                action={
                  customer.lastAddress && draft.type === FulfilmentType.Delivery ? (
                    <button
                      type="button"
                      className="text-primary"
                      onClick={() => {
                        set({
                          locationId: customer.lastAddress?.locationId ?? null,
                          address: customer.lastAddress?.deliveryAddress ?? '',
                        });
                      }}
                    >
                      {t('knownUse')}
                    </button>
                  ) : undefined
                }
              >
                {lastPlace
                  ? t('knownT', { count: customer.orderCount, area: lastPlace.thana })
                  : t('knownNone', { count: customer.orderCount })}
              </Banner>
            ) : null}
            <Field
              label={t('name')}
              value={draft.name}
              error={problems.customerName}
              onChange={(event) => {
                set({ name: event.target.value });
              }}
            />
          </Card>

          <Card className="flex flex-col gap-3">
            <CardTitle>{t('howReach')}</CardTitle>
            <Segments
              label={t('howReach')}
              value={draft.type}
              choices={[
                { value: FulfilmentType.Delivery, label: t('delivery') },
                { value: FulfilmentType.Takeaway, label: t('takeaway') },
                { value: FulfilmentType.DineIn, label: t('tableTab') },
              ]}
              onChange={(type) => {
                set({ type });
              }}
            />
            {draft.type === FulfilmentType.DineIn ? (
              <>
                <Field
                  label={t('tableNo')}
                  value={draft.table}
                  error={problems.tableRef}
                  onChange={(event) => {
                    set({ table: event.target.value });
                  }}
                />
                <p className="text-[14px] text-fg-muted">{t('tableSub')}</p>
              </>
            ) : draft.type === FulfilmentType.Takeaway ? (
              <p className="text-[14px] text-fg-muted">{t('counterSub')}</p>
            ) : (
              <>
                <PickField
                  label={t('district')}
                  value={placed?.text ?? ''}
                  error={problems.locationId}
                  help={
                    priced?.deliveryZone && !noDelivery
                      ? t('zoneHelp', {
                          zone: bn ? priced.deliveryZone.name.bn : priced.deliveryZone.name.en,
                          charge: formatTaka(priced.deliveryZone.charge),
                        })
                      : undefined
                  }
                  onPick={() => {
                    setPlacing(true);
                  }}
                />
                {noDelivery ? (
                  <Banner tone="warn">{t('zoneWarn', { area: placed?.zilla ?? '' })}</Banner>
                ) : null}
                {priced?.warnings
                  .filter((each) => each.code === 'product_not_delivered_here')
                  .map((each) => (
                    <Banner key={each.productName ?? ''} tone="warn">
                      {t('productNotHere', {
                        product: each.productName ?? '',
                        zone: bn ? each.zone.bn : each.zone.en,
                      })}
                    </Banner>
                  ))}
                <Field
                  label={t('address')}
                  value={draft.address}
                  error={problems.deliveryAddress}
                  onChange={(event) => {
                    set({ address: event.target.value });
                  }}
                />
              </>
            )}
          </Card>

          <Card flush>
            <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
              <h3 className="text-[17px] font-semibold">{t('itemsTitle')}</h3>
              <Button
                tone="outline"
                size="sm"
                onClick={() => {
                  setAdding(true);
                }}
              >
                <Icon name="plus" />
                {t('addItem')}
              </Button>
            </div>
            <RowList>
              {draft.lines.map((line) => (
                <LineRow
                  key={line.key}
                  line={line}
                  short={line.key === shortLine?.key}
                  onQuantity={(quantity) => {
                    if (quantity === 0) {
                      set({ lines: draft.lines.filter((each) => each.key !== line.key) });
                    } else {
                      change(line, { quantity });
                    }
                  }}
                  onPrice={() => {
                    setPricing(line);
                  }}
                />
              ))}
            </RowList>
          </Card>

          <Card className="flex flex-col gap-3">
            <Field
              label={t('orderDiscount')}
              prefix="৳"
              inputMode="decimal"
              value={draft.discount}
              error={problems.discount}
              onChange={(event) => {
                set({ discount: event.target.value });
              }}
            />
            {counter ? null : (
              <>
                <SwitchRow
                  label={t('deliveryByHand')}
                  checked={draft.byHand}
                  onChange={(byHand) => {
                    set({ byHand });
                  }}
                />
                {draft.byHand ? (
                  <Field
                    label={t('deliveryCharge')}
                    prefix="৳"
                    inputMode="decimal"
                    value={draft.charge}
                    error={problems.deliveryCharge}
                    onChange={(event) => {
                      set({ charge: event.target.value });
                    }}
                  />
                ) : null}
              </>
            )}
            {/* ORD-22: recording money is payments:manage's; an order already made takes it on its own page. */}
            {mayPay && !order ? (
              <>
                <SwitchRow
                  label={t('paidAlready')}
                  checked={draft.paid}
                  onChange={(paid) => {
                    set({ paid });
                  }}
                />
                {draft.paid ? <PaidFields draft={draft} problems={problems} onSet={set} /> : null}
              </>
            ) : null}
            {counter || order ? null : (
              <SwitchRow
                label={t('confirmedAlready')}
                sub={t('confirmedAlreadyH')}
                checked={draft.confirmed}
                onChange={(confirmed) => {
                  set({ confirmed });
                }}
              />
            )}
            <Field
              label={t('note')}
              value={draft.note}
              placeholder={t('notePh')}
              error={problems.notes}
              onChange={(event) => {
                set({ note: event.target.value });
              }}
            />
          </Card>

          {counter || order ? null : (
            <Card>
              {/* The prototype's `.later`: greyed, a phase still to come (as Home's checklist). */}
              <div
                aria-disabled="true"
                className="flex items-center gap-2 text-[13px] text-fg-muted opacity-55"
              >
                <StatusTag tone="neutral">{t('later')}</StatusTag>
                <span>{t('pasteLater')}</span>
              </div>
            </Card>
          )}
        </div>
        <div className="min-w-0">
          <Totals draft={draft} quote={priced} counter={counter} noDelivery={noDelivery} />
        </div>
      </div>
      <ActionBar>
        <Button
          busy={create.isPending || update.isPending}
          disabled={draft.lines.length === 0}
          onClick={() => {
            void submit();
          }}
        >
          {order ? t('saveChanges') : t('createOrder')}
        </Button>
      </ActionBar>
      <AddItemSheets
        open={adding}
        onAdd={(line) => {
          setProblem(null);
          set({ lines: [...draft.lines, line] });
        }}
        onClose={() => {
          setAdding(false);
        }}
      />
      {pricing ? (
        <PriceSheet
          line={pricing}
          onSave={(byHand) => {
            change(pricing, { byHand });
            setPricing(null);
          }}
          onClose={() => {
            setPricing(null);
          }}
        />
      ) : null}
      {locations.data ? (
        <AreaPickSheet
          open={placing}
          mode="thana"
          title={t('district')}
          locations={locations.data}
          zoneId={null}
          chosen={[]}
          onAdd={([ref]) => {
            if (ref?.kind === 'thana') set({ locationId: ref.id });
            setPlacing(false);
          }}
          onClose={() => {
            setPlacing(false);
          }}
        />
      ) : null}
    </ShellPage>
  );
}

/** One line (the prototype's line in `o29NewOrder`): its price for each, a combo's choices, add-ons, quantity, total. */
function LineRow({
  line,
  short,
  onQuantity,
  onPrice,
}: {
  line: DraftLine;
  short: boolean;
  onQuantity: (quantity: number) => void;
  onPrice: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const each = line.byHand ?? line.price;
  return (
    <div
      className={`flex min-h-[72px] items-start gap-3 px-4 py-3 ${short ? 'bg-danger-soft' : ''}`}
    >
      <span className="flex size-12 flex-none items-center justify-center rounded-button bg-gradient-to-br from-neutral-100 to-neutral-200 text-neutral-400">
        <Icon name="image" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[16px] font-medium">
          {line.productName}
          {line.combo ? (
            <>
              {' '}
              <StatusTag tone="neutral">{t('combo')}</StatusTag>
            </>
          ) : null}
        </span>
        <span className="text-[14px] text-fg-muted">
          {line.label ? `${line.label} · ` : null}
          <span className="num">{formatTaka(line.byHand ?? line.base)}</span>
          {line.byHand !== null ? ` · ${t('byHand')}` : null}
          {short && line.available !== null ? (
            <span className="text-danger"> · {t('left', { count: Number(line.available) })}</span>
          ) : null}
        </span>
        {line.choiceText ? (
          <span className="text-[14px] text-fg-muted">
            {t('chosen', { items: line.choiceText })}
          </span>
        ) : null}
        {line.modifierText ? (
          <span className="text-[14px] text-fg-muted">
            {t('addOns', { items: line.modifierText })}
          </span>
        ) : null}
        <span className="mt-1.5 flex items-center gap-2.5">
          <Quantity
            value={line.quantity}
            least={0}
            most={Number.MAX_SAFE_INTEGER}
            label={line.productName}
            onChange={onQuantity}
          />
          <button type="button" className="text-[13px]" onClick={onPrice}>
            {t('priceByHand')}
          </button>
        </span>
      </span>
      <span className="num flex-none text-[16px] font-semibold">
        {formatTaka(Number(each) * line.quantity)}
      </span>
    </div>
  );
}

/** ORD-22 (`o29-new-paid`): how it came, the amount, a wallet's number and TrxID or a bank's reference. */
function PaidFields({
  draft,
  problems,
  onSet,
}: {
  draft: OrderDraft;
  problems: Record<string, string>;
  onSet: (patch: Partial<OrderDraft>) => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const words = useOrderWords();
  const cash = draft.method === PaymentMethod.Cash;
  const bank = draft.method === PaymentMethod.Bank;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {PAID_BY.map((method) => (
          <Chip
            key={method}
            on={draft.method === method}
            onClick={() => {
              onSet({ method });
            }}
          >
            {words.method(method)}
          </Chip>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={t('payAmount')}
          prefix="৳"
          inputMode="decimal"
          value={draft.amount}
          error={problems['payment.amount']}
          onChange={(event) => {
            onSet({ amount: event.target.value });
          }}
        />
        {cash ? null : (
          <Field
            label={bank ? t('payReference') : t('payTrxId')}
            value={draft.trxId}
            error={problems['payment.transactionId']}
            onChange={(event) => {
              onSet({ trxId: event.target.value });
            }}
          />
        )}
      </div>
      {cash || bank ? null : (
        <Field
          label={t('paySender')}
          prefix="+880"
          inputMode="tel"
          value={draft.sender}
          error={problems['payment.senderNumber']}
          onChange={(event) => {
            onSet({ sender: event.target.value });
          }}
        />
      )}
    </>
  );
}

/** The money (TAX-03): the server's quote of what is typed, less what was paid already. */
function Totals({
  draft,
  quote,
  counter,
  noDelivery,
}: {
  draft: OrderDraft;
  quote: OrderQuote | undefined;
  counter: boolean;
  noDelivery: boolean;
}): React.JSX.Element {
  const { t, i18n } = useTranslation('orders');
  const bn = i18n.language === 'bn';
  const total = Number(quote?.grandTotal ?? 0);
  const paid = draft.paid ? (amountOf(draft.amount) ?? 0) : 0;
  const zone =
    draft.byHand || noDelivery
      ? t('byHandSet')
      : quote?.deliveryZone
        ? bn
          ? quote.deliveryZone.name.bn
          : quote.deliveryZone.name.en
        : '—';
  return (
    <Card>
      <h3 className="mb-1 text-[17px] font-semibold">{t('pricing')}</h3>
      <Kv label={t('subtotal')} value={formatTaka(quote?.subtotal ?? 0)} />
      {counter ? null : (
        <Kv
          label={t('deliveryZone', { zone })}
          value={quote && !(noDelivery && !draft.byHand) ? formatTaka(quote.deliveryCharge) : '—'}
        />
      )}
      <Kv label={t('discount')} value={formatTaka(quote?.discount ?? 0)} />
      <Kv label={t('total')} value={formatTaka(total)} total />
      {quote?.taxes.map((tax) => (
        <p key={tax.name} className="-mt-0.5 mb-1.5 text-[13px] text-fg-muted">
          {t('taxIn', { name: tax.name, rate: Number(tax.rate) })}{' '}
          <span className="num">
            <Taka amount={tax.amount} />
          </span>
        </p>
      ))}
      {paid > 0 ? <Kv label={t('advance')} value={formatTaka(paid)} /> : null}
      {paid > 0 || !counter ? (
        <Kv label={t('cod')} value={formatTaka(Math.max(total - paid, 0))} />
      ) : null}
    </Card>
  );
}
