import { z } from 'zod';
import { NAME_MAX_LENGTH } from '../../../common/limits';
import { Permission } from '../../../db/enums';

// POST roles: a role is a name and any set of permissions from the platform's list (STF-07). Roles are not capped (STF-08).
export const createRoleSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  permissions: z.array(z.nativeEnum(Permission)),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

// The role id in roles/:id. Anything that is not an id is simply no such role.
export const roleIdSchema = z.string().uuid();
