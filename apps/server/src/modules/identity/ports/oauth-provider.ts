import type { OauthProvider } from '@lytronix/validators';

/** The identity a provider confirmed for the person who signed in (AUTH-24). */
export interface OauthProfile {
  accountId: string;
  email: string | null;
  emailVerified: boolean;
}

/** One provider's sign-in flow. The real providers and the test double both implement it. */
export interface OauthProviderPort {
  readonly provider: OauthProvider;
  authorizeUrl(input: { state: string; codeChallenge: string; redirectUri: string }): string;
  exchange(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<OauthProfile>;
}
