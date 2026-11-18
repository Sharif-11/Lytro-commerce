import type { StorefrontDesign, StorefrontThemeKey } from '@lytronix/validators';
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
