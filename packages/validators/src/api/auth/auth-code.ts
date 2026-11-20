import { z } from 'zod';
import { codeField, phoneField } from '../identity/phone-signup/phone-signup-common';

// An email address as typed; the server lowercases it before use (AUTH-08).
export const emailField = z.string().trim().max(254).check(z.email());

// SUP-08, SMS-11, AUTH-09 as amended 2026-11-20: the dashboard's Turnstile token. Every request that texts a code
// carries one when the dashboard has a widget, and the server checks it with Cloudflare when it has the widget's secret.
// Cloudflare's tokens are at most 2,048 characters.
export const turnstileTokenField = z.string().min(1).max(2048).optional();

// POST auth/phone/code — request a sign-in OTP (AUTH-05, AUTH-21).
export const requestSigninCodeSchema = z.object({
  phone: phoneField,
  turnstileToken: turnstileTokenField,
});
export type RequestSigninCodeInput = z.infer<typeof requestSigninCodeSchema>;

// POST auth/phone/verify — verify the sign-in OTP and receive a session (AUTH-12).
export const verifySigninCodeSchema = z.object({
  phone: phoneField,
  code: codeField,
});
export type VerifySigninCodeInput = z.infer<typeof verifySigninCodeSchema>;

// POST auth/forgot-password and auth/forgot-password/resend — request a reset code (AUTH-17, AUTH-18).
export const forgotPasswordSchema = z.object({
  phone: phoneField,
  turnstileToken: turnstileTokenField,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

// POST auth/forgot-password/verify — verify the reset code (AUTH-17).
export const verifyForgotPasswordSchema = z.object({
  phone: phoneField,
  code: codeField,
});
export type VerifyForgotPasswordInput = z.infer<typeof verifyForgotPasswordSchema>;

// POST auth/email/code — request a sign-in code by email (AUTH-08, AUTH-27).
export const requestEmailCodeSchema = z.object({
  email: emailField,
});
export type RequestEmailCodeInput = z.infer<typeof requestEmailCodeSchema>;

// POST auth/email/verify — verify the email code and receive a session.
export const verifyEmailCodeSchema = z.object({
  email: emailField,
  code: codeField,
});
export type VerifyEmailCodeInput = z.infer<typeof verifyEmailCodeSchema>;

// GET auth/oauth/:provider/callback — the code and state the provider returns (AUTH-24).
export const oauthCallbackSchema = z.object({
  code: z.string().min(1).max(2048),
  state: z.string().min(1).max(128),
});
export type OauthCallbackInput = z.infer<typeof oauthCallbackSchema>;

// POST auth/forgot-password/email — a reset code to a verified email (AUTH-27).
export const forgotPasswordEmailSchema = z.object({
  email: emailField,
});
export type ForgotPasswordEmailInput = z.infer<typeof forgotPasswordEmailSchema>;

// POST auth/forgot-password/email/verify — verify the emailed reset code (AUTH-27).
export const verifyForgotPasswordEmailSchema = z.object({
  email: emailField,
  code: codeField,
});
export type VerifyForgotPasswordEmailInput = z.infer<typeof verifyForgotPasswordEmailSchema>;
