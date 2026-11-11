import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@lytronix/validators';
import { useEraseCustomer, useSetShopperPassword } from '@/api/customers';
import { ErrorBanner } from '@/components/error-banner';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useErrorText } from '@/hooks/use-error-text';
import { useShell } from '@/shell/shell-context';
import type { Customer } from '@/types/customers';
import { customerName, generatedPassword } from './customer-words';

/**
 * A new password (the prototype's `c30-password`, CUS-14): one filled in, or typed by the shop; Make another; Save and
 * copy puts it on the clipboard to send by WhatsApp or SMS, and every sign-in of the shopper's ends. If the browser
 * blocks the clipboard the password is saved and the sheet stays, to copy it by hand.
 */
export function PasswordSheet({
  customer,
  onClose,
}: {
  customer: Customer;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const { showToast } = useShell();
  const save = useSetShopperPassword(customer.id);
  const [password, setPassword] = useState(generatedPassword);
  const [uncopied, setUncopied] = useState(false);
  const name = customerName(customer);
  const length = password.trim().length;
  const fits = length >= PASSWORD_MIN_LENGTH && length <= PASSWORD_MAX_LENGTH;
  const problem =
    save.error instanceof ApiClientError ? save.error.fieldProblems().password : undefined;

  const saveAndCopy = async (): Promise<void> => {
    const chosen = password.trim();
    await save.mutateAsync(chosen);
    try {
      await navigator.clipboard.writeText(chosen);
      showToast(t('passwordSet', { name }));
      onClose();
    } catch {
      setUncopied(true);
    }
  };

  return (
    <Sheet
      open
      title={t('passwordFor', { name })}
      onClose={onClose}
      footer={
        <Button
          wide
          busy={save.isPending}
          disabled={!fits}
          onClick={() => {
            // A refusal shows on the field or the banner, from the mutation's own error.
            void saveAndCopy().catch(() => undefined);
          }}
        >
          {t('saveCopy')}
        </Button>
      }
    >
      <p className="-mt-1 mb-3 text-[14px]">{t('passwordHelp')}</p>
      {uncopied ? <Banner tone="warn">{t('passwordNotCopied', { name })}</Banner> : null}
      {save.isError && !problem ? <ErrorBanner error={save.error} /> : null}
      <Field
        label={t('passwordLabel')}
        value={password}
        autoComplete="off"
        maxLength={PASSWORD_MAX_LENGTH}
        error={problem}
        help={t('passwordRule', { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH })}
        suffix={<CopyButton text={password.trim()} icon />}
        onChange={(event) => {
          setPassword(event.target.value);
        }}
      />
      <div className="mt-2">
        <Button
          tone="ghost"
          size="sm"
          onClick={() => {
            setPassword(generatedPassword());
          }}
        >
          <Icon name="refresh" />
          {t('makeAnother')}
        </Button>
      </div>
    </Sheet>
  );
}

/** The orders a refused delete names (CUS-09), read from the server's reply. */
function openOrdersOf(error: unknown): string[] | null {
  if (!(error instanceof ApiClientError) || error.status !== 409) return null;
  const orders = error.details.orders;
  return Array.isArray(orders) ? orders.map(String) : null;
}

/**
 * The privacy delete (the prototype's `c30-delete` and `c30-delete-open`, CUS-09): what goes and what stays, Cancel or
 * Delete; refused, naming the orders, while one of theirs is still open.
 */
export function DeleteCustomerDialog({
  customer,
  onDeleted,
  onClose,
}: {
  customer: Customer;
  onDeleted: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const errorText = useErrorText();
  const erase = useEraseCustomer(customer.id);
  const name = customerName(customer);
  const open = openOrdersOf(erase.error);
  if (open) {
    return (
      <Dialog
        open
        title={t('cantDeleteT')}
        onClose={onClose}
        actions={<Button onClick={onClose}>{t('ok')}</Button>}
      >
        {t('cantDeleteP', {
          name,
          count: open.length,
          orders: open.map((number) => `#${number}`).join(', '),
        })}
      </Dialog>
    );
  }
  return (
    <Dialog
      open
      title={t('deleteDetailsT', { name })}
      onClose={onClose}
      actions={
        <>
          <Button tone="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            tone="danger"
            busy={erase.isPending}
            onClick={() => {
              erase.mutate(undefined, { onSuccess: onDeleted });
            }}
          >
            {t('deleteDetails')}
          </Button>
        </>
      }
    >
      {t('deleteDetailsP')}
      {erase.isError ? (
        <span className="mt-2 block text-[14px] text-danger-text">{errorText(erase.error)}</span>
      ) : null}
    </Dialog>
  );
}
