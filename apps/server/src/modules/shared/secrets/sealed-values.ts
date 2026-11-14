import type pg from 'pg';
import { LYTRO_GATEWAY_OWNER } from '../../gateway/ports/wallet-gateway';
import { type SecretBox, SecretPurpose, SecretUnreadable } from './secret-box';

/** A column of sealed values, and what each is bound to when sealed (SecretBox's purpose and owner). */
export interface SealedColumn {
  table: string;
  column: string;
  purpose: SecretPurpose;
  /** The column naming the shop each value is bound to, or the fixed owner of Lytro's own. */
  owner: { tenantColumn: string } | { fixed: string };
  /** A shop's table behind row-level security: read and written in each shop's own context. */
  perShop: boolean;
}

/**
 * SEC-10, §81 (Slice 9.7): every column the database keeps sealed values in. A wallet account's token (GatewayToken)
 * lives only in Redis and expires within the hour, so it never needs sealing again. A column added for a new purpose
 * belongs here, or a key change would leave it unreadable (test/reseal.e2e.spec.ts checks every bytea column is
 * listed or named as not sealed).
 */
export const SEALED_COLUMNS: readonly SealedColumn[] = [
  {
    table: 'control.api_keys',
    column: 'sealed_value',
    purpose: SecretPurpose.StorefrontKey,
    owner: { tenantColumn: 'tenant_id' },
    perShop: false,
  },
  {
    table: 'control.catalog_feeds',
    column: 'token_enc',
    purpose: SecretPurpose.CatalogFeedToken,
    owner: { tenantColumn: 'tenant_id' },
    perShop: false,
  },
  {
    table: 'control.platform_gateway_accounts',
    column: 'credentials',
    purpose: SecretPurpose.GatewayCredentials,
    owner: { fixed: LYTRO_GATEWAY_OWNER },
    perShop: false,
  },
  {
    table: 'tenant.ad_tracking_settings',
    column: 'meta_capi_token_enc',
    purpose: SecretPurpose.ConversionsApiToken,
    owner: { tenantColumn: 'tenant_id' },
    perShop: true,
  },
  {
    table: 'tenant.courier_connections',
    column: 'credentials',
    purpose: SecretPurpose.CourierCredentials,
    owner: { tenantColumn: 'tenant_id' },
    perShop: true,
  },
  {
    table: 'tenant.courier_connections',
    column: 'message_secrets',
    purpose: SecretPurpose.CourierMessages,
    owner: { tenantColumn: 'tenant_id' },
    perShop: true,
  },
  {
    table: 'tenant.wallet_accounts',
    column: 'gateway_credentials',
    purpose: SecretPurpose.GatewayCredentials,
    owner: { tenantColumn: 'tenant_id' },
    perShop: true,
  },
];

/** What a re-seal did with one column. */
export interface ResealCount {
  column: string;
  /** Sealed with the current key already. */
  current: number;
  resealed: number;
  /** Opened by neither key: the owner of each must enter it again. */
  unreadable: string[];
}

/**
 * SEC-10, §81, D9-8 (Slice 9.7): after the sealing key changes (RUNBOOKS.md §3), every stored value sealed with the one
 * before is opened with it and sealed again with the new one, so the old key can be retired. Run by hand, once both keys
 * are set; safe to run again (a value already sealed with the current key is left be). What neither key opens is
 * reported by its column and owner, never changed. One transaction per column, or per shop for a shop's table, in that
 * shop's own context, so row-level security holds.
 */
export class SealedValuesReseal {
  constructor(
    private readonly db: pg.Client,
    private readonly box: Pick<SecretBox, 'open' | 'seal' | 'sealedWithCurrent'>,
    private readonly columns: readonly SealedColumn[] = SEALED_COLUMNS,
  ) {}

  async run(): Promise<ResealCount[]> {
    const shops = (
      await this.db.query<{ id: string }>('SELECT id FROM control.tenants ORDER BY id')
    ).rows;
    const counts: ResealCount[] = [];
    for (const column of this.columns) {
      const count: ResealCount = {
        column: `${column.table}.${column.column}`,
        current: 0,
        resealed: 0,
        unreadable: [],
      };
      if (column.perShop) {
        for (const shop of shops) await this.inTransaction(column, count, shop.id);
      } else {
        await this.inTransaction(column, count, null);
      }
      counts.push(count);
    }
    return counts;
  }

  private async inTransaction(
    column: SealedColumn,
    count: ResealCount,
    shopId: string | null,
  ): Promise<void> {
    await this.db.query('BEGIN');
    try {
      if (shopId !== null)
        await this.db.query("SELECT set_config('app.tenant_id', $1, true)", [shopId]);
      await this.resealIn(column, count);
      await this.db.query('COMMIT');
    } catch (error) {
      await this.db.query('ROLLBACK');
      throw error;
    }
  }

  private async resealIn(column: SealedColumn, count: ResealCount): Promise<void> {
    const owner =
      'tenantColumn' in column.owner
        ? `${column.owner.tenantColumn}::text`
        : `'${column.owner.fixed}'`;
    const rows = await this.db.query<{ at: string; owner: string; sealed: Buffer }>(
      `SELECT ctid::text AS at, ${owner} AS owner, ${column.column} AS sealed
       FROM ${column.table} WHERE ${column.column} IS NOT NULL FOR UPDATE`,
    );
    for (const row of rows.rows) {
      if (this.box.sealedWithCurrent(row.sealed)) {
        count.current += 1;
        continue;
      }
      let plain: string;
      try {
        plain = this.box.open(row.sealed, column.purpose, row.owner);
      } catch (error) {
        if (!(error instanceof SecretUnreadable)) throw error;
        count.unreadable.push(row.owner);
        continue;
      }
      await this.db.query(`UPDATE ${column.table} SET ${column.column} = $1 WHERE ctid = $2::tid`, [
        this.box.seal(plain, column.purpose, row.owner),
        row.at,
      ]);
      count.resealed += 1;
    }
  }
}
