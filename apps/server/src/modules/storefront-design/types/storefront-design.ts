import type {
  SelectStorefrontDesign,
  StorefrontSaleSummary,
  StorefrontTargetRow,
} from '@lytronix/db';
import type { StorefrontDesign, StorefrontSection, StorefrontThemeKey } from '@lytronix/validators';
import type { ImageView } from '../../../common/media-links';

// The stored rows, as aliases of the shared types (ENGINEERING-STANDARDS §4), never copies.
export type StorefrontDesignRecord = SelectStorefrontDesign;
export type StorefrontTarget = StorefrontTargetRow;
export type StorefrontSale = StorefrontSaleSummary;

/** SB-16: a category or product a design's link or row names, as shoppers reach it. */
export interface StorefrontTargetView {
  id: string;
  slug: string;
  name: string;
}

/** SB-12, SB-16: the editor's read -- the design it edits, where it stands, and what it shows and points at. */
export interface StorefrontEditorView {
  /** The draft, else the live design, else the shop type's starting design (SB-11). */
  design: StorefrontDesign;
  /** SB-12: what shoppers see now -- the live design, else the starting one -- so Publish can say what changes. */
  live: StorefrontDesign;
  /** SB-11: the theme the shop's type starts on. */
  startingTheme: StorefrontThemeKey;
  /** There are changes not yet published. */
  hasDraft: boolean;
  /** A design of the shop's own is live; false while shoppers see the starting design. */
  isPublished: boolean;
  /** SB-12: "Back to the previous design" has one to go back to. */
  canGoBack: boolean;
  draftSavedAt: string | null;
  publishedAt: string | null;
  /** The design's photos that are still ready images of the shop's, by media ID. */
  images: Record<string, ImageView>;
  /** SB-16: the categories and products the design names that the shop still has, each with whether it shows. */
  categories: (StorefrontTargetView & { shown: boolean })[];
  products: (StorefrontTargetView & { shown: boolean })[];
  /** SB-16: the sections naming a photo, category or product that is gone or hidden, which the editor marks. */
  broken: string[];
}

/** SB-14: the design shoppers see, as `/v1/shop` sends it, with what it names resolved. */
export interface PublicStorefrontDesign {
  theme: StorefrontThemeKey;
  palette: number;
  /** The visible sections, in order. */
  sections: StorefrontSection[];
  /** The photos it names that are still ready images of the shop's, by media ID; a missing one is left out. */
  images: Record<string, ImageView>;
  /** SB-16: the categories and products it names that shoppers can reach; a link to any other goes home. */
  categories: StorefrontTargetView[];
  products: StorefrontTargetView[];
  /** SB-12: drawn from the draft, through a preview link. */
  preview: boolean;
}

/** SB-12: a short-lived link to the draft. */
export interface StorefrontPreviewLink {
  token: string;
  expiresAt: string;
}
