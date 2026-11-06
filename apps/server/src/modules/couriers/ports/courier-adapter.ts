import type { CourierKey, ParcelReading } from '@lytronix/validators';

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
  /** §3.6: how fast one connection may be asked after its parcels, kept well under what the courier allows. */
  callsPerMinute: number;
  /** Slice 6.3, read agreed 2026-11-05: it takes no paisa, so it is asked for the next whole taka up. */
  wholeTakaCod?: boolean;
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
  /** The order's items added up, which may not be whole: 1.5 kg of one thing is 1.5. */
  quantity: string;
  /** CUS-12: the area's name as the courier lists it, beside its code; null for a courier with no areas. */
  areaName: string | null;
  /** Read agreed 2026-11-06: what the goods are worth on the order, before the delivery charge, for a courier that asks. */
  goodsValue: string;
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

/** CRR-12, CRR-13, CRR-29 (Slice 6.2): one piece of news as an adapter read it, whichever way it came. */
export interface CourierNews {
  /** The courier's own key for this delivery where it sends one, otherwise worked out from what identifies it. */
  dedupeKey: string;
  event: string;
  /** It says where the parcel stands; other events show and move nothing. */
  statusEvent: boolean;
  /** Read agreed 2026-11-05: its words may show on the shopper's tracking. */
  forShopper: boolean;
  consignmentId: string | null;
  invoice: string | null;
  rawStatus: string | null;
  /** Null for a status the adapter doesn't recognise, which shows and moves nothing, and is logged. */
  reading: ParcelReading | null;
  messageEn: string | null;
  messageBn: string | null;
  cashCollected: string | null;
  deliveryCharge: string | null;
  /** The COD as changed in the courier's own panel. */
  codAtCourier: string | null;
  happenedAt: Date | null;
  /** CRR-12, CRR-17 (Slice 6.5): it says the courier paid the shop for the parcel, which moves nothing else. */
  paid: boolean;
  /** The payout or invoice it was paid in, where the courier names one. */
  payoutId: string | null;
}

/** A message's headers, as they arrived. */
export type MessageHeaders = Record<string, string | string[] | undefined>;

/** CRR-14, CRR-15: what asking where a parcel stands found. */
export type TrackAnswer =
  | { outcome: 'found'; news: CourierNews }
  | { outcome: 'not_found' }
  | { outcome: 'refused'; refusal: CourierRefusal };

export type CancelAnswer =
  { outcome: 'cancelled' } | { outcome: 'refused'; refusal: CourierRefusal };

export type ConnectionAnswer =
  { outcome: 'accepted' } | { outcome: 'refused'; refusal: CourierRefusal };

/** Slice 6.3, read agreed 2026-11-05: what a login left to keep, in place of what the owner typed. */
export type LogInAnswer =
  | { outcome: 'accepted'; credentials: Record<string, string> }
  | { outcome: 'refused'; refusal: CourierRefusal };

/** Slice 6.3: a store a courier lists for an account. */
export interface PickupStore {
  id: string;
  name: string;
  address: string | null;
  active: boolean;
}

export type StoresAnswer =
  { outcome: 'found'; stores: PickupStore[] } | { outcome: 'refused'; refusal: CourierRefusal };

/** CUS-10 (Slice 6.4): one of a courier's own areas, as its list gives it. */
export interface ListedArea {
  areaCode: string;
  name: string;
  districtName: string;
  postCode: string | null;
}

export type AreasAnswer =
  { outcome: 'found'; areas: ListedArea[] } | { outcome: 'refused'; refusal: CourierRefusal };

/** CRR-17 (Slice 6.5): one payout as a courier lists it, its figures as the courier gives them. */
export interface ListedPayout {
  payoutId: string;
  amount: string;
  charges: string | null;
  total: string | null;
  method: string | null;
  /** Only a payout the courier says is paid is read; one still being made up is listed again later. */
  paid: boolean;
  paidAt: Date | null;
  /** When the courier made it up. */
  madeAt: Date | null;
}

export type PayoutsAnswer =
  { outcome: 'found'; payouts: ListedPayout[] } | { outcome: 'refused'; refusal: CourierRefusal };

/** CRR-17 (Slice 6.5): a parcel a payout settled, by the courier's number and ours; no courier gives an amount for one. */
export interface PaidParcel {
  consignmentId: string | null;
  invoice: string | null;
}

export type PayoutAnswer =
  | { outcome: 'found'; parcels: PaidParcel[] }
  | { outcome: 'not_found' }
  | { outcome: 'refused'; refusal: CourierRefusal };

/** Slice 6.3, read agreed 2026-11-05: the one store chosen for a connection, kept with its sealed credentials. */
export const PICKUP_STORE_ID = 'storeId';
export const PICKUP_STORE_NAME = 'storeName';

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
  /** D6-5, read agreed 2026-11-05: it reads the area from the address, and without a thana it silently reads Dhaka. */
  readonly needsThana: boolean;
  /** WAL-13's way: checks the credentials without creating a parcel. */
  testConnection(account: CourierAccount): Promise<ConnectionAnswer>;
  /** CRR-06, CRR-18: one attempt; never retried here or by a caller. */
  book(account: CourierAccount, booking: ParcelBooking): Promise<BookingAnswer>;
  /** The courier's own tracking page for a code, where it has one. */
  trackingLink(trackingCode: string): string | null;
  /** D6-11: asks by our own number, for a courier that can. */
  lookUp?(account: CourierAccount, invoice: string): Promise<LookUpAnswer>;
  /** CRR-14, CRR-15: where one parcel stands; a change it finds takes the same path as a message. */
  track(
    account: CourierAccount,
    parcel: { consignmentId: string | null; invoice: string },
  ): Promise<TrackAnswer>;
  /** CRR-11: this courier's own proof that a message came from it, against the token the owner pasted. */
  verifyMessage(token: string, rawBody: Buffer, headers: MessageHeaders): boolean;
  /** CRR-12, CRR-13: what a verified message says; null if it can't be read. */
  readMessage(rawBody: Buffer, headers: MessageHeaders): CourierNews | null;
  /** D6-8: calls off a booked parcel, for a courier that can; otherwise staff confirm they did it in its panel. */
  cancel?(account: CourierAccount, consignmentId: string): Promise<CancelAnswer>;
  /** Slice 6.3: for a courier that logs in, turns what the owner typed into what is kept. Without it, what they typed is kept. */
  logIn?(fields: Readonly<Record<string, string>>): Promise<LogInAnswer>;
  /** Slice 6.3: for a courier whose login ends, whether these credentials should be renewed by now. */
  renewalDue?(credentials: Readonly<Record<string, string>>, now: Date): boolean;
  /** Slice 6.3: may work only once, so what it answers must be kept. Shared code holds the connection so no two run together. */
  renewLogin?(account: CourierAccount): Promise<LogInAnswer>;
  /** Slice 6.3: for a courier whose every booking names a store, the stores it lists for this account. */
  pickupStores?(account: CourierAccount): Promise<StoresAnswer>;
  /** Read agreed 2026-11-06: a courier that takes a store but goes without one, using its own default, so booking never waits. */
  readonly storeOptional?: boolean;
  /** CUS-10 (Slice 6.4): for a courier that needs its own area, its whole list; read with Lytro's own account, not a shop's. */
  listAreas?(account: CourierAccount): Promise<AreasAnswer>;
  /** CRR-27: the test a courier sends when its panel adds an address, which moves nothing and so needs no proof. */
  isAddressTest?(rawBody: Buffer): boolean;
  /** CRR-27: headers this courier wants on the answer to its messages. */
  messageAnswerHeaders?(): Record<string, string>;
  /**
   * CRR-17 (Slice 6.5): one page of the payouts a courier lists for an account, for a courier that lists them. Pages count from 1,
   * oldest first, as Steadfast's do; past the last, a page is empty.
   */
  payouts?(account: CourierAccount, page: number): Promise<PayoutsAnswer>;
  /** CRR-17 (Slice 6.5): the parcels one payout settled. */
  payout?(account: CourierAccount, payoutId: string): Promise<PayoutAnswer>;
  /** Slice 6.5: its payout pages hold at least this many, so a shorter one is the last; with no page count, that is how it ends. */
  readonly payoutPageAtLeast?: number;
}
