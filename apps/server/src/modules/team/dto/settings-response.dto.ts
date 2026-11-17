import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

import { dateField } from '@lytronix/validators';

export const settingValueSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  description: z.string(),
  updatedBy: z.string().nullable(),
  updatedByEmail: z.string().nullable(),
  updatedAt: dateField(),
});
export class SettingValueListDto extends createZodDto(settingValueSchema.array()) {}
