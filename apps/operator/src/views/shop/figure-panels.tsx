import { useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@lytronix/ui';
import {
  PlanPaymentStatus,
  SalesBucket,
  SmsLogStatus,
  type CourierKey,
} from '@lytronix/validators';
import { useOperatorCouriers } from '@/api/couriers';
import {
  useShopErrors,
  useShopFailedCourierCalls,
  useShopFailedSms,
  useShopPaymentsWaiting,
  useShopSales,
} from '@/api/shops';
import { Chip, Chips } from '@/components/ui/chips';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { CopyButton } from '@/components/ui/copy-button';
import { DataTable, EmptyBox, type Column } from '@/components/ui/data-table';
import { LoadFailed } from '@/components/ui/load-failed';
import { Panel } from '@/components/ui/panel';
import { NOTE } from '@/components/ui/sizes';
import { StatusChip } from '@/components/ui/status-chip';
import { dhakaDay, formatDay, taka, useAgo } from '@/lib/format';
import { amountOf } from '@/lib/payment-amounts';
import { spacedPhone } from '@/lib/phone-words';
import { formatSessionTime } from '@/lib/session-time';
import type { OperatorShop } from '@/types/operator';
import type { ShopSales } from '@/types/shop-figures';

interface ListPanelProps {
  shop: OperatorShop;
  onClose: () => void;
}

const ROW = 'flex min-h-[60px] items-center gap-3 border-t border-line px-4 py-3 first:border-t-0';

/** A list running to its card's edges, as the sketch's flush cards hold their rows. */
function FlushList({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <section className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
      {children}
    </section>
  );
}

function Lines({ title, children }: { title: ReactNode; children?: ReactNode }): React.JSX.Element {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="text-[15px] font-medium">{title}</span>
      {children}
    </span>
  );
}

const DETAIL = 'text-[13px] text-fg-muted';
const MONO_DETAIL = 'mono text-[13px] text-fg-muted [overflow-wrap:anywhere]';
const TIME = 'text-[13px] text-fg-subtle';

/** D8-23: the shop's kept server faults: each one's ID, where and what kind, never a message. */
export function ErrorsPanel({ shop, onClose }: ListPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const errors = useShopErrors(shop.id);
  const rows = errors.data?.pages.flatMap((page) => page.errors) ?? [];
  return (
    <Panel
      open
      title={t('p88shops.errorsTitle', { shop: shop.shopName })}
      sub={t('p88shops.last7')}
      onClose={onClose}
    >
      {errors.isError ? (
        <LoadFailed
          onRetry={() => {
            void errors.refetch();
          }}
        />
      ) : rows.length > 0 ? (
        <>
          <FlushList>
            {rows.map((error) => (
              <div key={error.id} className={ROW}>
                <Lines
                  title={
                    <>
                      <span className="mono text-[14px] font-semibold">{error.requestId}</span>{' '}
                      <StatusChip tone={error.status === 503 ? 'warn' : 'bad'}>
                        {String(error.status)}
                      </StatusChip>
                    </>
                  }
                >
                  <span className={MONO_DETAIL}>
                    {error.method} {error.route ?? '—'}
                  </span>
                  <span className={DETAIL}>{error.kind}</span>
                </Lines>
                <span className="flex flex-none flex-col items-end gap-1">
                  <span className={TIME}>{formatSessionTime(error.createdAt)}</span>
                  <CopyButton text={error.requestId} />
                </span>
              </div>
            ))}
          </FlushList>
          {errors.hasNextPage ? (
            <Button
              type="button"
              tone="outline"
              small
              loading={errors.isFetchingNextPage}
              onClick={() => {
                void errors.fetchNextPage();
              }}
            >
              {t('shops.loadMore')}
            </Button>
          ) : null}
        </>
      ) : errors.isPending ? (
        <span className="skel w-2/3" />
      ) : (
        <EmptyBox icon="check" title={t('p88shops.errorsEmpty')} hint="" />
      )}
      <div className={NOTE}>{t('p88shops.errorsNote')}</div>
    </Panel>
  );
}

function SmsSection({ title, children }: { title: string; children: ReactNode[] }) {
  const { t } = useTranslation();
  return (
    <>
      <h3 className="mt-1 text-[14px] font-semibold">{title}</h3>
      {children.length > 0 ? (
        <FlushList>{children}</FlushList>
      ) : (
        <div className={NOTE}>{t('p88shops.none')}</div>
      )}
    </>
  );
}

/** D8-30: the shop's own SMS that didn't go, without the customer's phone or the words, then Lytro's own to it. */
export function SmsPanel({ shop, onClose }: ListPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const sms = useShopFailedSms(shop.id);
  const data = sms.data;
  return (
    <Panel
      open
      title={t('p88shops.smsTitle', { shop: shop.shopName })}
      sub={t('p88shops.last7')}
      onClose={onClose}
    >
      {sms.isError ? (
        <LoadFailed
          onRetry={() => {
            void sms.refetch();
          }}
        />
      ) : data ? (
        <>
          <SmsSection title={t('p88shops.smsShop')}>
            {data.shop.map((each) => (
              <div key={each.id} className={ROW}>
                <Lines
                  title={
                    <>
                      {t(`p88shops.smsKinds.${each.kind}`)}{' '}
                      {each.status === SmsLogStatus.Blocked ? (
                        <StatusChip tone="warn">{t('p88shops.blocked')}</StatusChip>
                      ) : (
                        <StatusChip tone="bad">{t('p88shops.failed')}</StatusChip>
                      )}
                    </>
                  }
                >
                  <span className={`${DETAIL} tabular-nums`}>
                    {[
                      each.orderNumber ? `#${each.orderNumber}` : null,
                      t('p88shops.units', { n: each.units }),
                      each.blockedReason
                        ? t(`p88shops.blockedReasons.${each.blockedReason}`)
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </Lines>
                <span className={`flex-none ${TIME}`}>{formatSessionTime(each.createdAt)}</span>
              </div>
            ))}
          </SmsSection>
          <SmsSection title={t('p88shops.smsLytro')}>
            {data.lytro.map((each) => (
              <div key={each.id} className={ROW}>
                <Lines
                  title={
                    <>
                      {t(`p88shops.lytroSmsKinds.${each.kind}`, { defaultValue: each.kind })}{' '}
                      <StatusChip tone="bad">{t('p88shops.failed')}</StatusChip>
                    </>
                  }
                >
                  <span className={DETAIL}>
                    <span className="mono">{spacedPhone(each.toPhone)}</span> ·{' '}
                    {t('p88shops.attempts', { n: each.attempts })}
                  </span>
                  {each.lastError ? <span className={MONO_DETAIL}>{each.lastError}</span> : null}
                </Lines>
                <span className={`flex-none ${TIME}`}>{formatSessionTime(each.createdAt)}</span>
              </div>
            ))}
          </SmsSection>
        </>
      ) : (
        <span className="skel w-2/3" />
      )}
      <div className={NOTE}>{t('p88shops.smsNote')}</div>
    </Panel>
  );
}

/** D8-26: the courier calls that failed or the courier refused; the whole key log is a step away. */
export function CourierPanel({ shop, onClose }: ListPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const calls = useShopFailedCourierCalls(shop.id);
  const couriers = useOperatorCouriers();
  const nameOf = (key: CourierKey): string =>
    couriers.data?.find((each) => each.key === key)?.name ?? key;
  const rows = calls.data?.uses ?? [];
  return (
    <Panel
      open
      title={t('p88shops.courierTitle', { shop: shop.shopName })}
      sub={t('p88shops.last7')}
      onClose={onClose}
    >
      {calls.isError ? (
        <LoadFailed
          onRetry={() => {
            void calls.refetch();
          }}
        />
      ) : rows.length > 0 ? (
        <FlushList>
          {rows.map((use) => (
            <div
              key={`${use.at}-${use.action}-${use.orderId ?? ''}-${use.courierKey}`}
              className={ROW}
            >
              <Lines
                title={
                  <>
                    {nameOf(use.courierKey)} · {t(`courierActions.${use.action}`)}{' '}
                    <StatusChip tone="bad">{t('p88shops.failed')}</StatusChip>
                  </>
                }
              >
                <span className={DETAIL}>
                  {use.orderNumber ? <span className="tabular-nums">#{use.orderNumber}</span> : '—'}
                </span>
              </Lines>
              <span className={`flex-none ${TIME}`}>{formatSessionTime(use.at)}</span>
            </div>
          ))}
        </FlushList>
      ) : calls.isPending ? (
        <span className="skel w-2/3" />
      ) : (
        <EmptyBox icon="check" title={t('p88shops.none')} hint="" />
      )}
      <Button
        type="button"
        tone="outline"
        small
        onClick={() => {
          void navigate({ to: '/shops/$id/courier-keys', params: { id: shop.id } });
        }}
      >
        {t('p88shops.courierAll')}
      </Button>
    </Panel>
  );
}

/** D8-28: the seller's payments to Lytro waiting in the queue, each opening there; the shoppers' stay the seller's. */
export function WaitingPanel({
  shop,
  customers,
  onClose,
}: ListPanelProps & { customers: number }): React.JSX.Element {
  const { t } = useTranslation();
  const ago = useAgo();
  const navigate = useNavigate();
  const waiting = useShopPaymentsWaiting(shop.id);
  const rows = waiting.data ?? [];
  return (
    <Panel open title={t('p88shops.waitingTitle', { shop: shop.shopName })} onClose={onClose}>
      {waiting.isError ? (
        <LoadFailed
          onRetry={() => {
            void waiting.refetch();
          }}
        />
      ) : rows.length > 0 ? (
        <FlushList>
          {rows.map((payment) => (
            <button
              key={payment.id}
              type="button"
              onClick={() => {
                void navigate({ to: '/queue/$id', params: { id: payment.id } });
              }}
              className={`${ROW} w-full text-left`}
            >
              <Lines title={`${t(`paymentKinds.${payment.kind}`)} · ${taka(amountOf(payment))}`}>
                <span className={DETAIL}>
                  <span className="mono">{payment.transactionId ?? '—'}</span> ·{' '}
                  {payment.senderNumber ? spacedPhone(payment.senderNumber) : '—'} ·{' '}
                  {ago(payment.createdAt)}
                </span>
              </Lines>
              {payment.status === PlanPaymentStatus.NeedsReview ? (
                <StatusChip tone="warn">{t('paymentStatuses.needs_review')}</StatusChip>
              ) : (
                <StatusChip tone="info">{t('paymentStatuses.pending')}</StatusChip>
              )}
              <ConsoleIcon name="chev" className="text-neutral-400" />
            </button>
          ))}
        </FlushList>
      ) : waiting.isPending ? (
        <span className="skel w-2/3" />
      ) : (
        <EmptyBox icon="check" title={t('p88shops.none')} hint="" />
      )}
      <div className={NOTE}>{t('p88shops.waitingCustomers', { n: customers })}</div>
    </Panel>
  );
}

type SalesPeriod = 'thisWeek' | 'thisMonth' | 'lastMonth' | 'thisYear';

const PERIODS: SalesPeriod[] = ['thisWeek', 'thisMonth', 'lastMonth', 'thisYear'];

const DAY_MS = 24 * 60 * 60 * 1000;
// D3-9 (Slice 4.7): the seller's weeks run Saturday to Friday.
const SATURDAY = 6;

function isoOf(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

/** The days a period covers, in Dhaka, up to today; a year splits by month, the rest by week, as the Sales page does. */
function periodOf(
  period: SalesPeriod,
  now: Date,
): { dateFrom: string; dateTo: string; bucket: SalesBucket } {
  const today = dhakaDay(now);
  const [year, month, day] = today.split('-').map(Number) as [number, number, number];
  const todayAt = Date.UTC(year, month - 1, day);
  if (period === 'thisWeek') {
    const back = (new Date(todayAt).getUTCDay() - SATURDAY + 7) % 7;
    return { dateFrom: isoOf(todayAt - back * DAY_MS), dateTo: today, bucket: SalesBucket.Week };
  }
  if (period === 'thisMonth') {
    return {
      dateFrom: isoOf(Date.UTC(year, month - 1, 1)),
      dateTo: today,
      bucket: SalesBucket.Week,
    };
  }
  if (period === 'lastMonth') {
    return {
      dateFrom: isoOf(Date.UTC(year, month - 2, 1)),
      dateTo: isoOf(Date.UTC(year, month - 1, 1) - DAY_MS),
      bucket: SalesBucket.Week,
    };
  }
  return { dateFrom: `${String(year)}-01-01`, dateTo: today, bucket: SalesBucket.Month };
}

/** STA-01: the shop's own sales as its Sales page shows them, for a period; never cost or profit (ADM-03). */
export function SalesPanel({ shop, onClose }: ListPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<SalesPeriod>('thisMonth');
  const sales = useShopSales(shop.id, periodOf(period, new Date()));
  const data = sales.data;
  const columns: Column<ShopSales['buckets'][number]>[] = [
    {
      key: 'period',
      label: data?.bucket === SalesBucket.Month ? t('p88shops.month') : t('p88shops.week'),
      width: 'minmax(110px,1fr)',
      main: true,
      cell: (bucket) => `${formatDay(bucket.from)} – ${formatDay(bucket.to)}`,
    },
    {
      key: 'orders',
      label: t('p88shops.salesOrders'),
      width: '90px',
      right: true,
      cell: (bucket) => <span className="tabular-nums">{bucket.orders}</span>,
    },
    {
      key: 'revenue',
      label: t('p88shops.salesRevenue'),
      width: '110px',
      right: true,
      cell: (bucket) => <span className="tabular-nums">{taka(bucket.revenue)}</span>,
    },
  ];
  return (
    <Panel
      open
      title={t('p88shops.salesTitle', { shop: shop.shopName })}
      sub={t('p88shops.salesLead')}
      onClose={onClose}
    >
      {sales.isError ? (
        <LoadFailed
          onRetry={() => {
            void sales.refetch();
          }}
        />
      ) : (
        <>
          <Chips>
            {PERIODS.map((each) => (
              <Chip
                key={each}
                on={each === period}
                onClick={() => {
                  setPeriod(each);
                }}
              >
                {t(`p88shops.${each}`)}
              </Chip>
            ))}
          </Chips>
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 text-[14px]">
            <dt className="min-w-0 text-neutral-700">{t('p88shops.salesOrders')}</dt>
            <dd className="text-right font-medium tabular-nums">
              {data ? data.totals.orders.toLocaleString('en-US') : '—'}
            </dd>
            <dt className="min-w-0 text-neutral-700">{t('p88shops.salesRevenue')}</dt>
            <dd className="text-right font-medium tabular-nums">
              {data ? taka(data.totals.revenue) : '—'}
            </dd>
            <dt className="min-w-0 text-neutral-700">{t('p88shops.salesDelivery')}</dt>
            <dd className="text-right font-medium tabular-nums">
              {data ? taka(data.totals.deliveryCharges ?? 0) : '—'}
            </dd>
            <dt className="min-w-0 text-neutral-700">{t('p88shops.salesCourier')}</dt>
            <dd className="text-right font-medium tabular-nums">
              {data ? taka(data.totals.courierCharges ?? 0) : '—'}
            </dd>
          </dl>
          <DataTable
            columns={columns}
            rows={data?.buckets ?? []}
            rowKey={(bucket) => bucket.from}
            loading={sales.isPending}
            empty={<EmptyBox icon="chart" title={t('p88shops.none')} hint="" />}
          />
        </>
      )}
    </Panel>
  );
}
