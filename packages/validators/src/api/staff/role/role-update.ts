import { z } from 'zod';
import { NAME_MAX_LENGTH } from '../../../common/limits';
import { Permission } from '../../../db/enums';

// PATCH roles/:id: edit a role's name or permissions (STF-07). Changes apply on each user's next request (STF-10).
export const updateRoleSchema = z
  .object({
    name: z.string().trim().min(1).max(NAME_MAX_LENGTH),
    permissions: z.array(z.nativeEnum(Permission)),
  })
  .partial();
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
