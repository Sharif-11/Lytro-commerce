import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  AuditAction,
  CATEGORY_MAX_DEPTH,
  ServerFieldProblemCode,
  type CategoryAttributesInput,
  type CreateCategoryInput,
  type DeleteCategoryQuery,
  type MoveCategoryInput,
  type UpdateCategoryInput,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import type { ImageView } from '../../../common/media-links';
import type {
  AttributeStore,
  CatalogueTransactions,
  CategoryStore,
  PresetStore,
  ProductStore,
  SizeChartStore,
} from '../ports/catalogue-stores';
import {
  ATTRIBUTE_STORE,
  CATALOGUE_TRANSACTIONS,
  CATEGORY_STORE,
  PRESET_STORE,
  PRODUCT_STORE,
  SIZE_CHART_STORE,
} from '../tokens';
import type { CatalogueActor, CategoryRecord, CategoryView } from '../types/catalogue';
import { CatalogueActivity } from './catalogue-activity';
import { CatalogueImages, refuseUnattachable } from './catalogue-images';
import { nextFreeSlug, slugOf } from './slug';

function view(
  category: CategoryRecord,
  productCount: number,
  suggestedAttributeIds: string[],
  chart: { rows: string[][] | null; imageId: string | null } | null,
  images: ReadonlyMap<string, ImageView>,
): CategoryView {
  const imageOf = (id: string | null | undefined): ImageView | null =>
    id === null || id === undefined ? null : (images.get(id) ?? null);
  return {
    id: category.id,
    parentId: category.parentId,
    name: category.name,
    slug: category.slug,
    depth: category.depth,
    sortOrder: category.sortOrder,
    visible: category.visible,
    productCount,
    suggestedAttributeIds,
    behavesLike: category.behavesLike,
    image: imageOf(category.imageId),
    sizeChart: chart?.rows ?? null,
    sizeChartImage: imageOf(chart?.imageId),
  };
}

/**
 * PRD-03, ATR-02, ATL-05, PST-06: a shop's category tree, up to four levels, the attributes each suggests and the
 * shop type each behaves like. A tenant
 * with no categories is blocked from nothing; products filed in none are "Uncategorized" (not a row). Every change
 * moves the catalogue version, since the tree is public (CCH-02).
 */
@Injectable()
export class CategoryService {
  constructor(
    @Inject(CATALOGUE_TRANSACTIONS) private readonly transactions: CatalogueTransactions,
    @Inject(CATEGORY_STORE) private readonly categories: CategoryStore,
    @Inject(ATTRIBUTE_STORE) private readonly attributes: AttributeStore,
    @Inject(PRODUCT_STORE) private readonly products: ProductStore,
    @Inject(PRESET_STORE) private readonly presets: PresetStore,
    @Inject(SIZE_CHART_STORE) private readonly charts: SizeChartStore,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
    @Inject(CatalogueImages) private readonly images: CatalogueImages,
  ) {}

  list(tenantId: string): Promise<CategoryView[]> {
    return this.transactions.run(async (tx) => {
      const rows = await this.categories.listCategories(tx, tenantId);
      return this.views(tx, tenantId, rows);
    });
  }

  async create(
    tenantId: string,
    input: CreateCategoryInput,
    actor: CatalogueActor,
  ): Promise<CategoryView> {
    const who = await this.activity.resolve(tenantId, actor);
    const behavesLike = input.behavesLike ?? null;
    await this.refuseUnknownType(behavesLike);
    return this.transactions.run(async (tx) => {
      // D8-72: after a move renumbering its level, or before one, never during it, so the move numbers it with the rest
      // (the Phase 8 close-out's review C, S3).
      await this.categories.lockCategories(tx, tenantId);
      const parentId = input.parentId ?? null;
      const depth = parentId === null ? 1 : (await this.parentOf(tx, tenantId, parentId)).depth + 1;
      if (depth > CATEGORY_MAX_DEPTH) this.refuseTooDeep();
      const slug = nextFreeSlug(
        slugOf(input.name, 'category'),
        await this.categories.slugsLike(tx, tenantId, slugOf(input.name, 'category')),
      );
      let row: CategoryRecord;
      try {
        row = await this.categories.insertCategory(tx, {
          tenantId,
          parentId,
          name: input.name,
          slug,
          depth,
          sortOrder: input.sortOrder ?? 0,
          visible: input.visible ?? true,
          behavesLike,
          imageId: input.imageId ?? null,
        });
      } catch (error) {
        // Two categories of the same name created at once: the loser simply tries again.
        if (error instanceof UniqueViolation) throw new ApiError('conflict', 'PleaseTryAgain', {});
        refuseUnattachable(error, 'imageId');
      }
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.CategoryCreated,
        {
          type: 'category',
          id: row.id,
        },
        { name: row.name, parentId, ...(behavesLike !== null ? { behavesLike } : {}) },
      );
      await this.products.bumpVersion(tx, tenantId);
      return view(row, 0, [], null, await this.images.viewsOf(tx, tenantId, [row.imageId]));
    });
  }

  /** Renames, reorders, shows or hides, or moves a category with everything under it. The slug stays. */
  async update(
    tenantId: string,
    categoryId: string,
    input: UpdateCategoryInput,
    actor: CatalogueActor,
  ): Promise<CategoryView> {
    const who = await this.activity.resolve(tenantId, actor);
    if (input.behavesLike !== undefined) await this.refuseUnknownType(input.behavesLike);
    return this.transactions.run(async (tx) => {
      // D8-72: a new parent is checked against the tree as a move leaves it, under the move's lock, so a PATCH and a move
      // racing can never put two categories under each other (the Phase 8 close-out's review C, F5).
      if (input.parentId !== undefined) await this.categories.lockCategories(tx, tenantId);
      const current = await this.find(tx, tenantId, categoryId);
      const patch: Parameters<CategoryStore['updateCategory']>[3] = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
      if (input.visible !== undefined) patch.visible = input.visible;
      // PST-06, PST-03: applies to products created from now on; none already saved changes.
      if (input.behavesLike !== undefined) patch.behavesLike = input.behavesLike;
      // MED-03: its banner, or none.
      if (input.imageId !== undefined) patch.imageId = input.imageId;

      if (input.parentId !== undefined && input.parentId !== current.parentId) {
        await this.reparent(tx, tenantId, categoryId, input.parentId);
        patch.parentId = input.parentId;
      }

      let row: CategoryRecord | null;
      try {
        row = await this.categories.updateCategory(tx, tenantId, categoryId, patch);
      } catch (error) {
        refuseUnattachable(error, 'imageId');
      }
      if (!row) throw new ApiError('not_found', 'CategoryNotFound', {});
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.CategoryUpdated,
        {
          type: 'category',
          id: row.id,
        },
        { ...input },
      );
      await this.products.bumpVersion(tx, tenantId);
      const [shown] = await this.views(tx, tenantId, [row]);
      if (!shown) throw new ApiError('not_found', 'CategoryNotFound', {});
      return shown;
    });
  }

  /**
   * D8-72 (Slice 8.8): moves a category, with everything under it, to a parent (null for the top level) and a place among
   * that parent's sub-categories -- after `afterId`, or first -- and renumbers both its old and its new siblings, in one
   * transaction, so a failure never leaves half an order. A place that no longer exists, the parent gone or `afterId` no
   * longer under it, is a list someone changed meanwhile. Answers the whole list, as `list()` does.
   */
  async move(
    tenantId: string,
    categoryId: string,
    input: MoveCategoryInput,
    actor: CatalogueActor,
  ): Promise<CategoryView[]> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.transactions.run(async (tx) => {
      await this.categories.lockCategories(tx, tenantId);
      const rows = await this.categories.listCategories(tx, tenantId);
      const current = rows.find((row) => row.id === categoryId);
      if (!current) throw new ApiError('not_found', 'CategoryNotFound', {});
      const { parentId, afterId } = input;
      const placeGone =
        (parentId !== null && !rows.some((row) => row.id === parentId)) ||
        (afterId !== null &&
          (afterId === categoryId ||
            rows.find((row) => row.id === afterId)?.parentId !== parentId));
      if (placeGone) throw new ApiError('conflict', 'CategoryMovedMeanwhile', {});

      const reparented = parentId !== current.parentId;
      if (reparented) await this.reparent(tx, tenantId, categoryId, parentId);
      // The list is in the shop's order within a level, so each parent's sub-categories keep theirs.
      const siblings = (parent: string | null) =>
        rows.filter((row) => row.parentId === parent && row.id !== categoryId);
      const target = siblings(parentId);
      const at = afterId === null ? 0 : target.findIndex((row) => row.id === afterId) + 1;
      const order = [...target.slice(0, at), current, ...target.slice(at)];
      let changed = reparented;
      for (const [index, row] of order.entries()) {
        if (row.id !== categoryId && row.sortOrder === index) continue;
        if (row.id === categoryId && !reparented && row.sortOrder === index) continue;
        await this.categories.updateCategory(tx, tenantId, row.id, {
          ...(row.id === categoryId && reparented ? { parentId } : {}),
          sortOrder: index,
        });
        changed = true;
      }
      if (reparented) {
        for (const [index, row] of siblings(current.parentId).entries()) {
          if (row.sortOrder !== index) {
            await this.categories.updateCategory(tx, tenantId, row.id, { sortOrder: index });
          }
        }
      }
      if (changed) {
        await this.activity.record(
          tx,
          tenantId,
          who,
          AuditAction.CategoryUpdated,
          { type: 'category', id: categoryId },
          { parentId, afterId },
        );
        await this.products.bumpVersion(tx, tenantId);
      }
      return this.views(tx, tenantId, await this.categories.listCategories(tx, tenantId));
    });
  }

  /**
   * PRD-03: deletes a category. One with sub-categories is refused with their count; one holding products is
   * refused with their count unless the caller moves them to Uncategorized.
   */
  async delete(
    tenantId: string,
    categoryId: string,
    query: DeleteCategoryQuery,
    actor: CatalogueActor,
  ): Promise<void> {
    const who = await this.activity.resolve(tenantId, actor);
    await this.transactions.run(async (tx) => {
      const current = await this.find(tx, tenantId, categoryId);
      const children = await this.categories.countChildren(tx, tenantId, categoryId);
      if (children > 0)
        throw new ApiError('conflict', 'CategoryHasChildren', { count: children }, undefined, {
          count: children,
        });
      const holding = await this.categories.countLiveProducts(tx, tenantId, categoryId);
      if (holding > 0 && query.products !== 'uncategorize') {
        throw new ApiError('conflict', 'CategoryHasProducts', { count: holding }, undefined, {
          count: holding,
        });
      }
      // Archived products are unfiled too: nothing may keep pointing at a deleted category.
      await this.categories.unfileProducts(tx, tenantId, categoryId);
      await this.categories.deleteCategory(tx, tenantId, categoryId);
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.CategoryDeleted,
        {
          type: 'category',
          id: categoryId,
        },
        { name: current.name, productsMoved: holding },
      );
      await this.products.bumpVersion(tx, tenantId);
    });
  }

  /** ATR-02, ATL-05: the attributes suggested for products filed under the category, in order. */
  async setSuggestions(
    tenantId: string,
    categoryId: string,
    input: CategoryAttributesInput,
    actor: CatalogueActor,
  ): Promise<CategoryView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.transactions.run(async (tx) => {
      const category = await this.find(tx, tenantId, categoryId);
      const unique = [...new Set(input.attributeIds)];
      const found = new Set(
        (await this.attributes.findAttributes(tx, tenantId, unique)).map(
          (attribute) => attribute.id,
        ),
      );
      const missing = input.attributeIds
        .map((id, index) => ({ id, index }))
        .filter((entry) => !found.has(entry.id));
      if (missing.length > 0) {
        throw new FieldsError(
          missing.map((entry) => ({
            field: `attributeIds.${String(entry.index)}`,
            problem: ServerFieldProblemCode.NotFound,
            messageKey: 'AttributeNotFound' as const,
          })),
        );
      }
      await this.attributes.replaceCategorySuggestions(tx, tenantId, categoryId, unique);
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.CategoryUpdated,
        {
          type: 'category',
          id: categoryId,
        },
        { suggestedAttributeIds: unique },
      );
      const [shown] = await this.views(tx, tenantId, [category]);
      if (!shown) throw new ApiError('not_found', 'CategoryNotFound', {});
      return shown;
    });
  }

  private async find(
    tx: Transaction,
    tenantId: string,
    categoryId: string,
  ): Promise<CategoryRecord> {
    const [row] = await this.categories.findCategories(tx, tenantId, [categoryId]);
    if (!row) throw new ApiError('not_found', 'CategoryNotFound', {});
    return row;
  }

  /**
   * PRD-03, D8-72: puts a category, with everything under it, under `parentId` (null for the top level), re-levelling the
   * whole subtree; refused under itself or one of its own sub-categories, and past four levels. The one definition of a
   * move's rules, for a PATCH and a move alike.
   */
  private async reparent(
    tx: Transaction,
    tenantId: string,
    categoryId: string,
    parentId: string | null,
  ): Promise<void> {
    const subtree = await this.categories.subtree(tx, tenantId, categoryId);
    if (parentId !== null && subtree.some((node) => node.id === parentId)) {
      throw new FieldsError([
        {
          field: 'parentId',
          problem: ServerFieldProblemCode.OutOfRange,
          messageKey: 'CategoryCannotMoveUnderItself',
        },
      ]);
    }
    const depth = parentId === null ? 1 : (await this.parentOf(tx, tenantId, parentId)).depth + 1;
    const height = Math.max(...subtree.map((node) => node.level));
    if (depth + height > CATEGORY_MAX_DEPTH) this.refuseTooDeep();
    await this.categories.setSubtreeDepths(tx, tenantId, subtree, depth);
  }

  private async parentOf(
    tx: Transaction,
    tenantId: string,
    parentId: string,
  ): Promise<CategoryRecord> {
    const [parent] = await this.categories.findCategories(tx, tenantId, [parentId]);
    if (!parent) {
      throw new FieldsError([
        {
          field: 'parentId',
          problem: ServerFieldProblemCode.NotFound,
          messageKey: 'CategoryNotFound',
        },
      ]);
    }
    return parent;
  }

  /** PST-06: a category behaves like one of the platform's shop types, which the operator may change (PST-04). */
  private async refuseUnknownType(key: string | null): Promise<void> {
    if (key !== null && !(await this.presets.findPreset(key))) {
      throw new FieldsError([
        {
          field: 'behavesLike',
          problem: ServerFieldProblemCode.NotFound,
          messageKey: 'BusinessTypeUnknown',
        },
      ]);
    }
  }

  private refuseTooDeep(): never {
    throw new FieldsError([
      {
        field: 'parentId',
        problem: ServerFieldProblemCode.OutOfRange,
        messageKey: 'CategoryTooDeep',
        params: { max: CATEGORY_MAX_DEPTH },
      },
    ]);
  }

  private async views(
    tx: Transaction,
    tenantId: string,
    rows: CategoryRecord[],
  ): Promise<CategoryView[]> {
    const counts = await this.categories.countLiveProductsByCategory(tx, tenantId);
    const suggestions = await this.attributes.listCategorySuggestions(
      tx,
      tenantId,
      rows.map((row) => row.id),
    );
    const charts = new Map(
      (await this.charts.listCategoryCharts(tx, tenantId)).map((chart) => [
        chart.categoryId,
        { rows: chart.tableRows, imageId: chart.imageId },
      ]),
    );
    const images = await this.images.viewsOf(tx, tenantId, [
      ...rows.map((row) => row.imageId),
      ...[...charts.values()].map((chart) => chart.imageId),
    ]);
    return rows.map((row) =>
      view(
        row,
        counts.get(row.id) ?? 0,
        suggestions
          .filter((entry) => entry.categoryId === row.id)
          .map((entry) => entry.attributeId),
        charts.get(row.id) ?? null,
        images,
      ),
    );
  }
}
