import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PURCHASE_REASON_MAX_LENGTH } from '@lytronix/validators';
import { useCancelPurchase, useClosePurchase } from '@/api/purchases';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useErrorText } from '@/hooks/use-error-text';
import type { Purchase } from '@/types/purchasing';
import { outstandingOf } from './purchase-lines';
import { usePurchaseWords } from './purchase-words';

/**
 * Close short (the prototype's `sh-close-short`; PUR-06), once anything was delivered: what is still outstanding, in
 * each unit, is dropped as not coming, and the reason typed is kept.
 */
export function CloseShortSheet({
  open,
  purchase,
  onClose,
}: {
  open: boolean;
  purchase: Purchase;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const words = usePurchaseWords();
  const close = useClosePurchase(purchase.id);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) return;
    setReason('');
    close.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Sheet
      open={open}
      title={t('closeTitle')}
      onClose={onClose}
      footer={
        <Button
          tone="danger"
          wide
          busy={close.isPending}
          disabled={reason.trim() === ''}
          onClick={() => {
            close.mutate(reason.trim(), { onSuccess: onClose });
          }}
        >
          {t('poClose')}
        </Button>
      }
    >
      <p className="text-[15px]">
        {t('closeCons', { amount: words.units(outstandingOf(purchase.items)) })}
      </p>
      <Field
        label={t('closeReason')}
        placeholder={t('closeReasonPh')}
        maxLength={PURCHASE_REASON_MAX_LENGTH}
        value={reason}
        onChange={(event) => {
          setReason(event.target.value);
        }}
      />
      {close.isError ? <Banner tone="bad">{errorText(close.error)}</Banner> : null}
    </Sheet>
  );
}

/** Cancel purchase (the prototype's `sh-cancel-purchase`; PUR-03), while nothing has arrived; its number is never reused. */
export function CancelSheet({
  open,
  purchaseId,
  onClose,
}: {
  open: boolean;
  purchaseId: string;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const cancel = useCancelPurchase(purchaseId);

  useEffect(() => {
    if (open) cancel.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Sheet
      open={open}
      title={t('cancelTitle')}
      onClose={onClose}
      footer={
        <Button
          tone="danger"
          wide
          busy={cancel.isPending}
          onClick={() => {
            cancel.mutate(undefined, { onSuccess: onClose });
          }}
        >
          {t('poCancel')}
        </Button>
      }
    >
      <p className="text-[15px]">{t('cancelCons')}</p>
      {cancel.isError ? <Banner tone="bad">{errorText(cancel.error)}</Banner> : null}
    </Sheet>
  );
}

/** Delete draft, after asking (Part 21's `sh-delete-draft`): a draft was never placed, so it goes for good. */
export function DeleteDraftSheet({
  open,
  busy,
  onDelete,
  onClose,
}: {
  open: boolean;
  busy: boolean;
  onDelete: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  return (
    <Sheet
      open={open}
      title={t('delDraftT')}
      onClose={onClose}
      footer={
        <>
          <Button tone="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button tone="danger" busy={busy} onClick={onDelete}>
            {t('poDeleteDraft')}
          </Button>
        </>
      }
    >
      <p className="text-[15px]">{t('delDraftCons')}</p>
    </Sheet>
  );
}
