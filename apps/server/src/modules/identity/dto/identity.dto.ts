import { addIdentityCodeSchema, verifyAddIdentitySchema } from '@lytronix/validators';
import { createZodDto } from 'nestjs-zod';

// DTO classes are built from the shared schemas, so each request shape is written once (ENGINEERING §4).
export class AddIdentityCodeDto extends createZodDto(addIdentityCodeSchema) {}
export class VerifyAddIdentityDto extends createZodDto(verifyAddIdentitySchema) {}
