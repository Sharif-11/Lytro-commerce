import type { IdentityKind } from '@lytronix/validators';

/** GET /me/identities (AUTH-26): the sign-in methods on the account. */
export interface Identity {
  id: string;
  kind: IdentityKind;
  value: string;
}
