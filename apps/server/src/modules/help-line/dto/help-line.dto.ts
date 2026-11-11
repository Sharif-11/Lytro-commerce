import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** D8-4, D8-68: the help line as `GET /help-line` and the listener app's own route both answer it. */
export class HelpLineDto extends createZodDto(
  z.object({
    whatsapp: z.string().nullable(),
    phone: z.string().nullable(),
    opensHour: z.number(),
    closesHour: z.number(),
  }),
) {}

/** Cached a few minutes in the browser and on the way: it changes only when the operator changes it. */
export const HELP_LINE_CACHE = 'public, max-age=300';
