import type { Transaction } from '@lytronix/db';

/** Runs a unit of work in one transaction, and the account rows that sign-up writes. */
export interface SignupGateway {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  consumeChallenge(tx: Transaction, challengeId: string, at: Date): Promise<boolean>;
  insertSubscriber(tx: Transaction): Promise<string>;
  insertPhoneIdentity(
    tx: Transaction,
    values: { subscriberId: string; phone: string; verifiedAt: Date },
  ): Promise<string>;
}
