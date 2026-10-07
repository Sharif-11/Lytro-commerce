import { OauthProvider } from '@lytronix/validators';
import { z } from 'zod';
import { ApiError } from '../../../common/api-error';
import type { OauthProfile, OauthProviderPort } from '../ports/oauth-provider';

const DIALOG = 'https://www.facebook.com/v19.0';
const API = 'https://graph.facebook.com/v19.0';

const tokenReply = z.object({ access_token: z.string().min(1) });
const profileReply = z.object({ id: z.string().min(1), email: z.string().email().optional() });

/** Facebook sign-in (AUTH-24). The account is matched by the Facebook account ID; an email Facebook grants is not verified (AUTH-25). */
export class FacebookOauthProvider implements OauthProviderPort {
  readonly provider = OauthProvider.Facebook;

  constructor(
    private readonly appId: string,
    private readonly appSecret: string,
  ) {}

  authorizeUrl(input: { state: string; codeChallenge: string; redirectUri: string }): string {
    const url = new URL(`${DIALOG}/dialog/oauth`);
    url.searchParams.set('client_id', this.appId);
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('state', input.state);
    url.searchParams.set('scope', 'email');
    url.searchParams.set('response_type', 'code');
    return url.toString();
  }

  async exchange(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<OauthProfile> {
    const tokenUrl = new URL(`${API}/oauth/access_token`);
    tokenUrl.searchParams.set('client_id', this.appId);
    tokenUrl.searchParams.set('client_secret', this.appSecret);
    tokenUrl.searchParams.set('redirect_uri', input.redirectUri);
    tokenUrl.searchParams.set('code', input.code);
    const token = await fetch(tokenUrl);
    const tokenBody = tokenReply.safeParse(await token.json().catch(() => null));
    if (!token.ok || !tokenBody.success)
      throw new ApiError('unauthenticated', 'Facebook did not confirm your sign-in.', {});

    const meUrl = new URL(`${API}/me`);
    meUrl.searchParams.set('fields', 'id,email');
    meUrl.searchParams.set('access_token', tokenBody.data.access_token);
    const me = await fetch(meUrl);
    const profile = profileReply.safeParse(await me.json().catch(() => null));
    if (!me.ok || !profile.success)
      throw new ApiError('unauthenticated', 'Facebook did not confirm your sign-in.', {});

    return { accountId: profile.data.id, email: profile.data.email ?? null, emailVerified: false };
  }
}
