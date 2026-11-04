import type {
  CourierParcelPatch,
  NewCourierCredentialUse,
  NewCourierParcel,
  SelectCourierConnection,
  SelectCourierCredentialUse,
  SelectCourierParcel,
  Transaction,
} from '@lytronix/db';
import type { CourierConnectionState, CourierKey } from '@lytronix/validators';

/** Phase 6 Slice 6.1: each shop's courier connections, its parcels and the log of its credentials' uses. */
export interface CourierStore {
  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T>;
  /** The shops the minute pass goes through. */
  listShopIds(): Promise<string[]>;
  listConnections(tx: Transaction, tenantId: string): Promise<SelectCourierConnection[]>;
  findConnection(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey,
  ): Promise<SelectCourierConnection | null>;
  findDefaultConnection(tx: Transaction, tenantId: string): Promise<SelectCourierConnection | null>;
  saveConnection(
    tx: Transaction,
    tenantId: string,
    values: {
      courierKey: CourierKey;
      credentials: Buffer;
      isDefault: boolean;
      state: CourierConnectionState;
    },
    now: Date,
  ): Promise<SelectCourierConnection>;
  deleteConnection(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey,
  ): Promise<SelectCourierConnection | null>;
  setDefaultConnection(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey,
    now: Date,
  ): Promise<SelectCourierConnection | null>;
  insertParcel(
    tx: Transaction,
    tenantId: string,
    values: NewCourierParcel,
  ): Promise<SelectCourierParcel>;
  liveParcel(
    tx: Transaction,
    tenantId: string,
    orderId: string,
  ): Promise<SelectCourierParcel | null>;
  lockParcel(
    tx: Transaction,
    tenantId: string,
    parcelId: string,
  ): Promise<SelectCourierParcel | null>;
  updateParcel(
    tx: Transaction,
    tenantId: string,
    parcelId: string,
    patch: CourierParcelPatch,
    now: Date,
  ): Promise<SelectCourierParcel>;
  countCancelled(tx: Transaction, tenantId: string, orderId: string): Promise<number>;
  serialsInFlight(
    tx: Transaction,
    tenantId: string,
    orderId: string,
    serials: string[],
  ): Promise<boolean>;
  dueForPass(
    tx: Transaction,
    tenantId: string,
    stuckBefore: Date,
    now: Date,
    limit: number,
  ): Promise<SelectCourierParcel[]>;
  /** SEC-11: runs on its own, so the log failing never touches the call it records. */
  recordUse(tenantId: string, use: NewCourierCredentialUse): Promise<void>;
  listUses(
    tenantId: string,
    page: { offset: number; limit: number },
  ): Promise<{ rows: SelectCourierCredentialUse[]; total: number }>;
  deleteAllForTenant(tenantId: string): Promise<void>;
}
