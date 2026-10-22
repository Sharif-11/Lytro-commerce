import type {
  BrandColors,
  BrandContrast,
  BrandCorners,
  BrandDesign,
  BrandFontPair,
  BrandSpacing,
  DerivedBrandColors,
} from '@lytronix/validators';
import type { ImageView } from '../../../common/media-links';

/** BRN-02: a shop's saved identity -- its tokens, the owner's switch, and its two images (null for none). */
export interface BrandRecord extends BrandDesign {
  useBrand: boolean;
  darkLogoMediaId: string | null;
  iconMediaId: string | null;
  updatedAt: Date;
}

/** BRN-02: what a save writes. */
export type BrandValues = Omit<BrandRecord, 'updatedAt'>;

/** BRN-05, PLN-13: what decides whether the shop has the brand identity -- its plan's features and its add-ons. */
export interface BrandHoldings {
  features: Readonly<Record<string, boolean>> | null;
  active: readonly { key: string }[];
}

/** BRN-02: an image's stored size, to hold the square icon to its shape. */
export interface ImageSize {
  width: number | null;
  height: number | null;
}

/** BRN-02, BRN-03, BRN-05, BRN-06: the editor's read -- the identity, the switch, and whether it shows. */
export interface BrandEditorView {
  /** The owner's switch, kept through a lapse. */
  useBrand: boolean;
  /** The add-on or the plan lets the identity show (BRN-05). */
  allowed: boolean;
  /** What everyone sees now: switched on and allowed. */
  live: boolean;
  /** The saved identity, or Lytro's default where none is saved yet. */
  identity: BrandDesign & { darkLogo: ImageView | null; icon: ImageView | null };
  contrast: BrandContrast;
  savedAt: string | null;
}

/** BRN-07: the identity every surface applies, as tokens; `version` moves whenever any of it does. */
export interface LiveBrand {
  version: string;
  colors: {
    main: BrandColors['mainColor'];
    accent: BrandColors['accentColor'];
    background: BrandColors['backgroundColor'];
  } & DerivedBrandColors;
  fonts: { heading: BrandFontPair; body: BrandFontPair };
  corners: BrandCorners;
  spacing: BrandSpacing;
  darkLogo: ImageView | null;
  icon: ImageView | null;
}
