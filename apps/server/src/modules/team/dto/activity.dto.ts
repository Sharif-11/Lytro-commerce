import { listActivitySchema } from '@lytronix/validators';
import { createZodDto } from 'nestjs-zod';

// DTO class built from the shared schema, so the request shape is written once (ENGINEERING §4).
export class ListActivityDto extends createZodDto(listActivitySchema) {}
