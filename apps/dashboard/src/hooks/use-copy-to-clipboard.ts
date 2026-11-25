import { useCallback, useEffect, useRef, useState } from 'react';

/** Copies text and reports "copied" for two seconds (or as long as given), for Copy buttons next to links and codes. */
export function useCopyToClipboard(shownMs = 2000): {
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

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          setCopied(false);
        }, shownMs);
        return true;
      } catch {
        return false;
      }
    },
    [shownMs],
  );

  return { copied, copy };
}
