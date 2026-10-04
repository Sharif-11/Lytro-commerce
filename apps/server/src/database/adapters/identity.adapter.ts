import {
  AccountRepository,
  ChallengeRepository,
  TransactionRunner,
  type Database,
  type Transaction,
} from '@lytronix/db';
import { UniqueViolation } from '../../common/errors/unique-violation';
import type { ChallengeRecord, ChallengeStore, SignupGateway } from '../../identity/services/ports';

/** One-time code rows (AUTH-05 to AUTH-07), through the challenge repository. */
export class DrizzleChallengeStore implements ChallengeStore {
  private readonly challenges = new ChallengeRepository();

  latest(tx: Transaction, phone: string): Promise<ChallengeRecord | null> {
    return this.challenges.latest(tx, phone);
  }

  countSince(tx: Transaction, phone: string, since: Date): Promise<number> {
    return this.challenges.countSince(tx, phone, since);
  }

  async create(
    tx: Transaction,
    input: { phone: string; codeHash: string; expiresAt: Date },
  ): Promise<{ id: string; createdAt: Date }> {
    const row = await this.challenges.insert(tx, input);
    return { id: row.id, createdAt: row.createdAt };
  }

  recordWrongAttempt(tx: Transaction, challengeId: string): Promise<number> {
    return this.challenges.recordWrongAttempt(tx, challengeId);
  }

  lock(tx: Transaction, challengeId: string, until: Date): Promise<void> {
    return this.challenges.lock(tx, challengeId, until);
  }
}

/** Transactions and account rows for sign-up. A duplicate phone becomes UniqueViolation('phone'). */
export class DrizzleSignupGateway implements SignupGateway {
  private readonly accounts = new AccountRepository();
  private readonly challenges = new ChallengeRepository();
  private readonly transactions = new TransactionRunner();

  constructor(private readonly db: Database) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.db, work);
  }

  consumeChallenge(tx: Transaction, challengeId: string, at: Date): Promise<boolean> {
    return this.challenges.consume(tx, challengeId, at);
  }

  insertSubscriber(tx: Transaction): Promise<string> {
    return this.accounts.insertSubscriber(tx);
  }

  async insertPhoneIdentity(
    tx: Transaction,
    values: { subscriberId: string; phone: string; verifiedAt: Date },
  ): Promise<string> {
    try {
      return await this.accounts.insertPhoneIdentity(tx, values);
    } catch (error) {
      if (this.transactions.isUniqueViolation(error, 'kind_value')) {
        throw new UniqueViolation('phone');
      }
      throw error;
    }
  }
}
