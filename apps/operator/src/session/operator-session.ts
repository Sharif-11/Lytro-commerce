import { ApiClient } from '@lytronix/api-client';

// The CSRF token is only ever sent once, in the enroll or verify response body (SEC-14); only its hash is
// stored server-side. A copy in sessionStorage lets a reload survive without a fresh two-factor sign-in.
// Its own key: this is a separate cookie and session from a seller's (ADM-01), never to be confused with it.
const CSRF_STORAGE_KEY = 'lytro.operator.csrf';

/**
 * Holds the operator session's CSRF token. There is no `/me` for operators, so nothing here depends on a
 * fetched profile: `isSignedIn` answers synchronously from the token alone, and a 401 on any console call
 * is what reveals an expired cookie (the console layout then clears this and returns to sign-in).
 */
export class OperatorSession {
  readonly client: ApiClient;
  private csrfToken: string | null;

  constructor(baseUrl = '/api/v1') {
    this.csrfToken = OperatorSession.readStoredToken();
    this.client = new ApiClient({ baseUrl, getCsrfToken: () => this.csrfToken });
  }

  /** Called after a successful enroll or verify response. */
  setSignedIn(csrfToken: string): void {
    this.csrfToken = csrfToken;
    try {
      sessionStorage.setItem(CSRF_STORAGE_KEY, csrfToken);
    } catch {
      // Without storage a reload needs a fresh sign-in; the current page still works.
    }
  }

  /** Whether a session was established in this tab. */
  isSignedIn(): boolean {
    return this.csrfToken !== null;
  }

  clear(): void {
    this.csrfToken = null;
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

// One instance for the whole app: a browser tab has exactly one operator session.
export const operatorSession = new OperatorSession();
