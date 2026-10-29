'use client';

import { useEffect } from 'react';

/** CCH-10, SFT-14 (Slice 12c): registers the storefront's service worker, which makes it installable and lets a phone
    open the pages it has seen when it is offline. Production builds only: a development server's pages change under
    it. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  }, []);
  return null;
}
