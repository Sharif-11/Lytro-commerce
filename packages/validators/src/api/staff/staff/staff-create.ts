import { z } from 'zod';
import { NAME_MAX_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../../common/limits';

// POST staff: the owner adds a staff member with a phone and a password (STF-01). The phone is normalised on the server.
export const createStaffSchema = z.object({
  phone: z.string().trim().min(1).max(20),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  name: z.string().trim().min(1).max(NAME_MAX_LENGTH).optional(),
  roleIds: z.array(z.string().uuid()).max(20).default([]),
});
export type CreateStaffInput = z.infer<typeof createStaffSchema>;

// PATCH staff/:id: deactivate or reactivate a staff member (STF-03, STF-04), or change the roles they hold (STF-07).
export const updateStaffSchema = z
  .object({
    active: z.boolean().optional(),
    roleIds: z.array(z.string().uuid()).max(20).optional(),
  })
  .refine((value) => value.active !== undefined || value.roleIds !== undefined, {
    message: 'nothing to change',
  });
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;

// The staff id in PATCH staff/:id. Anything that is not an id is simply no such staff member.
export const staffIdSchema = z.string().uuid();
