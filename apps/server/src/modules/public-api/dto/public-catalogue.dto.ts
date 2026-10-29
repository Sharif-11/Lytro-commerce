import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  AttributeDataType,
  ItemCondition,
  PaymentPolicy,
  StockState,
  StockUnit,
  publicCatalogueVersionedSchema,
  publicProductListSchema,
} from '@lytronix/validators';
import { imageViewSchema, videoViewSchema } from '../../../common/dto/media-views.dto';

// DTO classes built from the shared schemas, so each request shape is written once (ENGINEERING §4).
export class PublicProductListQueryDto extends createZodDto(publicProductListSchema) {}
export class PublicCatalogueVersionedDto extends createZodDto(publicCatalogueVersionedSchema) {}

export class CatalogueVersionViewDto extends createZodDto(z.object({ version: z.string() })) {}

const productCardSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  minPrice: z.string().nullable(),
  maxPrice: z.string().nullable(),
  stockState: z.nativeEnum(StockState),
  image: imageViewSchema.nullable(),
});

export class PublicProductPageDto extends createZodDto(
  z.object({ products: z.array(productCardSchema), nextCursor: z.string().nullable() }),
) {}

export class PublicProductDetailDto extends createZodDto(
  z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    minPrice: z.string().nullable(),
    maxPrice: z.string().nullable(),
    stockState: z.nativeEnum(StockState),
    stockUnit: z.nativeEnum(StockUnit),
    condition: z.nativeEnum(ItemCondition),
    primaryCategoryId: z.string().nullable(),
    categoryIds: z.array(z.string()),
    images: z.array(imageViewSchema),
    video: videoViewSchema.nullable(),
    options: z.array(
      z.object({
        attributeId: z.string(),
        name: z.string(),
        dataType: z.nativeEnum(AttributeDataType),
        unitKind: z.string().nullable(),
        values: z.array(
          z.object({
            id: z.string(),
            value: z.string(),
            swatchColor: z.string().nullable(),
            swatchImage: imageViewSchema.nullable(),
          }),
        ),
      }),
    ),
    attributes: z.array(
      z.object({
        name: z.string(),
        dataType: z.nativeEnum(AttributeDataType),
        unitKind: z.string().nullable(),
        values: z.array(z.string()),
        text: z.string().nullable(),
        number: z.string().nullable(),
        yes: z.boolean().nullable(),
      }),
    ),
    variants: z.array(
      z.object({
        id: z.string(),
        optionIds: z.array(z.string()),
        price: z.string(),
        stockState: z.nativeEnum(StockState),
        available: z.boolean(),
      }),
    ),
    sizeChart: z
      .object({ rows: z.array(z.array(z.string())).nullable(), image: imageViewSchema.nullable() })
      .nullable(),
    paymentPolicy: z.nativeEnum(PaymentPolicy),
    advanceAmount: z.string().nullable(),
    deliveryZoneIds: z.array(z.string()),
  }),
) {}

interface CategoryShape {
  id: string;
  slug: string;
  name: string;
  image: z.infer<typeof imageViewSchema> | null;
  children: CategoryShape[];
}

const categorySchema: z.ZodType<CategoryShape> = z.lazy(() =>
  z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    image: imageViewSchema.nullable(),
    children: z.array(categorySchema),
  }),
);

export class PublicCategoriesDto extends createZodDto(
  z.object({ categories: z.array(categorySchema) }),
) {}
