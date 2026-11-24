'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { MetaPixelLoader } from '@/lib/meta-pixel';

/**
 * MKT-01: Lytro's own Meta pixel. Started once the page is up and idle, so it never holds the page back; a blocked or
 * failing script changes nothing on the page. Each client-side route change is one more PageView.
 */
export function LytroPixel({ pixelId }: { pixelId: string }) {
  const pathname = usePathname();
  const loader = useRef<MetaPixelLoader | null>(null);
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    const start = () => {
      try {
        const started = new MetaPixelLoader(window);
        started.start(pixelId);
        loader.current = started;
      } catch {
        // MKT-01: tracking never breaks the page.
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
  }, [pixelId]);

  useEffect(() => {
    // The first page is the start's own PageView; each later path is one more.
    if (lastPath.current === null || lastPath.current === pathname) {
      lastPath.current = pathname;
      return;
    }
    lastPath.current = pathname;
    try {
      loader.current?.pageView();
    } catch {
      // MKT-01: tracking never breaks the page.
    }
  }, [pathname]);

  return null;
}
