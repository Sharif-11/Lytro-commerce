import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

import { dateField } from '@lytronix/validators';

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
  // Slice 8.8: the console's "only mine" on the audit log (`actorId`) and manual entries (`operatorId`).
  id: z.string(),
  email: z.string(),
  unusedBackupCodes: z.number(),
  signedInAt: dateField(),
  userAgent: z.string().nullable(),
});
export class OperatorMeDto extends createZodDto(operatorMeSchema) {}
