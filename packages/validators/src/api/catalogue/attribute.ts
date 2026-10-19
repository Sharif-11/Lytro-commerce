import { z } from 'zod';
import {
  ATTRIBUTE_NAME_MAX_LENGTH,
  OPTION_VALUE_MAX_LENGTH,
  SWATCH_COLOR_PATTERN,
} from '../../common/limits';
import { AttributeDataType, UnitKind } from '../../db/enums';
import { FieldProblemCode } from '../../validation/field-problem';
import { queryFlag } from './catalogue-common';

// POST attributes (ATR-01, ATL-01): a shop's own attribute, made the moment a name is typed on a product. A
// number-with-unit attribute names what it measures (UOM-02); no other type has a unit.
export const createAttributeSchema = z
  .object({
    name: z.string().trim().min(1).max(ATTRIBUTE_NAME_MAX_LENGTH),
    dataType: z.nativeEnum(AttributeDataType),
    unitKind: z.nativeEnum(UnitKind).optional(),
  })
  .superRefine((value, ctx) => {
    const measured = value.dataType === AttributeDataType.NumberWithUnit;
    if (measured && value.unitKind === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['unitKind'],
        message: 'Choose what it measures.',
        params: { problem: FieldProblemCode.Required },
      });
    }
    if (!measured && value.unitKind !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['unitKind'],
        message: 'Only a number with a unit has one.',
        params: { problem: FieldProblemCode.NotAllowed },
      });
    }
  });
export type CreateAttributeInput = z.infer<typeof createAttributeSchema>;

// PATCH attributes/:id (ATR-10): rename a shop's own attribute, or retire it from future suggestions. Its type
// never changes once products use it.
export const updateAttributeSchema = z.object({
  name: z.string().trim().min(1).max(ATTRIBUTE_NAME_MAX_LENGTH).optional(),
  retired: z.boolean().optional(),
});
export type UpdateAttributeInput = z.infer<typeof updateAttributeSchema>;

// ATR-18: an option's colour swatch, #RRGGBB; null clears it.
const swatchColorField = z.string().trim().regex(SWATCH_COLOR_PATTERN).nullable().optional();

// POST attributes/:id/options: a shop's own value of an attribute with options, its own or the platform's, with an
// optional colour swatch (ATR-18).
export const createOptionSchema = z.object({
  value: z.string().trim().min(1).max(OPTION_VALUE_MAX_LENGTH),
  swatchColor: swatchColorField,
});
export type CreateOptionInput = z.infer<typeof createOptionSchema>;

// PATCH attributes/:id/options/:optionId: rename or retire a shop's own value.
export const updateOptionSchema = z.object({
  value: z.string().trim().min(1).max(OPTION_VALUE_MAX_LENGTH).optional(),
  swatchColor: swatchColorField,
  retired: z.boolean().optional(),
});
export type UpdateOptionInput = z.infer<typeof updateOptionSchema>;

// GET attributes: the platform's attributes and the shop's own, retired ones only when asked (ATR-10).
export const listAttributesSchema = z.object({
  includeRetired: queryFlag,
});
export type ListAttributesQuery = z.infer<typeof listAttributesSchema>;
