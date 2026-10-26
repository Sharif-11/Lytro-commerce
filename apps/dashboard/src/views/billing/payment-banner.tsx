import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { Banner } from '@/components/ui/banner';
import { useShell } from '@/shell/shell-context';
import type { PaymentNotice } from './notices';

/**
 * A payment's state on Plan or Balance (the prototype's `plan-pending`, `plan-rejected`, `balance-pending`,
 * `balance-rejected`): being checked, nothing changes until it is; or rejected, quoting support's note, with Details,
 * which opens the payment in Billing.
 */
export function PaymentBanner({
  notice,
  about,
}: {
  notice: PaymentNotice;
  about: 'plan' | 'topUp';
}): React.JSX.Element {
  const { t } = useTranslation('money');
  const { slug } = useShell();
  const amount = formatTaka(notice.payment.amount);
  if (notice.state === 'checking') {
    return (
      <Banner tone="info">
        {about === 'plan' ? t('plPendingNow', { amount }) : t('tuPending', { amount })}
      </Banner>
    );
  }
  const note = notice.payment.note ?? '';
  return (
    <Banner
      tone="bad"
      action={
        <Link
          to="/$shop/billing/$paymentId"
          params={{ shop: slug, paymentId: notice.payment.id }}
          className="text-primary"
        >
          {t('blDetails')}
        </Link>
      }
    >
      {about === 'plan' ? t('plRejected', { amount, note }) : t('tuRejected', { amount, note })}
    </Banner>
  );
}
