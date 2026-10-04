import { sql } from 'drizzle-orm';
import type { Database } from './client';

// A transaction handle. Repositories accept either the pool or a transaction, so one unit of work can span
// several repositories (for example identity, tenancy and staff when a shop is created, AUTH-10).
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type Executor = Database | Transaction;

export class TransactionRunner {
  run<T>(db: Database, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return db.transaction(work);
  }

  /** Sets the tenant context for the rest of the transaction, so row-level security applies (DAT-03). */
  async setTenantContext(tx: Transaction, tenantId: string): Promise<void> {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
  }

  /**
   * True when a unique constraint was violated and its name contains the fragment. Services use it to turn a race
   * (two sign-ups with the same phone or address) into a clear answer rather than a 500.
   */
  isUniqueViolation(error: unknown, constraintFragment: string): boolean {
    // The driver may wrap the Postgres error in `cause`; read whichever object carries the fields, without a cast.
    const source = error instanceof Error && error.cause ? error.cause : error;
    if (typeof source !== 'object' || source === null) return false;
    const code = 'code' in source ? source.code : undefined;
    const constraint = 'constraint' in source ? source.constraint : undefined;
    return (
      code === '23505' && typeof constraint === 'string' && constraint.includes(constraintFragment)
    );
  }
}
