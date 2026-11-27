import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { operatorSession } from '@/session/operator-session';

// LIVE-CHAT-PLAN LC-4 (the sketch's `oc-notif`): chat pushes to this browser while the console is closed -- the
// browser's own question, the subscription Lytro keeps for this operator, and turning it off here. As the dashboard's
// push on a device (apps/dashboard/src/lib/push.ts), on the console's own routes.

export type OperatorPushState = 'loading' | 'unsupported' | 'unset' | 'blocked' | 'off' | 'on';

const KEY_QUERY = ['operator', 'chats', 'push-key'] as const;

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

/** Lytro's public key for chat pushes; null where the server has none set up. */
function usePushKey() {
  return useQuery({
    queryKey: KEY_QUERY,
    queryFn: async () =>
      (await operatorSession.client.get<{ publicKey: string | null }>('/operator/chat/push/key'))
        .publicKey,
    staleTime: Infinity,
  });
}

/** Chat pushes on this browser: where they stand, and turning them on or off. */
export function useOperatorPush(): {
  state: OperatorPushState;
  turnOn: () => Promise<OperatorPushState>;
  turnOff: () => Promise<void>;
} {
  const key = usePushKey();
  const publicKey = key.isSuccess ? key.data : key.isError ? null : undefined;
  const [state, setState] = useState<OperatorPushState>('loading');

  const read = useCallback(async (): Promise<OperatorPushState> => {
    if (!supported()) return 'unsupported';
    if (publicKey === null) return 'unset';
    if (Notification.permission === 'denied') return 'blocked';
    const found = await registration();
    const subscription = await found?.pushManager.getSubscription();
    if (!subscription) return 'off';
    // On for the operator looking: the browser's subscription may be another operator's.
    const held = await operatorSession.client.post<{ subscribed: boolean }>(
      '/operator/chat/push/subscriptions/check',
      { endpoint: subscription.endpoint },
    );
    return held.subscribed ? 'on' : 'off';
  }, [publicKey]);

  useEffect(() => {
    if (publicKey === undefined) return;
    let current = true;
    void read()
      .catch((): OperatorPushState => 'off')
      .then((next) => {
        if (current) setState(next);
      });
    return () => {
      current = false;
    };
  }, [publicKey, read]);

  const turnOn = async (): Promise<OperatorPushState> => {
    if (!publicKey) return state;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      const next: OperatorPushState = permission === 'denied' ? 'blocked' : 'off';
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
    await operatorSession.client.post('/operator/chat/push/subscriptions', subscription.toJSON());
    setState('on');
    return 'on';
  };

  const turnOff = async (): Promise<void> => {
    const found = await registration();
    const subscription = await found?.pushManager.getSubscription();
    if (subscription) {
      await operatorSession.client.request('/operator/chat/push/subscriptions', {
        method: 'DELETE',
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
    }
    setState('off');
  };

  return { state, turnOn, turnOff };
}
