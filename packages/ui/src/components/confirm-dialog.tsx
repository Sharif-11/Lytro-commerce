import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './button';
import { ErrorBanner } from './notice';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: ReactNode;
  error?: string | null;
  confirmLabel: string;
  danger?: boolean;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A native dialog for the actions that need a second look: delete, retire, suspend, close the shop. Escape cancels,
 * except while the action is in flight.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  error,
  confirmLabel,
  danger = false,
  pending,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
      className="m-auto w-dialog max-w-dialog rounded-sheet border border-line bg-surface p-0 text-fg shadow-dialog backdrop:bg-backdrop"
    >
      <div className="p-5">
        <h2 className="heading text-[18px] text-fg">{title}</h2>
        {message ? <div className="mt-2 text-copy text-fg-muted">{message}</div> : null}
        {error ? (
          <div className="mt-3">
            <ErrorBanner message={error} />
          </div>
        ) : null}
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Button type="button" tone="outline" onClick={onCancel} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            tone={danger ? 'danger' : 'primary'}
            loading={pending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
