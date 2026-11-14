import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { TextArea } from '@lytronix/ui';
import { RECONCILIATION_NOTE_MAX_LENGTH } from '@lytronix/validators';
import { useResolveDifference } from '@/api/reconciliation';
import { ActionPanel } from '@/components/ui/action-panel';
import { useToast } from '@/components/ui/use-toast';
import type { ReconciliationDifference } from '@/types/operator';

/**
 * DAT-52 (Slice 9.9): the operator's word on a difference -- what they found or did, required, kept with it and in the
 * platform audit log.
 */
export function ResolvePanel({
  difference,
  onClose,
}: {
  difference: ReconciliationDifference;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const resolve = useResolveDifference();
  const [note, setNote] = useState('');
  const [missing, setMissing] = useState(false);
  const shop = difference.shopName ?? t('moneyCheck.lytro');
  return (
    <ActionPanel
      title={t('moneyCheck.resolveTitle')}
      sub={`${t(`moneyCheck.kinds.${difference.kind}`)} · ${shop}`}
      onClose={onClose}
      actionLabel={t('moneyCheck.resolve')}
      pending={resolve.isPending}
      error={resolve.isError ? errorMessage(resolve.error, t) : null}
      onSubmit={() => {
        if (note.trim() === '') {
          setMissing(true);
          return;
        }
        resolve.mutate(
          { id: difference.id, note: note.trim() },
          {
            onSuccess: () => {
              toast(t('moneyCheck.resolvedToast'));
              onClose();
            },
          },
        );
      }}
    >
      {/* Not the browser's "required": the sketch says in its own words what is missing. */}
      <div className="flex flex-col gap-1.5">
        <TextArea
          label={t('moneyCheck.note')}
          name="note"
          data-autofocus
          placeholder={t('moneyCheck.notePlaceholder')}
          error={missing ? t('moneyCheck.noteEmpty') : undefined}
          value={note}
          onChange={(event) => {
            setNote(event.target.value.slice(0, RECONCILIATION_NOTE_MAX_LENGTH));
            setMissing(false);
          }}
        />
        <div className="text-[14px] leading-[1.5] text-neutral-700">
          {t('moneyCheck.noteHelp', { max: RECONCILIATION_NOTE_MAX_LENGTH })}
        </div>
      </div>
    </ActionPanel>
  );
}
