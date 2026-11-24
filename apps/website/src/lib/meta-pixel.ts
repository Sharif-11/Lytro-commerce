// MKT-01 (the owner, 2026-11-24): Lytro's own Meta pixel on lytro.app. Only PageView is sent from the browser; the
// sign-up and shop events go from Lytro's server (MKT-02), so the dashboard loads no Meta code at all.

/** Meta's queue function as its loader leaves it on the page. */
export interface PixelQueue {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push: PixelQueue;
  loaded: boolean;
  version: string;
  /** Set, Meta's script sends no PageView of its own on a client-side route change; the site sends each one. */
  disablePushState?: boolean;
}

/** The parts of the browser the loader touches: the page's window, or a stand-in in a test. */
export interface PixelHost {
  fbq?: PixelQueue;
  _fbq?: PixelQueue;
  document: {
    createElement(tag: 'script'): { async: boolean; src: string };
    head: { appendChild(node: unknown): unknown };
  };
}

export const META_PIXEL_SCRIPT = 'https://connect.facebook.net/en_US/fbevents.js';

/**
 * MKT-01: starts Lytro's pixel once and sends a PageView for each page. Automatic configuration is off, so Meta's
 * script collects no button text or page data of its own (`autoConfig`), and its own PageView on route changes is off,
 * so each page is counted once.
 */
export class MetaPixelLoader {
  constructor(private readonly host: PixelHost) {}

  start(pixelId: string): void {
    const fbq = this.queue();
    fbq.disablePushState = true;
    fbq('set', 'autoConfig', false, pixelId);
    fbq('init', pixelId);
    fbq('track', 'PageView');
  }

  pageView(): void {
    this.host.fbq?.('track', 'PageView');
  }

  /** Meta's own loader, written out: a queue the calls wait in until fbevents.js arrives and replays them. */
  private queue(): PixelQueue {
    if (this.host.fbq) return this.host.fbq;
    const fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue.push(args);
    } as PixelQueue;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.queue = [];
    this.host.fbq = fbq;
    this.host._fbq ??= fbq;
    const script = this.host.document.createElement('script');
    script.async = true;
    script.src = META_PIXEL_SCRIPT;
    this.host.document.head.appendChild(script);
    return fbq;
  }
}
