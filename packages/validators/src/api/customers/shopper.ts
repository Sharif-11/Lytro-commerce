import { z } from 'zod';
import { FieldProblemCode } from '../../validation/field-problem';
import {
  ADDRESS_LABEL_MAX_LENGTH,
  CUSTOMER_NAME_MAX_LENGTH,
  LIST_PAGE_SIZE_MAX,
  ORDER_ADDRESS_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  SHOPPER_ORDER_PAGE_SIZE,
} from '../../common/limits';
import { newPasswordField } from '../auth/auth-password';
import { codeField } from '../identity/phone-signup/phone-signup-common';
import { orderPhoneField, textField } from '../orders/order';

// CUS-03, CUS-04 (Phase 4 Slice 4.4b, agreed 2026-10-30): a shopper makes an account with a code sent once to the
// phone -- paid from the shop's balance -- then a name and a password, and signs in with the phone and password after.

// POST /v1/shopper/code: send the sign-up code.
export const shopperCodeSchema = z.object({ phone: orderPhoneField }).strict();
export type ShopperCodeInput = z.infer<typeof shopperCodeSchema>;

// POST /v1/shopper/signup: the code, then the account.
export const shopperSignupSchema = z
  .object({
    phone: orderPhoneField,
    code: codeField,
    name: textField(CUSTOMER_NAME_MAX_LENGTH),
    password: newPasswordField,
  })
  .strict();
export type ShopperSignupInput = z.infer<typeof shopperSignupSchema>;

// POST /v1/shopper/signin: the phone and password, no code.
export const shopperSigninSchema = z
  .object({ phone: orderPhoneField, password: z.string().min(1).max(PASSWORD_MAX_LENGTH) })
  .strict();
export type ShopperSigninInput = z.infer<typeof shopperSigninSchema>;

// PATCH /v1/shopper/me (CUS-05): the name; the phone is the account and never changes.
export const shopperProfileSchema = z
  .object({ name: textField(CUSTOMER_NAME_MAX_LENGTH) })
  .strict();
export type ShopperProfileInput = z.infer<typeof shopperProfileSchema>;

// POST /v1/shopper/password: a new password, with the one it replaces.
export const shopperPasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
    newPassword: newPasswordField,
  })
  .strict();
export type ShopperPasswordInput = z.infer<typeof shopperPasswordSchema>;

// POST /v1/shopper/addresses (CUS-06): a saved address -- its label, thana (CUS-08) and the address itself -- the
// default if asked, or when it is the first.
export const shopperAddressSchema = z
  .object({
    label: textField(ADDRESS_LABEL_MAX_LENGTH),
    locationId: z.number().int().positive(),
    deliveryAddress: textField(ORDER_ADDRESS_MAX_LENGTH),
    isDefault: z.boolean().optional(),
  })
  .strict();
export type ShopperAddressInput = z.infer<typeof shopperAddressSchema>;

// PATCH /v1/shopper/addresses/:id: any of them; `isDefault: true` makes it the default.
export const shopperAddressUpdateSchema = shopperAddressSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Nothing to change.',
    params: { problem: FieldProblemCode.NothingToChange },
  });
export type ShopperAddressUpdateInput = z.infer<typeof shopperAddressUpdateSchema>;

// GET /v1/shopper/orders (ORD-18): a page of the orders with the shopper's phone.
export const shopperOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LIST_PAGE_SIZE_MAX).default(SHOPPER_ORDER_PAGE_SIZE),
});
export type ShopperOrdersQuery = z.infer<typeof shopperOrdersQuerySchema>;

// POST customers/:id/password (CUS-14): staff set a new password for a customer's shopper account.
export const shopperPasswordByStaffSchema = z.object({ password: newPasswordField }).strict();
export type ShopperPasswordByStaffInput = z.infer<typeof shopperPasswordByStaffSchema>;
