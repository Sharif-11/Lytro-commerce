import { z } from 'zod';
import {
  LIST_PAGE_SIZE_MAX,
  MAX_VARIANT_ATTRIBUTES,
  MAX_VARIANTS_PER_PRODUCT,
  PRODUCT_DESCRIPTION_MAX_LENGTH,
  PRODUCT_NAME_MAX_LENGTH,
  PRODUCT_PAGE_SIZE,
  PRODUCT_SLUG_MAX_LENGTH,
  PRODUCT_SLUG_PATTERN,
  SKU_MAX_LENGTH,
} from '../../common/limits';
import {
  AttributeRole,
  DeliveryMode,
  PaymentPolicy,
  StockTracking,
  StockUnit,
} from '../../db/enums';
import { FieldProblemCode } from '../../validation/field-problem';
import {
  catalogueIdSchema,
  positiveQuantityField,
  priceField,
  quantityField,
  queryFlag,
  weightKgField,
} from './catalogue-common';

const CATEGORIES_PER_PRODUCT_MAX = 20;
const ATTRIBUTES_PER_PRODUCT_MAX = 50;

// PRD-01: description is plain text kept exactly as typed (line breaks, emoji, Bangla), so it is not trimmed.
const descriptionField = z.string().max(PRODUCT_DESCRIPTION_MAX_LENGTH);
const skuField = z.string().trim().min(1).max(SKU_MAX_LENGTH);

// The product's own fields (PRD-01, PRD-08, PRD-16, UOM-01, INV-02/08/12/14). Every one but name and price is
// optional (ATR-03); a missing unit or tracking setting takes the shop type's default (PST-02).
const productFields = {
  name: z.string().trim().min(1).max(PRODUCT_NAME_MAX_LENGTH),
  description: descriptionField.nullable().optional(),
  basePrice: priceField,
  stockUnit: z.nativeEnum(StockUnit).optional(),
  stockTracking: z.nativeEnum(StockTracking).optional(),
  batchTracked: z.boolean().optional(),
  serialTracked: z.boolean().optional(),
  lowStockThreshold: quantityField.optional(),
  deliveryCharge: priceField.nullable().optional(),
  weightKg: weightKgField.nullable().optional(),
  deliveryMode: z.nativeEnum(DeliveryMode).optional(),
  paymentPolicy: z.nativeEnum(PaymentPolicy).nullable().optional(),
  advanceAmount: priceField.nullable().optional(),
  active: z.boolean().optional(),
  categoryIds: z.array(catalogueIdSchema).max(CATEGORIES_PER_PRODUCT_MAX).optional(),
  primaryCategoryId: catalogueIdSchema.nullable().optional(),
};

// ATR-04, ATL-02: an attribute that splits the product into variants, and the options used.
const variantAttributeInput = z.object({
  attributeId: catalogueIdSchema,
  optionIds: z.array(catalogueIdSchema).min(1).max(MAX_VARIANTS_PER_PRODUCT),
});

// ATR-05, ATR-13: one variant, named by one option of each variant-defining attribute. Every override is optional
// and falls back to the product's own value.
const variantInput = z.object({
  optionIds: z.array(catalogueIdSchema).max(MAX_VARIANT_ATTRIBUTES),
  price: priceField.nullable().optional(),
  sku: skuField.nullable().optional(),
  barcode: skuField.nullable().optional(),
  weightKg: weightKgField.nullable().optional(),
  deliveryCharge: priceField.nullable().optional(),
  deliveryMode: z.nativeEnum(DeliveryMode).nullable().optional(),
  // INV-24: on a product sharing its stock, how much of it one unit of this variant uses; required there, refused
  // elsewhere.
  packAmount: positiveQuantityField.optional(),
  active: z.boolean().optional(),
});

// ATR-08, ATL-02: an attribute that describes the product (informational) or is asked when ordering (captured
// at order time). Informational values are optional (ATR-03); the server checks they fit the attribute's type.
const attributeValueInput = z.object({
  attributeId: catalogueIdSchema,
  role: z.enum([AttributeRole.Informational, AttributeRole.CapturedAtOrder]),
  optionIds: z.array(catalogueIdSchema).max(MAX_VARIANTS_PER_PRODUCT).optional(),
  textValue: z.string().trim().min(1).max(PRODUCT_NAME_MAX_LENGTH).optional(),
  numberValue: z.number().finite().optional(),
  boolValue: z.boolean().optional(),
});

const variantAttributesField = z.array(variantAttributeInput).max(MAX_VARIANT_ATTRIBUTES);
const variantsField = z.array(variantInput).max(MAX_VARIANTS_PER_PRODUCT);

// A new product's variant may arrive with the stock already on the shelf, recorded as its opening stock (INV-03,
// `initial`). Whether the product's unit allows a fraction is checked by the server (UOM-03).
const newVariantsField = z
  .array(variantInput.extend({ openingStock: quantityField.optional() }))
  .max(MAX_VARIANTS_PER_PRODUCT);
const attributesField = z.array(attributeValueInput).max(ATTRIBUTES_PER_PRODUCT_MAX);

type Ctx = z.RefinementCtx;

function refuse(ctx: Ctx, path: (string | number)[], problem: FieldProblemCode, message: string) {
  ctx.addIssue({ code: 'custom', path, message, params: { problem } });
}

/** The matrix checks that need only the request: no attribute twice, and each variant names one option per attribute. */
function checkMatrix(
  value: {
    variantAttributes?: z.infer<typeof variantAttributesField>;
    variants?: z.infer<typeof variantsField>;
  },
  ctx: Ctx,
): void {
  const attributes = value.variantAttributes ?? [];
  const seen = new Set<string>();
  attributes.forEach((attribute, index) => {
    if (seen.has(attribute.attributeId)) {
      refuse(
        ctx,
        ['variantAttributes', index, 'attributeId'],
        FieldProblemCode.NotAllowed,
        'Listed twice.',
      );
    }
    seen.add(attribute.attributeId);
  });
  value.variants?.forEach((variant, index) => {
    if (variant.optionIds.length !== attributes.length) {
      refuse(
        ctx,
        ['variants', index, 'optionIds'],
        FieldProblemCode.WrongLength,
        'Choose one option of each attribute.',
      );
    }
  });
}

/** One role per attribute: an attribute that splits the product cannot also describe it. */
function checkRoles(
  value: {
    variantAttributes?: z.infer<typeof variantAttributesField>;
    attributes?: z.infer<typeof attributesField>;
  },
  ctx: Ctx,
): void {
  const splitting = new Set((value.variantAttributes ?? []).map((a) => a.attributeId));
  const seen = new Set<string>();
  value.attributes?.forEach((attribute, index) => {
    if (splitting.has(attribute.attributeId) || seen.has(attribute.attributeId)) {
      refuse(
        ctx,
        ['attributes', index, 'attributeId'],
        FieldProblemCode.NotAllowed,
        'Listed twice.',
      );
    }
    seen.add(attribute.attributeId);
  });
}

/**
 * INV-24, UOM-04: a product sharing its stock lists its variants, each with its pack amount, since nothing else says
 * how much of the stock each one uses; a product that does not share has no pack amounts. Opening stock of a shared
 * product's variant is a number of its packs, so a whole one. `sharedStock` undefined (a variants save that leaves it
 * as stored) is checked by the server against the product.
 */
function checkSharing(
  value: {
    sharedStock?: boolean;
    sharedOpeningStock?: number;
    variants?: (z.infer<typeof variantInput> & { openingStock?: number })[];
  },
  ctx: Ctx,
): void {
  if (value.sharedStock === true) {
    if (!value.variants || value.variants.length === 0) {
      refuse(
        ctx,
        ['variants'],
        FieldProblemCode.Required,
        'List the sizes and how much each uses.',
      );
    }
    value.variants?.forEach((variant, index) => {
      if (variant.packAmount === undefined) {
        refuse(
          ctx,
          ['variants', index, 'packAmount'],
          FieldProblemCode.Required,
          'Say how much of the stock one of these uses.',
        );
      }
      if (variant.openingStock !== undefined && !Number.isInteger(variant.openingStock)) {
        refuse(
          ctx,
          ['variants', index, 'openingStock'],
          FieldProblemCode.NotWholeNumber,
          'Opening stock here is a number of packs.',
        );
      }
    });
  }
  if (value.sharedStock === false) {
    value.variants?.forEach((variant, index) => {
      if (variant.packAmount !== undefined) {
        refuse(
          ctx,
          ['variants', index, 'packAmount'],
          FieldProblemCode.NotAllowed,
          'Only a product sharing one stock has pack amounts.',
        );
      }
    });
    if (value.sharedOpeningStock !== undefined) {
      refuse(
        ctx,
        ['sharedOpeningStock'],
        FieldProblemCode.NotAllowed,
        'Only a product sharing one stock has shared opening stock.',
      );
    }
  }
}

/** The product's own field rules that need no stored data (INV-12/14, PRD-08, PRD-15). */
function checkFields(value: Partial<z.infer<z.ZodObject<typeof productFields>>>, ctx: Ctx): void {
  if (
    value.stockTracking === StockTracking.NotTracked &&
    (value.batchTracked || value.serialTracked)
  ) {
    refuse(
      ctx,
      [value.batchTracked ? 'batchTracked' : 'serialTracked'],
      FieldProblemCode.NotAllowed,
      'A product whose stock is not counted has no batches or serial numbers.',
    );
  }
  if (value.batchTracked && value.serialTracked) {
    refuse(
      ctx,
      ['serialTracked'],
      FieldProblemCode.NotAllowed,
      'Choose batches or serial numbers, not both.',
    );
  }
  if (
    value.advanceAmount !== undefined &&
    value.advanceAmount !== null &&
    value.paymentPolicy !== undefined &&
    value.paymentPolicy !== PaymentPolicy.PartialAdvance
  ) {
    refuse(
      ctx,
      ['advanceAmount'],
      FieldProblemCode.NotAllowed,
      'Only a partial advance has an amount.',
    );
  }
  if (
    value.primaryCategoryId &&
    value.categoryIds !== undefined &&
    !value.categoryIds.includes(value.primaryCategoryId)
  ) {
    refuse(
      ctx,
      ['primaryCategoryId'],
      FieldProblemCode.NotAllowed,
      'Choose one of its categories.',
    );
  }
}

// POST products (PRD-01, ATR-03, ATR-11): the product, its attributes and its variants in one request, saved in
// one transaction. With no variant-defining attributes it gets one default variant (ATR-04); with some and no
// `variants`, one variant for every combination of the chosen options. With `sharedStock` (INV-24) its variants draw on
// one stock: each lists its pack amount, opening stock may be given as packs per variant and as `sharedOpeningStock` in
// the product's unit, and the variants must be listed.
export const createProductSchema = z
  .object({
    ...productFields,
    sharedStock: z.boolean().optional(),
    sharedOpeningStock: quantityField.optional(),
    variantAttributes: variantAttributesField.optional(),
    variants: newVariantsField.optional(),
    attributes: attributesField.optional(),
  })
  .superRefine((value, ctx) => {
    checkFields(value, ctx);
    checkMatrix(value, ctx);
    checkRoles(value, ctx);
    checkSharing({ ...value, sharedStock: value.sharedStock ?? false }, ctx);
    if (value.sharedStock && value.serialTracked) {
      refuse(
        ctx,
        ['serialTracked'],
        FieldProblemCode.NotAllowed,
        'A product sharing one stock has no serial numbers.',
      );
    }
    if (value.sharedStock && value.stockTracking === StockTracking.NotTracked) {
      refuse(
        ctx,
        ['sharedStock'],
        FieldProblemCode.NotAllowed,
        'A product whose stock is not counted has no stock to share.',
      );
    }
  });
export type CreateProductInput = z.infer<typeof createProductSchema>;

// PATCH products/:id: the product's own fields. The slug never follows a rename (LND-04); attributes and variants
// have their own routes. Rules that depend on stored values are checked by the server against the result.
export const updateProductSchema = z
  .object({
    ...productFields,
    name: productFields.name.optional(),
    basePrice: productFields.basePrice.optional(),
    // INV-24: switched where the variants are saved, since each one needs its pack amount with it.
    sharedStock: z.unknown().optional(),
  })
  .superRefine((value, ctx) => {
    checkFields(value, ctx);
    if (value.sharedStock !== undefined) {
      refuse(
        ctx,
        ['sharedStock'],
        FieldProblemCode.NotAllowed,
        'Turn shared stock on or off where the sizes are saved.',
      );
    }
  });
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// PUT products/:id/variants (ATR-11): the variant-defining attributes and the variants, replacing what is stored.
// A combination no longer listed is retired, not deleted; one listed again comes back. `sharedStock` (INV-24) turns
// shared stock on or off, only while the product holds none; left out, it stays as it is.
export const saveVariantsSchema = z
  .object({
    sharedStock: z.boolean().optional(),
    variantAttributes: variantAttributesField,
    variants: variantsField.optional(),
  })
  .superRefine((value, ctx) => {
    checkMatrix(value, ctx);
    checkSharing(value, ctx);
  });
export type SaveVariantsInput = z.infer<typeof saveVariantsSchema>;

// PUT products/:id/attributes: the informational and captured-at-order attributes, replacing what is stored.
export const saveProductAttributesSchema = z
  .object({
    attributes: attributesField,
  })
  .superRefine((value, ctx) => {
    checkRoles(value, ctx);
  });
export type SaveProductAttributesInput = z.infer<typeof saveProductAttributesSchema>;

// PUT products/:id/slug (LND-04): a deliberate change of the product's link. The old slug keeps redirecting.
export const changeProductSlugSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(PRODUCT_SLUG_MAX_LENGTH)
    .regex(PRODUCT_SLUG_PATTERN),
});
export type ChangeProductSlugInput = z.infer<typeof changeProductSlugSchema>;

// GET products (PRD-12): search by name, filter by category ("uncategorized" for products filed in none),
// 20 to a page by default (API-17).
export const listProductsSchema = z.object({
  search: z.string().trim().min(1).max(PRODUCT_NAME_MAX_LENGTH).optional(),
  categoryId: z.union([catalogueIdSchema, z.literal('uncategorized')]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LIST_PAGE_SIZE_MAX).default(PRODUCT_PAGE_SIZE),
});
export type ListProductsQuery = z.infer<typeof listProductsSchema>;

// DELETE products/:id (PRD-13): archived by default; `hard=true` removes it for good.
export const deleteProductQuerySchema = z.object({
  hard: queryFlag,
});
export type DeleteProductQuery = z.infer<typeof deleteProductQuerySchema>;
