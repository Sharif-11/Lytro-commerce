import type {
  StockState,
  StorefrontCardMode,
  StorefrontDesign,
  StorefrontThemeKey,
} from '@lytronix/validators';
import type { ImageView } from './me';

// STOREFRONT-BUILDER-PLAN SB-12, SB-16: the storefront design editor's read, as the server answers it
// (GET /storefront/design, API-CONTRACT).

/** A category or product the design names, as it is now; `shown` is whether shoppers can reach it. */
export interface DesignTarget {
  id: string;
  slug: string;
  name: string;
  shown: boolean;
}

export interface StorefrontEditor {
  /** The draft, else the live design, else the shop type's starting design (SB-11). */
  design: StorefrontDesign;
  /** What shoppers see now, so Publish can say what changes. */
  live: StorefrontDesign;
  startingTheme: StorefrontThemeKey;
  hasDraft: boolean;
  isPublished: boolean;
  canGoBack: boolean;
  draftSavedAt: string | null;
  publishedAt: string | null;
  /** The design's photos that are still ready, by media ID. */
  images: Record<string, ImageView>;
  categories: DesignTarget[];
  products: DesignTarget[];
  /** The sections naming a photo, category or product that is gone or hidden. */
  broken: string[];
}

/** SB-12: a short-lived link to the draft. */
export interface PreviewLink {
  token: string;
  expiresAt: string;
}

/** DC-6, DC-8: one card of the shop as the Product list shows it (GET /storefront/design/cards). */
export interface StorefrontCard {
  productId: string;
  /** The design it shows; null for a product's own card. */
  designId: string | null;
  name: string;
  /** For the seller's eyes: the design's name and number. */
  designName: string | null;
  designNumber: number | null;
  price: string | null;
  stockState: StockState;
  /** False for a hidden product: not in the shop, but kept in its place. */
  active: boolean;
  image: ImageView | null;
  placed: boolean;
  /** Whether it shows in the shop under its product's way. */
  shown: boolean;
  /** Its product's way, for a product with designs to spread; null otherwise. */
  mode: StorefrontCardMode | null;
}

/** DC-2, DC-6: the switch, and every card that could show, in the shop's default order. */
export interface StorefrontCards {
  designCards: boolean;
  cards: StorefrontCard[];
}
