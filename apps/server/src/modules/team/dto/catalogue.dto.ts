import {
  categoryAttributesSchema,
  changeProductSlugSchema,
  createAttributeSchema,
  createCategorySchema,
  createOptionSchema,
  createProductSchema,
  saveProductAttributesSchema,
  saveVariantsSchema,
  setBusinessTypeSchema,
  updateAttributeSchema,
  updateCategorySchema,
  updateOptionSchema,
  updateProductSchema,
} from '@lytronix/validators';
import { createZodDto } from 'nestjs-zod';

// DTO classes built from the shared schemas, so each request shape is written once (ENGINEERING §4).
export class SetBusinessTypeDto extends createZodDto(setBusinessTypeSchema) {}
export class CreateAttributeDto extends createZodDto(createAttributeSchema) {}
export class UpdateAttributeDto extends createZodDto(updateAttributeSchema) {}
export class CreateOptionDto extends createZodDto(createOptionSchema) {}
export class UpdateOptionDto extends createZodDto(updateOptionSchema) {}
export class CreateCategoryDto extends createZodDto(createCategorySchema) {}
export class UpdateCategoryDto extends createZodDto(updateCategorySchema) {}
export class CategoryAttributesDto extends createZodDto(categoryAttributesSchema) {}
export class CreateProductDto extends createZodDto(createProductSchema) {}
export class UpdateProductDto extends createZodDto(updateProductSchema) {}
export class SaveVariantsDto extends createZodDto(saveVariantsSchema) {}
export class SaveProductAttributesDto extends createZodDto(saveProductAttributesSchema) {}
export class ChangeProductSlugDto extends createZodDto(changeProductSlugSchema) {}
