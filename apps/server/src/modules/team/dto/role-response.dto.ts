import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const roleSchema = z.object({
  id: z.string(),
  name: z.string(),
  permissions: z.array(z.string()),
});
export class RoleDto extends createZodDto(roleSchema) {}

export const roleSummarySchema = roleSchema.extend({ holders: z.number() });
export class RoleSummaryListDto extends createZodDto(roleSummarySchema.array()) {}
