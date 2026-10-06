import type { IdentityKind } from '@lytronix/validators';
import type { SignedIn } from './signed-in';

// AUTH-27: an account created from Facebook with no email has no recovery path except Facebook itself.
export interface OauthSignedIn extends SignedIn {
  recovery: 'facebook-only' | null;
}

// AUTH-26: a provider account added to a signed-in account.
export interface OauthAttached {
  attached: IdentityKind;
}
