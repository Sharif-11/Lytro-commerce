import { shopLogoSchema, shopSettingsSchema, updateShopSettingsSchema } from '@lytronix/validators';
import { createZodDto } from 'nestjs-zod';
import { imageViewSchema } from './catalogue-response.dto';

// DTO classes built from the shared schemas, so the request/response shape is written once (ENGINEERING §4).
export class UpdateShopSettingsDto extends createZodDto(updateShopSettingsSchema) {}
export class ShopLogoDto extends createZodDto(shopLogoSchema) {}
// TEN-16: the settings as shown carry the shop's logo, or null for its monogram.
export const shopSettingsViewSchema = shopSettingsSchema.extend({
  logo: imageViewSchema.nullable(),
});
export class ShopSettingsDto extends createZodDto(shopSettingsViewSchema) {}
