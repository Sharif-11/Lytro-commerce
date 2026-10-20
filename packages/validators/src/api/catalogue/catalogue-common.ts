import { z } from 'zod';
import { PRICE_MAX, QUANTITY_MAX, WEIGHT_KG_MAX } from '../../common/limits';
import { FieldProblemCode } from '../../validation/field-problem';

function decimals(places: number) {
  const factor = 10 ** places;
  return {
    check: (value: number) => Math.round(value * factor) === value * factor,
    message: `Use at most ${String(places)} decimals.`,
  };
}

const twoDecimals = decimals(2);
const threeDecimals = decimals(3);

// PRD-14: a price or charge in taka, two decimals, never negative, within the `numeric(10,2)` column.
export const priceField = z.coerce
  .number()
  .nonnegative()
  .max(PRICE_MAX)
  .refine(twoDecimals.check, {
    message: twoDecimals.message,
    params: { problem: FieldProblemCode.TooManyDecimals },
  });

// PRD-16: a weight in kilograms, more than zero, three decimals (a 250 g item is 0.25).
export const weightKgField = z.coerce
  .number()
  .positive()
  .max(WEIGHT_KG_MAX)
  .refine(threeDecimals.check, {
    message: threeDecimals.message,
    params: { problem: FieldProblemCode.TooManyDecimals },
  });

// INV-08 and every stock quantity: never negative, three decimals for measured units (UOM-03). Whether a
// discrete unit allows a fraction is the database's check, since it depends on the product's unit.
export const quantityField = z.coerce
  .number()
  .nonnegative()
  .max(QUANTITY_MAX)
  .refine(threeDecimals.check, {
    message: threeDecimals.message,
    params: { problem: FieldProblemCode.TooManyDecimals },
  });

// A stock quantity that must be more than zero: a pack amount (INV-24, how much of a shared stock one unit sold uses)
// or stock added (INV-06). Three decimals; whether a whole-unit product allows a fraction is the server's and the
// database's check (UOM-03).
export const positiveQuantityField = z.coerce
  .number()
  .positive()
  .max(QUANTITY_MAX)
  .refine(threeDecimals.check, {
    message: threeDecimals.message,
    params: { problem: FieldProblemCode.TooManyDecimals },
  });

// Every catalogue id in a path or a body.
export const catalogueIdSchema = z.string().uuid();

// A "true"/"false" query flag. z.coerce.boolean() would read "false" as true.
export const queryFlag = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();
