import {
  consumeChallenge,
  countChallengesSince,
  insertChallenge,
  insertPhoneIdentity,
  insertSubscriber,
  isUniqueViolation,
  latestChallenge,
  lockChallenge,
  recordWrongAttempt,
  runInTransaction,
  type Database,
  type Transaction,
} from '@lytronix/db';
import { UniqueViolation } from '../../common/errors/unique-violation';
import type { ChallengeRecord, ChallengeStore, SignupGateway } from '../../identity/services/ports';

/** One-time code rows (AUTH-05 to AUTH-07). */
export class DrizzleChallengeStore implements ChallengeStore {
  async latest(tx: Transaction, phone: string): Promise<ChallengeRecord | null> {
    const row = await latestChallenge(tx, phone);
    return row
      ? {
          id: row.id,
          codeHash: row.codeHash,
          expiresAt: row.expiresAt,
          consumedAt: row.consumedAt,
          lockedUntil: row.lockedUntil,
          attempts: row.attempts,
          createdAt: row.createdAt,
        }
      : null;
  }

  countSince(tx: Transaction, phone: string, since: Date): Promise<number> {
    return countChallengesSince(tx, phone, since);
  }

  async create(
    tx: Transaction,
    input: { phone: string; codeHash: string; expiresAt: Date },
  ): Promise<{ id: string; createdAt: Date }> {
    const row = await insertChallenge(tx, input);
    return { id: row.id, createdAt: row.createdAt };
  }

  recordWrongAttempt(tx: Transaction, challengeId: string): Promise<number> {
    return recordWrongAttempt(tx, challengeId);
  }

  lock(tx: Transaction, challengeId: string, until: Date): Promise<void> {
    return lockChallenge(tx, challengeId, until);
  }
}

/** Transactions and account rows for sign-up. A duplicate phone becomes UniqueViolation('phone'). */
export class DrizzleSignupGateway implements SignupGateway {
  constructor(private readonly db: Database) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return runInTransaction(this.db, work);
  }

  consumeChallenge(tx: Transaction, challengeId: string, at: Date): Promise<boolean> {
    return consumeChallenge(tx, challengeId, at);
  }

  insertSubscriber(tx: Transaction): Promise<string> {
    return insertSubscriber(tx);
  }

  async insertPhoneIdentity(
    tx: Transaction,
    values: { subscriberId: string; phone: string; verifiedAt: Date },
  ): Promise<string> {
    try {
      return await insertPhoneIdentity(tx, values);
    } catch (error) {
      if (isUniqueViolation(error, 'kind_value')) throw new UniqueViolation('phone');
      throw error;
    }
  }
}
