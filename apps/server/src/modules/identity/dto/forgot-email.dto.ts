import { forgotPasswordEmailSchema, verifyForgotPasswordEmailSchema } from '@lytronix/validators';
import { createZodDto } from 'nestjs-zod';

// DTO classes are built from the shared schemas, so each request shape is written once (ENGINEERING §4).
export class ForgotPasswordEmailDto extends createZodDto(forgotPasswordEmailSchema) {}
export class VerifyForgotPasswordEmailDto extends createZodDto(verifyForgotPasswordEmailSchema) {}
