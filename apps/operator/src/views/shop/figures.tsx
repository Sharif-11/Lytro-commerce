import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { OrderStatus, UsageMetric } from '@lytronix/validators';
import { useShopFigures } from '@/api/shops';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { ConsoleCard } from '@/components/ui/console-page';
import { figureBox } from '@/components/ui/figure-box';
import { FigureBody } from '@/components/ui/figures';
import { LoadFailed } from '@/components/ui/load-failed';
import { NOTE } from '@/components/ui/sizes';
import { StatusChip } from '@/components/ui/status-chip';
import { formatDay, taka, useAgo } from '@/lib/format';
import { spacedPhone } from '@/lib/phone-words';
import { formatSessionTime } from '@/lib/session-time';
import type { ShopFigures as Figures, ShopUsageFigure } from '@/types/shop-figures';

/** The lists behind the figures, each opened in its panel (D8-25). */
export type FigureList = 'errors' | 'sms' | 'courier' | 'waiting' | 'sales';

/** The seller's order statuses, in the order their order list shows them. */
const ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.Unverified,
  OrderStatus.Pending,
  OrderStatus.Confirmed,
  OrderStatus.Processing,
  OrderStatus.Shipped,
  OrderStatus.Delivered,
  OrderStatus.PartialDelivered,
  OrderStatus.Completed,
  OrderStatus.Cancelled,
  OrderStatus.Hold,
  OrderStatus.InReview,
  OrderStatus.Refunded,
  OrderStatus.Returned,
  OrderStatus.Rejected,
];

const STILL_LOADING = <span className="skel h-6! w-[60px]" />;

function bytes(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(value >= 1e10 ? 0 : 1)} GB`;
  return `${String(Math.round(value / 1e6))} MB`;
}

/** A figure that opens its list; marigold when it needs a person. */
function OpenFigure({
  label,
  value,
  detail,
  flagged = false,
  wide = false,
  onOpen,
}: {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  flagged?: boolean;
  wide?: boolean;
  onOpen: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${figureBox(flagged)} cursor-pointer hover:border-line-strong ${
        wide ? 'col-span-full sm:col-auto' : ''
      }`}
    >
      <FigureBody label={label} value={value} detail={detail} flagged={flagged} />
    </button>
  );
}

/** One limit's use against it: marigold from 80%, red from 95% (LIM-01). */
function Meter({ used, limit }: { used: number; limit: number | null }): React.JSX.Element {
  const share = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const fill = share >= 95 ? 'bg-danger' : share >= 80 ? 'bg-accent-500' : 'bg-primary';
  return (
    <div className="relative h-2 rounded-full bg-neutral-100">
      <i
        className={`absolute inset-y-0 left-0 max-w-full rounded-full ${fill}`}
        style={{ width: `${String(share)}%` }}
      />
    </div>
  );
}

function UsageRow({ figure }: { figure: ShopUsageFigure }): React.JSX.Element {
  const { t } = useTranslation();
  const amount = (value: number): string =>
    figure.unit === 'bytes'
      ? bytes(value)
      : figure.metric === UsageMetric.SmsSpend
        ? taka(value)
        : value.toLocaleString('en-US');
  return (
    <div className="flex flex-col gap-1.5 border-t border-line py-2.5 first:border-t-0">
      <div className="flex flex-wrap justify-between gap-3 text-[14px]">
        <span>{t(`p88shops.metrics.${figure.metric}`)}</span>
        <span className="text-[13px] text-fg-muted">
          {t('p88shops.of', {
            a: amount(figure.used),
            b: figure.limit === null ? t('p88shops.unlimited') : amount(figure.limit),
          })}
        </span>
      </div>
      <Meter used={figure.used} limit={figure.limit} />
    </div>
  );
}

function SignIns({ figures }: { figures: Figures }): React.JSX.Element {
  const { t } = useTranslation();
  const ago = useAgo();
  return (
    <ConsoleCard className="p-0!">
      <h2 className="mb-1 px-4 pt-4 pb-1 text-[16px] font-semibold">{t('p88shops.signIns')}</h2>
      <div className="flex flex-col">
        {figures.signIns.map((member) => (
          <div
            key={member.userId}
            className="flex min-h-[52px] items-center gap-3 border-t border-line px-4 py-3 first:border-t-0"
          >
            <span className="flex size-8 flex-none items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
              <ConsoleIcon name="user" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-medium">
                {member.name ?? t('p88shops.noName')}{' '}
                {member.isOwner ? (
                  <StatusChip tone="info" plain>
                    {t('p88shops.owner')}
                  </StatusChip>
                ) : null}
              </span>
              <span className="mono text-[13px] text-fg-muted">
                {member.phone ? spacedPhone(member.phone) : '—'}
              </span>
            </span>
            <span className="flex flex-none flex-col items-end gap-1 text-right text-[13px] text-fg-subtle">
              <span>{member.lastAt ? formatSessionTime(member.lastAt) : t('p88shops.never')}</span>
              {member.lastAt ? <span>{t('p88shops.ago', { t: ago(member.lastAt) })}</span> : null}
            </span>
          </div>
        ))}
      </div>
    </ConsoleCard>
  );
}

/**
 * ADM-03 (OPERATOR-CONSOLE-DESIGN v7 §5): the shop as it is now, read inside it by the code its own dashboard uses (D8-8),
 * right under its facts, since that's why an operator opens a shop. Each list behind a figure loads in its panel.
 */
export function ShopFiguresSection({
  shopId,
  onOpen,
}: {
  shopId: string;
  onOpen: (list: FigureList) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const figures = useShopFigures(shopId);
  const data = figures.data;

  const head = (
    <div className="flex flex-col gap-1 sm:gap-2">
      <h2 className="text-[16px] font-semibold">{t('p88shops.figures')}</h2>
      {figures.isError ? null : <div className={NOTE}>{t('p88shops.figuresLead')}</div>}
    </div>
  );

  if (figures.isError) {
    return (
      <>
        {head}
        <LoadFailed
          onRetry={() => {
            void figures.refetch();
          }}
        />
      </>
    );
  }

  const sms = data
    ? data.failedSms.shop.failed + data.failedSms.shop.blocked + data.failedSms.lytro
    : 0;
  // PLN-20: address reads are the one service paid use by use today.
  const reads = data?.usage.payPerUse[0];

  return (
    <>
      {head}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className={figureBox(false)}>
          <FigureBody
            label={t('p88shops.balance')}
            value={data ? taka(data.balance.amount) : STILL_LOADING}
            detail={
              data ? (
                <>
                  {data.balance.frozen ? (
                    <StatusChip tone="bad">{t('p88shops.frozen')}</StatusChip>
                  ) : (
                    t('p88shops.notFrozen')
                  )}{' '}
                  · {t('p88shops.held', { a: taka(data.balance.held) })}
                </>
              ) : null
            }
          />
        </div>
        <OpenFigure
          label={t('p88shops.errors')}
          value={data ? data.errors.count : STILL_LOADING}
          detail={
            data
              ? data.errors.count > 0
                ? t('p88shops.errorsDetail')
                : t('p88shops.errorsNone')
              : null
          }
          flagged={(data?.errors.count ?? 0) > 0}
          onOpen={() => {
            onOpen('errors');
          }}
        />
        <OpenFigure
          label={t('p88shops.sms')}
          value={data ? sms : STILL_LOADING}
          detail={
            data
              ? t('p88shops.smsDetail', {
                  f: data.failedSms.shop.failed,
                  b: data.failedSms.shop.blocked,
                  l: data.failedSms.lytro,
                })
              : null
          }
          onOpen={() => {
            onOpen('sms');
          }}
        />
        <OpenFigure
          label={t('p88shops.courier')}
          value={data ? data.failedCourierCalls.count : STILL_LOADING}
          detail={data ? t('p88shops.courierDetail') : null}
          onOpen={() => {
            onOpen('courier');
          }}
        />
        <OpenFigure
          label={t('p88shops.waiting')}
          value={data ? data.paymentsWaiting.lytro.count : STILL_LOADING}
          detail={
            data
              ? t('p88shops.waitingDetail', {
                  a: taka(data.paymentsWaiting.lytro.amount),
                  n: data.paymentsWaiting.customers,
                })
              : null
          }
          wide
          onOpen={() => {
            onOpen('waiting');
          }}
        />
      </div>
      {data ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ConsoleCard>
              <h2 className="mb-1 text-[16px] font-semibold">{t('p88shops.usage')}</h2>
              <div className="text-[13px] text-fg-muted">
                {t('p88shops.usageLead', {
                  a: formatDay(data.usage.cycleStart),
                  b: formatDay(data.usage.cycleEnd),
                })}
              </div>
              <div className="mt-2">
                {data.usage.metrics.map((figure) => (
                  <UsageRow key={figure.metric} figure={figure} />
                ))}
              </div>
              {reads && reads.outsideAllowance.count > 0 ? (
                <div className={`mt-2 ${NOTE}`}>
                  {t('p88shops.reads', {
                    n: reads.outsideAllowance.count,
                    a: taka(reads.outsideAllowance.cost),
                  })}
                </div>
              ) : null}
            </ConsoleCard>
            <div className="flex min-w-0 flex-col gap-3">
              <SignIns figures={data} />
              <ConsoleCard>
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="mb-1 text-[16px] font-semibold">{t('p88shops.sales')}</h2>
                  <button
                    type="button"
                    onClick={() => {
                      onOpen('sales');
                    }}
                    className="text-[14px] font-medium whitespace-nowrap text-primary"
                  >
                    {t('p88shops.salesOpen')}
                  </button>
                </div>
                <div className="text-[13px] text-fg-muted">{t('p88shops.salesLead')}</div>
              </ConsoleCard>
            </div>
          </div>
          <ConsoleCard>
            <h2 className="mb-1 text-[16px] font-semibold">{t('p88shops.orders')}</h2>
            <div className="text-[13px] text-fg-muted">{t('p88shops.ordersLead')}</div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
              {ORDER_STATUSES.map((status) => {
                const count = data.orders[status];
                return (
                  <div
                    key={status}
                    className={`flex justify-between gap-2 border-b border-dashed border-line py-1 text-[14px] ${
                      count === 0 ? 'text-fg-muted' : ''
                    }`}
                  >
                    <span>{t(`p88shops.orderStatuses.${status}`)}</span>
                    <b className="tabular-nums">{count.toLocaleString('en-US')}</b>
                  </div>
                );
              })}
            </div>
          </ConsoleCard>
        </>
      ) : null}
    </>
  );
}
