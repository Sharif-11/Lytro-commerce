import type { Transaction } from '@lytronix/db';
import type { StaffCredentials, StaffRecord } from '../types/staff';

/** Staff rows of one shop. Every method runs inside the caller's transaction, which carries the tenant context. */
export interface StaffStore {
  /** Runs the work in a transaction with the shop's tenant context set. */
  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T>;
  insertOwner(
    tx: Transaction,
    values: { tenantId: string; phone: string | null; email: string | null; name: string },
  ): Promise<void>;
  lockSeats(tx: Transaction, tenantId: string): Promise<void>;
  listStaff(tx: Transaction, tenantId: string): Promise<StaffRecord[]>;
  countActive(tx: Transaction, tenantId: string): Promise<number>;
  findStaff(tx: Transaction, tenantId: string, userId: string): Promise<StaffRecord | null>;
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
  /** Ends every live session of the staff member (STF-05). */
  revokeSessionsOf(tx: Transaction, userId: string, at: Date): Promise<void>;
}
