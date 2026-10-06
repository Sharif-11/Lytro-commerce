import type { Transaction } from '@lytronix/db';
import type { IdentityKind } from '@lytronix/validators';
import type { TenantState } from '@lytronix/validators';

/** The shop a subscriber owns, as sign-in needs it to choose the next screen. */
export interface OwnedTenant {
  id: string;
  state: TenantState;
  suspendedAt: Date | null;
}

/** Runs a unit of work in one transaction, and the account rows that sign-in, sign-up and password changes write. */
export interface SignupGateway {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  consumeChallenge(tx: Transaction, challengeId: string, at: Date): Promise<boolean>;
  findSubscriberByPhone(
    tx: Transaction,
    phone: string,
  ): Promise<{ subscriberId: string; passwordHash: string | null } | null>;
  findSubscriberById(
    tx: Transaction,
    subscriberId: string,
  ): Promise<{ passwordHash: string | null } | null>;
  setPasswordHash(tx: Transaction, subscriberId: string, passwordHash: string): Promise<void>;
  markSignedIn(tx: Transaction, subscriberId: string, at: Date): Promise<void>;
  insertSubscriber(tx: Transaction): Promise<string>;
  insertPhoneIdentity(
    tx: Transaction,
    values: { subscriberId: string; phone: string; verifiedAt: Date },
  ): Promise<string>;
  findOwnedTenant(tx: Transaction, subscriberId: string): Promise<OwnedTenant | null>;
  findEmailIdentityOf(
    tx: Transaction,
    subscriberId: string,
  ): Promise<{ id: string; email: string } | null>;
  findSubscriberByIdentity(
    tx: Transaction,
    kind: IdentityKind,
    value: string,
  ): Promise<{ subscriberId: string; passwordHash: string | null } | null>;
  insertOauthIdentity(
    tx: Transaction,
    values: { subscriberId: string; kind: IdentityKind; value: string; verifiedAt: Date },
  ): Promise<string>;
  findPhoneIdentityOf(
    tx: Transaction,
    subscriberId: string,
  ): Promise<{ id: string; phone: string } | null>;
  findSubscriberByEmail(
    tx: Transaction,
    email: string,
  ): Promise<{ subscriberId: string; passwordHash: string | null } | null>;
  insertEmailIdentity(
    tx: Transaction,
    values: { subscriberId: string; email: string; verifiedAt: Date },
  ): Promise<string>;
}
