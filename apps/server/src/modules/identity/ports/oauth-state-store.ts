import type { OauthProvider } from '@lytronix/validators';

/** The state and PKCE verifier of each provider sign-in attempt (AUTH-24). A state is usable once. */
export interface OauthStateStore {
  insert(values: {
    state: string;
    provider: OauthProvider;
    codeVerifier: string;
    expiresAt: Date;
    attachToSubscriberId: string | null;
  }): Promise<void>;
  consume(
    state: string,
    provider: OauthProvider,
    now: Date,
  ): Promise<{ codeVerifier: string; attachToSubscriberId: string | null } | null>;
}
