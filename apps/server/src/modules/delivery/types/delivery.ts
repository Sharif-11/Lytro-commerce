import type {
  LocationList,
  SelectDeliveryZone,
  SelectDeliveryZoneArea,
  ZoneAreas,
} from '@lytronix/db';

// The stored rows, as aliases of the shared types (ENGINEERING-STANDARDS §4), never copies.
export type ZoneRecord = SelectDeliveryZone;
export type ZoneAreaRecord = SelectDeliveryZoneArea;
export type { LocationList, ZoneAreas };

/** A name in both of the platform's languages; the client shows the one the person reads. */
export interface Bilingual {
  en: string;
  bn: string;
}

// --- CUS-08: the canonical list ---

export interface CityView {
  code: string;
  nameEn: string;
  nameBn: string;
}

export interface ThanaView {
  id: number;
  nameEn: string;
  nameBn: string;
  /** The city area it belongs to, or null outside every city. */
  cityCode: string | null;
}

export interface ZillaView {
  id: number;
  nameEn: string;
  nameBn: string;
  thanas: ThanaView[];
}

export interface LocationsView {
  cities: CityView[];
  zillas: ZillaView[];
}

// --- DLV-01, DLV-02: delivery zones ---

export interface ZoneAreasView {
  zillas: { id: number; nameEn: string; nameBn: string }[];
  cities: CityView[];
  thanas: (ThanaView & { zillaId: number })[];
}

export interface ZoneView {
  id: string;
  /** The tenant's own name, or null while it follows the home area ("Inside Dhaka city"). */
  name: string | null;
  /** What to show: its own name, or the one following the home area. */
  label: Bilingual;
  charge: string;
  isHome: boolean;
  isFallback: boolean;
  /** DLV-06: public orders to this zone are refused. */
  noDelivery: boolean;
  areas: ZoneAreasView;
}

/** DLV-01: the home area is one city, one zilla, or the tenant's own thanas. */
export type HomeAreaKind = 'city' | 'zilla' | 'thanas';

export interface DeliverySettingsView {
  homeArea: { kind: HomeAreaKind; label: Bilingual };
  zones: ZoneView[];
  maxZones: number;
  /** RAT-14: the shop's extra charge per kg over each zone's charge, to the paisa; set through /shop-settings. */
  extraDeliveryChargePerKg: string;
}

/** DLV-02: which zone a thana falls in, and by which of its areas. */
export interface ResolvedZoneView {
  location: ThanaView & { zillaId: number };
  matchedBy: 'thana' | 'city' | 'zilla' | 'fallback';
  zone: ZoneView;
}
