'use client';

import { useEffect } from 'react';

interface PixelQueue {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push: PixelQueue;
  loaded: boolean;
  version: string;
}

declare global {
  interface Window {
    fbq?: PixelQueue;
    _fbq?: PixelQueue;
  }
}

/** LND-15, LND-18: the shop's Meta Pixel on its landing page: `PageView` and `ViewContent` with the variant IDs the
    catalog feed lists (FED-02). Loaded only after the page is up and idle, so it never holds back the page or the form;
    a blocked or failing script changes nothing on the page. Phase 4 adds `InitiateCheckout` and `Purchase`. */
export function MetaPixel({
  pixelId,
  contentIds,
  value,
}: {
  pixelId: string;
  contentIds: string[];
  value: number | null;
}) {
  const ids = contentIds.join(',');
  useEffect(() => {
    const start = () => {
      try {
        const fbq = installQueue();
        fbq('init', pixelId);
        fbq('track', 'PageView');
        fbq('track', 'ViewContent', {
          content_ids: ids.split(','),
          content_type: 'product',
          currency: 'BDT',
          ...(value === null ? {} : { value }),
        });
      } catch {
        // LND-18: tracking never breaks the page.
      }
    };
    if ('requestIdleCallback' in window) {
      const handle = window.requestIdleCallback(start, { timeout: 3000 });
      return () => {
        window.cancelIdleCallback(handle);
      };
    }
    const timer = setTimeout(start, 1);
    return () => {
      clearTimeout(timer);
    };
  }, [pixelId, ids, value]);
  return null;
}

/** Meta's own loader, written out: a queue the calls wait in until fbevents.js arrives and replays them. */
function installQueue(): PixelQueue {
  if (window.fbq) return window.fbq;
  const fbq = function (this: unknown, ...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as PixelQueue;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.queue = [];
  window.fbq = fbq;
  window._fbq ??= fbq;
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(script);
  return fbq;
}
