import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const settingValueSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  description: z.string(),
  updatedBy: z.string().nullable(),
  updatedAt: z.date(),
});
export class SettingValueListDto extends createZodDto(settingValueSchema.array()) {}
