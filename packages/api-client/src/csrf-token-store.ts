/**
 * SEC-14: where a page keeps its session's anti-CSRF token, shared by every tab of the app and by the installed app
 * (decided 2026-11-23). They all share the one session cookie, so a token kept per tab went stale as soon as another tab
 * signed in, and every change from the first tab was then refused; a new tab, or a link opened from an SMS, asked for a
 * sign-in the cookie didn't need. Another site can no more read localStorage than sessionStorage, so a shared copy is
 * no easier to forge a request with. The cookie still decides how long a sign-in lasts.
 */
export class CsrfTokenStore {
  constructor(
    private readonly key: string,
    private readonly shared: Storage | null = storageNamed('localStorage'),
    /** Where a tab kept its own copy before 2026-11-23: read once, so a deploy signs nobody out. */
    private readonly perTab: Storage | null = storageNamed('sessionStorage'),
  ) {}

  /** The stored token, or null when this browser isn't signed in. */
  read(): string | null {
    const token = this.get(this.shared);
    if (token !== null) return token;
    const kept = this.get(this.perTab);
    if (kept !== null) {
      this.write(kept);
      this.remove(this.perTab);
    }
    return kept;
  }

  write(token: string): void {
    try {
      this.shared?.setItem(this.key, token);
    } catch {
      // Without storage a reload needs a fresh sign-in; the current page still works.
    }
  }

  clear(): void {
    this.remove(this.shared);
    this.remove(this.perTab);
  }

  /**
   * Calls `changed` when another tab signs in (the new token) or out (null), so this one never sends a stale token. A
   * tab's own writes don't call it: the browser tells only the others. Returns the way to stop.
   */
  watch(changed: (token: string | null) => void): () => void {
    if (typeof window === 'undefined' || this.shared === null) return () => undefined;
    const listener = (event: StorageEvent): void => {
      if (event.storageArea !== this.shared) return;
      if (event.key === this.key) changed(event.newValue);
      else if (event.key === null) changed(null);
    };
    window.addEventListener('storage', listener);
    return () => {
      window.removeEventListener('storage', listener);
    };
  }

  private get(storage: Storage | null): string | null {
    try {
      return storage?.getItem(this.key) ?? null;
    } catch {
      return null;
    }
  }

  private remove(storage: Storage | null): void {
    try {
      storage?.removeItem(this.key);
    } catch {
      // Nothing stored, nothing to remove.
    }
  }
}

function storageNamed(name: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window[name];
  } catch {
    return null;
  }
}
