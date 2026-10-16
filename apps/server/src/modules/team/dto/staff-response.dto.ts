import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const staffMemberSchema = z.object({
  id: z.string(),
  phone: z.string().nullable(),
  name: z.string().nullable(),
  isOwner: z.boolean(),
  active: z.boolean(),
  createdAt: z.date(),
  roleIds: z.array(z.string()),
});
export class StaffMemberDto extends createZodDto(staffMemberSchema) {}

export const staffListSchema = z.object({
  seats: z.object({ used: z.number(), total: z.number().nullable() }),
  staff: z.array(staffMemberSchema),
});
export class StaffListDto extends createZodDto(staffListSchema) {}
