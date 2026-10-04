import type { Transaction } from '@lytronix/db';

// The storage and settings the identity services depend on. Each is implemented once, in database/adapters.
// Services never import Drizzle or @lytronix/db repository functions directly.

export interface ChallengeRecord {
  id: string;
  codeHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  lockedUntil: Date | null;
  attempts: number;
  createdAt: Date;
}

export interface ChallengeStore {
  latest(tx: Transaction, phone: string): Promise<ChallengeRecord | null>;
  countSince(tx: Transaction, phone: string, since: Date): Promise<number>;
  create(
    tx: Transaction,
    input: { phone: string; codeHash: string; expiresAt: Date },
  ): Promise<{ id: string; createdAt: Date }>;
  recordWrongAttempt(tx: Transaction, challengeId: string): Promise<number>;
  lock(tx: Transaction, challengeId: string, until: Date): Promise<void>;
}

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

export interface SignupSettings {
  now(): Date;
  otpSecret: string;
  shopUrl(address: string): string;
}
