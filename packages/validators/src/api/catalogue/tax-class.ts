import { z } from 'zod';
import { TAX_CLASS_NAME_MAX_LENGTH } from '../../common/limits';
import { FieldProblemCode } from '../../validation/field-problem';
import { catalogueIdSchema } from './catalogue-common';

// TAX-01 (Slice 4.6a, agreed 2026-10-30): a tax class's rate, a percent with two decimals from 0 (zero-rated) to 100.
// Prices include the tax, so the rate only says how much of a price is tax.
const taxRateField = z.coerce
  .number()
  .min(0)
  .max(100)
  .refine((value) => Math.round(value * 100) === value * 100, {
    message: 'Use at most 2 decimals.',
    params: { problem: FieldProblemCode.TooManyDecimals },
  });

// POST tax-classes: a named class and its rate.
export const taxClassSchema = z
  .object({ name: z.string().trim().min(1).max(TAX_CLASS_NAME_MAX_LENGTH), rate: taxRateField })
  .strict();
export type TaxClassInput = z.infer<typeof taxClassSchema>;

// PATCH tax-classes/:id: a new name or rate, for products ordered from now on; past orders keep theirs (TAX-02).
export const taxClassUpdateSchema = taxClassSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Nothing to change.',
    params: { problem: FieldProblemCode.NothingToChange },
  });
export type TaxClassUpdateInput = z.infer<typeof taxClassUpdateSchema>;

// PUT tax-classes/default (agreed 2026-10-30): the class each new product starts with, or null for none.
export const taxDefaultSchema = z.object({ taxClassId: catalogueIdSchema.nullable() }).strict();
export type TaxDefaultInput = z.infer<typeof taxDefaultSchema>;
