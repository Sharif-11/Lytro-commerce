import type { ChallengeRow, Transaction } from '@lytronix/db';

/** A one-time code challenge: exactly the database row, so the shape is defined once. */
export type ChallengeRecord = ChallengeRow;

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
