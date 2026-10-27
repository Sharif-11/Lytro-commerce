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

/** An iPhone or iPad browser, which never offers to install: the page says how instead, unless it already runs installed. */
export function onIphoneBrowser(navigator: Navigator, standalone: boolean): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) && !standalone;
}
