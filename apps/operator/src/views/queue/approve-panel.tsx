import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { PlanPaymentKind } from '@lytronix/validators';
import { useApprovePayment } from '@/api/payment-queue';
import { ActionPanel } from '@/components/ui/action-panel';
import { Banner } from '@/components/ui/banner';
import { Consequence } from '@/components/ui/consequence';
import { KeyValue, KeyValues } from '@/components/ui/key-values';
import { MoneyField } from '@/components/ui/money-field';
import { useToast } from '@/components/ui/use-toast';
import { taka } from '@/lib/format';
import { amountOf } from '@/lib/payment-amounts';
import type { QueuedPayment } from '@/types/operator';
import { usePlanWords } from './use-plan-words';

const BOLD = { b: <b className="font-semibold" /> };

/**
 * ADM-06, BIL-06: approving, with what arrived. The figure starts at what a receipt says, else the quote; it is sent only
 * if the operator changes it, so what the server already knows stays what counts.
 */
export function ApprovePanel({
  payment,
  onClose,
  onBack,
}: {
  payment: QueuedPayment;
  onClose: () => void;
  onBack: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const approve = useApprovePayment();
  const { planOf, termOf } = usePlanWords();
  const known = amountOf(payment);
  const [arrived, setArrived] = useState(String(Number(known)));
  const typed = Number(arrived);
  const valid = arrived.trim() !== '' && Number.isFinite(typed) && typed > 0;
  const amount = taka(valid ? typed : known);
  const differs = valid && typed !== Number(payment.amount);
  const plan = planOf(payment.planId);
  const shop = payment.shopName;

  function submit(): void {
    approve.mutate(
      { id: payment.id, amount: typed === Number(known) ? undefined : typed },
      {
        onSuccess: () => {
          if (payment.kind === PlanPaymentKind.TopUp) {
            toast(t('queue.approvedTopUp', { a: amount }));
          } else if (payment.kind === PlanPaymentKind.Addon) {
            toast(t('queue.approvedAddon', { a: amount }));
          } else {
            toast(t('queue.approved', { a: amount, shop, plan: plan?.name ?? '' }));
          }
          onClose();
        },
      },
    );
  }

  return (
    <ActionPanel
      title={t('queue.approveTitle')}
      sub={`${shop} · ${amount}`}
      onClose={onClose}
      onCancel={onBack}
      actionLabel={t('queue.approveButton', { a: amount })}
      pending={approve.isPending}
      canSubmit={valid}
      error={approve.isError ? errorMessage(approve.error, t) : null}
      onSubmit={submit}
    >
      <Consequence tone="ok">
        {payment.kind === PlanPaymentKind.TopUp ? (
          <Trans i18nKey="queue.approveTopUp" values={{ a: amount, shop }} components={BOLD} />
        ) : payment.kind === PlanPaymentKind.Addon ? (
          t('queue.addonActivates')
        ) : (
          <Trans
            i18nKey="queue.approvePlan"
            values={{ shop, plan: plan?.name ?? '', term: termOf(payment.billingTermId) }}
            components={BOLD}
          />
        )}
      </Consequence>
      {differs && payment.kind !== PlanPaymentKind.TopUp ? (
        <Banner tone="warn" icon="warn">
          {t('queue.approveReview', { a: amount, q: taka(payment.amount) })}
        </Banner>
      ) : null}
      <MoneyField
        label={t('queue.arrivedLabel')}
        name="arrived"
        value={arrived}
        onChange={setArrived}
        hint={t('queue.arrivedHelp')}
      />
      <KeyValues>
        <KeyValue label={t('queue.trx')} mono>
          {payment.transactionId ?? '—'}
        </KeyValue>
        <KeyValue label={t('queue.sender')} mono>
          {payment.senderNumber ?? '—'}
          {payment.wallet ? ` · ${payment.wallet}` : ''}
        </KeyValue>
      </KeyValues>
    </ActionPanel>
  );
}
