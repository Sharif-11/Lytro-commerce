import { sql } from 'drizzle-orm';
import type { Transaction, TransactionRunner } from '../../transactions';

/** One use of a shop's stored credential, as the export lists it. */
export interface CredentialUseRow {
  at: Date;
  /** Whose credential: a courier's, a wallet gateway's or Meta's. */
  kind: 'courier' | 'gateway' | 'meta';
  /** Which one: the courier's or the wallet's key, or `meta`. */
  provider: string;
  action: string;
  /** The order number it served, or the payment page's reference; empty where it served none. */
  reference: string | null;
  succeeded: boolean;
}

/** At most this many uses in one export: a year of a busy shop's, and a CSV a spreadsheet still opens. */
export const CREDENTIAL_USE_EXPORT_MAX_ROWS = 200_000;

/**
 * SEC-11 (Phase 9 Slice 9.7): every use of a shop's stored credentials in a period, oldest first, from the three logs
 * kept since each credential arrived -- couriers' (Slice 6.1), wallet gateways' (Slice 5.7) and Meta's token's (this
 * slice) -- in the shop's own context, so row-level security holds. Never a credential: none of the logs holds one.
 */
export class CredentialUseExportRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  async between(
    tx: Transaction,
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<CredentialUseRow[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const result = await tx.execute<{
      at: Date | string;
      kind: CredentialUseRow['kind'];
      provider: string;
      action: string;
      reference: string | null;
      succeeded: boolean;
    }>(sql`
      SELECT u.at, 'courier' AS kind, u.courier_key AS provider, u.action::text AS action,
             o.order_number AS reference, u.succeeded
      FROM tenant.courier_credential_uses u
      LEFT JOIN tenant.orders o ON o.id = u.order_id
      WHERE u.tenant_id = ${tenantId} AND u.at >= ${from} AND u.at < ${to}
      UNION ALL
      SELECT g.at, 'gateway', g.method::text, g.action::text, s.ref, g.succeeded
      FROM tenant.gateway_credential_uses g
      LEFT JOIN tenant.payment_sessions s ON s.id = g.session_id
      WHERE g.tenant_id = ${tenantId} AND g.at >= ${from} AND g.at < ${to}
      UNION ALL
      SELECT m.at, 'meta', 'meta', m.action, o.order_number, m.succeeded
      FROM tenant.ad_tracking_credential_uses m
      LEFT JOIN tenant.orders o ON o.id = m.order_id
      WHERE m.tenant_id = ${tenantId} AND m.at >= ${from} AND m.at < ${to}
      ORDER BY 1
      LIMIT ${CREDENTIAL_USE_EXPORT_MAX_ROWS}
    `);
    return result.rows.map((row) => ({ ...row, at: new Date(row.at) }));
  }
}
