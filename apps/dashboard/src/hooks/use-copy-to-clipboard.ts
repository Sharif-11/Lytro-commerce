import { useCallback, useEffect, useRef, useState } from 'react';

/** Copies text and reports "copied" for two seconds, for Copy buttons next to links and codes. */
export function useCopyToClipboard(): {
  copied: boolean;
  copy: (text: string) => Promise<boolean>;
} {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        setCopied(false);
      }, 2000);
      return true;
    } catch {
      return false;
    }
  }, []);

  return { copied, copy };
}
