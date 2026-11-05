import { useState } from 'react';
import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@lytronix/ui';
import { PlanPaymentKind, PlanPaymentStatus } from '@lytronix/validators';
import { usePaymentQueue } from '@/api/payment-queue';
import { Chip, Chips } from '@/components/ui/chips';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { ConsolePage, PageTitle } from '@/components/ui/console-page';
import { DataTable, EmptyBox, type Column } from '@/components/ui/data-table';
import { LoadFailed } from '@/components/ui/load-failed';
import { CELL_NOTE, SMALL_BUTTON } from '@/components/ui/sizes';
import { StatusChip } from '@/components/ui/status-chip';
import { taka, useAgo } from '@/lib/format';
import { amountOf, differsFromQuote } from '@/lib/payment-amounts';
import type { QueuedPayment } from '@/types/operator';
import { QueueFigures } from './queue-figures';
import { usePlanWords } from './use-plan-words';

const KINDS = [
  PlanPaymentKind.Purchase,
  PlanPaymentKind.Renewal,
  PlanPaymentKind.Upgrade,
  PlanPaymentKind.TopUp,
  PlanPaymentKind.Addon,
];

function needsReview(payment: QueuedPayment): boolean {
  return payment.status === PlanPaymentStatus.NeedsReview;
}

/**
 * ADM-06, BIL-06 (OPERATOR-CONSOLE-DESIGN §4): payments Lytro's phones couldn't match, then those with no receipt yet.
 * Evidence on one row; Approve and Reject are the only buttons on it, and each opens its panel.
 */
export function Queue(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const ago = useAgo();
  const queue = usePaymentQueue();
  const { planOf, termOf } = usePlanWords();
  const [kind, setKind] = useState<PlanPaymentKind | null>(null);
  const [reviewOnly, setReviewOnly] = useState(false);

  const all = queue.data ?? [];
  const rows = [...all]
    .filter(
      (payment) =>
        (kind === null || payment.kind === kind) && (!reviewOnly || needsReview(payment)),
    )
    .sort((a, b) => Number(needsReview(b)) - Number(needsReview(a)));

  function open(id: string, step?: 'approve' | 'reject'): void {
    void navigate({ to: '/queue/$id', params: { id }, search: step ? { step } : {} });
  }

  function whatFor(payment: QueuedPayment): string {
    const addon = payment.addons[0];
    if (addon)
      return `${i18n.language === 'bn' ? addon.labelBn : addon.labelEn} ×${String(addon.quantity)}`;
    if (payment.kind === PlanPaymentKind.TopUp) {
      return t('queue.credits', { a: taka(amountOf(payment)) });
    }
    const plan = planOf(payment.planId);
    return plan ? `${plan.name} · ${termOf(payment.billingTermId)}` : '';
  }

  const columns: Column<QueuedPayment>[] = [
    {
      key: 'shop',
      label: t('queue.shop'),
      width: 'minmax(170px,1.5fr)',
      main: true,
      cell: (payment) => (
        <>
          <Link
            to="/queue/$id"
            params={{ id: payment.id }}
            search={{}}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            {payment.shopName}
          </Link>
          <div className={CELL_NOTE}>{payment.shopSlug}.lytro.app</div>
        </>
      ),
    },
    {
      key: 'kind',
      label: t('queue.kind'),
      width: 'minmax(120px,1fr)',
      cell: (payment) => (
        <>
          <div>{t(`paymentKinds.${payment.kind}`)}</div>
          <div className={CELL_NOTE}>{whatFor(payment)}</div>
        </>
      ),
    },
    {
      key: 'amount',
      label: t('queue.amount'),
      width: '110px',
      right: true,
      cell: (payment) => (
        <>
          <span className="font-display font-bold tracking-[-0.01em] tabular-nums">
            {taka(amountOf(payment))}
          </span>
          {differsFromQuote(payment) ? (
            <div className="text-[12px] text-warning">
              {t('queue.quoted').toLowerCase()} {taka(payment.amount)}
            </div>
          ) : null}
        </>
      ),
    },
    {
      key: 'sender',
      label: `${t('queue.sender')} · ${t('queue.trx')}`,
      width: '150px',
      cell: (payment) => (
        <>
          <span className="mono text-[13px]">{payment.senderNumber ?? '—'}</span>
          <div className={`mono ${CELL_NOTE}`}>
            {payment.transactionId ?? '—'}
            {payment.wallet ? ` · ${payment.wallet}` : ''}
          </div>
        </>
      ),
    },
    {
      key: 'age',
      label: t('queue.waiting'),
      width: '80px',
      cell: (payment) => <span className="tabular-nums">{ago(payment.createdAt)}</span>,
    },
    {
      key: 'status',
      label: t('queue.status'),
      width: '120px',
      cell: (payment) =>
        needsReview(payment) ? (
          <StatusChip tone="warn">{t('paymentStatuses.needs_review')}</StatusChip>
        ) : (
          <StatusChip tone="info">{t('paymentStatuses.pending')}</StatusChip>
        ),
    },
    {
      key: 'actions',
      label: '',
      width: '170px',
      actions: true,
      cell: (payment) => (
        <>
          <Button
            type="button"
            small
            fit
            className={SMALL_BUTTON}
            onClick={(event) => {
              event.stopPropagation();
              open(payment.id, 'approve');
            }}
          >
            {t('queue.approve')}
          </Button>
          <Button
            type="button"
            tone="outline"
            small
            fit
            className={SMALL_BUTTON}
            onClick={(event) => {
              event.stopPropagation();
              open(payment.id, 'reject');
            }}
          >
            {t('queue.reject')}
          </Button>
        </>
      ),
    },
  ];

  return (
    <ConsolePage>
      <PageTitle title={t('nav.paymentQueue')} lead={t('queue.lead')} />
      {queue.isError ? (
        <LoadFailed
          onRetry={() => {
            void queue.refetch();
          }}
        />
      ) : (
        <>
          <QueueFigures payments={queue.data} />
          <Chips>
            <Chip
              on={kind === null}
              count={all.length}
              onClick={() => {
                setKind(null);
              }}
            >
              {t('queue.all')}
            </Chip>
            {KINDS.map((each) => (
              <Chip
                key={each}
                on={kind === each}
                count={all.filter((payment) => payment.kind === each).length}
                onClick={() => {
                  setKind(each);
                }}
              >
                {t(`paymentKinds.${each}`)}
              </Chip>
            ))}
            <Chip
              on={reviewOnly}
              className="ml-auto"
              onClick={() => {
                setReviewOnly((value) => !value);
              }}
            >
              <ConsoleIcon name="flag" size={16} />
              {t('queue.reviewOnly')}
            </Chip>
          </Chips>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(payment) => payment.id}
            loading={queue.isPending}
            onOpen={(payment) => {
              open(payment.id);
            }}
            empty={<EmptyBox icon="queue" title={t('queue.empty')} hint={t('queue.emptyHint')} />}
          />
        </>
      )}
      <Outlet />
    </ConsolePage>
  );
}
