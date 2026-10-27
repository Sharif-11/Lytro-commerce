import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { RadioMark } from '@/components/ui/kv';
import { RowList } from '@/components/ui/list-row';

type How = 'archive' | 'hard';

/**
 * Remove a product (TENANT-DASHBOARD-DESIGN §7.4, the prototype's `sh-delete`; PRD-13): Archive, the default, or
 * Delete for good, each with what it does. An archived product's page asks only about deleting for good.
 */
export function RemoveDialog({
  open,
  only,
  busy,
  error,
  onClose,
  onRemove,
}: {
  /** The choice it opens on, or null when closed. */
  open: How | null;
  /** Offer this one alone (an archived product can only be deleted for good). */
  only?: How;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onRemove: (hard: boolean) => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const [how, setHow] = useState<How>('archive');
  useEffect(() => {
    if (open) setHow(open);
  }, [open]);
  const choices: { how: How; title: string; note: string }[] = [
    { how: 'archive', title: t('archiveOpt'), note: t('archiveNote') },
    { how: 'hard', title: t('hardOpt'), note: t('hardNote') },
  ];
  return (
    <Dialog
      open={open !== null}
      title={t('deleteTitle')}
      onClose={onClose}
      actions={
        <>
          <Button tone="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            tone={how === 'hard' ? 'danger' : 'primary'}
            busy={busy}
            onClick={() => {
              onRemove(how === 'hard');
            }}
          >
            {how === 'hard' ? t('hardOpt') : t('archiveOpt')}
          </Button>
        </>
      }
    >
      {only ? (
        <span className="block">{choices.find((each) => each.how === only)?.note}</span>
      ) : (
        <Card flush className="mt-1">
          <RowList role="radiogroup" aria-label={t('deleteTitle')}>
            {choices.map((choice) => (
              <button
                key={choice.how}
                type="button"
                role="radio"
                aria-checked={how === choice.how}
                onClick={() => {
                  setHow(choice.how);
                }}
                className="flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left"
              >
                <RadioMark on={how === choice.how} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span
                    className={`text-[15px] font-medium ${choice.how === 'hard' ? 'text-danger-text' : ''}`}
                  >
                    {choice.title}
                  </span>
                  <span className="text-[14px] text-fg-muted">{choice.note}</span>
                </span>
              </button>
            ))}
          </RowList>
        </Card>
      )}
      {error ? <span className="mt-2 block text-danger-text">{error}</span> : null}
    </Dialog>
  );
}
