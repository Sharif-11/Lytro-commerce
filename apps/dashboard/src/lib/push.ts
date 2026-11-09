import { useCallback, useEffect, useState } from 'react';
import { checkPush, subscribePush, unsubscribePush } from '@/api/notifications';
import { onIphoneBrowser } from './install-prompt';

// NTF-02 (Part 37's `p37-push-*`): push on this device -- the browser's own question, the subscription Lytro's server keeps,
// and turning it off here. An iPhone takes push only once Lytro is on its Home Screen.

/** How long signing out waits to stop this browser's pushes before it goes ahead anyway. */
const SIGN_OUT_WAITS_MS = 2000;

export type PushState = 'loading' | 'unsupported' | 'ios' | 'unset' | 'blocked' | 'off' | 'on';

/** A VAPID key as the Push API takes it: base64url to bytes. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = `${base64url}${'='.repeat((4 - (base64url.length % 4)) % 4)}`
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function supported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** The registration a subscription is made on, once the worker is active; null without one. */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  const found = await navigator.serviceWorker.getRegistration();
  return found ? navigator.serviceWorker.ready : null;
}

/** NTF-02: sign-out stops this browser's pushes, so the next person on it never sees the last one's. Never holds it up. */
export async function leavePushOnThisDevice(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  // The registration itself: `ready` never settles for a worker still installing, and signing out mustn't wait on that.
  const leaving = navigator.serviceWorker
    .getRegistration()
    .then((found) => found?.pushManager.getSubscription())
    .then(async (subscription) => {
      if (!subscription) return;
      await unsubscribePush(subscription.endpoint);
      await subscription.unsubscribe();
    })
    // Signing out matters more; a push that still arrives is removed once the browser refuses it.
    .catch(() => undefined);
  await Promise.race([
    leaving,
    new Promise((resolve) => {
      setTimeout(resolve, SIGN_OUT_WAITS_MS);
    }),
  ]);
}

/** "Chrome on Android": this browser and system, as the push card names the device. */
export function deviceName(userAgent: string): { browser: string; system: string } {
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Browser';
  const system = /Android/.test(userAgent)
    ? 'Android'
    : /iPhone|iPad/.test(userAgent)
      ? 'iPhone'
      : /Windows/.test(userAgent)
        ? 'Windows'
        : /Mac OS X/.test(userAgent)
          ? 'Mac'
          : 'Linux';
  return { browser, system };
}

/** Push on this device: where it stands, and turning it on or off (the key is Lytro's, null where push isn't set up). */
export function usePushDevice(publicKey: string | null | undefined): {
  state: PushState;
  turnOn: () => Promise<PushState>;
  turnOff: () => Promise<void>;
} {
  const [state, setState] = useState<PushState>('loading');

  const read = useCallback(async (): Promise<PushState> => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    if (onIphoneBrowser(navigator, standalone)) return 'ios';
    if (!supported()) return 'unsupported';
    if (publicKey === null) return 'unset';
    if (Notification.permission === 'denied') return 'blocked';
    const found = await registration();
    const subscription = await found?.pushManager.getSubscription();
    if (!subscription) return 'off';
    // On for the person looking, in this shop: the browser's subscription may be someone else's or another shop's.
    return (await checkPush(subscription.endpoint)).subscribed ? 'on' : 'off';
  }, [publicKey]);

  useEffect(() => {
    if (publicKey === undefined) return;
    let current = true;
    void read().then((next) => {
      if (current) setState(next);
    });
    return () => {
      current = false;
    };
  }, [publicKey, read]);

  const turnOn = async (): Promise<PushState> => {
    if (!publicKey) return state;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      const next: PushState = permission === 'denied' ? 'blocked' : 'off';
      setState(next);
      return next;
    }
    const found = await registration();
    if (!found) {
      setState('unsupported');
      return 'unsupported';
    }
    const subscription = await found.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    });
    await subscribePush(subscription.toJSON());
    setState('on');
    return 'on';
  };

  const turnOff = async (): Promise<void> => {
    const found = await registration();
    const subscription = await found?.pushManager.getSubscription();
    if (subscription) {
      await unsubscribePush(subscription.endpoint);
      await subscription.unsubscribe();
    }
    setState('off');
  };

  return { state, turnOn, turnOff };
}
