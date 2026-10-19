import { z } from 'zod';
import { CATEGORY_NAME_MAX_LENGTH } from '../../common/limits';
import { catalogueIdSchema } from './catalogue-common';

// POST categories (PRD-03): a name, and optionally the parent it sits under (up to four levels deep, checked by
// the server against the tree), its place among its siblings and whether shoppers see it.
export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(CATEGORY_NAME_MAX_LENGTH),
  parentId: catalogueIdSchema.nullable().optional(),
  sortOrder: z.number().int().min(0).max(1_000_000).optional(),
  visible: z.boolean().optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

// PATCH categories/:id: rename, move (a null parent makes it top level) or reorder. The slug never changes.
export const updateCategorySchema = createCategorySchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

// DELETE categories/:id. A category holding products is refused unless `products=uncategorize`, which moves its
// products to Uncategorized (PRD-03).
export const deleteCategoryQuerySchema = z.object({
  products: z.enum(['uncategorize']).optional(),
});
export type DeleteCategoryQuery = z.infer<typeof deleteCategoryQuerySchema>;

// PUT categories/:id/attributes (ATR-02, ATL-05): the attributes suggested for products filed under it, in order.
// Suggestions only; they never make an attribute required.
export const categoryAttributesSchema = z.object({
  attributeIds: z.array(catalogueIdSchema).max(30),
});
export type CategoryAttributesInput = z.infer<typeof categoryAttributesSchema>;
