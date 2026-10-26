import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { Banner } from '@/components/ui/banner';
import { useShell } from '@/shell/shell-context';
import type { PaymentNotice } from './notices';

/** The add-on a payment paid for, in the language shown. */
function addonName(notice: PaymentNotice, language: string): string {
  const addon = notice.payment.addons[0];
  if (!addon) return '';
  return language === 'bn' ? addon.labelBn : addon.labelEn;
}

/**
 * A payment's state on Plan, Balance or Add-ons (the prototype's `plan-pending`, `plan-rejected`, `balance-pending`,
 * `balance-rejected`, `addons-checking`, `addons-rejected`): being checked, nothing changes until it is; or rejected,
 * quoting support's note, with Details, which opens the payment in Billing.
 */
export function PaymentBanner({
  notice,
  about,
}: {
  notice: PaymentNotice;
  about: 'plan' | 'topUp' | 'addon';
}): React.JSX.Element {
  const { t, i18n } = useTranslation('money');
  const { slug } = useShell();
  const amount = formatTaka(notice.payment.amount);
  const name = addonName(notice, i18n.language);
  if (notice.state === 'checking') {
    const words = {
      plan: () => t('plPendingNow', { amount }),
      topUp: () => t('tuPending', { amount }),
      addon: () => t('aoChecking', { amount, name }),
    };
    return <Banner tone="info">{words[about]()}</Banner>;
  }
  const note = notice.payment.note ?? '';
  const words = {
    plan: () => t('plRejected', { amount, note }),
    topUp: () => t('tuRejected', { amount, note }),
    addon: () => t('aoRejected', { amount, name, note }),
  };
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
      {words[about]()}
    </Banner>
  );
}
