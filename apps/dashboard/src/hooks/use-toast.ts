import { useCallback, useEffect, useRef, useState } from 'react';

/** What a toast says about itself (the prototype's `ux-toast-*`): a thing done, a thing that failed, or a word to know. */
export type ToastTone = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  tone?: ToastTone;
  action?: ToastAction | null;
}

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  action: ToastAction | null;
}

// Fixes · UI/UX batch 2, item 1.4: success and info go after 4 s; an error, or a toast with an action, stays 8 s and can
// be closed. Two at most, the newest lowest.
export const TOAST_SHORT_MS = 4000;
export const TOAST_LONG_MS = 8000;
export const TOASTS_AT_ONCE = 2;

/** How long a toast stays: longer when it reports a failure or offers something to do. */
export function toastDuration(item: Pick<ToastItem, 'tone' | 'action'>): number {
  return item.tone === 'error' || item.action !== null ? TOAST_LONG_MS : TOAST_SHORT_MS;
}

/** The toasts after one more arrives: the same words again replace their earlier toast, and only the newest stay. */
export function withToast(
  list: readonly ToastItem[],
  item: ToastItem,
  most = TOASTS_AT_ONCE,
): ToastItem[] {
  return [...list.filter((each) => each.message !== item.message), item].slice(-most);
}

/**
 * Messages that show for a moment after a save or a change, then clear themselves. `message` is the newest one's words,
 * for a screen that shows one at a time.
 */
export function useToast(): {
  message: string | null;
  toasts: ToastItem[];
  show: (message: string, options?: ToastOptions) => void;
  dismiss: (id: number) => void;
} {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, number>());
  const next = useRef(1);

  useEffect(() => {
    const running = timers.current;
    return () => {
      for (const timer of running.values()) window.clearTimeout(timer);
      running.clear();
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((list) => list.filter((each) => each.id !== id));
  }, []);

  const show = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const item: ToastItem = {
        id: next.current++,
        message,
        tone: options.tone ?? 'success',
        action: options.action ?? null,
      };
      setToasts((list) => withToast(list, item));
      timers.current.set(
        item.id,
        window.setTimeout(() => {
          dismiss(item.id);
        }, toastDuration(item)),
      );
    },
    [dismiss],
  );

  return { message: toasts.at(-1)?.message ?? null, toasts, show, dismiss };
}
