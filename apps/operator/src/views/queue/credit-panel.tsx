import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { useCreditPayment } from '@/api/payment-queue';
import { ActionPanel } from '@/components/ui/action-panel';
import { Consequence } from '@/components/ui/consequence';
import { MoneyField } from '@/components/ui/money-field';
import { useToast } from '@/components/ui/use-toast';
import { taka } from '@/lib/format';
import type { QueuedPayment } from '@/types/operator';

/**
 * BIL-06: the money goes on the balance and nothing is activated. With no receipt the operator has to say what the
 * statement shows; the quote is no guide to money that may not have arrived, so the field starts empty.
 */
export function CreditPanel({
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
  const credit = useCreditPayment();
  const known = payment.amountArrived;
  const [arrived, setArrived] = useState(known === null ? '' : String(Number(known)));
  const typed = Number(arrived);
  const valid = arrived.trim() !== '' && Number.isFinite(typed) && typed > 0;
  const amount = valid ? taka(typed) : '৳—';
  const shop = payment.shopName;

  function submit(): void {
    credit.mutate(
      { id: payment.id, amount: known !== null && typed === Number(known) ? undefined : typed },
      {
        onSuccess: () => {
          toast(t('queue.credited', { a: amount, shop }));
          onClose();
        },
      },
    );
  }

  return (
    <ActionPanel
      title={t('queue.creditTitle')}
      sub={`${shop} · ${payment.transactionId ?? '—'}`}
      onClose={onClose}
      onCancel={onBack}
      actionLabel={t('queue.creditButton', { a: amount })}
      pending={credit.isPending}
      canSubmit={valid}
      error={credit.isError ? errorMessage(credit.error, t) : null}
      onSubmit={submit}
    >
      <Consequence>
        <Trans
          i18nKey="queue.creditConsequence"
          values={{ a: amount, shop }}
          components={{ b: <b className="font-semibold" /> }}
        />
      </Consequence>
      <MoneyField
        label={t('queue.arrivedLabel')}
        name="arrived"
        value={arrived}
        onChange={setArrived}
        hint={t('queue.creditHelp')}
      />
    </ActionPanel>
  );
}
