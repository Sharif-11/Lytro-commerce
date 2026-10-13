import { adjustBalanceSchema, listLedgerSchema, updateRateSchema } from '@lytronix/validators';
import { createZodDto } from 'nestjs-zod';

// DTO classes built from the shared schemas, so each request shape is written once (ENGINEERING §4).
export class ListLedgerDto extends createZodDto(listLedgerSchema) {}
export class AdjustBalanceDto extends createZodDto(adjustBalanceSchema) {}
export class UpdateRateDto extends createZodDto(updateRateSchema) {}
