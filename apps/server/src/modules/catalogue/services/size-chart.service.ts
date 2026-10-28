import { Inject, Injectable } from '@nestjs/common';
import type { SizeChartContent, SizeChartOwner, Transaction } from '@lytronix/db';
import { AuditAction, type SizeChartInput } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import type { ImageView } from '../../../common/media-links';
import type {
  CatalogueTransactions,
  CategoryStore,
  ProductStore,
  SizeChartStore,
} from '../ports/catalogue-stores';
import { CATALOGUE_TRANSACTIONS, CATEGORY_STORE, PRODUCT_STORE, SIZE_CHART_STORE } from '../tokens';
import type { CatalogueActor, SizeChartRecord } from '../types/catalogue';
import { CatalogueActivity } from './catalogue-activity';
import { CatalogueImages, refuseUnattachable } from './catalogue-images';

/** PRD-17: a chart as it is stored and shown: its table, or its image (MED-03). */
export interface SizeChartRows {
  rows: string[][] | null;
  image: ImageView | null;
}

/** PRD-17: what the request asks the chart to show. */
function contentOf(input: SizeChartInput): SizeChartContent {
  if (input.rows !== undefined) return { rows: input.rows };
  if (input.imageId !== undefined) return { imageId: input.imageId };
  throw new Error('a size chart names its rows or its image (sizeChartSchema)');
}

/**
 * PRD-17: size charts on a product or a category. A product without its own shows its category's (the product
 * detail resolves which); setting one replaces the chart it had. Charts show on the public pages, so every change
 * moves the catalogue version (CCH-02).
 */
@Injectable()
export class SizeChartService {
  constructor(
    @Inject(CATALOGUE_TRANSACTIONS) private readonly transactions: CatalogueTransactions,
    @Inject(SIZE_CHART_STORE) private readonly charts: SizeChartStore,
    @Inject(PRODUCT_STORE) private readonly products: ProductStore,
    @Inject(CATEGORY_STORE) private readonly categories: CategoryStore,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
    @Inject(CatalogueImages) private readonly images: CatalogueImages,
  ) {}

  async setOnProduct(
    tenantId: string,
    productId: string,
    input: SizeChartInput,
    actor: CatalogueActor,
  ): Promise<SizeChartRows> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.transactions.run(async (tx) => {
      await this.liveProduct(tx, tenantId, productId);
      const chart = await this.put(tx, tenantId, { productId }, input);
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.ProductUpdated,
        { type: 'product', id: productId },
        { sizeChart: 'set' },
      );
      await this.products.bumpVersion(tx, tenantId);
      return this.shown(tx, tenantId, chart);
    });
  }

  /** Removes the product's own chart, so its category's shows again. Removing none is not an error. */
  async removeFromProduct(
    tenantId: string,
    productId: string,
    actor: CatalogueActor,
  ): Promise<void> {
    const who = await this.activity.resolve(tenantId, actor);
    await this.transactions.run(async (tx) => {
      await this.liveProduct(tx, tenantId, productId);
      if (!(await this.charts.deleteChart(tx, tenantId, { productId }))) return;
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.ProductUpdated,
        { type: 'product', id: productId },
        { sizeChart: 'removed' },
      );
      await this.products.bumpVersion(tx, tenantId);
    });
  }

  async setOnCategory(
    tenantId: string,
    categoryId: string,
    input: SizeChartInput,
    actor: CatalogueActor,
  ): Promise<SizeChartRows> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.transactions.run(async (tx) => {
      await this.category(tx, tenantId, categoryId);
      const chart = await this.put(tx, tenantId, { categoryId }, input);
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.CategoryUpdated,
        { type: 'category', id: categoryId },
        { sizeChart: 'set' },
      );
      await this.products.bumpVersion(tx, tenantId);
      return this.shown(tx, tenantId, chart);
    });
  }

  async removeFromCategory(
    tenantId: string,
    categoryId: string,
    actor: CatalogueActor,
  ): Promise<void> {
    const who = await this.activity.resolve(tenantId, actor);
    await this.transactions.run(async (tx) => {
      await this.category(tx, tenantId, categoryId);
      if (!(await this.charts.deleteChart(tx, tenantId, { categoryId }))) return;
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.CategoryUpdated,
        { type: 'category', id: categoryId },
        { sizeChart: 'removed' },
      );
      await this.products.bumpVersion(tx, tenantId);
    });
  }

  /** PRD-17: a new product's own chart, inside its creation's transaction; a bad image is refused by `field`. */
  async putOnProductWithin(
    tx: Transaction,
    tenantId: string,
    productId: string,
    input: SizeChartInput,
    field: string,
  ): Promise<void> {
    await this.put(tx, tenantId, { productId }, input, field);
  }

  private async put(
    tx: Transaction,
    tenantId: string,
    owner: SizeChartOwner,
    input: SizeChartInput,
    field = 'imageId',
  ): Promise<SizeChartRecord> {
    try {
      return await this.charts.putChart(tx, tenantId, owner, contentOf(input));
    } catch (error) {
      refuseUnattachable(error, field);
    }
  }

  private async shown(
    tx: Transaction,
    tenantId: string,
    chart: SizeChartRecord,
  ): Promise<SizeChartRows> {
    const images = await this.images.viewsOf(tx, tenantId, [chart.imageId]);
    return {
      rows: chart.tableRows,
      image: chart.imageId === null ? null : (images.get(chart.imageId) ?? null),
    };
  }

  private async liveProduct(tx: Transaction, tenantId: string, productId: string): Promise<void> {
    if (!(await this.products.findProduct(tx, tenantId, productId, false))) {
      throw new ApiError('not_found', 'ProductNotFound', {});
    }
  }

  private async category(tx: Transaction, tenantId: string, categoryId: string): Promise<void> {
    const [row] = await this.categories.findCategories(tx, tenantId, [categoryId]);
    if (!row) throw new ApiError('not_found', 'CategoryNotFound', {});
  }
}
