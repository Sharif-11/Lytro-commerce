import type {
  CourierConnectionState,
  CourierKey,
  CourierMessagesState,
  CourierNewsSource,
  ParcelAttention,
  ParcelReading,
  ParcelState,
} from '@lytronix/validators';

// Mirrors apps/server/src/modules/couriers/services (Phase 6, TENANT-DASHBOARD-DESIGN §7.39). Times are ISO strings, amounts decimal
// strings in taka. Every courier is shown by its name, never a logo.

/** GET /couriers/adapters (CRR-01): a courier the shop may connect, and what it asks for and does. */
export interface CourierAdapter {
  key: CourierKey;
  name: string;
  credentialFields: string[];
  needsArea: boolean;
  /** An order needs a thana before this courier can book it. */
  needsThana: boolean;
  /** Its bookings leave from one store, chosen for the connection (Slice 6.3). */
  hasStores: boolean;
  takesWeight: boolean;
  /** D6-8: cancelled from Lytro; otherwise staff confirm they did it in its panel. */
  canCancel: boolean;
  /** CRR-23: being retired; listed only for a shop already connected to it. */
  retiring: boolean;
}

/** GET /couriers/connections (CRR-03): a connection as anyone sees it, never its keys. */
export interface CourierConnection {
  courierKey: CourierKey;
  name: string;
  isDefault: boolean;
  hasCredentials: true;
  /** A refused Pathao login is `login_refused` (Slice 6.3). */
  state: CourierConnectionState;
  connectedAt: string;
  /** CRR-02, D6-3: arriving, none yet, or arriving without the token. */
  messages: CourierMessagesState;
  lastMessageAt: string | null;
  /** CRR-15 (Slice 6.7): the night check found news no message brought; null once a message has come since. */
  messagesMissedAt: string | null;
  pickupStore: { id: string; name: string } | null;
  /** CRR-23, CRR-25 (Slice 6.6): being retired, and the courier the operator suggests instead. */
  retiring: boolean;
  suggestedKey: CourierKey | null;
  /** Slice 6.6: when the shop was told its retiring was undone; kept for 7 days, null while it is retiring again. */
  backSince: string | null;
  /** D6-11: a lost answer is asked again by the order's number (Steadfast today); else staff settle it from the panel. */
  asksByOrderNumber: boolean;
}

/** What to paste into the courier's panel: Lytro's own address and token (CRR-02). */
export interface MessageAddress {
  address: string;
  token: string;
}

/** POST /couriers/connections: the connection, and the address to paste. */
export type CourierConnected = CourierConnection & { message: MessageAddress };

/** GET /couriers/connections/:key/stores (Slice 6.3). */
export interface PickupStore {
  id: string;
  name: string;
  address: string | null;
  active: boolean;
}

/** GET /couriers/:key/areas (CUS-12): the thana's areas first, then the district's matching the search. */
export interface CourierAreaChoice {
  areaCode: string;
  name: string;
  /** A match the operator hasn't confirmed: "likely". */
  suggested: boolean;
}

/** One piece of a parcel's news, newest first, in the courier's words (CRR-12). */
export interface ParcelNews {
  source: CourierNewsSource;
  rawStatus: string | null;
  message: { en: string | null; bn: string | null };
  at: string;
}

/** An order's parcel, as GET /orders/:id gives it (CRR-06 to CRR-18, CRR-29). */
export interface OrderParcel {
  courierKey: CourierKey;
  state: ParcelState;
  invoice: string;
  consignmentId: string | null;
  trackingCode: string | null;
  courierStatus: string | null;
  cod: string;
  note: string | null;
  weightKg: string | null;
  areaCode: string | null;
  deliveryCharge: string | null;
  /** Its courier's own short words, when it refused. */
  refusal: string | null;
  /** The order has taken it: moved, counted, charged and its stock out. */
  settled: boolean;
  /** The message key of a stock problem staff must clear (Try again). */
  settleProblem: string | null;
  createdAt: string;
  reading: ParcelReading | null;
  cashCollected: string | null;
  codAtCourier: string | null;
  lastNewsAt: string | null;
  /** D6-4: 30 days with no change stopped the checks; Sync starts them again. */
  noNews: boolean;
  attention: ParcelAttention | null;
  /** CRR-17 (Slice 6.5): when its courier said it paid the shop for it, and the payout that did where it named one. */
  paidAt: string | null;
  payoutId: string | null;
  news: ParcelNews[];
}

/** Slice 6.7: where an order's live parcel stands, on its list row. */
export interface OrderListParcel {
  courierKey: CourierKey;
  state: ParcelState;
  reading: ParcelReading | null;
}

/** GET /couriers/payouts (CRR-17): a payout a courier made the shop, its figures as the courier gave them. */
export interface CourierPayout {
  id: string;
  courierKey: CourierKey;
  payoutId: string;
  amount: string;
  charges: string | null;
  total: string | null;
  method: string | null;
  paidAt: string;
  madeAt: string | null;
  /** How many parcels it settled, and how many of those Lytro booked. */
  parcels: number;
  ours: number;
}

export interface CourierPayoutPage {
  payouts: CourierPayout[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

/** One of the shop's orders a payout settled; no courier gives an amount for one parcel. */
export interface CourierPayoutOrder {
  orderId: string;
  orderNumber: string | null;
  cod: string;
  cashCollected: string | null;
  deliveryCharge: string | null;
  reading: ParcelReading | null;
}

/** GET /couriers/payouts/:id. */
export type CourierPayoutDetail = CourierPayout & { orders: CourierPayoutOrder[] };
