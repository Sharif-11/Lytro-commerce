import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { BillingPaymentState } from '@lytronix/validators';
import { useBillingPaymentById, useBillingPayments } from '@/api/billing';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip, ChipRow } from '@/components/ui/chips';
import { EmptyState } from '@/components/ui/empty-state';
import { PageFrame } from '@/components/ui/page';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useErrorText } from '@/hooks/use-error-text';
import { formatMonthYear, monthKey } from '@/lib/dates';
import { SectionChips } from '@/shell/section-chips';
import { ShellBanner } from '@/shell/shell-banner';
import { useShell } from '@/shell/shell-context';
import type { BillingPayment } from '@/types/billing';
import { PaymentDetail } from './payment-detail';
import { PaymentRow } from './payment-row';

// The filter chips (§7.13): all, then the states a seller looks for.
const FILTERS: { state: BillingPaymentState | null; word: string }[] = [
  { state: null, word: 'all' },
  { state: BillingPaymentState.Checking, word: 'blChecking' },
  { state: BillingPaymentState.Paid, word: 'blPaid' },
  { state: BillingPaymentState.Rejected, word: 'blRejected' },
];

/** Payments grouped under their month, newest first, as the list is ordered. */
function byMonth(
  payments: BillingPayment[],
): { key: string; iso: string; items: BillingPayment[] }[] {
  const groups: { key: string; iso: string; items: BillingPayment[] }[] = [];
  for (const payment of payments) {
    const key = monthKey(payment.quotedAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(payment);
    else groups.push({ key, iso: payment.quotedAt, items: [payment] });
  }
  return groups;
}

/**
 * Billing (TENANT-DASHBOARD-DESIGN §7.13, BIL-19): every payment the shop made to Lytro with its state, the invoice as a
 * paid one's receipt. On a phone the list, or one payment on its own screen with Back (`/billing/:id`); from 1024 px the
 * list beside the payment, the row marked. A payment opened cold is found in the list's pages, up to five (decided
 * for 11.5b); there is no route for one payment on the server.
 */
export function BillingView({ paymentId }: { paymentId: string | null }): React.JSX.Element {
  const { t, i18n } = useTranslation('money');
  const { t: tShell } = useTranslation('shell');
  const errorText = useErrorText();
  const { slug } = useShell();
  const [filter, setFilter] = useState<BillingPaymentState | null>(null);
  const list = useBillingPayments(filter);
  const loaded = (list.data?.pages ?? []).flatMap((page) => page.payments);
  const inList = paymentId ? loaded.find((payment) => payment.id === paymentId) : undefined;
  const cold = useBillingPaymentById(paymentId, {
    enabled: list.isFetched && inList === undefined,
  });
  const selected = paymentId ? (inList ?? cold.data ?? null) : (loaded[0] ?? null);
  const nothingYet = filter === null && list.isSuccess && loaded.length === 0;

  const listColumn = (
    <div
      className={[
        'flex min-w-0 flex-col gap-4 lg:sticky lg:top-0 lg:w-[400px] lg:flex-none',
        paymentId ? 'max-lg:hidden' : '',
      ].join(' ')}
    >
      {/* The list column keeps its heading at every width, as the sketch's does. */}
      <h1 className="text-[22px] leading-[1.3] font-bold">{tShell('secBilling')}</h1>
      <SectionChips />
      {nothingYet ? null : (
        <>
          <ChipRow className="lg:flex-wrap">
            {FILTERS.map((each) => (
              <Chip
                key={each.word}
                on={filter === each.state}
                onClick={() => {
                  setFilter(each.state);
                }}
              >
                {t(each.word)}
              </Chip>
            ))}
          </ChipRow>
          <Card flush>
            {list.isLoading ? <SkeletonRows count={3} /> : null}
            {list.isError ? (
              <div className="p-4">
                <Banner tone="bad">{errorText(list.error)}</Banner>
              </div>
            ) : null}
            {list.isSuccess && loaded.length === 0 ? (
              <EmptyState icon="file">{t('nothingYet')}</EmptyState>
            ) : null}
            {byMonth(loaded).map((group) => (
              <div key={group.key}>
                <div className="bg-neutral-50 px-4 pt-3 pb-1 text-[13px] font-semibold text-neutral-700">
                  {formatMonthYear(group.iso, i18n.language)}
                </div>
                <div className="flex flex-col [&>*+*]:border-t [&>*+*]:border-line">
                  {group.items.map((payment) => (
                    <PaymentRow
                      key={payment.id}
                      payment={payment}
                      selected={payment.id === selected?.id}
                    />
                  ))}
                </div>
              </div>
            ))}
            {list.hasNextPage ? (
              <div className="px-4 pt-2 pb-3">
                <Button
                  tone="outline"
                  size="sm"
                  wide
                  busy={list.isFetchingNextPage}
                  onClick={() => {
                    void list.fetchNextPage();
                  }}
                >
                  {t('showEarlier')}
                </Button>
              </div>
            ) : null}
          </Card>
        </>
      )}
    </div>
  );

  if (nothingYet) {
    return (
      <PageFrame>
        <ShellBanner />
        {listColumn}
        <Card>
          <EmptyState icon="file">{t('blEmpty')}</EmptyState>
        </Card>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <ShellBanner />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {listColumn}
        <div
          className={[
            'min-w-0 flex-1 flex-col gap-4 lg:flex lg:gap-6',
            paymentId ? 'flex' : 'hidden',
          ].join(' ')}
        >
          {selected ? (
            <PaymentDetail payment={selected} />
          ) : paymentId && cold.isFetched ? (
            <Card>
              <p className="text-[15px] text-fg-muted">{t('blNotRecent')}</p>
              <Link
                to="/$shop/billing"
                params={{ shop: slug }}
                className="mt-2 inline-block font-semibold text-primary"
              >
                {t('blSeeAll')}
              </Link>
            </Card>
          ) : paymentId ? (
            <Card flush>
              <SkeletonRows count={3} />
            </Card>
          ) : null}
        </div>
      </div>
    </PageFrame>
  );
}
