import {
  adjustBalanceSchema,
  confirmTopUpSchema,
  listLedgerSchema,
  quoteTopUpSchema,
  suspendTenantSchema,
  updateRateSchema,
} from '@lytronix/validators';
import { createZodDto } from 'nestjs-zod';

// DTO classes built from the shared schemas, so each request shape is written once (ENGINEERING §4).
export class ListLedgerDto extends createZodDto(listLedgerSchema) {}
export class AdjustBalanceDto extends createZodDto(adjustBalanceSchema) {}
export class UpdateRateDto extends createZodDto(updateRateSchema) {}
export class QuoteTopUpDto extends createZodDto(quoteTopUpSchema) {}
export class ConfirmTopUpDto extends createZodDto(confirmTopUpSchema) {}
export class SuspendTenantDto extends createZodDto(suspendTenantSchema) {}
