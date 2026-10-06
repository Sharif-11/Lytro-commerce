import type { ChallengeChannel, ChallengeKind } from '@lytronix/validators';
import type { ChallengeRow, Transaction } from '@lytronix/db';

/** A one-time code challenge: exactly the database row, so the shape is defined once. */
export type ChallengeRecord = ChallengeRow;

export interface ChallengeStore {
  latest(
    tx: Transaction,
    destination: string,
    channel: ChallengeChannel,
    kind: ChallengeKind,
  ): Promise<ChallengeRecord | null>;
  countSince(
    tx: Transaction,
    destination: string,
    channel: ChallengeChannel,
    kind: ChallengeKind,
    since: Date,
  ): Promise<number>;
  create(
    tx: Transaction,
    input: {
      destination: string;
      channel: ChallengeChannel;
      kind: ChallengeKind;
      codeHash: string;
      expiresAt: Date;
    },
  ): Promise<{ id: string; createdAt: Date }>;
  recordWrongAttempt(tx: Transaction, challengeId: string): Promise<number>;
  lock(tx: Transaction, challengeId: string, until: Date): Promise<void>;
}
