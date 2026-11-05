import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { useRejectPayment } from '@/api/payment-queue';
import { ActionPanel } from '@/components/ui/action-panel';
import { Consequence } from '@/components/ui/consequence';
import { ReasonField } from '@/components/ui/reason-field';
import { useToast } from '@/components/ui/use-toast';
import { taka } from '@/lib/format';
import { amountOf } from '@/lib/payment-amounts';
import type { QueuedPayment } from '@/types/operator';

/** Nothing is credited; the seller reads the note and can submit again. */
export function RejectPanel({
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
  const reject = useRejectPayment();
  const [note, setNote] = useState('');

  function submit(): void {
    reject.mutate(
      { id: payment.id, note: note.trim() },
      {
        onSuccess: () => {
          toast(t('queue.rejected'));
          onClose();
        },
      },
    );
  }

  return (
    <ActionPanel
      title={t('queue.rejectTitle')}
      sub={`${payment.shopName} · ${taka(amountOf(payment))} · ${payment.transactionId ?? '—'}`}
      onClose={onClose}
      onCancel={onBack}
      actionLabel={t('queue.rejectButton')}
      danger
      pending={reject.isPending}
      canSubmit={note.trim() !== ''}
      error={reject.isError ? errorMessage(reject.error, t) : null}
      onSubmit={submit}
    >
      <Consequence tone="danger">{t('queue.rejectLead')}</Consequence>
      <ReasonField
        label={t('queue.rejectNote')}
        placeholder={t('queue.rejectHint')}
        value={note}
        onChange={setNote}
      />
    </ActionPanel>
  );
}
