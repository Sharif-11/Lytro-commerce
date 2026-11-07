/** A browser's subscription, as its push service gave it. */
export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** What a push carries, for the dashboard's service worker to show (Slice 7.7 draws it). */
export interface PushMessage {
  title: string;
  body: string;
  /** Where tapping it leads: the shop's own dashboard path. */
  url: string;
  /** The kind, so a newer push of the same kind can replace an older one on the screen. */
  tag: string;
  /** The notification's ID, for marking it read; null for a test. */
  id: string | null;
}

export interface PushOptions {
  urgency: 'high' | 'normal';
  ttlSeconds: number;
}

/**
 * What a push service said. `gone`: the subscription no longer exists (404, 410) and is deleted. `refused`: this push
 * will never be taken as it is (400, 403, 413). A push service that couldn't take it now is thrown.
 */
export type PushOutcome = 'sent' | 'gone' | 'refused';

/** NTF-02 (Slice 7.3): sends one push to one browser. */
export interface PushProvider {
  /** The VAPID public key a browser subscribes with; null when push isn't set up. */
  readonly publicKey: string | null;
  send(target: PushTarget, message: PushMessage, options: PushOptions): Promise<PushOutcome>;
}
