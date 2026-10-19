import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  AuditAction,
  CATEGORY_MAX_DEPTH,
  ServerFieldProblemCode,
  type CategoryAttributesInput,
  type CreateCategoryInput,
  type DeleteCategoryQuery,
  type UpdateCategoryInput,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { UniqueViolation } from '../../../common/errors/unique-violation';
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
import { nextFreeSlug, slugOf } from './slug';

function view(
  category: CategoryRecord,
  productCount: number,
  suggestedAttributeIds: string[],
  sizeChart: string[][] | null,
): CategoryView {
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
    sizeChart,
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
        });
      } catch (error) {
        // Two categories of the same name created at once: the loser simply tries again.
        if (error instanceof UniqueViolation) throw new ApiError('conflict', 'PleaseTryAgain', {});
        throw error;
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
      return view(row, 0, [], null);
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
      const current = await this.find(tx, tenantId, categoryId);
      const patch: Parameters<CategoryStore['updateCategory']>[3] = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
      if (input.visible !== undefined) patch.visible = input.visible;
      // PST-06, PST-03: applies to products created from now on; none already saved changes.
      if (input.behavesLike !== undefined) patch.behavesLike = input.behavesLike;

      if (input.parentId !== undefined && input.parentId !== current.parentId) {
        const subtree = await this.categories.subtree(tx, tenantId, categoryId);
        const newParent = input.parentId;
        if (newParent !== null && subtree.some((node) => node.id === newParent)) {
          throw new FieldsError([
            {
              field: 'parentId',
              problem: ServerFieldProblemCode.OutOfRange,
              messageKey: 'CategoryCannotMoveUnderItself',
            },
          ]);
        }
        const depth =
          newParent === null ? 1 : (await this.parentOf(tx, tenantId, newParent)).depth + 1;
        const height = Math.max(...subtree.map((node) => node.level));
        if (depth + height > CATEGORY_MAX_DEPTH) this.refuseTooDeep();
        patch.parentId = newParent;
        await this.categories.setSubtreeDepths(tx, tenantId, subtree, depth);
      }

      const row = await this.categories.updateCategory(tx, tenantId, categoryId, patch);
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
        chart.tableRows,
      ]),
    );
    return rows.map((row) =>
      view(
        row,
        counts.get(row.id) ?? 0,
        suggestions
          .filter((entry) => entry.categoryId === row.id)
          .map((entry) => entry.attributeId),
        charts.get(row.id) ?? null,
      ),
    );
  }
}
