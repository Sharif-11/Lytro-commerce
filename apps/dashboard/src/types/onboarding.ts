/** Mirrors `AddressCheckView` in apps/server/src/modules/identity/types/address-check-view.ts (AUTH-11, TEN-26). */
export interface AddressCheck {
  available: boolean;
  address: string | null;
  /** `unavailable` is taken and reserved alike. */
  reason: 'format' | 'unavailable' | null;
  suggestion: string | null;
}

/** GET /presets (PST-01): a shop type, as the operator keeps the list (PST-04). */
export interface ShopTypePreset {
  key: string;
  labelBn: string;
  labelEn: string;
}

/** A name in both of the platform's languages (the server's `Bilingual`). */
export interface Bilingual {
  en: string;
  bn: string;
}
