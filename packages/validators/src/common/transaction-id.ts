import { z } from 'zod';
import {
  BANK_REFERENCE_MAX_LENGTH,
  BANK_REFERENCE_MIN_LENGTH,
  TRANSACTION_ID_MAX_LENGTH,
  TRANSACTION_ID_MIN_LENGTH,
} from './limits';

// PAY-07, VER-02 (Phase 5 Slice 5.3, one shape for every ID): a wallet transaction ID is letters and digits only.
export const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9]+$/;

/**
 * PAY-07, VER-02, BIL-07 (Phase 5 Slice 5.3): a wallet payment's transaction ID -- [6 to 20] letters and digits, kept in
 * capitals so the platform's registry matches it ignoring case -- wherever it is typed: the payment page, a payment
 * staff record, and a shop's own payments to Lytro.
 */
export const transactionIdField = z
  .string()
  .trim()
  .regex(TRANSACTION_ID_PATTERN)
  .min(TRANSACTION_ID_MIN_LENGTH)
  .max(TRANSACTION_ID_MAX_LENGTH)
  .transform((value) => value.toUpperCase());

// D8-75: a bank's reference also takes the dashes, slashes, dots and spaces statements print, such as BRAC-FT-55190327.
export const BANK_REFERENCE_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9 ./-]*[A-Za-z0-9])?$/;

/**
 * D8-75 (Slice 8.8): a bank transfer's reference, recorded by the operator where a TrxID would be and used once
 * platform-wide by the same rule (D8-56). Kept in capitals, as a TrxID is.
 */
export const bankReferenceField = z
  .string()
  .trim()
  .regex(BANK_REFERENCE_PATTERN)
  .min(BANK_REFERENCE_MIN_LENGTH)
  .max(BANK_REFERENCE_MAX_LENGTH)
  .transform((value) => value.toUpperCase());
