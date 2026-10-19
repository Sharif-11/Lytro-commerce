import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Buttons pinned under the scrolling body. */
  footer?: ReactNode;
}

/**
 * The one container for an action (DASHBOARD-SECTIONS-DESIGN rule 2): a bottom sheet under 640 px, a 480 px
 * side panel above, over a dimmed page that stays where it was. A native dialog, so focus and Escape are
 * the browser's.
 */
export function Sheet({ open, title, onClose, children, footer }: SheetProps): React.JSX.Element {
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
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="fixed inset-x-0 top-auto bottom-0 m-0 h-auto max-h-[92vh] w-full max-w-none rounded-t-sheet border-0 bg-white p-0 text-ink shadow-lift backdrop:bg-ink/45 sm:inset-y-0 sm:right-0 sm:left-auto sm:h-full sm:max-h-none sm:w-[480px] sm:rounded-none"
    >
      <div className="flex max-h-[92vh] flex-col sm:h-full sm:max-h-none">
        <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-neutral-200 sm:hidden" />
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-3 pb-2 sm:px-6 sm:pt-5">
          <h2 className="heading text-[18px] text-ink">{title}</h2>
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-control bg-neutral-100 text-[15px] text-ink"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-6">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-line px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </dialog>
  );
}

/** The thin progress line a multi-step sheet shows under its title: numbered, the done segments filled. */
export function Stepper({ steps, current }: { steps: number; current: number }): React.JSX.Element {
  return (
    <div className="num mb-4 flex items-center gap-1.5 text-[12px] font-bold text-neutral-500">
      {Array.from({ length: steps }, (_, index) => (
        <span key={index} className="contents">
          <span className={index <= current ? 'text-brand-800' : ''}>{index + 1}</span>
          {index < steps - 1 ? (
            <span
              className={`h-0.5 flex-1 rounded-full ${index < current ? 'bg-brand-700' : 'bg-neutral-200'}`}
            />
          ) : null}
        </span>
      ))}
    </div>
  );
}
