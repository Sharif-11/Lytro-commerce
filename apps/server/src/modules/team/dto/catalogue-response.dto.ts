import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  AttributeDataType,
  AttributeRole,
  DeliveryMode,
  ItemCondition,
  PaymentPolicy,
  ProductFormField,
  SerialFormat,
  StockState,
  StockTracking,
  ProductKind,
  StockUnit,
} from '@lytronix/validators';
import {
  imageViewSchema,
  productImageViewSchema,
  productVideoViewSchema,
  videoViewSchema,
} from '../../../common/dto/media-views.dto';

export { imageViewSchema, videoViewSchema };

const scope = z.enum(['platform', 'shop']);

const productDefaultsFields = {
  stockUnit: z.nativeEnum(StockUnit),
  stockTracking: z.nativeEnum(StockTracking),
  batchTracked: z.boolean(),
  serialTracked: z.boolean(),
  serialFormat: z.nativeEnum(SerialFormat),
  lowStockThreshold: z.string(),
  suggestedAttributeIds: z.array(z.string()),
  suggestedCategories: z.array(z.string()),
  upFrontFields: z.array(z.nativeEnum(ProductFormField)),
};

export const productDefaultsSchema = z.object({
  businessType: z.string().nullable(),
  presetKey: z.string().nullable(),
  fromCategoryId: z.string().nullable(),
  ...productDefaultsFields,
});
export class ProductDefaultsDto extends createZodDto(productDefaultsSchema) {}

// PRD-08: the product form's defaults, with the shop's default payment policy.
export const productFormDefaultsSchema = productDefaultsSchema.extend({
  shopPaymentPolicy: z.object({
    defaultPaymentPolicy: z.nativeEnum(PaymentPolicy),
    defaultAdvanceAmount: z.string().nullable(),
  }),
});
export class ProductFormDefaultsDto extends createZodDto(productFormDefaultsSchema) {}

export const presetViewSchema = z.object({
  key: z.string(),
  labelBn: z.string(),
  labelEn: z.string(),
  defaults: z.object(productDefaultsFields),
});
export class PresetViewDto extends createZodDto(presetViewSchema) {}

export const optionViewSchema = z.object({
  id: z.string(),
  value: z.string(),
  swatchColor: z.string().nullable(),
  swatchImage: imageViewSchema.nullable(),
  scope,
  retired: z.boolean(),
});
export class OptionViewDto extends createZodDto(optionViewSchema) {}

export const attributeViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  dataType: z.nativeEnum(AttributeDataType),
  unitKind: z.string().nullable(),
  scope,
  retired: z.boolean(),
  options: z.array(optionViewSchema),
});
export class AttributeViewDto extends createZodDto(attributeViewSchema) {}

export const categoryViewSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  slug: z.string(),
  depth: z.number(),
  sortOrder: z.number(),
  visible: z.boolean(),
  productCount: z.number(),
  suggestedAttributeIds: z.array(z.string()),
  behavesLike: z.string().nullable(),
  image: imageViewSchema.nullable(),
  sizeChart: z.array(z.array(z.string())).nullable(),
  sizeChartImage: imageViewSchema.nullable(),
});
export class CategoryViewDto extends createZodDto(categoryViewSchema) {}

export const sizeChartRowsSchema = z.object({
  rows: z.array(z.array(z.string())).nullable(),
  image: imageViewSchema.nullable(),
});
export class SizeChartRowsDto extends createZodDto(sizeChartRowsSchema) {}

export const optionSetViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  options: z.array(z.string()),
  scope,
  presetKey: z.string().nullable(),
});
export class OptionSetViewDto extends createZodDto(optionSetViewSchema) {}

export const productPageSchema = z.object({
  products: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      basePrice: z.string(),
      minPrice: z.string().nullable(),
      maxPrice: z.string().nullable(),
      active: z.boolean(),
      stockState: z.nativeEnum(StockState),
      primaryCategoryId: z.string().nullable(),
      variantCount: z.number(),
      image: imageViewSchema.nullable(),
      createdAt: z.date(),
    }),
  ),
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  pages: z.number(),
  counts: z.object({
    total: z.number(),
    active: z.number(),
    low: z.number(),
    out: z.number(),
    archived: z.number(),
  }),
  productLimit: z.number().nullable(),
});
export class ProductPageDto extends createZodDto(productPageSchema) {}

/**
 * ATR-11, ATR-18: a product's variant-defining attribute with the options its variants use, as the edit screen, the
 * Stock page and a stock check's lines name variants by it.
 */
export const variantAttributeViewSchema = z.object({
  attributeId: z.string(),
  name: z.string(),
  dataType: z.nativeEnum(AttributeDataType),
  unitKind: z.string().nullable(),
  options: z.array(
    z.object({
      id: z.string(),
      value: z.string(),
      swatchColor: z.string().nullable(),
      swatchImage: imageViewSchema.nullable(),
    }),
  ),
});

export const productDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  oldSlugs: z.array(z.string()),
  description: z.string().nullable(),
  basePrice: z.string(),
  stockUnit: z.nativeEnum(StockUnit),
  stockTracking: z.nativeEnum(StockTracking),
  batchTracked: z.boolean(),
  serialTracked: z.boolean(),
  serialFormat: z.nativeEnum(SerialFormat),
  sharedStock: z.boolean(),
  lowStockThreshold: z.string(),
  deliveryCharge: z.string().nullable(),
  weightKg: z.string().nullable(),
  deliveryMode: z.nativeEnum(DeliveryMode),
  effectiveDeliveryMode: z.nativeEnum(DeliveryMode),
  paymentPolicy: z.nativeEnum(PaymentPolicy).nullable(),
  advanceAmount: z.string().nullable(),
  effectivePaymentPolicy: z.nativeEnum(PaymentPolicy),
  effectiveAdvanceAmount: z.string().nullable(),
  active: z.boolean(),
  archived: z.boolean(),
  condition: z.nativeEnum(ItemCondition),
  categoryIds: z.array(z.string()),
  primaryCategoryId: z.string().nullable(),
  minPrice: z.string().nullable(),
  maxPrice: z.string().nullable(),
  stockState: z.nativeEnum(StockState),
  variantAttributes: z.array(variantAttributeViewSchema),
  attributes: z.array(
    z.object({
      attributeId: z.string(),
      name: z.string(),
      dataType: z.nativeEnum(AttributeDataType),
      unitKind: z.string().nullable(),
      role: z.enum([AttributeRole.Informational, AttributeRole.CapturedAtOrder]),
      optionIds: z.array(z.string()),
      optionValues: z.array(z.string()),
      textValue: z.string().nullable(),
      numberValue: z.string().nullable(),
      boolValue: z.boolean().nullable(),
    }),
  ),
  variants: z.array(
    z.object({
      id: z.string(),
      optionIds: z.array(z.string()),
      sku: z.string().nullable(),
      barcode: z.string().nullable(),
      price: z.string().nullable(),
      effectivePrice: z.string(),
      weightKg: z.string().nullable(),
      deliveryCharge: z.string().nullable(),
      deliveryMode: z.nativeEnum(DeliveryMode).nullable(),
      effectiveDeliveryMode: z.nativeEnum(DeliveryMode),
      packAmount: z.string().nullable(),
      active: z.boolean(),
      stockState: z.nativeEnum(StockState),
    }),
  ),
  sizeChart: z
    .object({
      source: z.enum(['product', 'category']),
      categoryId: z.string().nullable(),
      rows: z.array(z.array(z.string())).nullable(),
      image: imageViewSchema.nullable(),
    })
    .nullable(),
  images: z.array(productImageViewSchema),
  video: productVideoViewSchema.nullable(),
  deliveryZoneIds: z.array(z.string()),
  // CMB-01: an ordinary product or a combo, and a combo's parts in order (empty for an ordinary product).
  taxClass: z.object({ id: z.string(), name: z.string(), rate: z.string() }).nullable(),
  kind: z.nativeEnum(ProductKind),
  parts: z.array(
    z.object({
      position: z.number(),
      quantity: z.string(),
      variants: z.array(
        z.object({
          variantId: z.string(),
          productId: z.string(),
          productName: z.string(),
          label: z.string(),
          available: z.boolean(),
        }),
      ),
    }),
  ),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export class ProductDetailDto extends createZodDto(productDetailSchema) {}
