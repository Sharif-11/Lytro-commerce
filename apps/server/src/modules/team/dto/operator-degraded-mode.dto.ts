import { degradedModeSwitchSchema } from '@lytronix/validators';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// DAT-38 (Slice 9.5): the operator's degraded-mode switch, and how it stands.
export class DegradedModeSwitchDto extends createZodDto(degradedModeSwitchSchema) {}

export class DegradedModeDto extends createZodDto(
  z.object({
    on: z.boolean(),
    noticeId: z.string().uuid().nullable(),
    factor: z.number().int(),
  }),
) {}
