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
