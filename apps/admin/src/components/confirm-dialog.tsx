import { useTranslation } from 'react-i18next';
import { Button } from '@/components/button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A small centered overlay for one destructive confirmation — not a general-purpose modal system, just
    this one shape, reused wherever the app needs to ask "are you sure?" before an action that can't be
    undone (first user: deleting a role). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger = false,
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): React.JSX.Element | null {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t('common.close')}
        className="absolute inset-0 bg-slate-900/40"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-2xl shadow-slate-900/20">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {message ? <p className="text-sm text-slate-500">{message}</p> : null}
        <div className="flex gap-2">
          <Button
            type="button"
            variant={danger ? 'danger' : 'primary'}
            loading={pending}
            onClick={onConfirm}
            className="w-auto! flex-1"
          >
            {confirmLabel}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} className="w-auto! flex-1">
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </div>
  );
}
