import type { ChallengeChannel, IdentityKind } from '@lytronix/validators';

/** Where a code for an identity is sent, and the identity it would create (AUTH-08). */
export interface IdentityDestination {
  destination: string;
  channel: ChallengeChannel;
  identityKind: IdentityKind;
}
