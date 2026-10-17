import { z } from 'zod';
import { emailField } from '../auth/auth-code';
import { phoneField } from '../identity/phone-signup/phone-signup-common';
import { BUSINESS_ADDRESS_MAX_LENGTH } from '../../common/limits';
import { nonNegativeMoneyField } from '../../common/money';

// TEN-30: a tenant's own support/contact details, set from dashboard settings any time after onboarding --
// never a field at shop creation (that step has its own, unrelated `address`, the subdomain-slug candidate,
// AUTH-11). Each of the three is independent: `null` clears it, an omitted key leaves it unchanged.
// RAT-14: the tenant's own extra-delivery-charge-per-kg rate lives in a separate table
// (`tenant.shop_settings`) from the three contact fields above (`control.tenants`), but shares this same
// "the shop's own settings" API shape -- the service layer hides that split, not the request/response shape.
export const shopSettingsSchema = z.object({
  contactPhone: z.string().nullable(),
  contactEmail: z.string().nullable(),
  businessAddress: z.string().nullable(),
  extraDeliveryChargePerKg: z.string(),
});
export type ShopSettings = z.infer<typeof shopSettingsSchema>;

export const updateShopSettingsSchema = z.object({
  contactPhone: phoneField.nullable().optional(),
  contactEmail: emailField.nullable().optional(),
  businessAddress: z.string().trim().max(BUSINESS_ADDRESS_MAX_LENGTH).nullable().optional(),
  extraDeliveryChargePerKg: nonNegativeMoneyField.optional(),
});
export type UpdateShopSettingsInput = z.infer<typeof updateShopSettingsSchema>;
