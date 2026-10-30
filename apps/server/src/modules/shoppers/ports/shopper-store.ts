import type { NewShopperAddress, ShopperPatch, Transaction } from '@lytronix/db';
import type { CustomerRecord } from '../../customers/types/customers';
import type { ShopperAddressRecord, ShopperCodeRecord, ShopperRecord } from '../types/shoppers';

/**
 * CUS-03 to CUS-06, CUS-14: a shop's shoppers, their sign-up codes, sign-ins and saved addresses. Every call is held to
 * the shop it names, so another shop's shopper is never seen.
 */
export interface ShopperStore {
  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T>;
  /** The phone's latest code, held until the transaction ends. */
  latestCode(tx: Transaction, tenantId: string, phone: string): Promise<ShopperCodeRecord | null>;
  /** SMS-11: codes sent since `since`, to one phone or (null) across the shop. */
  countCodesSince(
    tx: Transaction,
    tenantId: string,
    phone: string | null,
    since: Date,
  ): Promise<number>;
  insertCode(
    tx: Transaction,
    tenantId: string,
    values: { phone: string; codeHash: string; expiresAt: Date; createdAt: Date },
  ): Promise<ShopperCodeRecord>;
  recordWrongCode(tx: Transaction, tenantId: string, id: string): Promise<void>;
  useCode(tx: Transaction, tenantId: string, id: string, now: Date): Promise<void>;
  deleteCode(tx: Transaction, tenantId: string, id: string): Promise<void>;
  /** The phone's account, held until the transaction ends. */
  findByPhone(tx: Transaction, tenantId: string, phone: string): Promise<ShopperRecord | null>;
  lock(tx: Transaction, tenantId: string, id: string): Promise<ShopperRecord | null>;
  /** The new account, or null when the phone already has one. */
  insertShopper(
    tx: Transaction,
    tenantId: string,
    values: { phone: string; name: string; passwordHash: string },
  ): Promise<ShopperRecord | null>;
  updateShopper(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: ShopperPatch,
  ): Promise<ShopperRecord>;
  insertSession(
    tx: Transaction,
    tenantId: string,
    values: { shopperId: string; tokenHash: string; expiresAt: Date },
  ): Promise<string>;
  findSession(
    tx: Transaction,
    tenantId: string,
    tokenHash: string,
    now: Date,
  ): Promise<{ sessionId: string; shopper: ShopperRecord } | null>;
  deleteSession(tx: Transaction, tenantId: string, sessionId: string): Promise<void>;
  deleteSessions(
    tx: Transaction,
    tenantId: string,
    shopperId: string,
    keep: string | null,
  ): Promise<void>;
  listAddresses(
    tx: Transaction,
    tenantId: string,
    shopperId: string,
  ): Promise<ShopperAddressRecord[]>;
  insertAddress(
    tx: Transaction,
    tenantId: string,
    shopperId: string,
    values: NewShopperAddress,
  ): Promise<ShopperAddressRecord>;
  updateAddress(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: Partial<NewShopperAddress>,
  ): Promise<void>;
  clearDefault(tx: Transaction, tenantId: string, shopperId: string): Promise<void>;
  deleteAddress(tx: Transaction, tenantId: string, id: string): Promise<void>;
  /** CUS-14: the customer staff opened, to find the account of their phone. */
  findCustomer(tx: Transaction, tenantId: string, id: string): Promise<CustomerRecord | null>;
  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void>;
}
