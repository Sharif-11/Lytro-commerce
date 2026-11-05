import { Link, Navigate, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@lytronix/ui';
import { PlanPaymentKind, PlanPaymentStatus } from '@lytronix/validators';
import { usePaymentQueue } from '@/api/payment-queue';
import { Banner } from '@/components/ui/banner';
import { CopyButton } from '@/components/ui/copy-button';
import { KeyValue, KeyValues } from '@/components/ui/key-values';
import { Panel } from '@/components/ui/panel';
import { daysFromNow, formatDay, taka, useAgo } from '@/lib/format';
import { amountOf } from '@/lib/payment-amounts';
import { formatSessionTime } from '@/lib/session-time';
import type { QueuedPayment } from '@/types/operator';
import { ApprovePanel } from './approve-panel';
import { CreditPanel } from './credit-panel';
import { RejectPanel } from './reject-panel';
import { usePlanWords } from './use-plan-words';

export type PaymentStep = 'approve' | 'reject' | 'credit';

function PaymentFacts({
  payment,
  onClose,
  onStep,
}: {
  payment: QueuedPayment;
  onClose: () => void;
  onStep: (step: PaymentStep) => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const ago = useAgo();
  const { planOf, termOf } = usePlanWords();
  const plan = planOf(payment.planId);
  const isTopUp = payment.kind === PlanPaymentKind.TopUp;
  const isAddon = payment.kind === PlanPaymentKind.Addon;
  const amount = taka(amountOf(payment));

  return (
    <Panel
      open
      title={`${amount} · ${t(`paymentKinds.${payment.kind}`)}`}
      sub={payment.shopName}
      onClose={onClose}
      footerInRow
      footer={
        <>
          <Button
            type="button"
            tone="outline"
            small
            fit
            className="flex-1 sm:flex-none"
            onClick={() => {
              onStep('reject');
            }}
          >
            {t('queue.reject')}
          </Button>
          <Button
            type="button"
            small
            fit
            className="flex-1 sm:flex-none"
            onClick={() => {
              onStep('approve');
            }}
          >
            {t('queue.approveButton', { a: amount })}
          </Button>
        </>
      }
    >
      {payment.status === PlanPaymentStatus.NeedsReview && payment.reviewReason ? (
        <Banner tone="warn" icon="warn">
          <b className="font-semibold">{t(`reviewReasons.${payment.reviewReason}`)}</b>
        </Banner>
      ) : null}
      {isAddon ? (
        <Banner tone="info" icon="info">
          {t('queue.addonActivates')}
        </Banner>
      ) : null}
      <KeyValues>
        <KeyValue label={t('queue.quotedFact')}>{taka(payment.amount)}</KeyValue>
        <KeyValue label={t('queue.sent')}>
          {payment.amountSent ? taka(payment.amountSent) : '—'}
        </KeyValue>
        <KeyValue label={t('queue.arrived')}>
          {payment.amountArrived ? taka(payment.amountArrived) : t('queue.noReceipt')}
        </KeyValue>
        <KeyValue label={t('queue.shop')}>
          {payment.shopName} ·{' '}
          <Link
            to="/shops/$id"
            params={{ id: payment.tenantId }}
            className="font-normal text-primary underline"
          >
            {payment.shopSlug}.lytro.app
          </Link>
        </KeyValue>
        {payment.addons.map((addon) => (
          <KeyValue key={addon.id} label={t('queue.addon')}>
            {t('queue.addonLine', {
              name: i18n.language === 'bn' ? addon.labelBn : addon.labelEn,
              q: addon.quantity,
              n: daysFromNow(addon.expiresAt),
              d: formatDay(addon.expiresAt),
            })}
          </KeyValue>
        ))}
        {plan ? (
          <KeyValue label={t('queue.planTerm')}>
            {plan.name} v{plan.version} · {termOf(payment.billingTermId)}
          </KeyValue>
        ) : null}
        {Number(payment.creditAmount) > 0 && !isTopUp ? (
          <KeyValue label={t('queue.unusedCredit')}>{taka(payment.creditAmount)}</KeyValue>
        ) : null}
        <KeyValue label={t('queue.sender')} mono>
          {payment.senderNumber ?? '—'}
          {payment.wallet ? ` · ${payment.wallet}` : ''}
        </KeyValue>
        <KeyValue label={t('queue.trx')} mono>
          {payment.transactionId ?? '—'}{' '}
          {payment.transactionId ? <CopyButton text={payment.transactionId} /> : null}
        </KeyValue>
        <KeyValue label={t('queue.quotedAt')}>{formatSessionTime(payment.quotedAt)}</KeyValue>
        <KeyValue label={t('queue.submitted')}>
          {formatSessionTime(payment.submittedAt ?? payment.createdAt)} ·{' '}
          {ago(payment.submittedAt ?? payment.createdAt)}
        </KeyValue>
      </KeyValues>
      <div className="text-[13px] leading-[1.55] text-fg-muted">{t('queue.statement')}</div>
      {isTopUp ? null : (
        <Button
          type="button"
          tone="outline"
          small
          onClick={() => {
            onStep('credit');
          }}
        >
          {t('queue.creditOpen')}
        </Button>
      )}
    </Panel>
  );
}

/**
 * One queued payment, at its own address so it survives a reload: its evidence, then a step for each thing that can be
 * done with it. A payment no longer waiting, handled by now, goes back to the queue.
 */
export function PaymentPanel(): React.JSX.Element | null {
  const { id } = useParams({ from: '/_console/queue/$id' });
  const { step } = useSearch({ from: '/_console/queue/$id' });
  const navigate = useNavigate();
  const queue = usePaymentQueue();
  const payment = queue.data?.find((each) => each.id === id);

  if (queue.isPending || queue.isError) return null;
  if (!payment) return <Navigate to="/queue" replace />;

  function close(): void {
    void navigate({ to: '/queue' });
  }
  function goTo(next?: PaymentStep): void {
    void navigate({ to: '/queue/$id', params: { id }, search: next ? { step: next } : {} });
  }
  function back(): void {
    goTo();
  }

  if (step === 'approve') return <ApprovePanel payment={payment} onClose={close} onBack={back} />;
  if (step === 'reject') return <RejectPanel payment={payment} onClose={close} onBack={back} />;
  if (step === 'credit' && payment.kind !== PlanPaymentKind.TopUp) {
    return <CreditPanel payment={payment} onClose={close} onBack={back} />;
  }
  return <PaymentFacts payment={payment} onClose={close} onStep={goTo} />;
}
