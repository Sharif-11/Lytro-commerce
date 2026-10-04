import { sql } from 'drizzle-orm';
import type { Database } from './client';

// A transaction handle. Repositories accept either the pool or a transaction, so one unit of work can span
// several repositories (for example identity, tenancy and staff when a shop is created, AUTH-10).
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type Executor = Database | Transaction;

export function runInTransaction<T>(
  db: Database,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(work);
}

/** Sets the tenant context for the rest of the transaction, so row-level security applies (DAT-03). */
export async function setTenantContext(tx: Transaction, tenantId: string): Promise<void> {
  await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
}

/**
 * True when a unique constraint was violated and its name contains the fragment. Used by services to turn a
 * race (two sign-ups with the same phone or address) into a clear answer rather than a 500.
 */
export function isUniqueViolation(error: unknown, constraintFragment: string): boolean {
  const cause = (error instanceof Error && error.cause ? error.cause : error) as {
    code?: string;
    constraint?: string;
  };
  return cause.code === '23505' && (cause.constraint ?? '').includes(constraintFragment);
}
