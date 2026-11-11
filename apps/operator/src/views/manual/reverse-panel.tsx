import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { PlanPaymentKind } from '@lytronix/validators';
import { useReverseEntry } from '@/api/manual-entries';
import { ActionPanel } from '@/components/ui/action-panel';
import { Banner } from '@/components/ui/banner';
import { Consequence } from '@/components/ui/consequence';
import { ReasonField } from '@/components/ui/reason-field';
import { useToast } from '@/components/ui/use-toast';
import { taka } from '@/lib/format';
import type { ManualEntry } from '@/types/manual-entries';

const BOLD = { b: <b className="font-semibold" /> };

/**
 * ADM-15: the reversing entry, which puts the shop back (D8-48, D8-49) or takes a top-up off the balance. A refusal, such as
 * the shop's plan having moved on, is the server's own sentence, at the top.
 */
export function ReversePanel({
  entry,
  onClose,
  onBack,
}: {
  entry: ManualEntry;
  onClose: () => void;
  onBack: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const reverse = useReverseEntry(entry.id);
  const [reason, setReason] = useState('');
  const amount = taka(entry.amount);
  const topUp = entry.kind === PlanPaymentKind.TopUp;

  return (
    <ActionPanel
      title={t('manual.reverseTitle')}
      sub={`${entry.shopName} · ${t(`paymentKinds.${entry.kind}`)} · ${amount}`}
      onClose={onClose}
      onCancel={onBack}
      actionLabel={t('manual.reverseButton', { a: amount })}
      danger
      pending={reverse.isPending}
      canSubmit={reason.trim().length > 0}
      onSubmit={() => {
        reverse.mutate(reason.trim(), {
          onSuccess: () => {
            toast(t('manual.reverseDone', { shop: entry.shopName }));
            onClose();
          },
        });
      }}
    >
      {reverse.isError ? (
        <Banner tone="bad" icon="warn">
          {errorMessage(reverse.error, t)}
        </Banner>
      ) : null}
      <Consequence tone="danger">
        <Trans
          i18nKey={topUp ? 'manual.reverseConsTopUp' : 'manual.reverseConsPlan'}
          values={{ a: amount, shop: entry.shopName }}
          components={BOLD}
        />
      </Consequence>
      <ReasonField value={reason} onChange={setReason} help={t('manual.reverseReasonHelp')} />
    </ActionPanel>
  );
}
