import { z } from 'zod';
import {
  CATEGORY_NAME_MAX_LENGTH,
  MAX_DELIVERY_ZONES,
  OPTION_SET_MAX_OPTIONS,
  OPTION_SET_NAME_MAX_LENGTH,
  OPTION_VALUE_MAX_LENGTH,
  SIZE_CHART_CELL_MAX_LENGTH,
  SIZE_CHART_MAX_COLUMNS,
  SIZE_CHART_MAX_ROWS,
} from '../../common/limits';
import { ProductFormField, SerialFormat, StockUnit } from '../../db/enums';
import { FieldProblemCode } from '../../validation/field-problem';
import { catalogueIdSchema, quantityField } from './catalogue-common';

// PUT products/:id/size-chart and categories/:id/size-chart (PRD-17): a chart as a table of short text, up to 15
// rows of up to 10 cells, every row as wide as the first. A cell may be empty (a header's corner).
export const sizeChartSchema = z.object({
  rows: z
    .array(
      z.array(z.string().trim().max(SIZE_CHART_CELL_MAX_LENGTH)).min(1).max(SIZE_CHART_MAX_COLUMNS),
    )
    .min(1)
    .max(SIZE_CHART_MAX_ROWS)
    .superRefine((rows, ctx) => {
      const width = rows[0]?.length ?? 0;
      rows.forEach((row, index) => {
        if (row.length !== width) {
          ctx.addIssue({
            code: 'custom',
            path: [index],
            message: 'Give every row the same number of cells.',
            params: { problem: FieldProblemCode.NotAllowed },
          });
        }
      });
    }),
});
export type SizeChartInput = z.infer<typeof sizeChartSchema>;

const setValues = z
  .array(z.string().trim().min(1).max(OPTION_VALUE_MAX_LENGTH))
  .min(1)
  .max(OPTION_SET_MAX_OPTIONS);

// POST option-sets (ATR-16): a shop saving its own set, from any attribute's options, for reuse.
export const createOptionSetSchema = z.object({
  name: z.string().trim().min(1).max(OPTION_SET_NAME_MAX_LENGTH),
  options: setValues,
});
export type CreateOptionSetInput = z.infer<typeof createOptionSetSchema>;

// POST attributes/:id/options/batch (ATR-16): several values at once, as tapping an option set adds them. A value
// the shop already has is reused, never doubled.
export const addOptionsSchema = z.object({
  values: setValues,
});
export type AddOptionsInput = z.infer<typeof addOptionsSchema>;

// GET product-defaults: the defaults for a new product filed under this category, which may behave like another
// shop type (PST-06).
export const productDefaultsQuerySchema = z.object({
  categoryId: catalogueIdSchema.optional(),
});
export type ProductDefaultsQuery = z.infer<typeof productDefaultsQuerySchema>;

// PUT products/:id/delivery-zones (DLV-07): the zones the product may be delivered to; none means wherever the shop
// delivers. A zone a product names cannot be deleted until the product stops naming it.
export const productDeliveryZonesSchema = z.object({
  zoneIds: z.array(catalogueIdSchema).max(MAX_DELIVERY_ZONES),
});
export type ProductDeliveryZonesInput = z.infer<typeof productDeliveryZonesSchema>;

// --- The operator's curation (PST-04, ATL-01, ATR-16) ---

// PATCH operator/presets/:key: a shop type's labels, defaults, suggestions and up-front fields. Applies to the next
// product created; never to an existing one (PST-03).
export const updatePresetSchema = z
  .object({
    labelBn: z.string().trim().min(1).max(60),
    labelEn: z.string().trim().min(1).max(60),
    defaultStockUnit: z.nativeEnum(StockUnit),
    defaultBatch: z.boolean(),
    defaultSerial: z.boolean(),
    defaultSerialFormat: z.nativeEnum(SerialFormat),
    defaultNotTracked: z.boolean(),
    defaultLowStock: quantityField,
    suggestedAttributeIds: z.array(catalogueIdSchema).max(20),
    suggestedCategories: z.array(z.string().trim().min(1).max(CATEGORY_NAME_MAX_LENGTH)).max(20),
    upFrontFields: z.array(z.nativeEnum(ProductFormField)).max(10),
  })
  .partial()
  .superRefine((value, ctx) => {
    if (value.defaultBatch && value.defaultSerial) {
      ctx.addIssue({
        code: 'custom',
        path: ['defaultSerial'],
        message: 'Choose batches or serial numbers, not both.',
        params: { problem: FieldProblemCode.NotAllowed },
      });
    }
  });
export type UpdatePresetInput = z.infer<typeof updatePresetSchema>;

// POST operator/option-sets: a platform set, offered first to shops of one type when it names one.
export const createPlatformOptionSetSchema = createOptionSetSchema.extend({
  presetKey: z.string().trim().min(1).max(40).nullable().optional(),
});
export type CreatePlatformOptionSetInput = z.infer<typeof createPlatformOptionSetSchema>;

// PATCH operator/option-sets/:id.
export const updatePlatformOptionSetSchema = createPlatformOptionSetSchema.partial();
export type UpdatePlatformOptionSetInput = z.infer<typeof updatePlatformOptionSetSchema>;
