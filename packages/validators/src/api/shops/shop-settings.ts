import { z } from 'zod';
import { emailField } from '../auth/auth-code';
import { phoneField } from '../identity/phone-signup/phone-signup-common';
import { BUSINESS_ADDRESS_MAX_LENGTH } from '../../common/limits';

// TEN-30: a tenant's own support/contact details, set from dashboard settings any time after onboarding --
// never a field at shop creation (that step has its own, unrelated `address`, the subdomain-slug candidate,
// AUTH-11). Each of the three is independent: `null` clears it, an omitted key leaves it unchanged.
export const shopSettingsSchema = z.object({
  contactPhone: z.string().nullable(),
  contactEmail: z.string().nullable(),
  businessAddress: z.string().nullable(),
});
export type ShopSettings = z.infer<typeof shopSettingsSchema>;

export const updateShopSettingsSchema = z.object({
  contactPhone: phoneField.nullable().optional(),
  contactEmail: emailField.nullable().optional(),
  businessAddress: z.string().trim().max(BUSINESS_ADDRESS_MAX_LENGTH).nullable().optional(),
});
export type UpdateShopSettingsInput = z.infer<typeof updateShopSettingsSchema>;
