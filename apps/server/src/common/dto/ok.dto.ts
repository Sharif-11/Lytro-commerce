import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

// The `{ ok: true }` acknowledgement many mutating routes return when there's no other payload worth
// sending back. One shared schema/DTO, reused everywhere, instead of redeclaring it per route.
export const okSchema = z.object({ ok: z.literal(true) });
export class OkDto extends createZodDto(okSchema) {}
