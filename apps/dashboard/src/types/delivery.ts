import type { Bilingual } from './onboarding';

/** A thana of the canonical list (CUS-08), with the city area it sits in, if any. */
export interface Thana {
  id: number;
  nameEn: string;
  nameBn: string;
  cityCode: string | null;
}

/** GET /locations (CUS-08): the 11 city areas and the 64 zillas, each with its thanas. */
export interface Locations {
  cities: { code: string; nameEn: string; nameBn: string }[];
  zillas: { id: number; nameEn: string; nameBn: string; thanas: Thana[] }[];
}

/** A zone's areas as sent (DLV-01): zillas, city areas and thanas by their ids. */
export interface AreasInput {
  cityCodes: string[];
  zillaIds: number[];
  locationIds: number[];
}

/** PUT /delivery-zones/home-area (DLV-01): one city, one zilla, or the shop's own thanas. */
export interface HomeAreaInput {
  areas: AreasInput;
}

/** A zone's areas as read, each named in both languages. */
export interface ZoneAreasView {
  zillas: { id: number; nameEn: string; nameBn: string }[];
  cities: { code: string; nameEn: string; nameBn: string }[];
  thanas: (Thana & { zillaId: number })[];
}

/** Mirrors `ZoneView` in apps/server/src/modules/delivery/types/delivery.ts (DLV-01, DLV-05, DLV-06). */
export interface DeliveryZone {
  id: string;
  /** The shop's own name; null while a fixed zone follows the home area. */
  name: string | null;
  /** What to show: the shop's name, or "Inside Dhaka city" built from the home area. */
  label: Bilingual;
  charge: string;
  isHome: boolean;
  isFallback: boolean;
  /** DLV-06: a zone the shop does not deliver to. */
  noDelivery: boolean;
  areas: ZoneAreasView;
}

/** GET /delivery-zones (DLV-05): the home area, every zone, the most there may be, and the extra charge per kg. */
export interface DeliverySettings {
  homeArea: { kind: 'city' | 'zilla' | 'thanas'; label: Bilingual };
  zones: DeliveryZone[];
  maxZones: number;
  /** RAT-14: over each zone's charge, for weight-adjusted products. */
  extraDeliveryChargePerKg: string;
}

/** GET /delivery-zones/resolve (DLV-02): the zone a thana falls in, and which of its areas put it there. */
export interface ResolvedZone {
  location: Thana & { zillaId: number };
  matchedBy: 'thana' | 'city' | 'zilla' | 'fallback';
  zone: DeliveryZone;
}

/** DLV-07: a product whose delivery limit still names a zone being deleted; an archived one still holds it. */
export interface ZoneHolder {
  id: string;
  name: string;
  archived: boolean;
}
