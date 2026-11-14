import { z } from 'zod';
import { NAME_MAX_LENGTH } from '../../../common/limits';
import { FieldProblemCode } from '../../../validation/field-problem';
import { rolePermissionsField } from './role-create';

// PATCH roles/:id: edit a role's name or permissions (STF-07). Changes apply on each user's next request (STF-10).
// An empty edit is refused here: it reached the database as an update with nothing to set, a 500 (found by Slice 9.7's
// walk of every route taking an ID).
export const updateRoleSchema = z
  .object({
    name: z.string().trim().min(1).max(NAME_MAX_LENGTH),
    permissions: rolePermissionsField,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Nothing to change.',
    params: { problem: FieldProblemCode.NothingToChange },
  });
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
