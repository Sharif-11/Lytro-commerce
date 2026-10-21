import {
  addOptionsSchema,
  categoryAttributesSchema,
  changeProductSlugSchema,
  createAttributeSchema,
  createCategorySchema,
  createOptionSchema,
  createOptionSetSchema,
  createPlatformOptionSetSchema,
  createProductSchema,
  createShopOptionSchema,
  productDeliveryZonesSchema,
  productImagesSchema,
  productVideoSchema,
  saveProductAttributesSchema,
  saveVariantsSchema,
  setBusinessTypeSchema,
  sizeChartSchema,
  updateAttributeSchema,
  updateCategorySchema,
  updateOptionSchema,
  updatePlatformOptionSetSchema,
  updatePresetSchema,
  updateProductSchema,
  updateShopOptionSchema,
} from '@lytronix/validators';
import { createZodDto } from 'nestjs-zod';

// DTO classes built from the shared schemas, so each request shape is written once (ENGINEERING §4).
export class SetBusinessTypeDto extends createZodDto(setBusinessTypeSchema) {}
export class CreateAttributeDto extends createZodDto(createAttributeSchema) {}
export class UpdateAttributeDto extends createZodDto(updateAttributeSchema) {}
export class CreateOptionDto extends createZodDto(createOptionSchema) {}
export class UpdateOptionDto extends createZodDto(updateOptionSchema) {}
export class CreateShopOptionDto extends createZodDto(createShopOptionSchema) {}
export class UpdateShopOptionDto extends createZodDto(updateShopOptionSchema) {}
export class CreateCategoryDto extends createZodDto(createCategorySchema) {}
export class UpdateCategoryDto extends createZodDto(updateCategorySchema) {}
export class CategoryAttributesDto extends createZodDto(categoryAttributesSchema) {}
export class CreateProductDto extends createZodDto(createProductSchema) {}
export class UpdateProductDto extends createZodDto(updateProductSchema) {}
export class SaveVariantsDto extends createZodDto(saveVariantsSchema) {}
export class SaveProductAttributesDto extends createZodDto(saveProductAttributesSchema) {}
export class ChangeProductSlugDto extends createZodDto(changeProductSlugSchema) {}
export class SizeChartDto extends createZodDto(sizeChartSchema) {}
export class ProductDeliveryZonesDto extends createZodDto(productDeliveryZonesSchema) {}
export class ProductImagesDto extends createZodDto(productImagesSchema) {}
export class ProductVideoDto extends createZodDto(productVideoSchema) {}
export class AddOptionsDto extends createZodDto(addOptionsSchema) {}
export class CreateOptionSetDto extends createZodDto(createOptionSetSchema) {}
export class UpdatePresetDto extends createZodDto(updatePresetSchema) {}
export class CreatePlatformOptionSetDto extends createZodDto(createPlatformOptionSetSchema) {}
export class UpdatePlatformOptionSetDto extends createZodDto(updatePlatformOptionSetSchema) {}
