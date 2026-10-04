import { setTenantContext, type Transaction } from '../../transactions';
import { users } from '../../schema';

// AUTH-10: the owner user row. Row-level security applies to it, so it must run inside a transaction that has
// set the tenant context. The transaction type makes that requirement part of the signature.
export async function insertOwnerUser(
  tx: Transaction,
  values: { tenantId: string; phone: string; name: string },
): Promise<void> {
  await setTenantContext(tx, values.tenantId);
  await tx.insert(users).values({
    tenantId: values.tenantId,
    phone: values.phone,
    name: values.name,
    isOwner: true,
  });
}
