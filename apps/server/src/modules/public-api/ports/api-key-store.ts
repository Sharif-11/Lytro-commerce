import type { AddonUnits, CyclePackFields, TenantTotal, Transaction } from '@lytronix/db';
import type {
  ApiKeyRecord,
  ApiShopRow,
  ApiUsageCounts,
  ApiUsageDay,
  ApiUsageRow,
  NewApiKey,
} from '../types/public-api';

/**
 * API-01 to API-05, API-08, API-23, PLN-11: a shop's API keys, and what the public API reads about the shop a key
 * belongs to. Writes take the caller's transaction; the public API's reads use their own connection.
 */
export interface ApiKeyStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  insert(tx: Transaction, row: NewApiKey): Promise<ApiKeyRecord>;
  listForTenant(tenantId: string): Promise<ApiKeyRecord[]>;
  findForTenant(tx: Transaction, tenantId: string, id: string): Promise<ApiKeyRecord | null>;
  /** API-02: the shop's live keys, counted under a lock on its keys. */
  lockAndCountLive(tx: Transaction, tenantId: string, now: Date): Promise<number>;
  update(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: { name?: string; websites?: string[] },
  ): Promise<ApiKeyRecord | null>;
  revoke(
    tx: Transaction,
    tenantId: string,
    id: string,
    by: string | null,
    at: Date,
  ): Promise<ApiKeyRecord | null>;
  /** SFT-11: the shop's live storefront key, with its sealed value. */
  findStorefrontKey(tenantId: string): Promise<ApiKeyRecord | null>;
  /** SFT-11: the storefront key, or null when another request made the shop's first a moment before. */
  insertStorefrontKey(row: NewApiKey): Promise<ApiKeyRecord | null>;
  findByHash(keyHash: string): Promise<ApiKeyRecord | null>;
  touchLastUsed(id: string, at: Date): Promise<void>;
  isOriginRegistered(origin: string, now: Date): Promise<boolean>;
  /** The shop, and its overrides (PLN-11), for the public API. */
  findShop(tenantId: string): Promise<ApiShopRow | null>;
  listOverrides(tenantId: string): Promise<{ limitKey: string; value: unknown }[]>;
  /** PLN-13: the shop's active limit add-ons, limit by limit. */
  listAddonUnits(tenantId: string): Promise<AddonUnits[]>;
  deleteAllForTenant(tenantId: string): Promise<void>;
}

/** RTE-03, D3-2: each shop's requests per billing cycle, kept in PostgreSQL. */
export interface ApiUsageStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  /** Adds the counts to the cycle's and its requests to `day`'s (YYYY-MM-DD, Asia/Dhaka). */
  add(
    tx: Transaction,
    tenantId: string,
    cycleStart: Date,
    counts: ApiUsageCounts,
    day: string,
  ): Promise<ApiUsageRow>;
  find(tenantId: string, cycleStart: Date): Promise<ApiUsageRow | null>;
  /** The cycle's days in order; together they total its requests. */
  listDays(tenantId: string, cycleStart: Date): Promise<ApiUsageDay[]>;
  setWarned(tx: Transaction, tenantId: string, cycleStart: Date, percent: number): Promise<void>;
  setFastSpendAlerted(tx: Transaction, tenantId: string, cycleStart: Date, at: Date): Promise<void>;
  /** RTE-11: changes the cycle's warning or pack figures. */
  updateCycle(
    tx: Transaction,
    tenantId: string,
    cycleStart: Date,
    values: Partial<CyclePackFields & { warnedPercent: number }>,
  ): Promise<void>;
  /** RTE-11: the shop's cycle, made at nothing used if it has none yet, locked for a change to its packs. */
  lockCycle(tx: Transaction, tenantId: string, cycleStart: Date): Promise<ApiUsageRow>;
  /** RTE-11: the request packs the shop bought, and what its cycles took from them -- in `tx` when given. */
  packsBought(tenantId: string, tx?: Transaction): Promise<number>;
  packsTaken(tenantId: string, tx?: Transaction): Promise<number>;
}

/** One shop's total, or 0 when it has none. */
export function totalOf(rows: readonly TenantTotal[]): number {
  return rows[0]?.units ?? 0;
}
