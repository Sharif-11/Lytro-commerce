import type { OfferCut, OfferState } from '@lytronix/validators';
import type { ImageView } from './me';

// Mirrors apps/server/src/modules/team/dto/offers.dto.ts (OFFERS-PLAN).

/** A low and high price across the sizes something covers. */
export interface PriceSpan {
  low: string;
  high: string;
}

/** OF-7, OF-16: the other offer that already holds a product or design. */
export interface OfferHolder {
  offerId: string;
  name: string;
}

/** An offer as the Offers list shows it. */
export interface OfferSummary {
  id: string;
  name: string;
  slug: string;
  state: OfferState;
  cut: OfferCut;
  products: number;
  designs: number;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

/** OF-2, OF-9, OF-10: a product or one of its designs in an offer, with its prices. */
export interface OfferItem {
  productId: string;
  designId: string | null;
  name: string;
  designName: string | null;
  designNumber: number | null;
  designCount: number;
  image: ImageView | null;
  active: boolean;
  stockState: string;
  price: PriceSpan | null;
  was: PriceSpan | null;
  offer: PriceSpan | null;
  belowOne: boolean;
  heldBy: OfferHolder | null;
}

export interface Offer extends OfferSummary {
  items: OfferItem[];
}

/** OF-25: a design in the picker. */
export interface OfferPickDesign {
  designId: string;
  name: string;
  number: number;
  image: ImageView | null;
  price: string | null;
  heldBy: OfferHolder | null;
}

/** OF-25: a product in the picker. */
export interface OfferPickProduct {
  productId: string;
  name: string;
  image: ImageView | null;
  price: PriceSpan | null;
  regularPrice: string | null;
  active: boolean;
  stockState: string;
  isCombo: boolean;
  heldBy: OfferHolder | null;
  designs: OfferPickDesign[];
}

export interface OfferPickPage {
  products: OfferPickProduct[];
  more: boolean;
}

/** What an offer holds as the requests send it: a product whole (`designId` null) or one of its designs. */
export interface OfferPick {
  productId: string;
  designId: string | null;
}
