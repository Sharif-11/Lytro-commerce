import type { Transaction } from '@lytronix/db';
import type { StaffCredentials, StaffRecord } from '../types/staff';
import type { OwnerContact } from '../types/owner-contact';

/** Staff rows of one shop. Every method runs inside the caller's transaction, which carries the tenant context. */
export interface StaffStore {
  /** Runs the work in a transaction with the shop's tenant context set. */
  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T>;
  /** A transaction that names no shop: only control tables and the person's own staff row are readable (TEN-31). */
  runAcrossShops<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  insertOwner(
    tx: Transaction,
    values: { tenantId: string; phone: string | null; email: string | null; name: string },
  ): Promise<void>;
  lockSeats(tx: Transaction, tenantId: string): Promise<void>;
  listStaff(tx: Transaction, tenantId: string): Promise<StaffRecord[]>;
  countActive(tx: Transaction, tenantId: string): Promise<number>;
  countMustSetPassword(tx: Transaction, tenantId: string): Promise<number>;
  findStaff(tx: Transaction, tenantId: string, userId: string): Promise<StaffRecord | null>;
  findOwner(tx: Transaction, tenantId: string): Promise<StaffRecord | null>;
  findByIds(tx: Transaction, tenantId: string, userIds: string[]): Promise<StaffRecord[]>;
  findCredentialsById(
    tx: Transaction,
    tenantId: string,
    userId: string,
  ): Promise<StaffCredentials | null>;
  setPassword(
    tx: Transaction,
    tenantId: string,
    userId: string,
    passwordHash: string,
    mustSetPassword: boolean,
  ): Promise<void>;
  /** The sign-in details of the shop's staff member with this phone, or null. */
  findCredentialsByPhone(
    tx: Transaction,
    tenantId: string,
    phone: string,
  ): Promise<StaffCredentials | null>;
  /** A phone already used in this shop comes back as UniqueViolation('phone'). */
  insertStaff(
    tx: Transaction,
    values: {
      tenantId: string;
      subscriberId: string;
      phone: string;
      name: string | null;
      passwordHash: string;
    },
  ): Promise<StaffRecord>;
  setActive(
    tx: Transaction,
    tenantId: string,
    userId: string,
    active: boolean,
  ): Promise<StaffRecord | null>;
  /** STF-03: renames the staff member; null clears the name. */
  setName(
    tx: Transaction,
    tenantId: string,
    userId: string,
    name: string | null,
  ): Promise<StaffRecord | null>;
  /** Ends every live session of the staff member (STF-05). */
  revokeSessionsOf(tx: Transaction, userId: string, at: Date): Promise<void>;
  /** LIF-19: deletes every staff row of the shop. Call after RoleStore.deleteAllForTenant (FK order). */
  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void>;
  /** LIF-18/24, PYG-21: the owner's own contact, for a platform-sent notice (never a staff member's). */
  findOwnerContact(tx: Transaction, tenantId: string): Promise<OwnerContact | null>;
  /** TEN-31, AUTH-31: the shop a person is active staff in, and their staff row there, found across shops. */
  findStaffShop(tx: Transaction, subscriberId: string): Promise<StaffShop | null>;
}

/** The shop a person is staff in (at most one, STF-06), their staff row's id, and whether it is still active. */
export interface StaffShop {
  tenantId: string;
  userId: string;
  active: boolean;
}
