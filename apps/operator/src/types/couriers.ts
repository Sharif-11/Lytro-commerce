import type {
  RetireState,
  CourierAreaMatch,
  CourierBlockReason,
  CourierCallAction,
  CourierKey,
} from '@lytronix/validators';

// Mirrors the operator's courier routes (OPERATOR-CONSOLE-DESIGN §10b, Phase 6 Slices 6.4, 6.6 and 6.7). Times are ISO strings.

/** GET /operator/couriers (CRR-23): a courier as the platform holds it, and how many shops lean on it. */
export interface OperatorCourier {
  key: CourierKey;
  name: string;
  state: RetireState;
  suggestedKey: CourierKey | null;
  retiringSince: string | null;
  removedAt: string | null;
  /** Shops connected to it, shops whose default it is, and their parcels with it still on their way. */
  shops: number;
  defaultFor: number;
  onTheirWay: number;
}

/** POST /operator/couriers/:key/retire: how many shops were told, and whose defaults moved. */
export interface CourierRetired {
  courier: OperatorCourier;
  told: number;
  defaultsMoved: number;
}

/** POST /operator/couriers/:key/undo-retire. */
export interface CourierRetireUndone {
  courier: OperatorCourier;
  told: number;
}

/** POST /operator/couriers/:key/remove. */
export interface CourierRemoved {
  courier: OperatorCourier;
  disconnected: number;
}

/** CRR-24: one order that holds a courier back from removal, and why. */
export interface CourierBlockingOrder {
  tenantId: string;
  shopName: string;
  slug: string;
  orderId: string;
  orderNumber: string | null;
  reason: CourierBlockReason;
  /** The courier's own last status, for a parcel on its way. */
  courierStatus: string | null;
  /** For a delivered parcel waiting for its payout, when its courier reported it finished, and when it stops waiting. */
  finishedAt: string | null;
  waitsUntil: string | null;
}

/** GET /operator/couriers/:key/blocking. `orders` holds at most the first 200; `total` counts them all. */
export interface CourierBlocking {
  courierKey: CourierKey;
  total: number;
  orders: CourierBlockingOrder[];
}

/** CUS-10: one of a courier's own areas. */
export interface CourierArea {
  id: string;
  courierKey: CourierKey;
  areaCode: string;
  name: string;
  districtName: string;
  postCode: string | null;
  zillaId: number | null;
  thanaId: number | null;
  suggestedThanaId: number | null;
  match: CourierAreaMatch;
  retiredAt: string | null;
}

/** How many areas each filter lists. */
export interface CourierAreaCounts {
  all: number;
  suggested: number;
  unassigned: number;
  assigned: number;
  retired: number;
}

/** GET /operator/courier-areas: a page of areas, the chips' counts, when the list was read, and Lytro's token. */
export interface CourierAreaPage {
  areas: CourierArea[];
  page: number;
  limit: number;
  total: number;
  pages: number;
  counts: CourierAreaCounts;
  lastReadAt: string | null;
  tokenSet: boolean;
}

/** POST /operator/courier-areas/refresh. */
export interface CourierAreaRefresh {
  listed: number;
  added: number;
  renamed: number;
  retired: number;
  back: number;
}

/** GET /operator/locations (CUS-08): a thana as the shops' address forms name it. */
export interface LocationThana {
  id: number;
  nameEn: string;
  nameBn: string;
}

export interface LocationZilla {
  id: number;
  nameEn: string;
  nameBn: string;
  thanas: LocationThana[];
}

/** SEC-11: one use of a shop's courier keys, never the keys. */
export interface CourierKeyUse {
  courierKey: CourierKey;
  action: CourierCallAction;
  connectionId: string | null;
  orderId: string | null;
  orderNumber: string | null;
  succeeded: boolean;
  at: string;
}

export interface CourierKeyUsePage {
  uses: CourierKeyUse[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}
