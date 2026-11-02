import type {
  ListenerShopRow,
  NewListenerDevice,
  SelectListenerDevice,
  SelectListenerPairingCode,
  Transaction,
} from '@lytronix/db';
import type { ListenerRevokeReason } from '@lytronix/validators';

/** LSN-01 to LSN-23 (Slice 5.4a): the listener's pairing codes, devices and Lytro's blocked installations. */
export interface ListenerStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  insertCode(
    tx: Transaction,
    values: { tenantId: string; codeHash: string; createdBy: string | null; expiresAt: Date },
  ): Promise<SelectListenerPairingCode>;
  lockCode(tx: Transaction, codeHash: string): Promise<SelectListenerPairingCode | null>;
  spendCode(tx: Transaction, id: string, at: Date): Promise<void>;
  addTry(tx: Transaction, id: string, max: number, at: Date): Promise<number>;
  countLive(tx: Transaction, tenantId: string): Promise<number>;
  insertDevice(tx: Transaction, values: NewListenerDevice): Promise<SelectListenerDevice>;
  findByTokenHash(tx: Transaction, tokenHash: string): Promise<SelectListenerDevice | null>;
  listForTenant(tx: Transaction, tenantId: string): Promise<SelectListenerDevice[]>;
  findDevice(
    tx: Transaction,
    tenantId: string | null,
    id: string,
    lock: boolean,
  ): Promise<SelectListenerDevice | null>;
  rename(tx: Transaction, id: string, name: string): Promise<SelectListenerDevice>;
  revoke(
    tx: Transaction,
    id: string,
    values: { revokedBy: string | null; reason: ListenerRevokeReason; at: Date },
  ): Promise<SelectListenerDevice>;
  touch(tx: Transaction, id: string, at: Date, appVersion: string): Promise<void>;
  flag(tx: Transaction, id: string): Promise<number>;
  isBlocked(tx: Transaction, installationId: string): Promise<boolean>;
  block(
    tx: Transaction,
    values: { installationId: string; reason: string; blockedBy: string | null },
  ): Promise<boolean>;
  lockLiveForInstallation(tx: Transaction, installationId: string): Promise<SelectListenerDevice[]>;
  shopOf(tx: Transaction, tenantId: string): Promise<ListenerShopRow | null>;
  purge(
    tx: Transaction,
    codesBefore: Date,
    devicesBefore: Date,
  ): Promise<{ codes: number; devices: number }>;
  deleteForTenant(tx: Transaction, tenantId: string): Promise<void>;
}
