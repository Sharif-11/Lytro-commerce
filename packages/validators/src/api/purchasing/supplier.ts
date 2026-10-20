import { z } from 'zod';
import {
  LIST_PAGE_SIZE_MAX,
  SUPPLIER_ADDRESS_MAX_LENGTH,
  SUPPLIER_NAME_MAX_LENGTH,
  SUPPLIER_NOTES_MAX_LENGTH,
  SUPPLIER_PAGE_SIZE,
} from '../../common/limits';
import { emailField } from '../auth/auth-code';
import { queryFlag } from '../catalogue/catalogue-common';
import { phoneField } from '../identity/phone-signup/phone-signup-common';

// PUR-01, PUR-02: optional text, trimmed; left blank it is cleared (null).
export function optionalTextField(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable();
}

// PUR-01: a supplier's name, required. Unique among the shop's live suppliers, ignoring case (the server's check).
const supplierNameField = z.string().trim().min(1).max(SUPPLIER_NAME_MAX_LENGTH);

const supplierDetails = {
  phone: phoneField
    .trim()
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional(),
  // Left blank, cleared.
  email: z.preprocess((value) => (value === '' ? null : value), emailField.nullable()).optional(),
  postalAddress: optionalTextField(SUPPLIER_ADDRESS_MAX_LENGTH).optional(),
  notes: optionalTextField(SUPPLIER_NOTES_MAX_LENGTH).optional(),
};

// POST suppliers (PUR-01): a name, and optionally a phone, email, address and notes.
export const createSupplierSchema = z.object({ name: supplierNameField, ...supplierDetails });
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

// PATCH suppliers/:id (PUR-01): any of the details, and `archived` to archive the supplier (no longer offered for new
// purchases; its past ones still show its name) or bring it back.
export const updateSupplierSchema = z.object({
  name: supplierNameField.optional(),
  ...supplierDetails,
  archived: z.boolean().optional(),
});
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;

// GET suppliers: by name, A to Z; the live ones, or with `archived=true` the archived ones. `q` finds a name containing
// it, ignoring case.
export const supplierListQuerySchema = z.object({
  q: z.string().trim().min(1).max(SUPPLIER_NAME_MAX_LENGTH).optional(),
  archived: queryFlag,
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LIST_PAGE_SIZE_MAX).default(SUPPLIER_PAGE_SIZE),
});
export type SupplierListQuery = z.infer<typeof supplierListQuerySchema>;
