import type { BrandCorners, BrandFont, BrandSpacing, TenantState } from '@lytronix/validators';

/**
 * Mirrors `MeResponse` in apps/server/src/modules/identity/controllers/me.controller.ts. No shared package
 * exports response shapes yet (only request validation and error codes), so this is a deliberate structural
 * duplicate of a server-only type.
 */

/** MED-08: a ready image, with its picture and thumbnail. */
export interface ImageView {
  id: string;
  urls: { main: string; thumbnail: string };
}

/** BRN-02: one curated typeface pair, as Google Fonts names its two families. */
export interface BrandFontPair {
  id: BrandFont;
  bangla: string;
  latin: string;
  headingsOnly: boolean;
}

/** BRN-07: the shop's own identity as tokens; the dashboard applies it from Slice 11.12. */
export interface LiveBrand {
  version: string;
  colors: {
    main: string;
    accent: string;
    background: string;
    onMain: string;
    onAccent: string;
    text: string;
    mainText: string;
  };
  fonts: { heading: BrandFontPair; body: BrandFontPair };
  corners: BrandCorners;
  spacing: BrandSpacing;
  darkLogo: ImageView | null;
  icon: ImageView | null;
}

export interface MeTenant {
  id: string;
  slug: string;
  shopName: string;
  state: TenantState;
  suspended: boolean;
  planName: string | null;
  periodEnd: string | null;
  /** BIL-17: whether the plan renews itself from the balance. */
  autoRenewEnabled: boolean;
  /** TEN-16: the shop's logo for the navigation; null for its monogram. */
  logo: ImageView | null;
  /** BRN-07: the shop's own identity; null for Lytro's default. */
  brand: LiveBrand | null;
  /** TRM-12: the term a paid plan runs on; null on a trial or pay-as-you-go. */
  billingTerm: MeBillingTerm | null;
  /** LIF-26: the days of each stage a lapse would take the plan through; null on a trial, pay-as-you-go and once locked. */
  lapseStages: LapseStages | null;
  /** LIF-12, LIF-19: once lapsed, when the shop's business data would be deleted. */
  deletesAt: string | null;
}

export interface MeBillingTerm {
  id: string;
  labelEn: string;
  labelBn: string;
  months: number;
}

/** Days within each stage, not counted from the period's end (LIF-04). */
export interface LapseStages {
  grace: number;
  readOnly: number;
  locked: number;
  archived: number;
}

export interface MeResponse {
  subscriber: { id: string };
  /** The owner implicitly holds every permission (D32). */
  isOwner: boolean;
  /** Only meaningful when `isOwner` is false. */
  permissions: string[];
  /** The signed-in person's own name in this shop, for the header's initial; null when unnamed. */
  name: string | null;
  /**
   * TEN-31: `staff` for a sign-in made on the staff page with the password the shop set, which never reaches the
   * person's own account; `own` for their own phone, email, password, Google or Facebook.
   */
  signIn: SignInKind;
  /** The roles the person holds in this shop, for the Menu's card; none for the owner. */
  roles: string[];
  /** TEN-31: the phone a staff sign-in was made with; null for the person's own sign-in. */
  phone: string | null;
  tenant: MeTenant | null;
  /** TEN-31: every shop the person may open -- one opens directly, several show the picker (TEN-15). */
  shops: ShopListing[];
  /** LIF-21: no shop open yet, and a deleted one whose balance the new shop takes over (create-shop's note). */
  hasDeletedShop: boolean;
}

/** How the person signed in (TEN-31, AUTH-31). */
export type SignInKind = 'own' | 'staff';

/** One shop on the picker. */
export interface ShopListing {
  slug: string;
  shopName: string;
  role: 'owner' | 'staff';
}
