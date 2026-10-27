import { z } from 'zod';
import { emailField } from '../auth/auth-code';
import { phoneField } from '../identity/phone-signup/phone-signup-common';
import { BUSINESS_ADDRESS_MAX_LENGTH, NAME_MAX_LENGTH } from '../../common/limits';
import { nonNegativeMoneyField } from '../../common/money';
import { PaymentPolicy } from '../../db/enums';

// TEN-30: a tenant's own support/contact details, set from dashboard settings any time after onboarding --
// never a field at shop creation (that step has its own, unrelated `address`, the subdomain-slug candidate,
// AUTH-11). Each of the three is independent: `null` clears it, an omitted key leaves it unchanged.
// RAT-14: the tenant's own extra-delivery-charge-per-kg rate lives in a separate table
// (`tenant.shop_settings`) from the three contact fields above (`control.tenants`), but shares this same
// "the shop's own settings" API shape -- the service layer hides that split, not the request/response shape.
export const shopSettingsSchema = z.object({
  // TEN-19: the shop's name, which the dashboard, the tab title and new installs follow; the address never changes.
  shopName: z.string(),
  contactPhone: z.string().nullable(),
  contactEmail: z.string().nullable(),
  businessAddress: z.string().nullable(),
  extraDeliveryChargePerKg: z.string(),
  // PRD-08: what a product with no payment policy of its own follows.
  defaultPaymentPolicy: z.nativeEnum(PaymentPolicy),
  defaultAdvanceAmount: z.string().nullable(),
});
export type ShopSettings = z.infer<typeof shopSettingsSchema>;

export const updateShopSettingsSchema = z.object({
  shopName: z.string().trim().min(1).max(NAME_MAX_LENGTH).optional(),
  contactPhone: phoneField.nullable().optional(),
  contactEmail: emailField.nullable().optional(),
  businessAddress: z.string().trim().max(BUSINESS_ADDRESS_MAX_LENGTH).nullable().optional(),
  extraDeliveryChargePerKg: nonNegativeMoneyField.optional(),
  // PRD-08: the shop-wide default payment policy. A partial advance needs its amount (checked by the server
  // against the stored policy, since either may change alone); no other policy takes one.
  defaultPaymentPolicy: z.nativeEnum(PaymentPolicy).optional(),
  defaultAdvanceAmount: nonNegativeMoneyField.nullable().optional(),
});
export type UpdateShopSettingsInput = z.infer<typeof updateShopSettingsSchema>;
