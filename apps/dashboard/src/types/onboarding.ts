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

/** GET /locations (CUS-08): the 11 city areas and the 64 zillas; set-up offers the cities and the zillas. */
export interface Locations {
  cities: { code: string; nameEn: string; nameBn: string }[];
  zillas: { id: number; nameEn: string; nameBn: string }[];
}

/** PUT /delivery-zones/home-area (DLV-01): one city, one zilla, or the shop's own thanas. */
export interface HomeAreaInput {
  areas: { cityCodes: string[]; zillaIds: number[]; locationIds: number[] };
}

/** The parts of GET /delivery-zones (DLV-05) the first build's Settings reads until Slice 11.6. */
export interface DeliverySettings {
  homeArea: { kind: 'city' | 'zilla' | 'thanas'; label: Bilingual };
  zones: { id: string; label: Bilingual; charge: string; isHome: boolean; isFallback: boolean }[];
}
