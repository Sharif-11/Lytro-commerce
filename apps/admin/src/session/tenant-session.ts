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

  /**
   * Call once at boot. Resolves `whenReady` either way — a failed check must never hang a public page.
   *
   * On the OAuth callback page specifically, this races the OAuth exchange itself: both fire on the same
   * fresh page load (Google's redirect is a real navigation, not a client-side route change, so main.tsx
   * runs again from scratch). If this /me call's 401 resolves after setSignedIn() has already run, it must
   * not clobber that fresh session — hence the csrfToken snapshot-and-compare instead of an unconditional
   * clear(). Every other flow stays client-side-only after the first boot, so this never races there.
   */
  async init(): Promise<void> {
    const csrfAtStart = this.csrfToken;
    try {
      this.me = await this.client.get<MeResponse>('/me');
    } catch {
      if (this.csrfToken === csrfAtStart) this.clear();
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

  /**
   * Fetches a fresh /me and caches it. Unlike init(), a failure here is not treated as "not signed in" and
   * does not clear the session — by the time anything calls this, the caller already knows there's a live
   * session (e.g. the dashboard, right after a route guard let it through); a transient /me failure should
   * surface as a query error, not silently sign the tenant out.
   */
  async refreshMe(): Promise<MeResponse> {
    this.me = await this.client.get<MeResponse>('/me');
    return this.me;
  }

  /**
   * Whether a session cookie was established — true right after verify/signin, before any /me call has run.
   * Checks the CSRF token (set synchronously in setSignedIn/the constructor), not `me`, which only becomes
   * non-null once /me has actually resolved — those two go out of sync in the gap right after sign-in.
   */
  isSignedIn(): boolean {
    return this.csrfToken !== null;
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
