import { useEffect } from 'react';

/** Sets the tab title while mounted and restores the previous one on unmount. A null or empty title leaves
    the current one alone (while the shop name is still loading). */
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
