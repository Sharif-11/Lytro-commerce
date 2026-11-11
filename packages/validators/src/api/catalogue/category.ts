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
  // PST-06: the shop type (a preset key) its products behave like; null follows its parent, then the shop.
  behavesLike: z.string().trim().min(1).max(40).nullable().optional(),
  // MED-03: its banner, a ready image of the shop's; null removes it.
  imageId: catalogueIdSchema.nullable().optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

// PATCH categories/:id: rename, move (a null parent makes it top level) or reorder. The slug never changes.
export const updateCategorySchema = createCategorySchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

// POST categories/:id/move (D8-72, Slice 8.8): a category, with everything under it, to a parent (null for the top level)
// and a place among that parent's sub-categories: after `afterId`, or first when it is null. Both its old and its new
// siblings are renumbered in the same request; `afterId` no longer under `parentId` means the list changed meanwhile.
export const moveCategorySchema = z.object({
  parentId: catalogueIdSchema.nullable(),
  afterId: catalogueIdSchema.nullable(),
});
export type MoveCategoryInput = z.infer<typeof moveCategorySchema>;

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
