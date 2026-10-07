import {
  changeStaffPasswordSchema,
  createStaffSchema,
  resetStaffPasswordSchema,
  updateStaffSchema,
} from '@lytronix/validators';
import { createZodDto } from 'nestjs-zod';

// DTO classes are built from the shared schemas, so each request shape is written once (ENGINEERING §4).
export class CreateStaffDto extends createZodDto(createStaffSchema) {}
export class UpdateStaffDto extends createZodDto(updateStaffSchema) {}
export class ResetStaffPasswordDto extends createZodDto(resetStaffPasswordSchema) {}
export class ChangeStaffPasswordDto extends createZodDto(changeStaffPasswordSchema) {}
