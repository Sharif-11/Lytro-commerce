import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { Permission } from '@lytronix/validators';
import { useCourierConnections, useCourierPayout, useCourierPayouts } from '@/api/couriers';
import { ErrorBanner } from '@/components/error-banner';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/classes';
import { EmptyState } from '@/components/ui/empty-state';
import { Kv } from '@/components/ui/kv';
import { rowClass, RowLead, RowList } from '@/components/ui/list-row';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatusTag } from '@/components/ui/status-tag';
import { courierName, dayInSentence } from '@/lib/couriers';
import { formatTime } from '@/lib/dates';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import type { CourierPayout } from '@/types/couriers';
import { READING_LOOK, readingOf } from '@/views/orders/parcel-words';

/**
 * Payments › Courier payouts (TENANT-DASHBOARD-DESIGN §7.39, Part 36's `c36-payouts`; CRR-17, agreed 2026-11-06: a tab on
 * Payments for whoever may read payments): what couriers paid the shop, newest first, in their own figures, each with its amount,
 * courier, the day paid, the method, how many parcels it settled and how many were Lytro's orders, and its ID. Lytro reads them
 * once a night and never checks them against the orders' cash.
 */
export function PayoutsList(): React.JSX.Element | null {
  const { t, i18n } = useTranslation('money');
  const { slug, viewer } = useShell();
  const mayConnect = allows(viewer, [Permission.CouriersManage]);
  const readsCouriers = allows(viewer, [Permission.CouriersManage, Permission.OrdersManage]);
  const list = useCourierPayouts();
  const couriers = useCourierConnections({ enabled: readsCouriers });
  const [open, setOpen] = useState<CourierPayout | null>(null);
  if (list.isError) return <ErrorBanner error={list.error} />;
  if (!list.data) {
    return (
      <Card flush>
        <SkeletonRows count={3} />
      </Card>
    );
  }
  const payouts = list.data.pages.flatMap((page) => page.payouts);
  if (payouts.length === 0) {
    // None connected: connect one first (`c36-payouts-none`); connected, none paid yet (`c36-payouts-empty`).
    if (couriers.data?.length === 0) {
      return (
        <Card>
          <EmptyState
            icon="truck"
            action={
              mayConnect ? (
                <Link
                  to="/$shop/settings/couriers"
                  params={{ shop: slug }}
                  className={buttonClass('primary', 'sm')}
                >
                  {t('crConnectFirst')}
                </Link>
              ) : undefined
            }
          >
            {t('crPNoCourier')}
          </EmptyState>
        </Card>
      );
    }
    return (
      <Card>
        <EmptyState icon="banknote">{t('crPEmpty')}</EmptyState>
      </Card>
    );
  }
  return (
    <>
      <p className="m-0 text-[14px] text-fg-muted">{t('crPayoutsLead')}</p>
      <Card flush>
        <RowList>
          {payouts.map((payout) => (
            <button
              key={payout.id}
              type="button"
              className={`${rowClass} min-h-16`}
              onClick={() => {
                setOpen(payout);
              }}
            >
              <RowLead className="text-neutral-700">
                <Icon name="truck" />
              </RowLead>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="num text-[16px] font-medium">
                  {formatTaka(payout.amount)}{' '}
                  <span className="text-[14px] font-normal text-fg-muted">
                    · {courierName(payout.courierKey)}
                  </span>
                </span>
                <span className="num text-[14px] text-fg-muted">
                  {t('crPayoutLine', {
                    d: dayInSentence(payout.paidAt, i18n.language),
                    m: payout.method ?? '–',
                    p: payout.parcels,
                    o: payout.ours,
                  })}
                </span>
                <span className="num text-[14px] text-fg-muted">{payout.payoutId}</span>
              </span>
              <span className="text-neutral-400">
                <Icon name="right" />
              </span>
            </button>
          ))}
        </RowList>
      </Card>
      {list.hasNextPage ? (
        <Button
          tone="outline"
          wide
          busy={list.isFetchingNextPage}
          onClick={() => {
            void list.fetchNextPage();
          }}
        >
          {t('spMore')}
        </Button>
      ) : null}
      {open ? (
        <PayoutSheet
          payout={open}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * One payout (Part 36's `sh-c36-payout`): its amount, charges, total, method, when paid and made, as the courier sent them; the
 * shop's orders in it with each one's COD, charge and reading; and how many more parcels weren't booked through Lytro. No
 * courier gives an amount per parcel.
 */
function PayoutSheet({
  payout,
  onClose,
}: {
  payout: CourierPayout;
  onClose: () => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation('money');
  const { t: orders } = useTranslation('orders');
  const one = useCourierPayout(payout.id);
  const name = courierName(payout.courierKey);
  const others = payout.parcels - payout.ours;
  const dash = '–';
  return (
    <Sheet open title={t('crPayoutT', { p: payout.payoutId })} onClose={onClose}>
      <div>
        <Kv label={t('crPAmount')} value={formatTaka(payout.amount)} />
        <Kv
          label={t('crPCharges')}
          value={payout.charges === null ? dash : formatTaka(payout.charges)}
        />
        <Kv label={t('crPTotal')} value={payout.total === null ? dash : formatTaka(payout.total)} />
        <Kv label={t('crPMethod')} value={payout.method ?? dash} />
        <Kv
          label={t('crPPaid')}
          value={`${dayInSentence(payout.paidAt, i18n.language)}, ${formatTime(payout.paidAt, i18n.language)}`}
        />
        <Kv
          label={t('crPMade')}
          value={payout.madeAt ? dayInSentence(payout.madeAt, i18n.language) : dash}
        />
      </div>
      <p className="text-[14px] text-fg-muted">{t('crPNote', { c: name })}</p>
      <div>
        <h3 className="mb-1 text-[16px] font-semibold">{t('crPOrders')}</h3>
        {one.isError ? <ErrorBanner error={one.error} /> : null}
        {one.isPending ? (
          <SkeletonRows count={2} />
        ) : (
          <RowList>
            {(one.data?.orders ?? []).map((order) => {
              const look = READING_LOOK[readingOf(order)];
              return (
                <div key={order.orderId} className="flex min-h-[52px] items-center gap-3 px-4 py-3">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="num text-[15px] font-medium">#{order.orderNumber ?? ''}</span>
                    <span className="num text-[14px] text-fg-muted">
                      {orders('crCodSent')} {formatTaka(order.cod)} · {orders('crCharge')}{' '}
                      {order.deliveryCharge === null
                        ? orders('crChargeNone')
                        : formatTaka(order.deliveryCharge)}
                    </span>
                  </span>
                  <StatusTag tone={look.tone}>{orders(look.word)}</StatusTag>
                </div>
              );
            })}
          </RowList>
        )}
        {others > 0 ? (
          <p className="mt-2 text-[14px] text-fg-muted">{t('crPOthers', { n: others })}</p>
        ) : null}
      </div>
    </Sheet>
  );
}
