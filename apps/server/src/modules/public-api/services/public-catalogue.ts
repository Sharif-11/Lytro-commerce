import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  AttributeRole,
  FieldProblemCode,
  PlatformSettingKey,
  StockState,
  type Language,
  type PublicProductListQuery,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { SECOND_MS } from '../../../common/time';
import { CatalogueImages } from '../../catalogue/services/catalogue-images';
import { ProductService } from '../../catalogue/services/product.service';
import type { CategoryRecord, ProductDetail } from '../../catalogue/types/catalogue';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import type { CatalogueSearch, PublicCatalogueStore } from '../ports/public-catalogue-store';
import { CATALOGUE_SEARCH, PUBLIC_CATALOGUE_STORE } from '../tokens';
import type { ApiShop } from '../types/public-api';
import type {
  CatalogueAnswer,
  CatalogueVersionView,
  PublicCategory,
  PublicOptionValue,
  PublicProductDetail,
  PublicProductPage,
} from '../types/public-catalogue';
import { CatalogFeedCsv } from './catalog-feed-csv';
import { CatalogueCache } from './catalogue-cache';
import { listRequestOf, cursorOf, positionOf, type ListRequest } from './catalogue-query';
import { CatalogueVersionReader } from './catalogue-version-reader';
import { DomainService } from '../../domains/services/domain.service';

// Bumped whenever an answer's shape changes, so no shopper's browser keeps an old one under an unchanged tag. 2: a list
// row's swatches and creation time, a category's product count (Slice 12b).
const ANSWER_FORMAT = 2;
// CCH-04: the version endpoint itself is kept at most this long.
const VERSION_MAX_AGE_SECONDS = 5;
// FED-04: a feed is fetched on Meta's schedule; its answer is kept no longer than a product page.
const FEED_MAX_AGE_SECONDS = 60;
// CCH-03: the lifetimes when the operator has set none.
const DEFAULT_SECONDS: Readonly<Partial<Record<PlatformSettingKey, number>>> = {
  [PlatformSettingKey.CatalogueListMaxAgeSeconds]: 30,
  [PlatformSettingKey.CatalogueListStaleSeconds]: 120,
  [PlatformSettingKey.CatalogueDetailMaxAgeSeconds]: 60,
  [PlatformSettingKey.CatalogueSearchMaxAgeSeconds]: 30,
  [PlatformSettingKey.CatalogueCategoriesMaxAgeSeconds]: 300,
};

/** CCH-03: how long a shopper's browser may keep an answer, and show it stale while fetching it again. */
function cacheControl(maxAge: number, stale: number | null): string {
  const kept = `private, max-age=${String(maxAge)}`;
  return stale === null ? kept : `${kept}, stale-while-revalidate=${String(stale)}`;
}

/**
 * PRD-09, PRD-10, CCH-01 to CCH-04, CCH-08, CCH-11, LND-04: the public catalogue -- the versions, the shop's active
 * products a page at a time (by category, search and order), a product's page by its link, and the category tree --
 * with public fields only. Each answer comes from the memory cache under a key naming the shop's and the platform
 * library's current versions, so an edit shows within seconds, and carries a tag and a browser lifetime. Nothing here
 * is stored by Cloudflare: every request passes the public key's gate first and is counted (RTE-04).
 */
@Injectable()
export class PublicCatalogue {
  constructor(
    @Inject(PUBLIC_CATALOGUE_STORE) private readonly store: PublicCatalogueStore,
    @Inject(CATALOGUE_SEARCH) private readonly search: CatalogueSearch,
    @Inject(CatalogueVersionReader) private readonly versions: CatalogueVersionReader,
    @Inject(CatalogueCache) private readonly cache: CatalogueCache,
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
    @Inject(ProductService) private readonly products: ProductService,
    @Inject(CatalogueImages) private readonly images: CatalogueImages,
    @Inject(CatalogFeedCsv) private readonly feedCsv: CatalogFeedCsv,
    @Inject(DomainService) private readonly domains: DomainService,
  ) {}

  /** CCH-04: the one small answer a caller reads first, to put the version in the addresses after it. */
  async version(shop: ApiShop, lang: Language): Promise<CatalogueAnswer<CatalogueVersionView>> {
    const current = await this.versions.current(shop.row.id);
    const version = `${String(current.shop)}.${String(current.platform)}`;
    return {
      data: { version },
      etag: this.tag(lang, ['version', shop.row.id, version]),
      cacheControl: cacheControl(VERSION_MAX_AGE_SECONDS, null),
    };
  }

  /** PRD-09, CCH-11, CCH-12: a page of the shop's active products. */
  async list(
    shop: ApiShop,
    query: PublicProductListQuery,
    lang: Language,
  ): Promise<CatalogueAnswer<PublicProductPage>> {
    const request = listRequestOf(query);
    const after = request.cursor === null ? null : positionOf(request.sort, request.cursor);
    if (request.cursor !== null && after === null) {
      throw new FieldsError([{ field: 'cursor', problem: FieldProblemCode.InvalidFormat }]);
    }
    const searching = request.search !== null;
    const maxAge = await this.seconds(
      searching
        ? PlatformSettingKey.CatalogueSearchMaxAgeSeconds
        : PlatformSettingKey.CatalogueListMaxAgeSeconds,
    );
    const stale = searching
      ? null
      : await this.seconds(PlatformSettingKey.CatalogueListStaleSeconds);
    return this.answer(shop, lang, ['products', request], maxAge, stale, () =>
      this.buildList(shop.row.id, request, after),
    );
  }

  /** PRD-09, LND-04: an active product's page by its link, current or old. */
  async product(
    shop: ApiShop,
    slug: string,
    lang: Language,
  ): Promise<CatalogueAnswer<PublicProductDetail>> {
    const link = slug.toLowerCase();
    const maxAge = await this.seconds(PlatformSettingKey.CatalogueDetailMaxAgeSeconds);
    return this.answer(shop, lang, ['product', link], maxAge, null, async () => {
      const found = await this.store.run((tx) => this.store.findBySlug(tx, shop.row.id, link));
      if (!found) throw new ApiError('not_found', 'ProductNotFound', {});
      return publicDetail(await this.products.get(shop.row.id, found.productId));
    });
  }

  /** PRD-03: the visible categories as a tree, each with its number of products (Slice 12b). */
  async categories(
    shop: ApiShop,
    lang: Language,
  ): Promise<CatalogueAnswer<{ categories: PublicCategory[] }>> {
    const maxAge = await this.seconds(PlatformSettingKey.CatalogueCategoriesMaxAgeSeconds);
    return this.answer(shop, lang, ['categories'], maxAge, null, () =>
      this.store.run(async (tx) => {
        const visible = visibleCategories(await this.store.listCategories(tx, shop.row.id));
        const images = await this.images.viewsOf(
          tx,
          shop.row.id,
          visible.map((row) => row.imageId),
        );
        const counts = new Map(
          (await this.store.countCategoryProducts(tx, shop.row.id)).map((row) => [
            row.categoryId,
            row.products,
          ]),
        );
        const children = new Map<string | null, PublicCategory[]>();
        for (const row of [...visible].reverse()) {
          const node: PublicCategory = {
            id: row.id,
            slug: row.slug,
            name: row.name,
            image: row.imageId === null ? null : (images.get(row.imageId) ?? null),
            productCount: counts.get(row.id) ?? 0,
            children: children.get(row.id) ?? [],
          };
          children.set(row.parentId, [node, ...(children.get(row.parentId) ?? [])]);
        }
        return { categories: children.get(null) ?? [] };
      }),
    );
  }

  /**
   * FED-04: the shop's Meta catalog feed, from the same cache as every other answer, by the same versions -- and by the
   * shop's main address, so its links follow the shop's own domain at once (Slice 13).
   */
  async feed(shop: ApiShop): Promise<CatalogueAnswer<string>> {
    const ownDomain = await this.domains.servingHost(shop.row.id);
    return this.answer(shop, 'en', ['feed', ownDomain], FEED_MAX_AGE_SECONDS, null, () =>
      this.feedCsv.build(shop.row.id, shop.row.slug, ownDomain),
    );
  }

  /**
   * The answer under a key naming the shop, both current versions and the request, built on a miss. The tag names the
   * same, the language its message is in, and the answer's format.
   */
  private async answer<T>(
    shop: ApiShop,
    lang: Language,
    request: unknown[],
    maxAge: number,
    stale: number | null,
    build: () => Promise<T>,
  ): Promise<CatalogueAnswer<T>> {
    const current = await this.versions.current(shop.row.id);
    const key = JSON.stringify([shop.row.id, current.shop, current.platform, ...request]);
    const data = await this.cache.get(key, maxAge * SECOND_MS, build);
    return { data, etag: this.tag(lang, [key]), cacheControl: cacheControl(maxAge, stale) };
  }

  private tag(lang: Language, parts: unknown[]): string {
    const digest = createHash('sha256')
      .update(JSON.stringify([ANSWER_FORMAT, lang, ...parts]))
      .digest('base64url');
    return `"${digest.slice(0, 27)}"`;
  }

  private buildList(
    tenantId: string,
    request: ListRequest,
    after: string[] | null,
  ): Promise<PublicProductPage> {
    return this.store.run(async (tx) => {
      const categoryIds =
        request.category === null ? null : await this.categoryScope(tx, tenantId, request.category);
      const rows = await this.search.listProducts(tx, tenantId, {
        categoryIds,
        search: request.search,
        sort: request.sort,
        inStock: request.inStock,
        after,
        limit: request.limit + 1,
      });
      const page = rows.slice(0, request.limit);
      const last = page.at(-1);
      const ids = page.map((row) => row.id);
      const images = await this.images.ofProducts(tx, tenantId, ids);
      const swatches = await this.swatchesOf(tx, tenantId, ids);
      return {
        products: page.map((row) => ({
          id: row.id,
          slug: row.slug,
          name: row.name,
          minPrice: row.minPrice,
          maxPrice: row.maxPrice,
          stockState: row.stockState,
          image: images.get(row.id)?.[0] ?? null,
          createdAt: row.createdAt,
          swatches: swatches.get(row.id) ?? [],
        })),
        nextCursor:
          rows.length > request.limit && last ? cursorOf(request.sort, last.position) : null,
      };
    });
  }

  /** ATR-18, Slice 12b: each product's card swatches, with their pictures' links. */
  private async swatchesOf(
    tx: Transaction,
    tenantId: string,
    productIds: string[],
  ): Promise<Map<string, PublicOptionValue[]>> {
    const rows = await this.store.listSwatches(tx, tenantId, productIds);
    const pictures = await this.images.viewsOf(
      tx,
      tenantId,
      rows.map((row) => row.swatchImageId),
    );
    const byProduct = new Map<string, PublicOptionValue[]>();
    for (const row of rows) {
      const swatch: PublicOptionValue = {
        id: row.optionId,
        value: row.value,
        swatchColor: row.swatchColor,
        swatchImage: row.swatchImageId === null ? null : (pictures.get(row.swatchImageId) ?? null),
      };
      byProduct.set(row.productId, [...(byProduct.get(row.productId) ?? []), swatch]);
    }
    return byProduct;
  }

  /** PRD-03, PRD-09: a visible category and every category under it; an unknown or hidden one is not found. */
  private async categoryScope(tx: Transaction, tenantId: string, slug: string): Promise<string[]> {
    const rows = await this.store.listCategories(tx, tenantId);
    const category = visibleCategories(rows).find((row) => row.slug === slug);
    if (!category) throw new ApiError('not_found', 'CategoryNotFound', {});
    const scope = [category.id];
    for (let index = 0; index < scope.length; index += 1) {
      const parent = scope[index];
      scope.push(...rows.filter((row) => row.parentId === parent).map((row) => row.id));
    }
    return scope;
  }

  private async seconds(key: PlatformSettingKey): Promise<number> {
    const setting = await this.settings.current(key);
    return typeof setting?.value === 'number' ? setting.value : (DEFAULT_SECONDS[key] ?? 0);
  }
}

/** PRD-03: the categories shown, in the shop's order: a hidden one hides everything under it. */
function visibleCategories(rows: readonly CategoryRecord[]): CategoryRecord[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const shown = (row: CategoryRecord): boolean => {
    if (!row.visible) return false;
    const parent = row.parentId === null ? undefined : byId.get(row.parentId);
    return parent === undefined ? row.parentId === null : shown(parent);
  };
  return rows.filter(shown);
}

/**
 * PRD-09, ATR-07: the dashboard's product page with only what the public may see. Variants not on sale are left out;
 * one sold out stays, marked unavailable. A choice offers only the values its variants on sale use.
 */
function publicDetail(detail: ProductDetail): PublicProductDetail {
  const onSale = detail.variants.filter((variant) => variant.active);
  const used = new Set(onSale.flatMap((variant) => variant.optionIds));
  return {
    id: detail.id,
    slug: detail.slug,
    name: detail.name,
    description: detail.description,
    minPrice: detail.minPrice,
    maxPrice: detail.maxPrice,
    stockState: detail.stockState,
    stockUnit: detail.stockUnit,
    condition: detail.condition,
    primaryCategoryId: detail.primaryCategoryId,
    categoryIds: detail.categoryIds,
    images: detail.images,
    video: detail.video,
    options: detail.variantAttributes.map((attribute) => ({
      attributeId: attribute.attributeId,
      name: attribute.name,
      dataType: attribute.dataType,
      unitKind: attribute.unitKind,
      values: attribute.options.filter((option) => used.has(option.id)),
    })),
    attributes: detail.attributes
      .filter((attribute) => attribute.role === AttributeRole.Informational)
      .map((attribute) => ({
        name: attribute.name,
        dataType: attribute.dataType,
        unitKind: attribute.unitKind,
        values: attribute.optionValues,
        text: attribute.textValue,
        number: attribute.numberValue,
        yes: attribute.boolValue,
      })),
    variants: onSale.map((variant) => ({
      id: variant.id,
      optionIds: variant.optionIds,
      price: variant.effectivePrice,
      stockState: variant.stockState,
      available: variant.stockState !== StockState.Out,
    })),
    sizeChart: detail.sizeChart
      ? { rows: detail.sizeChart.rows, image: detail.sizeChart.image }
      : null,
    paymentPolicy: detail.effectivePaymentPolicy,
    advanceAmount: detail.effectiveAdvanceAmount,
    deliveryZoneIds: detail.deliveryZoneIds,
  };
}
