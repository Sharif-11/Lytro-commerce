import { z } from 'zod';
import {
  DELIVERY_ZONE_NAME_MAX_LENGTH,
  DELIVERY_ZONE_MAX_CITIES,
  DELIVERY_ZONE_MAX_THANAS,
  DELIVERY_ZONE_MAX_ZILLAS,
} from '../../common/limits';
import { FieldProblemCode } from '../../validation/field-problem';
import { priceField } from '../catalogue/catalogue-common';

const areaId = z.number().int().positive();

// DLV-01, DLV-02: the CUS-08 areas a zone covers, at three levels: whole zillas, whole cities, single thanas.
// A thana resolves to the zone naming it, else its city's, else its zilla's, else the fallback zone.
export const deliveryAreasSchema = z.object({
  zillaIds: z.array(areaId).max(DELIVERY_ZONE_MAX_ZILLAS).default([]),
  cityCodes: z.array(z.string().trim().min(1).max(20)).max(DELIVERY_ZONE_MAX_CITIES).default([]),
  locationIds: z.array(areaId).max(DELIVERY_ZONE_MAX_THANAS).default([]),
});
export type DeliveryAreasInput = z.infer<typeof deliveryAreasSchema>;

const zoneName = z.string().trim().min(1).max(DELIVERY_ZONE_NAME_MAX_LENGTH);

// POST delivery-zones (DLV-01): one more zone, such as "Dhaka suburbs", with its charge and areas.
export const createDeliveryZoneSchema = z.object({
  name: zoneName,
  charge: priceField,
  // DLV-06: public orders to this zone are refused.
  noDelivery: z.boolean().optional(),
  areas: deliveryAreasSchema,
});
export type CreateDeliveryZoneInput = z.infer<typeof createDeliveryZoneSchema>;

// PATCH delivery-zones/:id: rename, re-price or mark "no delivery". A null name puts the home or fallback zone back
// on its automatic name ("Inside <home area>"); every other zone keeps a name of its own.
export const updateDeliveryZoneSchema = z.object({
  name: zoneName.nullable().optional(),
  charge: priceField.optional(),
  noDelivery: z.boolean().optional(),
});
export type UpdateDeliveryZoneInput = z.infer<typeof updateDeliveryZoneSchema>;

// PUT delivery-zones/:id/areas: replaces a zone's areas. The fallback zone has none (it is everything else), and
// the home zone's are its home area.
export const deliveryZoneAreasSchema = z.object({ areas: deliveryAreasSchema });
export type DeliveryZoneAreasInput = z.infer<typeof deliveryZoneAreasSchema>;

// PUT delivery-zones/home-area (DLV-01, DLV-05): a city, a zilla, or the tenant's own set of thanas.
export const homeAreaSchema = z.object({ areas: deliveryAreasSchema }).superRefine((value, ctx) => {
  const { zillaIds, cityCodes, locationIds } = value.areas;
  const oneCity = cityCodes.length === 1 && zillaIds.length === 0 && locationIds.length === 0;
  const oneZilla = zillaIds.length === 1 && cityCodes.length === 0 && locationIds.length === 0;
  const thanas = locationIds.length > 0 && zillaIds.length === 0 && cityCodes.length === 0;
  if (!oneCity && !oneZilla && !thanas) {
    ctx.addIssue({
      code: 'custom',
      path: ['areas'],
      message: 'Choose one city, one district, or your own thanas.',
      params: { problem: FieldProblemCode.NotAllowed },
    });
  }
});
export type HomeAreaInput = z.infer<typeof homeAreaSchema>;

// GET delivery-zones/resolve (DLV-02, DLV-05): which zone, and which charge, a thana falls in.
export const resolveDeliveryZoneQuerySchema = z.object({
  locationId: z.coerce.number().int().positive(),
});
export type ResolveDeliveryZoneQuery = z.infer<typeof resolveDeliveryZoneQuerySchema>;
