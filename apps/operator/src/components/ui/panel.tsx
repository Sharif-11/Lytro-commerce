import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ConsoleIcon } from './console-icon';

/**
 * Where every action opens (OPERATOR-CONSOLE-DESIGN §1): a bottom sheet on a phone, a 460 px drawer from 640 px, in a
 * native dialog so focus stays inside and the screen underneath is left as it was. Its content mounts only while open,
 * so a form starts empty each time. `dismissable={false}` keeps a stray tap or Escape from closing what can't be
 * seen again, as new backup codes can't; `[data-autofocus]` names the field to start in.
 */
export function Panel({
  open,
  title,
  sub,
  onClose,
  dismissable = true,
  footer,
  footerInRow = false,
  flush = false,
  children,
}: {
  open: boolean;
  title: string;
  sub?: ReactNode;
  onClose: () => void;
  dismissable?: boolean;
  footer?: ReactNode;
  /** Two buttons side by side on a phone, rather than stacked. */
  footerInRow?: boolean;
  /** A list running to the panel's edges, rather than fields in its padding. */
  flush?: boolean;
  children: ReactNode;
}): React.JSX.Element {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissable) onClose();
      }}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-[rgba(6,18,17,0.45)]"
    >
      {open ? (
        <div
          className="flex h-full items-end justify-center sm:items-stretch sm:justify-end"
          onClick={(event) => {
            if (dismissable && event.target === event.currentTarget) onClose();
          }}
        >
          <div className="flex max-h-[92%] w-full flex-col overflow-hidden rounded-t-sheet bg-surface text-fg shadow-pop sm:h-full sm:max-h-full sm:w-[460px] sm:rounded-none sm:border-l sm:border-line">
            <div className="mx-auto mt-2.5 h-1 w-9 flex-none rounded-sm bg-neutral-300 sm:hidden" />
            <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2 sm:px-5 sm:pt-5">
              <div className="min-w-0">
                <h2 className="text-[18px] leading-[1.3] font-bold">{title}</h2>
                {sub ? <div className="mt-0.5 text-[13px] text-fg-muted">{sub}</div> : null}
              </div>
              <button
                type="button"
                aria-label={t('common.close')}
                onClick={onClose}
                className="inline-flex size-9 flex-none items-center justify-center rounded-lg text-neutral-700 hover:bg-neutral-100"
              >
                <ConsoleIcon name="x" />
              </button>
            </div>
            <div
              className={`flex flex-col overflow-auto ${
                flush ? 'pb-4' : 'gap-3.5 px-4 pt-1 pb-4 sm:px-5 sm:pb-5'
              }`}
            >
              {children}
            </div>
            {footer ? (
              <div
                className={`flex gap-2 border-t border-line bg-surface px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-5 sm:py-3.5 ${
                  footerInRow ? 'flex-row' : 'flex-col'
                }`}
              >
                {footer}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
