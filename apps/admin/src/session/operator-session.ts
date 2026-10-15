import { ApiClient } from '../api/client';

// Same reasoning as tenant-session.ts's CSRF storage — a separate key, since this is a separate cookie/session
// entirely (ADM-01), never to be confused with the tenant one even if somehow read from the same browser.
const CSRF_STORAGE_KEY = 'lytronix.operator.csrf';

/**
 * Holds the operator session's CSRF token. Still no auth-init gate or `/me` equivalent — unlike the tenant
 * session, nothing here depends on a fetched profile, just on a cookie having been established, which
 * isSignedIn() below answers synchronously from the CSRF token alone.
 */
export class OperatorSession {
  readonly client: ApiClient;
  private csrfToken: string | null;

  constructor(baseUrl = '/api/v1') {
    this.csrfToken = sessionStorage.getItem(CSRF_STORAGE_KEY);
    this.client = new ApiClient({ baseUrl, getCsrfToken: () => this.csrfToken });
  }

  /** Called after a successful enroll/verify response. */
  setSignedIn(csrfToken: string): void {
    this.csrfToken = csrfToken;
    sessionStorage.setItem(CSRF_STORAGE_KEY, csrfToken);
  }

  /** Same reasoning as TenantSession.isSignedIn() — a cheap, synchronous check the `/operator` layout route's
      beforeLoad guard can use now that there's a protected subtree behind it (plans/billing-terms/rates). */
  isSignedIn(): boolean {
    return this.csrfToken !== null;
  }

  clear(): void {
    this.csrfToken = null;
    sessionStorage.removeItem(CSRF_STORAGE_KEY);
  }
}

// One instance for the whole app, the same reasoning as tenant-session.ts's singleton.
export const operatorSession = new OperatorSession();
