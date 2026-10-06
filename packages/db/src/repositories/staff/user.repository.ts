import { users } from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

// AUTH-10: the owner user row. Row-level security applies to it, so it must run inside a transaction that has set
// the tenant context. The transaction type makes that requirement part of the signature.
export class UserRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  async insertOwner(
    tx: Transaction,
    values: { tenantId: string; phone: string | null; email: string | null; name: string },
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, values.tenantId);
    await tx.insert(users).values({
      tenantId: values.tenantId,
      phone: values.phone,
      email: values.email,
      name: values.name,
      isOwner: true,
    });
  }
}
