import { useCallback, useEffect, useRef, useState } from 'react';

const SHOW_COPIED_MS = 1800;

/** Copies text to the clipboard and reports "copied" for a moment, for the secret and backup code buttons. */
export function useCopy(): [copied: boolean, copy: (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback((text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        setCopied(false);
      }, SHOW_COPIED_MS);
    });
  }, []);

  return [copied, copy];
}
