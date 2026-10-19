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
// `variants`, one variant for every combination of the chosen options.
export const createProductSchema = z
  .object({
    ...productFields,
    variantAttributes: variantAttributesField.optional(),
    variants: variantsField.optional(),
    attributes: attributesField.optional(),
  })
  .superRefine((value, ctx) => {
    checkFields(value, ctx);
    checkMatrix(value, ctx);
    checkRoles(value, ctx);
  });
export type CreateProductInput = z.infer<typeof createProductSchema>;

// PATCH products/:id: the product's own fields. The slug never follows a rename (LND-04); attributes and variants
// have their own routes. Rules that depend on stored values are checked by the server against the result.
export const updateProductSchema = z
  .object({
    ...productFields,
    name: productFields.name.optional(),
    basePrice: productFields.basePrice.optional(),
  })
  .superRefine((value, ctx) => {
    checkFields(value, ctx);
  });
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// PUT products/:id/variants (ATR-11): the variant-defining attributes and the variants, replacing what is stored.
// A combination no longer listed is retired, not deleted; one listed again comes back.
export const saveVariantsSchema = z
  .object({
    variantAttributes: variantAttributesField,
    variants: variantsField.optional(),
  })
  .superRefine((value, ctx) => {
    checkMatrix(value, ctx);
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
