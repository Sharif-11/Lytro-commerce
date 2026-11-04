import type { CourierKey } from '@lytronix/validators';

/** CRR-03, SEC-09: the account a call runs on, its credentials opened only for the call. */
export interface CourierAccount {
  tenantId: string;
  connectionId: string;
  credentials: Readonly<Record<string, string>>;
}

/**
 * D6-14, CRR-30: what a courier takes. Booking checks an order against these before sending, so a courier never receives a value
 * it would cut or refuse. Lengths are in characters; a `phoneDigits` courier takes a local mobile number of exactly that length.
 */
export interface CourierLimits {
  invoiceMax: number;
  nameMin?: number;
  nameMax: number;
  phoneDigits: number;
  addressMin?: number;
  addressMax: number;
  noteMax: number;
  /** A courier that takes a weight needs one; null for one that doesn't take it (ATR-13, CMB-07). */
  weightKg: { min: number; max: number } | null;
}

/** CRR-06: one parcel as sent to a courier. */
export interface ParcelBooking {
  invoice: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  cod: string;
  note: string | null;
  weightKg: string | null;
  areaCode: string | null;
}

/** CRR-06: a parcel the courier accepted. */
export interface AcceptedParcel {
  consignmentId: string;
  trackingCode: string | null;
  courierStatus: string | null;
  deliveryCharge: string | null;
}

/**
 * CRR-07, SEC-16 as amended: the courier said no. `message` is the one short field it refuses with, as plain text; null when it
 * sent none that could be read. `login` says the refusal was of the credentials, not of this parcel.
 */
export interface CourierRefusal {
  message: string | null;
  login: boolean;
}

export type BookingAnswer =
  { outcome: 'accepted'; parcel: AcceptedParcel } | { outcome: 'refused'; refusal: CourierRefusal };

/** D6-11: what asking by our own number found. A courier that can't name the parcel's IDs here leaves them null. */
export type LookUpAnswer =
  | {
      outcome: 'found';
      consignmentId: string | null;
      trackingCode: string | null;
      courierStatus: string | null;
    }
  | { outcome: 'not_found' };

export type CancelAnswer =
  { outcome: 'cancelled' } | { outcome: 'refused'; refusal: CourierRefusal };

export type ConnectionAnswer =
  { outcome: 'accepted' } | { outcome: 'refused'; refusal: CourierRefusal };

/**
 * CRR-18: the courier gave no answer that can be read: a timeout, a lost connection, a server error or a page. The call may have
 * worked, so a booking stays unknown and is never retried blindly. It counts toward the circuit (PRF-05).
 */
export class CourierNoAnswer extends Error {
  constructor(reason: string) {
    super(`the courier gave no readable answer: ${reason}`);
    this.name = 'CourierNoAnswer';
  }
}

/**
 * CRR-01, §3.6 (Phase 6 Slice 6.1): a courier, as a plugin registered by its key. It declares its fields, its limits and what it can
 * do; shared code never asks which courier it is. A refusal is an answer, returned; `CourierNoAnswer` is thrown. An adapter
 * never logs a credential or a whole reply. Each one runs the contract suite before it is enabled (CRR-21).
 */
export interface CourierAdapter {
  readonly key: CourierKey;
  /** As shown on the order, and in the ship sheet's chips. */
  readonly name: string;
  readonly credentialFields: readonly string[];
  readonly limits: CourierLimits;
  /** D6-5, CRR-10: it can't book without one of its own areas. */
  readonly needsArea: boolean;
  /** WAL-13's way: checks the credentials without creating a parcel. */
  testConnection(account: CourierAccount): Promise<ConnectionAnswer>;
  /** CRR-06, CRR-18: one attempt; never retried here or by a caller. */
  book(account: CourierAccount, booking: ParcelBooking): Promise<BookingAnswer>;
  /** The courier's own tracking page for a code, where it has one. */
  trackingLink(trackingCode: string): string | null;
  /** D6-11: asks by our own number, for a courier that can. */
  lookUp?(account: CourierAccount, invoice: string): Promise<LookUpAnswer>;
  /** D6-8: calls off a booked parcel, for a courier that can; otherwise staff confirm they did it in its panel. */
  cancel?(account: CourierAccount, consignmentId: string): Promise<CancelAnswer>;
}
