import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  createDeliveryZoneSchema,
  deliveryZoneAreasSchema,
  homeAreaSchema,
  updateDeliveryZoneSchema,
} from '@lytronix/validators';

// DTO classes built from the shared schemas, so each request shape is written once (ENGINEERING §4).
export class CreateDeliveryZoneDto extends createZodDto(createDeliveryZoneSchema) {}
export class UpdateDeliveryZoneDto extends createZodDto(updateDeliveryZoneSchema) {}
export class DeliveryZoneAreasDto extends createZodDto(deliveryZoneAreasSchema) {}
export class HomeAreaDto extends createZodDto(homeAreaSchema) {}

// --- Responses ---

const bilingual = z.object({ en: z.string(), bn: z.string() });
const city = z.object({ code: z.string(), nameEn: z.string(), nameBn: z.string() });
const thana = z.object({
  id: z.number(),
  nameEn: z.string(),
  nameBn: z.string(),
  cityCode: z.string().nullable(),
});

export const locationsViewSchema = z.object({
  cities: z.array(city),
  zillas: z.array(
    z.object({ id: z.number(), nameEn: z.string(), nameBn: z.string(), thanas: z.array(thana) }),
  ),
});
export class LocationsViewDto extends createZodDto(locationsViewSchema) {}

const zoneView = z.object({
  id: z.string(),
  name: z.string().nullable(),
  label: bilingual,
  charge: z.string(),
  isHome: z.boolean(),
  isFallback: z.boolean(),
  noDelivery: z.boolean(),
  areas: z.object({
    zillas: z.array(z.object({ id: z.number(), nameEn: z.string(), nameBn: z.string() })),
    cities: z.array(city),
    thanas: z.array(thana.extend({ zillaId: z.number() })),
  }),
});

export const deliverySettingsViewSchema = z.object({
  homeArea: z.object({ kind: z.enum(['city', 'zilla', 'thanas']), label: bilingual }),
  zones: z.array(zoneView),
  maxZones: z.number(),
});
export class DeliverySettingsViewDto extends createZodDto(deliverySettingsViewSchema) {}

export const resolvedZoneViewSchema = z.object({
  location: thana.extend({ zillaId: z.number() }),
  matchedBy: z.enum(['thana', 'city', 'zilla', 'fallback']),
  zone: zoneView,
});
export class ResolvedZoneViewDto extends createZodDto(resolvedZoneViewSchema) {}
