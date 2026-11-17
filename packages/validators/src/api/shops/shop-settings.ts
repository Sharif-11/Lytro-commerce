import { z } from 'zod';
import { emailField } from '../auth/auth-code';
import { phoneField } from '../identity/phone-signup/phone-signup-common';
import {
  BUSINESS_ADDRESS_MAX_LENGTH,
  MONEY_TEXT_MAX_LENGTH,
  NAME_MAX_LENGTH,
} from '../../common/limits';
import { nonNegativeMoneyField } from '../../common/money';
import {
  FACEBOOK_PAGE_MAX_LENGTH,
  MESSENGER_USERNAME_MAX_LENGTH,
  facebookPageField,
  messengerUsernameField,
  whatsAppNumberField,
} from '../../common/social-contacts';
import { PaymentPolicy } from '../../db/enums';

// TEN-30: a tenant's own support/contact details, set from dashboard settings any time after onboarding --
// never a field at shop creation (that step has its own, unrelated `address`, the subdomain-slug candidate,
// AUTH-11). Each of the three is independent: `null` clears it, an omitted key leaves it unchanged.
// RAT-14: the tenant's own extra-delivery-charge-per-kg rate lives in a separate table
// (`tenant.shop_settings`) from the three contact fields above (`control.tenants`), but shares this same
// "the shop's own settings" API shape -- the service layer hides that split, not the request/response shape.
export const shopSettingsSchema = z.object({
  // TEN-19: the shop's name, which the dashboard, the tab title and new installs follow; the address never changes.
  shopName: z.string().max(NAME_MAX_LENGTH),
  contactPhone: z.string().max(30).nullable(),
  contactEmail: z.string().max(254).nullable(),
  businessAddress: z.string().max(BUSINESS_ADDRESS_MAX_LENGTH).nullable(),
  // TEN-30, SFT-21 (UI/UX batch 2): where shoppers chat with the shop. WhatsApp as 01XXXXXXXXX, Messenger as the
  // username, the Facebook page as https://www.facebook.com/<page>; each null when unset.
  whatsapp: z.string().max(30).nullable(),
  messenger: z.string().max(MESSENGER_USERNAME_MAX_LENGTH).nullable(),
  facebookPage: z.string().max(FACEBOOK_PAGE_MAX_LENGTH).nullable(),
  extraDeliveryChargePerKg: z.string().max(MONEY_TEXT_MAX_LENGTH),
  // PRD-08: what a product with no payment policy of its own follows.
  defaultPaymentPolicy: z.enum(PaymentPolicy),
  defaultAdvanceAmount: z.string().max(MONEY_TEXT_MAX_LENGTH).nullable(),
  // SFT-16: the shared storefront is on.
  storefrontEnabled: z.boolean(),
});
export type ShopSettings = z.infer<typeof shopSettingsSchema>;

export const updateShopSettingsSchema = z.object({
  shopName: z.string().trim().min(1).max(NAME_MAX_LENGTH).optional(),
  contactPhone: phoneField.nullable().optional(),
  contactEmail: emailField.nullable().optional(),
  businessAddress: z.string().trim().max(BUSINESS_ADDRESS_MAX_LENGTH).nullable().optional(),
  // TEN-30, SFT-21: an empty box or null clears each; a pasted m.me or facebook.com link is accepted and kept in one form.
  whatsapp: whatsAppNumberField.optional(),
  messenger: messengerUsernameField.optional(),
  facebookPage: facebookPageField.optional(),
  extraDeliveryChargePerKg: nonNegativeMoneyField.optional(),
  // PRD-08: the shop-wide default payment policy. A partial advance needs its amount (checked by the server
  // against the stored policy, since either may change alone); no other policy takes one.
  defaultPaymentPolicy: z.enum(PaymentPolicy).optional(),
  defaultAdvanceAmount: nonNegativeMoneyField.nullable().optional(),
  // SFT-16: switch the shared storefront on or off; landing pages and the API keep working either way.
  storefrontEnabled: z.boolean().optional(),
});
export type UpdateShopSettingsInput = z.infer<typeof updateShopSettingsSchema>;
