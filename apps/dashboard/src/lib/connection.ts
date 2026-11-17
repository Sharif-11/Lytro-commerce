import { ApiClientError } from '@lytronix/api-client';

/**
 * Fixes · UI/UX batch 2, item 1.1: whether a request failed because the connection did, not because the server said no.
 * A server's answer is always an ApiClientError; a fetch that never reached it rejects with a TypeError, and with the
 * browser offline any other failure is the connection's too.
 */
export function isConnectionFailure(error: unknown, online: boolean = navigator.onLine): boolean {
  if (error instanceof ApiClientError) return false;
  return !online || error instanceof TypeError;
}

/** How long "Back online" shows after the connection returns, while the latest is read again. */
export const BACK_ONLINE_MS = 3000;

/**
 * What the offline bar shows, from the connection now and when it last came back: nothing, "No internet", or for a
 * moment "Back online".
 */
export function netState(
  online: boolean,
  backSince: number | null,
  now: number,
): 'online' | 'offline' | 'back' {
  if (!online) return 'offline';
  return backSince !== null && now - backSince < BACK_ONLINE_MS ? 'back' : 'online';
}

/**
 * A change tapped while the connection was gone (the prototype's `ux-offline-tap`): the query client hears it, and the
 * shell says so in a toast. One shared signal, like the can't-save one.
 */
export class ConnectionSignal {
  private readonly listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** A change failed for want of a connection. */
  failed(): void {
    for (const listener of this.listeners) listener();
  }
}

/** The one the whole dashboard shares (main.tsx's query client reports into it). */
export const connectionSignal = new ConnectionSignal();
