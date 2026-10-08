import { and, eq, isNull } from 'drizzle-orm';
import type { Executor } from '../../transactions';
import { operatorBackupCodes } from '../../schema';

// ADM-01, ADM-18: ten single-use backup codes per operator, shown once at enrollment confirmation.

export type OperatorBackupCodeRow = typeof operatorBackupCodes.$inferSelect;

export class OperatorBackupCodeRepository {
  async insertMany(db: Executor, operatorId: string, codeHashes: readonly string[]): Promise<void> {
    await db
      .insert(operatorBackupCodes)
      .values(codeHashes.map((codeHash) => ({ operatorId, codeHash })));
  }

  /** Still-valid codes for this operator — a submitted code is checked against each hash by the caller. */
  async findValidByOperator(db: Executor, operatorId: string): Promise<OperatorBackupCodeRow[]> {
    return db
      .select()
      .from(operatorBackupCodes)
      .where(
        and(eq(operatorBackupCodes.operatorId, operatorId), isNull(operatorBackupCodes.usedAt)),
      );
  }

  /** Marks one code used. Never reused once set (ADM-01). */
  async markUsed(db: Executor, id: string, at: Date): Promise<void> {
    await db
      .update(operatorBackupCodes)
      .set({ usedAt: at })
      .where(and(eq(operatorBackupCodes.id, id), isNull(operatorBackupCodes.usedAt)));
  }

  /** Regenerating or break-glass recovery invalidates the whole old set at once (ADM-01, ADM-18). */
  async deleteAllForOperator(db: Executor, operatorId: string): Promise<void> {
    await db.delete(operatorBackupCodes).where(eq(operatorBackupCodes.operatorId, operatorId));
  }
}
