import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const activityPageSchema = z.object({
  entries: z.array(
    z.object({
      id: z.string(),
      tenantId: z.string(),
      actorType: z.string(),
      actorId: z.string().nullable(),
      actorName: z.string().nullable(),
      action: z.string(),
      targetType: z.string().nullable(),
      targetId: z.string().nullable(),
      result: z.string(),
      summary: z.unknown(),
      ip: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
  nextCursor: z.string().nullable(),
});
export class ActivityPageDto extends createZodDto(activityPageSchema) {}
