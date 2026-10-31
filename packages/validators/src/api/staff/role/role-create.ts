import { z } from 'zod';
import { NAME_MAX_LENGTH } from '../../../common/limits';
import { OWNER_ONLY_PERMISSIONS, Permission } from '../../../db/enums';
import { FieldProblemCode } from '../../../validation/field-problem';

// STF-07 (amended 2026-10-31): any of the platform's permissions but the owner's own (OWNER_ONLY_PERMISSIONS).
export const rolePermissionsField = z
  .array(z.nativeEnum(Permission))
  .refine((held) => !held.some((permission) => OWNER_ONLY_PERMISSIONS.includes(permission)), {
    message: 'Only the owner holds this permission.',
    params: { problem: FieldProblemCode.NotAllowed },
  });

// POST roles: a role is a name and any set of permissions from the platform's list (STF-07). Roles are not capped (STF-08).
export const createRoleSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  permissions: rolePermissionsField,
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

// The role id in roles/:id. Anything that is not an id is simply no such role.
export const roleIdSchema = z.string().uuid();
