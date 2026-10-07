import { createRoleSchema, updateRoleSchema } from '@lytronix/validators';
import { createZodDto } from 'nestjs-zod';

// DTO classes are built from the shared schemas, so each request shape is written once (ENGINEERING §4).
export class CreateRoleDto extends createZodDto(createRoleSchema) {}
export class UpdateRoleDto extends createZodDto(updateRoleSchema) {}
