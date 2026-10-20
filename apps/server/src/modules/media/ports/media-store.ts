import type { Transaction } from '@lytronix/db';
import type { MediaKind, PlanLimits } from '@lytronix/validators';
import type {
  MediaObjectRecord,
  MediaOutcome,
  MediaRecord,
  MediaUses,
  NewMedia,
  NewMediaObject,
} from '../types/media';

/** MED-03, MED-04, STO-01, TEN-16: a shop's media rows, their stored files, where they are attached, and its logo. */
export interface MediaStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  insertMedia(tx: Transaction, tenantId: string, row: NewMedia): Promise<MediaRecord>;
  findMedia(tx: Transaction, tenantId: string, id: string): Promise<MediaRecord | null>;
  lockMedia(tx: Transaction, tenantId: string, id: string): Promise<MediaRecord | null>;
  markProcessing(tx: Transaction, tenantId: string, id: string): Promise<boolean>;
  finish(tx: Transaction, tenantId: string, id: string, outcome: MediaOutcome): Promise<void>;
  insertObjects(tx: Transaction, tenantId: string, rows: NewMediaObject[]): Promise<void>;
  listObjects(tx: Transaction, tenantId: string, mediaIds: string[]): Promise<MediaObjectRecord[]>;
  storedBytes(tx: Transaction, tenantId: string): Promise<number>;
  /** STO-03: one writer at a time weighs the shop's storage against its limit. */
  lockStorage(tx: Transaction, tenantId: string): Promise<void>;
  /** PLN-11: the shop's plan snapshot and its overrides, for its storage limit. */
  planLimits(
    tx: Transaction,
    tenantId: string,
  ): Promise<{ snapshot: PlanLimits | null; overrides: { limitKey: string; value: unknown }[] }>;
  listReady(
    tx: Transaction,
    tenantId: string,
    filter: { kind: MediaKind | null; offset: number; limit: number },
  ): Promise<{ rows: MediaRecord[]; total: number }>;
  usesOf(tx: Transaction, tenantId: string, id: string): Promise<MediaUses>;
  /** Deletes the item; the keys of its stored files, for the deletion job. */
  deleteMedia(tx: Transaction, tenantId: string, id: string): Promise<string[]>;
  targetExists(
    tx: Transaction,
    tenantId: string,
    target: { kind: 'product' | 'category' | 'option'; id: string },
  ): Promise<boolean>;
  shopLogo(tx: Transaction, tenantId: string): Promise<string | null>;
  /** TEN-16: sets the logo; a media id that is not a ready image of the shop's is refused as MediaNotAttachable. */
  setShopLogo(tx: Transaction, tenantId: string, mediaId: string | null): Promise<void>;
  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void>;
}
