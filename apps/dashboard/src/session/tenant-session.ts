import { ApiClient } from '../api/client';
import type { MeResponse } from '../types/me';

// The CSRF token is only ever sent once, in a sign-in response body (SEC-14); only its hash is stored
// server-side. A copy in sessionStorage lets a page reload survive without a fresh sign-in.
const CSRF_STORAGE_KEY = 'lytro.tenant.csrf';

/**
 * Holds the tenant session's CSRF token and the last `/me` result, and the auth-init gate every protected
 * screen waits on. One instance for the whole app (main.tsx); tests construct their own.
 */
export class TenantSession {
  readonly client: ApiClient;
  private csrfToken: string | null;
  private me: MeResponse | null = null;
  private readonly ready: Promise<void>;
  private resolveReady!: () => void;

  constructor(baseUrl = '/api/v1') {
    this.csrfToken = TenantSession.readStoredToken();
    this.client = new ApiClient({ baseUrl, getCsrfToken: () => this.csrfToken });
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  /**
   * Call once at boot. Resolves `whenReady` either way: a failed check must never hang a public page. On the
   * OAuth callback page this races the OAuth exchange itself, so a late 401 must not clobber a session set
   * in the meantime; hence the token snapshot-and-compare instead of an unconditional clear().
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

  /** Awaited by route guards before deciding where a protected screen sends someone. */
  whenReady(): Promise<void> {
    return this.ready;
  }

  /** Called after a successful sign-in/verify/OAuth response. */
  setSignedIn(csrfToken: string, me?: MeResponse): void {
    this.csrfToken = csrfToken;
    try {
      sessionStorage.setItem(CSRF_STORAGE_KEY, csrfToken);
    } catch {
      // Without storage a reload needs a fresh sign-in; the current page still works.
    }
    if (me) this.me = me;
  }

  getMe(): MeResponse | null {
    return this.me;
  }

  /** Fetches a fresh /me and caches it. A failure here is a query error, never a silent sign-out. */
  async refreshMe(): Promise<MeResponse> {
    this.me = await this.client.get<MeResponse>('/me');
    return this.me;
  }

  /** Whether a session was established: true right after sign-in, before any /me has run. */
  isSignedIn(): boolean {
    return this.csrfToken !== null;
  }

  clear(): void {
    this.csrfToken = null;
    this.me = null;
    try {
      sessionStorage.removeItem(CSRF_STORAGE_KEY);
    } catch {
      // Nothing stored, nothing to remove.
    }
  }

  private static readStoredToken(): string | null {
    try {
      return sessionStorage.getItem(CSRF_STORAGE_KEY);
    } catch {
      return null;
    }
  }
}

// One instance for the whole app: a browser tab has exactly one tenant session.
export const tenantSession = new TenantSession();
