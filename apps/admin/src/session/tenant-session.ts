import { ApiClient } from '../api/client';
import type { MeResponse } from '../types/me';

// The CSRF token is only ever sent once, in a sign-in/enroll response body (SEC-14) — the server never re-sends
// it, since only its hash is stored. Keeping a copy in sessionStorage is what lets a page reload survive
// without forcing a fresh sign-in just to get a token back for the next mutating request.
const CSRF_STORAGE_KEY = 'lytronix.tenant.csrf';

/**
 * Holds the tenant session's CSRF token and the last `/me` result, and the auth-init gate every protected
 * query waits on. One instance for the whole app (constructed once in main.tsx), the same shape as the
 * server's own stateful services — settings and storage are constructor/instance state, not module globals
 * scattered across files.
 */
export class TenantSession {
  readonly client: ApiClient;
  private csrfToken: string | null;
  private me: MeResponse | null = null;
  private ready: Promise<void>;
  private resolveReady!: () => void;

  constructor(baseUrl = '/api') {
    this.csrfToken = sessionStorage.getItem(CSRF_STORAGE_KEY);
    this.client = new ApiClient({ baseUrl, getCsrfToken: () => this.csrfToken });
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  /** Call once at boot. Resolves `whenReady` either way — a failed check must never hang a public page. */
  async init(): Promise<void> {
    try {
      this.me = await this.client.get<MeResponse>('/me');
    } catch {
      this.clear();
    } finally {
      this.resolveReady();
    }
  }

  /** Awaited by the query layer before firing a request that needs a live session. */
  whenReady(): Promise<void> {
    return this.ready;
  }

  /** Called after a successful sign-in/verify/enroll response. */
  setSignedIn(csrfToken: string, me?: MeResponse): void {
    this.csrfToken = csrfToken;
    sessionStorage.setItem(CSRF_STORAGE_KEY, csrfToken);
    if (me) this.me = me;
  }

  getMe(): MeResponse | null {
    return this.me;
  }

  isSignedIn(): boolean {
    return this.me !== null;
  }

  clear(): void {
    this.csrfToken = null;
    this.me = null;
    sessionStorage.removeItem(CSRF_STORAGE_KEY);
  }
}

// One instance for the whole app — a browser tab has exactly one tenant session, never more than one, so a
// singleton is the actual shape of the thing, not a shortcut around DI. Tests construct their own instance.
export const tenantSession = new TenantSession();
