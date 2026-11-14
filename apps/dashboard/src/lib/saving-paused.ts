import { ApiClientError } from '@lytronix/api-client';

/** How long a refusal holds the banner when the server names no wait: its own retry hint (SAVING_RETRY_AFTER_SECONDS). */
const DEFAULT_WAIT_SECONDS = 30;

/**
 * D9-14, DAT-42 (Slice 9.9): the server's answer while changes can't be saved -- a 503 whose details say `savingPaused`
 * (9.2's SavingGuard, and its answer when the database is lost under a request). Every other 503 (degraded mode's
 * PausedForLoad, a courier or a provider not answering) is something else and never shows the can't-save banner.
 */
export function isSavingPaused(error: unknown): error is ApiClientError {
  return (
    error instanceof ApiClientError &&
    error.status === 503 &&
    error.code === 'service_unavailable' &&
    error.details.savingPaused === true
  );
}

/**
 * What the dashboard last heard from a refused save: until when changes can't be saved. A refusal holds it for the
 * server's retry hint, a save that goes through ends it at once, and a page asks again once it lapses. The server's own
 * word (the notice summary's `savingPaused`) is read beside it, so the banner shows before anyone tries to save.
 */
export class SavingPausedSignal {
  private until = 0;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly now: () => number = Date.now) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Until when (epoch milliseconds) the last refusal holds; 0 when none does. */
  readonly snapshot = (): number => this.until;

  /** Whether a refusal still holds at this moment. */
  paused(): boolean {
    return this.now() < this.until;
  }

  /** A save was refused because changes can't be saved now. */
  refused(error: ApiClientError): void {
    const wait = error.retryAfterSeconds ?? DEFAULT_WAIT_SECONDS;
    this.set(this.now() + Math.max(1, wait) * 1000);
  }

  /** A save went through: changes can be saved again. */
  saved(): void {
    if (this.until !== 0) this.set(0);
  }

  private set(until: number): void {
    this.until = until;
    for (const listener of this.listeners) listener();
  }
}

/** The one the whole dashboard shares (main.tsx's query client reports into it). */
export const savingPausedSignal = new SavingPausedSignal();
