import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icon';

interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Buttons pinned under the scrolling body. */
  footer?: ReactNode;
  /** A step of the sheet that goes back to the one before it (Add staff's New role): a back arrow before the title. */
  onBack?: () => void;
}

/**
 * The one container for an action that creates or changes one record (TENANT-DASHBOARD-DESIGN §4.1, the
 * prototype's `.sheet`): a bottom sheet with a grab handle under 640 px, a 480 px panel from the right above, over a
 * dimmed page that stays where it was. Its action is pinned at its foot. A native dialog, so focus and Escape are
 * the browser's.
 */
export function Sheet({
  open,
  title,
  onClose,
  children,
  footer,
  onBack,
}: SheetProps): React.JSX.Element {
  const { t } = useTranslation('shell');
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="fixed inset-x-0 top-auto bottom-0 m-0 h-auto max-h-[92dvh] w-full max-w-none rounded-t-sheet border-0 bg-surface p-0 text-fg shadow-[0_-8px_32px_rgba(16,32,31,0.2)] backdrop:bg-[rgba(16,32,31,0.45)] sm:inset-y-0 sm:right-0 sm:left-auto sm:h-full sm:max-h-none sm:w-[480px] sm:rounded-none [html[lang=bn]_&]:leading-[1.6]"
    >
      <div className="flex max-h-[92dvh] flex-col sm:h-full sm:max-h-none">
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-neutral-300 sm:hidden" />
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2 sm:pt-5">
          <span className={`flex min-w-0 items-center gap-1 ${onBack ? '-ml-2' : ''}`}>
            {onBack ? (
              <button
                type="button"
                aria-label={t('back')}
                onClick={onBack}
                className="inline-flex size-9 flex-none items-center justify-center rounded-[8px] text-fg-muted"
              >
                <Icon name="left" />
              </button>
            ) : null}
            <h2 id={titleId} className="text-[18px] font-bold">
              {title}
            </h2>
          </span>
          <button
            type="button"
            aria-label={t('close')}
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-[8px] text-fg-muted"
          >
            <Icon name="x" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-1 pb-4">
          {children}
        </div>
        {footer ? (
          // Its buttons share the row equally, as drawn; one whose words need more takes it from the other rather than
          // wrapping them ("16 Nov-এ বন্ধ করুন"), up to the whole row.
          <div className="flex shrink-0 gap-2 border-t border-line bg-surface px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] [&>*]:min-w-fit [&>*]:flex-1">
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
