import {
  assignPlanSchema,
  confirmPurchaseSchema,
  createBillingTermSchema,
  createPlanSchema,
  quotePurchaseSchema,
  rejectPaymentSchema,
  setPlanLimitOverrideSchema,
  setPlanPriceSchema,
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
