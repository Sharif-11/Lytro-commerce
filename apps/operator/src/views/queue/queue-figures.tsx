import { useTranslation } from 'react-i18next';
import { PlanPaymentStatus } from '@lytronix/validators';
import { Figure, Figures } from '@/components/ui/figures';
import { taka, useAgo } from '@/lib/format';
import { amountOf, reviewLine } from '@/lib/payment-amounts';
import type { QueuedPayment } from '@/types/operator';

const STILL_LOADING = <span className="skel h-6! w-[60px]" />;

/** Four figures from the queue itself (OPERATOR-CONSOLE-DESIGN §3): what needs review, what waits, the taka, the oldest. */
export function QueueFigures({
  payments,
}: {
  payments: QueuedPayment[] | undefined;
}): React.JSX.Element {
  const { t } = useTranslation();
  const ago = useAgo();
  if (!payments) {
    return (
      <Figures>
        <Figure label={t('figures.needsReview')} value={STILL_LOADING} detail={null} />
        <Figure label={t('figures.pending')} value={STILL_LOADING} detail={null} />
        <Figure label={t('figures.taka')} value={STILL_LOADING} detail={null} />
        <Figure label={t('figures.oldest')} value={STILL_LOADING} detail={null} />
      </Figures>
    );
  }
  const review = payments.filter((payment) => payment.status === PlanPaymentStatus.NeedsReview);
  const first = review[0];
  const total = payments.reduce((sum, payment) => sum + Number(amountOf(payment)), 0);
  const oldest = payments.reduce<QueuedPayment | null>(
    (older, payment) =>
      !older || new Date(payment.createdAt) < new Date(older.createdAt) ? payment : older,
    null,
  );
  return (
    <Figures>
      <Figure
        label={t('figures.needsReview')}
        value={review.length}
        detail={first ? reviewLine(first, t) : t('figures.nothing')}
        flagged={review.length > 0}
      />
      <Figure
        label={t('figures.pending')}
        value={payments.length - review.length}
        detail={payments.length > 0 ? t('queue.noReceipt') : t('figures.nothing')}
      />
      <Figure
        label={t('figures.taka')}
        value={taka(total)}
        detail={t('figures.payments', { count: payments.length })}
      />
      <Figure
        label={t('figures.oldest')}
        value={oldest ? ago(oldest.createdAt) : '—'}
        detail={oldest ? oldest.shopName : t('figures.nothing')}
      />
    </Figures>
  );
}
