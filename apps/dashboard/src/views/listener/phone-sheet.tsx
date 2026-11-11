import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCancelPhone, useRenamePhone } from '@/api/listener';
import { ErrorBanner } from '@/components/error-banner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Kv } from '@/components/ui/kv';
import { Sheet } from '@/components/ui/sheet';
import { formatDayMonth } from '@/lib/dates';
import type { ListenerPhone } from '@/types/payments';
import { spanWords } from './phone-health';

const NAME_MAX_LENGTH = 60;

/**
 * One phone (the prototype's `sh-lp35-phone`, LSN-20): what it is and how it's doing. Whoever may manage phones can rename it or
 * cancel it; cancelling asks first (`dlg-lp35-cancel`), since the phone stops at once and has to pair again.
 */
export function PhoneSheet({
  phone,
  canManage,
  onClose,
  onCancelled,
}: {
  phone: ListenerPhone;
  canManage: boolean;
  onClose: () => void;
  onCancelled: (name: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const rename = useRenamePhone();
  const cancel = useCancelPhone();
  const [name, setName] = useState(phone.name);
  const [asking, setAsking] = useState(false);
  const trimmed = name.trim();

  if (asking) {
    return (
      <Dialog
        open
        title={t('lpCancelTitle')}
        onClose={() => {
          setAsking(false);
        }}
        actions={
          <>
            <Button
              tone="outline"
              onClick={() => {
                setAsking(false);
              }}
            >
              {t('lpKeep')}
            </Button>
            <Button
              tone="danger"
              busy={cancel.isPending}
              onClick={() => {
                cancel.mutate(phone.id, {
                  onSuccess: () => {
                    onCancelled(phone.name);
                  },
                });
              }}
            >
              {t('lpCancel')}
            </Button>
          </>
        }
      >
        <p className="m-0">{t('lpCancelText', { name: phone.name })}</p>
        {cancel.isError ? <ErrorBanner error={cancel.error} /> : null}
      </Dialog>
    );
  }

  return (
    <Sheet
      open
      title={t('lpPhoneTitle')}
      onClose={onClose}
      footer={
        canManage ? (
          <>
            <Button
              tone="ghost"
              onClick={() => {
                setAsking(true);
              }}
            >
              <span className="text-danger">{t('lpCancel')}</span>
            </Button>
            <Button
              busy={rename.isPending}
              disabled={trimmed.length === 0}
              onClick={() => {
                if (trimmed === phone.name) {
                  onClose();
                  return;
                }
                rename.mutate({ id: phone.id, name: trimmed }, { onSuccess: onClose });
              }}
            >
              {t('lpSave')}
            </Button>
          </>
        ) : undefined
      }
    >
      {canManage ? (
        <Field
          label={t('lpPhoneName')}
          value={name}
          maxLength={NAME_MAX_LENGTH}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      ) : null}
      <div>
        {canManage ? null : <Kv label={t('lpPhoneName')} value={phone.name} />}
        {phone.model ? <Kv label={t('lpModel')} value={phone.model} /> : null}
        {phone.appVersion ? <Kv label={t('lpVersion')} value={phone.appVersion} /> : null}
        <Kv label={t('lpPairedOn')} value={formatDayMonth(phone.pairedAt)} />
        <Kv
          label={t('lpLastSeen')}
          value={
            phone.lastSeenAt ? t('lpAgo', { span: spanWords(phone.lastSeenAt, t) }) : t('lpNotSeen')
          }
        />
        <Kv label={t('lpReceiptsToday')} value={String(phone.uploadsToday)} />
      </div>
      {rename.isError ? <ErrorBanner error={rename.error} /> : null}
    </Sheet>
  );
}
