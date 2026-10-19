/**
 * Mirrors the server's identity response shapes (apps/server/src/modules/identity/) — deliberate structural
 * duplicates, since only request schemas and error codes are exported from shared packages.
 */
export interface CodeIssued {
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

export type NextStep = 'create-shop' | 'dashboard' | 'set-password' | 'renewal' | 'unavailable';

export interface SignedInBody {
  next: NextStep;
  tenantId: string | null;
  csrfToken: string;
}

export interface ShopCreated {
  tenantId: string;
  address: string;
  shopUrl: string;
  next: 'set-password';
}

/** GET auth/oauth/:provider/callback's sign-in response; `recovery` is returned once, when a Facebook account
    is created with no email (AUTH-27). */
export interface OauthSignedIn extends SignedInBody {
  recovery: 'facebook-only' | null;
}

/** POST auth/staff/signin: a staff member can only be sent to a forced password change or the dashboard. */
export interface StaffSignedInBody {
  next: 'set-password' | 'dashboard';
  tenantId: string | null;
  csrfToken: string;
}
