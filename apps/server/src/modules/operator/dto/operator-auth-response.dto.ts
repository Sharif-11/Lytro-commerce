import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const operatorSignedInSchema = z.object({ csrfToken: z.string() });
export class OperatorSignedInDto extends createZodDto(operatorSignedInSchema) {}

export const operatorEnrolledSchema = z.object({
  csrfToken: z.string(),
  backupCodes: z.array(z.string()),
});
export class OperatorEnrolledDto extends createZodDto(operatorEnrolledSchema) {}
