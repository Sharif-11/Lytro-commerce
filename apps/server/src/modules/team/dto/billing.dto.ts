import {
  assignPlanSchema,
  buyPacksSchema,
  confirmAddonSchema,
  confirmPurchaseSchema,
  confirmUpgradeSchema,
  createAddonSchema,
  createBillingTermSchema,
  createPlanSchema,
  quoteAddonSchema,
  quotePurchaseSchema,
  quoteUpgradeSchema,
  setAddonRenewalSchema,
  setPackAutoBuySchema,
  listPaymentQueueSchema,
  rejectPaymentSchema,
  setAutoRenewSchema,
  setPlanLimitOverrideSchema,
  setPlanPriceSchema,
  targetDowngradePlanSchema,
  updateAddonSchema,
  updateBillingTermSchema,
  updatePlanSchema,
} from '@lytronix/validators';
import { createZodDto } from 'nestjs-zod';

// DTO classes built from the shared schemas, so each request shape is written once (ENGINEERING §4).
export class CreatePlanDto extends createZodDto(createPlanSchema) {}
export class UpdatePlanDto extends createZodDto(updatePlanSchema) {}
export class CreateBillingTermDto extends createZodDto(createBillingTermSchema) {}
export class UpdateBillingTermDto extends createZodDto(updateBillingTermSchema) {}
export class SetPlanPriceDto extends createZodDto(setPlanPriceSchema) {}
export class AssignPlanDto extends createZodDto(assignPlanSchema) {}
export class SetPlanLimitOverrideDto extends createZodDto(setPlanLimitOverrideSchema) {}
export class QuotePurchaseDto extends createZodDto(quotePurchaseSchema) {}
export class ConfirmPurchaseDto extends createZodDto(confirmPurchaseSchema) {}
export class RejectPaymentDto extends createZodDto(rejectPaymentSchema) {}
export class ListPaymentQueueDto extends createZodDto(listPaymentQueueSchema) {}
export class QuoteUpgradeDto extends createZodDto(quoteUpgradeSchema) {}
export class ConfirmUpgradeDto extends createZodDto(confirmUpgradeSchema) {}
export class TargetDowngradePlanDto extends createZodDto(targetDowngradePlanSchema) {}
export class SetAutoRenewDto extends createZodDto(setAutoRenewSchema) {}
export class CreateAddonDto extends createZodDto(createAddonSchema) {}
export class UpdateAddonDto extends createZodDto(updateAddonSchema) {}
export class QuoteAddonDto extends createZodDto(quoteAddonSchema) {}
export class ConfirmAddonDto extends createZodDto(confirmAddonSchema) {}
export class SetAddonRenewalDto extends createZodDto(setAddonRenewalSchema) {}
export class BuyPacksDto extends createZodDto(buyPacksSchema) {}
export class SetPackAutoBuyDto extends createZodDto(setPackAutoBuySchema) {}
