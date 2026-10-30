import type { SelectShopper, SelectShopperAddress, SelectShopperCode } from '@lytronix/db';
import type { ThanaView } from '../../delivery/types/delivery';

// The stored rows, as aliases of the shared types (ENGINEERING-STANDARDS §4), never copies.
export type ShopperRecord = SelectShopper;
export type ShopperCodeRecord = SelectShopperCode;
export type ShopperAddressRecord = SelectShopperAddress;

/** CUS-05: a shopper's own account as they see it. */
export interface ShopperView {
  id: string;
  name: string;
  phone: string;
  createdAt: Date;
}

/** CUS-03: a sign-in -- the token the shop's site sends back as X-Shopper-Token, until it expires. */
export interface ShopperSignedIn {
  token: string;
  expiresAt: Date;
  shopper: ShopperView;
}

/** CUS-04: a code sent: how long it works, and when another may be asked for. */
export interface ShopperCodeSent {
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

/** A signed-in shopper, as a route acting for them knows them. */
export interface SignedInShopper {
  sessionId: string;
  shopper: ShopperRecord;
}

/** CUS-06: one saved address. */
export interface ShopperAddressView {
  id: string;
  label: string;
  location: (ThanaView & { zillaId: number }) | null;
  deliveryAddress: string;
  isDefault: boolean;
}
