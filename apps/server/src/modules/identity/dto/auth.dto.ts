import {
  createShopSchema,
  forgotPasswordSchema,
  passwordSigninSchema,
  requestSigninCodeSchema,
  setPasswordSchema,
  verifyForgotPasswordSchema,
  verifySigninCodeSchema,
} from '@lytronix/validators';
import { createZodDto } from 'nestjs-zod';

// DTO classes are built from the shared schemas, so each request shape is written once (ENGINEERING §4).
export class RequestSigninCodeDto extends createZodDto(requestSigninCodeSchema) {}
export class VerifySigninCodeDto extends createZodDto(verifySigninCodeSchema) {}
export class PasswordSigninDto extends createZodDto(passwordSigninSchema) {}
export class ForgotPasswordDto extends createZodDto(forgotPasswordSchema) {}
export class VerifyForgotPasswordDto extends createZodDto(verifyForgotPasswordSchema) {}
export class SetPasswordDto extends createZodDto(setPasswordSchema) {}
export class CreateShopDto extends createZodDto(createShopSchema) {}
