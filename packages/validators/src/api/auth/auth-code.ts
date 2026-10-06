import { z } from 'zod';
import { codeField, phoneField } from '../identity/phone-signup/phone-signup-common';

// POST auth/phone/code — request a sign-in OTP (AUTH-05, AUTH-21).
export const requestSigninCodeSchema = z.object({
  phone: phoneField,
});
export type RequestSigninCodeInput = z.infer<typeof requestSigninCodeSchema>;

// POST auth/phone/verify — verify the sign-in OTP and receive a session (AUTH-12).
export const verifySigninCodeSchema = z.object({
  phone: phoneField,
  code: codeField,
});
export type VerifySigninCodeInput = z.infer<typeof verifySigninCodeSchema>;

// POST auth/forgot-password — request a reset code (AUTH-17).
export const forgotPasswordSchema = z.object({
  phone: phoneField,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

// POST auth/forgot-password/verify — verify the reset code (AUTH-17).
export const verifyForgotPasswordSchema = z.object({
  phone: phoneField,
  code: codeField,
});
export type VerifyForgotPasswordInput = z.infer<typeof verifyForgotPasswordSchema>;
