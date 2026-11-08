// The dashboard's service worker (vite-plugin-pwa's, in prompt mode): it keeps the app's files for offline starts, shows
// pushes (public/push-sw.js), and, when a new version is deployed, waits for the person to choose Update (NTF-07,
// D7-44), so a half-filled form is never lost. Registered from main.tsx in a built app only; vite-plugin-pwa makes no
// worker in development.

type Listener = () => void;

/** Whether a new version has installed and waits for Update; and the push registration, once there is one. */
class ServiceWorkerState {
  private waiting: ServiceWorker | null = null;
  private registration: ServiceWorkerRegistration | null = null;
  private readonly listeners = new Set<Listener>();

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly updateReady = (): boolean => this.waiting !== null;

  /** The registration a push subscription is made on; waits for the worker to be active. */
  async ready(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) return null;
    if (this.registration) return navigator.serviceWorker.ready;
    return null;
  }

  register(url = '/sw.js'): void {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register(url, { scope: '/' })
        .then((registration) => {
          this.registration = registration;
          if (registration.waiting && navigator.serviceWorker.controller) {
            this.setWaiting(registration.waiting);
          }
          registration.addEventListener('updatefound', () => {
            const installing = registration.installing;
            installing?.addEventListener('statechange', () => {
              // A first install has no version to replace; only a later one waits for Update.
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                this.setWaiting(installing);
              }
            });
          });
        })
        .catch(() => {
          // Without a worker the app still works; it just has no offline start, pushes or update prompt.
        });
    });
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  }

  /** Update: the waiting version takes over, and the page reloads into it. */
  update(): void {
    this.waiting?.postMessage({ type: 'SKIP_WAITING' });
  }

  private setWaiting(worker: ServiceWorker): void {
    this.waiting = worker;
    for (const listener of this.listeners) listener();
  }
}

export const serviceWorker = new ServiceWorkerState();
