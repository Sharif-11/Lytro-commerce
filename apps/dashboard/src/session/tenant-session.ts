import { ApiClient, CsrfTokenStore } from '@lytronix/api-client';
import type { MeResponse } from '../types/me';
import { shopOfPath } from './shop-of-path';

// The CSRF token is only ever sent once, in a sign-in response body (SEC-14); only its hash is stored
// server-side. A copy every tab and the installed app share (CsrfTokenStore, 2026-11-23) lets a reload, a second tab or
// a link opened from an SMS work without a fresh sign-in, for as long as the session cookie (7 days) lasts.
const CSRF_STORAGE_KEY = 'lytro.tenant.csrf';

/**
 * Holds the tenant session's CSRF token and the last `/me` result, and the auth-init gate every protected
 * screen waits on. One instance for the whole app (main.tsx); tests construct their own. Another tab's sign-in hands
 * this one its new token; its sign-out sends this one to sign-in.
 */
export class TenantSession {
  readonly client: ApiClient;
  private csrfToken: string | null;
  private me: MeResponse | null = null;
  private readonly ready: Promise<void>;
  private resolveReady!: () => void;

  private signedOutElsewhere: () => void = () => undefined;

  constructor(
    baseUrl = '/api/v1',
    private readonly tokens = new CsrfTokenStore(CSRF_STORAGE_KEY),
  ) {
    this.csrfToken = tokens.read();
    tokens.watch((token) => {
      const wasSignedIn = this.csrfToken !== null;
      this.csrfToken = token;
      if (token === null) this.me = null;
      if (token === null && wasSignedIn) this.signedOutElsewhere();
    });
    this.client = new ApiClient({
      baseUrl,
      getCsrfToken: () => this.csrfToken,
      // TEN-31: every call from a shop's page names that shop; the server checks the person belongs to it.
      getShop: () => shopOfPath(window.location.pathname),
      // I18N-01, NTC-15: the server's words (the bell, Lytro's notices, every message) come in the language the page
      // shows, which the language setup keeps on <html lang>, not the browser's own.
      getLanguage: () => document.documentElement.lang || null,
    });
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

  /** What this tab does once another tab has signed out, ending the cookie they share (main.tsx: back to sign-in). */
  whenSignedOutElsewhere(then: () => void): void {
    this.signedOutElsewhere = then;
  }

  /** Called after a successful sign-in/verify/OAuth response. */
  setSignedIn(csrfToken: string, me?: MeResponse): void {
    this.csrfToken = csrfToken;
    this.tokens.write(csrfToken);
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
    this.tokens.clear();
  }
}

// One instance for the whole app; every tab's instance shares the one token.
export const tenantSession = new TenantSession();
