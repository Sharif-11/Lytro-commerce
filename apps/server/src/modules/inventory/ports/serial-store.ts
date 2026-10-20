import type { Transaction } from '@lytronix/db';
import type { SerialStatus } from '@lytronix/validators';
import type { NewSerial, SerialRecord } from '../types/inventory';

/**
 * INV-14: a shop's serial-numbered units. Serials arrive and leave with their stock through the ledger; this store
 * reads them, adds serials to units already held, and corrects or removes a serial while its unit is in stock. A
 * serial a held unit already has comes back as UniqueViolation('serial').
 */
export interface SerialStore {
  countHeld(tx: Transaction, tenantId: string, variantIds: string[]): Promise<Map<string, number>>;
  /** A variant's held serials, locked; lock the variant's level first. */
  lockHeld(tx: Transaction, tenantId: string, variantId: string): Promise<SerialRecord[]>;
  findHeld(tx: Transaction, tenantId: string, serials: string[]): Promise<SerialRecord[]>;
  insertSerials(tx: Transaction, tenantId: string, rows: NewSerial[]): Promise<void>;
  /** These units left by this movement: sold to the order named, or written off when none is. */
  markLeft(
    tx: Transaction,
    tenantId: string,
    ids: string[],
    movementId: number,
    soldOrderId: string | null,
  ): Promise<void>;
  /** INV-17: these sold units came back; each returns as a new in-stock serial, the sold row kept as history. */
  markReturned(tx: Transaction, tenantId: string, ids: string[]): Promise<void>;
  listSerials(
    tx: Transaction,
    tenantId: string,
    variantId: string,
    status: SerialStatus | null,
    page: { offset: number; limit: number },
  ): Promise<{ rows: SerialRecord[]; total: number }>;
  listForMovements(
    tx: Transaction,
    tenantId: string,
    movementIds: number[],
  ): Promise<SerialRecord[]>;
  findSerial(tx: Transaction, tenantId: string, id: string): Promise<SerialRecord | null>;
  updateSerial(tx: Transaction, tenantId: string, id: string, serial: string): Promise<void>;
  deleteSerial(tx: Transaction, tenantId: string, id: string): Promise<void>;
  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void>;
}
