import { useEffect } from 'react';

/** Sets the browser tab title while the calling component is mounted, restoring whatever it was before on
    unmount. Generic — not shop-specific — so any screen that needs a dynamic title can reuse it. A `null` or
    empty title leaves the current document title untouched (useful while data like the shop name is still
    loading). */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
