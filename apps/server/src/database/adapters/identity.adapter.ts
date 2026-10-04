import { Inject, Injectable } from '@nestjs/common';
import {
  AccountRepository,
  ChallengeRepository,
  TransactionRunner,
  type Transaction,
} from '@lytronix/db';
import { UniqueViolation } from '../../common/errors/unique-violation';
import type {
  ChallengeRecord,
  ChallengeStore,
  SignupGateway,
} from '../../modules/identity/services/ports';
import { DatabaseService } from '../database.service';

/** One-time code rows (AUTH-05 to AUTH-07), through the challenge repository. */
@Injectable()
export class DrizzleChallengeStore implements ChallengeStore {
  constructor(@Inject(ChallengeRepository) private readonly challenges: ChallengeRepository) {}

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
@Injectable()
export class DrizzleSignupGateway implements SignupGateway {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(AccountRepository) private readonly accounts: AccountRepository,
    @Inject(ChallengeRepository) private readonly challenges: ChallengeRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
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
