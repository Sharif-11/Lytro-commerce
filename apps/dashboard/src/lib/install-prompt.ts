import { useSyncExternalStore } from 'react';

/** The browser's offer to install a page as an app (Chrome's `beforeinstallprompt`). */
interface InstallOfferEvent extends Event {
  prompt: () => Promise<void>;
}

/**
 * TEN-17: the browser's offer to install the shop's dashboard as an app. The offer comes once, early, often before the
 * Menu opens, so it is caught when the app starts (this module is imported by `main.tsx`) and kept until used or the
 * app is installed.
 */
class InstallOffers {
  private offer: InstallOfferEvent | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(target: Window | undefined) {
    target?.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.offer = event as InstallOfferEvent;
      this.changed();
    });
    target?.addEventListener('appinstalled', () => {
      this.offer = null;
      this.changed();
    });
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly current = (): InstallOfferEvent | null => this.offer;

  /** Shows the browser's own install dialog; the offer is spent either way. */
  install(): void {
    const offer = this.offer;
    this.offer = null;
    this.changed();
    void offer?.prompt();
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }
}

export const installOffers = new InstallOffers(typeof window === 'undefined' ? undefined : window);

/** Whether this browser offers to install the app now. */
export function useInstallOffer(): boolean {
  return useSyncExternalStore(installOffers.subscribe, installOffers.current) !== null;
}

const IPHONE = /iPhone|iPad|iPod/;
// Facebook's, Messenger's and Instagram's own browsers, where a seller from the ad signs up (FB_IAB/FBAV on Android,
// FBAN/FBIOS on an iPhone).
const IN_APP = /FB_IAB|FBAV|FBAN|FBIOS|Instagram/;

/** An iPhone or iPad browser, which never offers to install: the page says how instead, unless it already runs installed. */
export function onIphoneBrowser(navigator: Navigator, standalone: boolean): boolean {
  return IPHONE.test(navigator.userAgent) && !standalone;
}

/**
 * TEN-17, TENANT-DASHBOARD-DESIGN §7.1a (the owner, 2026-11-26): how this browser puts the dashboard on the phone's home
 * screen. `offer`: Chrome offers it, one tap. `open-in-chrome`: Facebook's own browser on Android, which can't, so the
 * page opens in Chrome. `iphone`: Safari's Share, then Add to Home Screen. `iphone-in-app`: Facebook's browser on an
 * iPhone, Safari first. `menu`: any other Android browser, or Chrome before its offer, by its ⋮ menu. Null when it
 * already runs installed, or on a computer.
 */
export type InstallWay = 'offer' | 'open-in-chrome' | 'iphone' | 'iphone-in-app' | 'menu';

export function installWayOf(
  userAgent: string,
  standalone: boolean,
  offered: boolean,
): InstallWay | null {
  if (standalone) return null;
  if (IPHONE.test(userAgent)) return IN_APP.test(userAgent) ? 'iphone-in-app' : 'iphone';
  const android = /Android/.test(userAgent);
  if (android && IN_APP.test(userAgent)) return 'open-in-chrome';
  if (offered) return 'offer';
  return android ? 'menu' : null;
}

/**
 * §7.1a: this page's `path` in Chrome, from another Android browser -- an intent link. Without Chrome, the browser
 * opens the same address itself.
 */
export function inChromeLink(location: Pick<Location, 'protocol' | 'host'>, path: string): string {
  const scheme = location.protocol.replace(':', '');
  const fallback = encodeURIComponent(`${location.protocol}//${location.host}${path}`);
  return `intent://${location.host}${path}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
}

const ROW_CLOSED_KEY = 'lytro.install-row-closed';

/** §7.1a: whether the install row was closed on this device (a private window remembers nothing). */
export function installRowClosed(): boolean {
  try {
    return window.localStorage.getItem(ROW_CLOSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function closeInstallRow(): void {
  try {
    window.localStorage.setItem(ROW_CLOSED_KEY, '1');
  } catch {
    // A private window keeps nothing: the row comes back on the next visit.
  }
}
