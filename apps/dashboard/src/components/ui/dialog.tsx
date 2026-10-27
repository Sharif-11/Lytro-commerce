import { useEffect, useId, useRef, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  /** What it is about, and what it will do. */
  children: ReactNode;
  /** The buttons: the safe one first, the action after. */
  actions: ReactNode;
}

/**
 * A question before something that cannot be undone (the prototype's `.dialog`): 400 px at most, a 16 px radius,
 * centred over a dimmed page, and on a phone raised above the middle -- centred in the height above the sketch's 40%
 * bottom margin, so half of it -- whatever its own height; its buttons in a wrapping row from the left. A native
 * dialog, so focus and Escape are the browser's.
 */
export function Dialog({
  open,
  title,
  onClose,
  children,
  actions,
}: DialogProps): React.JSX.Element {
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
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto w-[calc(100%-48px)] max-w-[400px] rounded-sheet bg-surface p-0 text-fg backdrop:bg-[rgba(16,32,31,0.45)] max-sm:-translate-y-[20vw]"
    >
      <div className="flex flex-col gap-3 p-5">
        <h2 id={titleId} className="text-[18px] font-bold">
          {title}
        </h2>
        <div className="text-[15px] text-fg-muted">{children}</div>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>
    </dialog>
  );
}
