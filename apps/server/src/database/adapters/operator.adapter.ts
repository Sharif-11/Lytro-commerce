import { Inject, Injectable } from '@nestjs/common';
import {
  OperatorAccountRepository,
  OperatorBackupCodeRepository,
  OperatorSessionRepository,
  TransactionRunner,
  type Transaction,
} from '@lytronix/db';
import type {
  NewOperatorSessionValues,
  OperatorAccountRecord,
  OperatorBackupCodeRecord,
  OperatorGateway,
  OperatorSessionRecord,
} from '../../modules/operator/ports/operator-gateway';
import { DatabaseService } from '../database.service';

/** Operator sign-in's own unit of work (ADM-01, D8), through the three operator repositories. */
@Injectable()
export class DrizzleOperatorGateway implements OperatorGateway {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(OperatorAccountRepository) private readonly accounts: OperatorAccountRepository,
    @Inject(OperatorBackupCodeRepository)
    private readonly backupCodes: OperatorBackupCodeRepository,
    @Inject(OperatorSessionRepository) private readonly sessions: OperatorSessionRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  async findByEmail(tx: Transaction, email: string): Promise<OperatorAccountRecord | null> {
    const row = await this.accounts.findByEmail(tx, email);
    return row
      ? {
          id: row.id,
          email: row.email,
          passwordHash: row.passwordHash,
          twoFactorSecret: row.twoFactorSecret,
          twoFactorConfirmedAt: row.twoFactorConfirmedAt,
        }
      : null;
  }

  setTwoFactorSecret(tx: Transaction, operatorId: string, secret: string): Promise<void> {
    return this.accounts.setTwoFactorSecret(tx, operatorId, secret);
  }

  confirmTwoFactor(tx: Transaction, operatorId: string, at: Date): Promise<void> {
    return this.accounts.confirmTwoFactor(tx, operatorId, at);
  }

  insertBackupCodes(
    tx: Transaction,
    operatorId: string,
    codeHashes: readonly string[],
  ): Promise<void> {
    return this.backupCodes.insertMany(tx, operatorId, codeHashes);
  }

  async findValidBackupCodes(
    tx: Transaction,
    operatorId: string,
  ): Promise<OperatorBackupCodeRecord[]> {
    const rows = await this.backupCodes.findValidByOperator(tx, operatorId);
    return rows.map((row) => ({ id: row.id, codeHash: row.codeHash }));
  }

  markBackupCodeUsed(tx: Transaction, id: string, at: Date): Promise<void> {
    return this.backupCodes.markUsed(tx, id, at);
  }

  async insertSession(tx: Transaction, values: NewOperatorSessionValues): Promise<void> {
    await this.sessions.insert(tx, values);
  }

  async findActiveSession(tokenHash: string, now: Date): Promise<OperatorSessionRecord | null> {
    const row = await this.sessions.findActiveByTokenHash(this.database.handle.db, tokenHash, now);
    return row ? { id: row.id, operatorId: row.operatorId, csrfHash: row.csrfHash } : null;
  }

  revokeSession(sessionId: string, at: Date): Promise<void> {
    return this.sessions.revoke(this.database.handle.db, sessionId, at);
  }
}
