import type { Transaction } from '@lytronix/db';
import type {
  ApiKeyRecord,
  ApiShopRow,
  ApiUsageRow,
  NewApiKey,
  RequestQuotaNotice,
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
  findByHash(keyHash: string): Promise<ApiKeyRecord | null>;
  touchLastUsed(id: string, at: Date): Promise<void>;
  isOriginRegistered(origin: string, now: Date): Promise<boolean>;
  /** The shop, and its overrides (PLN-11), for the public API. */
  findShop(tenantId: string): Promise<ApiShopRow | null>;
  listOverrides(tenantId: string): Promise<{ limitKey: string; value: unknown }[]>;
  deleteAllForTenant(tenantId: string): Promise<void>;
}

/** RTE-03, D3-2: each shop's requests per billing cycle, kept in PostgreSQL. */
export interface ApiUsageStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  add(tx: Transaction, tenantId: string, cycleStart: Date, requests: number): Promise<ApiUsageRow>;
  find(tenantId: string, cycleStart: Date): Promise<ApiUsageRow | null>;
  setWarned(tx: Transaction, tenantId: string, cycleStart: Date, percent: number): Promise<void>;
}

/**
 * RTE-03, D3-5: tells the shop its keys have used half, four fifths or nearly all of the cycle's requests, once each.
 * A console stand-in until Phase 7's notification module replaces the adapter; the once-each rule is the quota's.
 */
export interface RequestQuotaNotifier {
  quotaWarning(notice: RequestQuotaNotice): Promise<void>;
}
