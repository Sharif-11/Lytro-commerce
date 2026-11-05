import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ToastContext } from './use-toast';

const SHOWN_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );

  const show = useCallback((next: string) => {
    window.clearTimeout(timer.current);
    setMessage(next);
    timer.current = window.setTimeout(() => {
      setMessage(null);
    }, SHOWN_MS);
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        className={
          message
            ? 'fixed bottom-[84px] left-1/2 z-30 max-w-[90%] -translate-x-1/2 rounded-lg border-l-4 border-brand-400 bg-ink px-4 py-2.5 text-[14px] text-white shadow-pop sm:bottom-7'
            : 'sr-only'
        }
      >
        {message}
      </div>
    </ToastContext.Provider>
  );
}
