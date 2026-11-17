'use client';

import { useEffect } from 'react';
import { browserOpening } from '../product/use-browser-opening';
import { flushPixelEvents } from './pixel-events';

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
    a blocked or failing script changes nothing on the page. `InitiateCheckout` and `Purchase` are the form's own
    (pixel-events.ts). On a page Cloudflare's edge keeps (Slice 9.10), the server can't know the `?v=` link, so it passes
    the variants (`linkable`) and the linked one's ID and price are picked here. */
export function MetaPixel({
  pixelId,
  contentIds,
  value,
  linkable,
}: {
  pixelId: string;
  contentIds: string[];
  value: number | null;
  linkable?: readonly { id: string; price: string }[];
}) {
  const ids = contentIds.join(',');
  useEffect(() => {
    const start = () => {
      try {
        const linkedId = browserOpening(window.location.search, '').linkedVariantId;
        const linked = linkable?.find((variant) => variant.id === linkedId);
        const fbq = installQueue();
        fbq('init', pixelId);
        fbq('track', 'PageView');
        const shownValue = linked ? Number(linked.price) : value;
        fbq('track', 'ViewContent', {
          content_ids: linked ? [linked.id] : ids.split(','),
          content_type: 'product',
          currency: 'BDT',
          ...(shownValue === null ? {} : { value: shownValue }),
        });
        flushPixelEvents();
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
  }, [pixelId, ids, value, linkable]);
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
