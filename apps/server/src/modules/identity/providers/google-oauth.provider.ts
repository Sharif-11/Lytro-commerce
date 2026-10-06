import { OauthProvider } from '@lytronix/validators';
import { z } from 'zod';
import { ApiError } from '../../../common/api-error';
import type { OauthProfile, OauthProviderPort } from '../ports/oauth-provider';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

const tokenReply = z.object({ access_token: z.string().min(1) });
const profileReply = z.object({
  sub: z.string().min(1),
  email: z.string().email().optional(),
  email_verified: z.boolean().optional(),
});

/** Google sign-in with PKCE (AUTH-24). The account is matched by Google's stable subject ID. */
export class GoogleOauthProvider implements OauthProviderPort {
  readonly provider = OauthProvider.Google;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  authorizeUrl(input: { state: string; codeChallenge: string; redirectUri: string }): string {
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email');
    url.searchParams.set('state', input.state);
    url.searchParams.set('code_challenge', input.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  async exchange(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<OauthProfile> {
    const token = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: input.code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: input.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: input.codeVerifier,
      }),
    });
    const tokenBody = tokenReply.safeParse(await token.json().catch(() => null));
    if (!token.ok || !tokenBody.success)
      throw new ApiError('unauthenticated', 'Google did not confirm your sign-in.', {});

    const info = await fetch(USERINFO_URL, {
      headers: { authorization: `Bearer ${tokenBody.data.access_token}` },
    });
    const profile = profileReply.safeParse(await info.json().catch(() => null));
    if (!info.ok || !profile.success)
      throw new ApiError('unauthenticated', 'Google did not confirm your sign-in.', {});

    return {
      accountId: profile.data.sub,
      email: profile.data.email ?? null,
      emailVerified: profile.data.email_verified === true,
    };
  }
}
