import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const operatorSignedInSchema = z.object({ csrfToken: z.string() });
export class OperatorSignedInDto extends createZodDto(operatorSignedInSchema) {}

export const operatorEnrolledSchema = z.object({
  csrfToken: z.string(),
  backupCodes: z.array(z.string()),
});
export class OperatorEnrolledDto extends createZodDto(operatorEnrolledSchema) {}

export const operatorBackupCodesSchema = z.object({ backupCodes: z.array(z.string()) });
export class OperatorBackupCodesDto extends createZodDto(operatorBackupCodesSchema) {}

export const operatorMeSchema = z.object({
  email: z.string(),
  unusedBackupCodes: z.number(),
  signedInAt: z.date(),
  userAgent: z.string().nullable(),
});
export class OperatorMeDto extends createZodDto(operatorMeSchema) {}
