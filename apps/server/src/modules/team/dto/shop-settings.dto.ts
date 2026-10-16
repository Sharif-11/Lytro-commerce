import { shopSettingsSchema, updateShopSettingsSchema } from '@lytronix/validators';
import { createZodDto } from 'nestjs-zod';

// DTO classes built from the shared schemas, so the request/response shape is written once (ENGINEERING §4).
export class UpdateShopSettingsDto extends createZodDto(updateShopSettingsSchema) {}
export class ShopSettingsDto extends createZodDto(shopSettingsSchema) {}
