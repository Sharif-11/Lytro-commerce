/**
 * Mirrors response shapes defined server-side in apps/server/src/modules/identity/types/ and
 * auth.controller.ts's inline SignedInBody — none of these are exported from a shared package (only
 * request schemas and error codes are), so these are deliberate structural duplicates, not copies of
 * something importable.
 */
export interface CodeIssued {
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

export type NextStep =
  'create-shop' | 'dashboard' | 'set-password' | 'renewal' | 'purchase' | 'unavailable';

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

/** GET auth/oauth/:provider/callback's response for the sign-in case (the other case, OauthAttached, only
    happens from the account-settings "add a provider" flow, which this app doesn't build yet). */
export interface OauthSignedIn extends SignedInBody {
  recovery: 'facebook-only' | null;
}

/** POST auth/staff/signin's response (StaffAuthController) — its own, narrower NextStep than the owner's
    SignedInBody: a staff member can never reach create-shop/renewal/purchase/unavailable, only a forced
    password change (the owner set their password; StaffSigninService.signIn's own `next` logic) or straight
    to the dashboard. */
export interface StaffSignedInBody {
  next: 'set-password' | 'dashboard';
  tenantId: string | null;
  csrfToken: string;
}
