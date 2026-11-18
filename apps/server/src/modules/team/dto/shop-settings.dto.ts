import {
  shopIconSchema,
  shopLogoSchema,
  shopSettingsSchema,
  updateShopSettingsSchema,
} from '@lytronix/validators';
import { createZodDto } from 'nestjs-zod';
import { imageViewSchema } from './catalogue-response.dto';

// DTO classes built from the shared schemas, so the request/response shape is written once (ENGINEERING §4).
export class UpdateShopSettingsDto extends createZodDto(updateShopSettingsSchema) {}
export class ShopLogoDto extends createZodDto(shopLogoSchema) {}
export class ShopIconDto extends createZodDto(shopIconSchema) {}
// TEN-16, SB-5: the settings as shown carry the shop's logo, or null for its monogram, and its icon, or null to make it
// from the logo.
export const shopSettingsViewSchema = shopSettingsSchema.extend({
  logo: imageViewSchema.nullable(),
  icon: imageViewSchema.nullable(),
});
export class ShopSettingsDto extends createZodDto(shopSettingsViewSchema) {}
