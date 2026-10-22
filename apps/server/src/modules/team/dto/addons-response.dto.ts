import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { AddonKind, AddonRenewal } from '@lytronix/validators';
import { invoiceSchema, planPaymentSchema } from './billing-response.dto';

// PLN-13: control.addons, one item of the catalogue.
export const addonSchema = z.object({
  id: z.string(),
  key: z.string(),
  kind: z.nativeEnum(AddonKind),
  limitKey: z.string().nullable(),
  unitSize: z.number().nullable(),
  price: z.string(),
  labelEn: z.string(),
  labelBn: z.string(),
  retiredAt: z.date().nullable(),
  createdAt: z.date(),
});
export class AddonDto extends createZodDto(addonSchema) {}
export class AddonListDto extends createZodDto(addonSchema.array()) {}

// PLN-14: an add-on for sale to this shop; the price is whole taka for one, to the period's end, or null.
export const addonOfferSchema = z.object({
  addon: addonSchema,
  price: z.number().nullable(),
  expiresAt: z.date().nullable(),
});
export class AddonOfferListDto extends createZodDto(addonOfferSchema.array()) {}

// PLN-14, BIL-09: a held add-on quote, paid by confirming its payment.
export const addonQuoteSchema = z.object({
  payment: planPaymentSchema,
  addon: addonSchema,
  quantity: z.number(),
  expiresAt: z.date(),
});
export class AddonQuoteDto extends createZodDto(addonQuoteSchema) {}

// PLN-14, BIL-12: an add-on paid for -- with no invoice yet while a wallet payment waits for the operator (BIL-02).
export const addonPurchaseResultSchema = z.object({
  payment: planPaymentSchema,
  invoice: invoiceSchema.omit({ earlierShop: true }).nullable(),
});
export class AddonPurchaseResultDto extends createZodDto(addonPurchaseResultSchema) {}

// PLN-14, BRN-05: the add-ons the shop has now, and whether its brand identity may be switched on.
export const shopAddonsSchema = z.object({
  addons: z
    .object({
      id: z.string(),
      addonId: z.string(),
      key: z.string(),
      kind: z.nativeEnum(AddonKind),
      labelEn: z.string(),
      labelBn: z.string(),
      limitKey: z.string().nullable(),
      unitSize: z.number().nullable(),
      quantity: z.number(),
      startsAt: z.date().nullable(),
      expiresAt: z.date(),
      renews: z.boolean(),
      renewal: z.nativeEnum(AddonRenewal),
      endsSoon: z.boolean(),
    })
    .array(),
  brandIdentity: z.boolean(),
});
export class ShopAddonsDto extends createZodDto(shopAddonsSchema) {}
