import type { Transaction } from '@lytronix/db';
import type { PlatformAdEvent } from '../types/platform-ad';

/** MKT-04: where Lytro's once-per-shop ad events are recorded, and the shop owner's phone they are told of by. */
export interface PlatformAdStore {
  /** Records the shop's event in the caller's transaction; true only the first time. */
  claim(tx: Transaction, tenantId: string, event: PlatformAdEvent): Promise<boolean>;
  /** The shop owner's phone (01XXXXXXXXX), or null for an owner enrolled by email alone. */
  ownerPhoneOf(tenantId: string): Promise<string | null>;
}
