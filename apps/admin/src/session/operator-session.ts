import { ApiClient } from '../api/client';

// Same reasoning as tenant-session.ts's CSRF storage — a separate key, since this is a separate cookie/session
// entirely (ADM-01), never to be confused with the tenant one even if somehow read from the same browser.
const CSRF_STORAGE_KEY = 'lytronix.operator.csrf';

/**
 * Holds the operator session's CSRF token. No auth-init gate and no `/me` equivalent, deliberately — this
 * slice has no protected operator screens beyond the auth flow itself (sign-in, enroll, verify), so there is
 * nothing yet that needs to wait on a confirmed-active session before firing.
 */
export class OperatorSession {
  readonly client: ApiClient;
  private csrfToken: string | null;

  constructor(baseUrl = '/api') {
    this.csrfToken = sessionStorage.getItem(CSRF_STORAGE_KEY);
    this.client = new ApiClient({ baseUrl, getCsrfToken: () => this.csrfToken });
  }

  /** Called after a successful enroll/verify response. */
  setSignedIn(csrfToken: string): void {
    this.csrfToken = csrfToken;
    sessionStorage.setItem(CSRF_STORAGE_KEY, csrfToken);
  }

  clear(): void {
    this.csrfToken = null;
    sessionStorage.removeItem(CSRF_STORAGE_KEY);
  }
}

// One instance for the whole app, the same reasoning as tenant-session.ts's singleton.
export const operatorSession = new OperatorSession();
