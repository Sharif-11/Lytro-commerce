import { and, count, desc, eq, gte } from 'drizzle-orm';
import { CredentialUseAction, type PaymentMethod } from '@lytronix/validators';
import { gatewayCredentialUses, type SelectGatewayCredentialUse } from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

/** SEC-11 (Slice 5.7): one outbound call made with a stored credential, without the credential. */
export interface NewGatewayCredentialUse {
  method: PaymentMethod;
  action: CredentialUseAction;
  accountId: string;
  sessionId: string | null;
  succeeded: boolean;
  at: Date;
}

// SEC-11 (Phase 5 Slice 5.7): each shop's log of the uses of its stored gateway credentials. Every method sets its tenant context.
export class GatewayCredentialUseRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  async insert(tx: Transaction, tenantId: string, values: NewGatewayCredentialUse): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.insert(gatewayCredentialUses).values({ tenantId, ...values });
  }

  async tokenCallsSince(
    tx: Transaction,
    tenantId: string,
    accountId: string,
    since: Date,
  ): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select({ total: count() })
      .from(gatewayCredentialUses)
      .where(
        and(
          eq(gatewayCredentialUses.tenantId, tenantId),
          eq(gatewayCredentialUses.accountId, accountId),
          eq(gatewayCredentialUses.action, CredentialUseAction.Token),
          gte(gatewayCredentialUses.at, since),
        ),
      );
    return row?.total ?? 0;
  }

  async list(
    tx: Transaction,
    tenantId: string,
    page: { offset: number; limit: number },
  ): Promise<{ rows: SelectGatewayCredentialUse[]; total: number }> {
    await this.transactions.setTenantContext(tx, tenantId);
    const where = eq(gatewayCredentialUses.tenantId, tenantId);
    const [totals] = await tx.select({ total: count() }).from(gatewayCredentialUses).where(where);
    const rows = await tx
      .select()
      .from(gatewayCredentialUses)
      .where(where)
      .orderBy(desc(gatewayCredentialUses.at), desc(gatewayCredentialUses.id))
      .limit(page.limit)
      .offset(page.offset);
    return { rows, total: totals?.total ?? 0 };
  }
}
