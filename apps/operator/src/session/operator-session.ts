import i18n from 'i18next';
import { ApiClient, CsrfTokenStore } from '@lytronix/api-client';

// The CSRF token is only ever sent once, in the enroll or verify response body (SEC-14); only its hash is stored
// server-side. A copy every tab shares (CsrfTokenStore, 2026-11-23) lets a reload or a second tab work without a fresh
// two-factor sign-in, for as long as the session cookie (12 hours) lasts.
// Its own key: this is a separate cookie and session from a seller's (ADM-01), never to be confused with it.
const CSRF_STORAGE_KEY = 'lytro.operator.csrf';

/**
 * Holds the operator session's CSRF token. Nothing here depends on a fetched profile: `isSignedIn` answers
 * synchronously from the token alone, and a 401 on any console call is what reveals an expired cookie (main.tsx
 * then clears this and returns to sign-in). The server words its refusals in the console's language, not the browser's.
 * Another tab's sign-in hands this one its new token; its sign-out sends this one to sign-in.
 */
export class OperatorSession {
  readonly client: ApiClient;
  private csrfToken: string | null;
  private signedOutElsewhere: () => void = () => undefined;

  constructor(
    baseUrl = '/api/v1',
    private readonly tokens = new CsrfTokenStore(CSRF_STORAGE_KEY),
  ) {
    this.csrfToken = tokens.read();
    tokens.watch((token) => {
      const wasSignedIn = this.csrfToken !== null;
      this.csrfToken = token;
      if (token === null && wasSignedIn) this.signedOutElsewhere();
    });
    this.client = new ApiClient({
      baseUrl,
      getCsrfToken: () => this.csrfToken,
      getLanguage: () => i18n.language || null,
    });
  }

  /** What this tab does once another tab has signed out, ending the cookie they share (main.tsx: back to sign-in). */
  whenSignedOutElsewhere(then: () => void): void {
    this.signedOutElsewhere = then;
  }

  /** Called after a successful enroll or verify response. */
  setSignedIn(csrfToken: string): void {
    this.csrfToken = csrfToken;
    this.tokens.write(csrfToken);
  }

  /** Whether this browser holds a session. */
  isSignedIn(): boolean {
    return this.csrfToken !== null;
  }

  clear(): void {
    this.csrfToken = null;
    this.tokens.clear();
  }
}

// One instance for the whole app; every tab's instance shares the one token.
export const operatorSession = new OperatorSession();
