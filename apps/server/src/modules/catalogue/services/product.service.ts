import { Inject, Injectable } from '@nestjs/common';
import type { SizeChartContent, Transaction } from '@lytronix/db';
import {
  AttributeDataType,
  AttributeRole,
  AuditAction,
  CAPTURED_DATA_TYPES,
  DeliveryMode,
  FieldProblemCode,
  MAX_VARIANTS_PER_PRODUCT,
  MEASURED_STOCK_UNITS,
  PRODUCT_NAME_MAX_LENGTH,
  normalizeSerial,
  SerialFormat,
  ServerFieldProblemCode,
  ItemCondition,
  StockState,
  StockTracking,
  TenantState,
  VARIANT_DATA_TYPES,
  STOCK_HOLDER_KEY,
  type CreateProductInput,
  type ListProductsQuery,
  type ProductDeliveryZonesInput,
  type ProductImagesInput,
  type ProductVideoInput,
  type SaveProductAttributesInput,
  type SaveVariantsInput,
  type UpdateProductInput,
  limitOf,
  UsageMetric,
} from '@lytronix/validators';
import { ApiError, FieldsError, type InvalidField } from '../../../common/api-error';
import { UsageWarnings } from '../../usage-warnings/services/usage-warnings';
import { MissingReference } from '../../../common/errors/missing-reference';
import { StockRefused } from '../../../common/errors/stock-refused';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import { readSerials } from '../../../common/serial-entry';
import { dhakaDate } from '../../../common/time';
import { PayAsYouGoBillingService } from '../../balance/services/payg-billing.service';
import type {
  AttributeStore,
  CatalogueImageStore,
  CatalogueTransactions,
  CategoryStore,
  ProductChange,
  ProductStockHooks,
  ProductStore,
  SizeChartStore,
  VariantChange,
} from '../ports/catalogue-stores';
import {
  ATTRIBUTE_STORE,
  CATALOGUE_IMAGE_STORE,
  CATALOGUE_TRANSACTIONS,
  CATEGORY_STORE,
  PRODUCT_STORE,
  SIZE_CHART_STORE,
} from '../tokens';
import type {
  AttributeRecord,
  CatalogueActor,
  CatalogueShop,
  OptionRecord,
  ProductAttributeValueRecord,
  ProductAttributeView,
  ProductDefaults,
  ProductDetail,
  ProductListItem,
  ProductPage,
  ProductRecord,
  SizeChartRecord,
  SizeChartView,
  VariantAttributeView,
  VariantRecord,
  VariantValueRecord,
  VariantView,
} from '../types/catalogue';
import { CatalogueActivity, type ResolvedActor } from './catalogue-activity';
import { CatalogueImages, refuseUnattachable } from './catalogue-images';
import { settlePaymentPolicy } from './payment-policy';
import { PresetService } from './preset.service';
import { ShopPaymentPolicyService } from './shop-payment-policy.service';
import { nextFreeSlug, slugOf } from './slug';
import { planVariants, type MatrixProblem, type PlannedVariant } from './variant-matrix';

type VariantSpec = NonNullable<CreateProductInput['variants']>[number];
type DescriptionInput = SaveProductAttributesInput['attributes'][number];
type MatrixInput = SaveVariantsInput['variantAttributes'];

/** A variant-defining attribute after its ids have been checked: the attribute and its listed options, in order. */
interface ResolvedMatrix {
  attributes: { attribute: AttributeRecord; optionIds: string[] }[];
  planned: PlannedVariant<VariantSpec>[];
}

/** An informational or captured-at-order attribute after checking it fits its type (ATL-02, ATR-08). */
interface ResolvedDescription {
  attribute: AttributeRecord;
  role: AttributeRole.Informational | AttributeRole.CapturedAtOrder;
  optionIds: string[];
  textValue: string | null;
  numberValue: string | null;
  boolValue: boolean | null;
}

function money(value: number | null | undefined): string | null | undefined {
  return value === undefined ? undefined : value === null ? null : String(value);
}

/** PRD-16, ATR-13: with no weight in play the mode is Default, whatever is stored. */
function effectiveMode(weight: string | null, mode: DeliveryMode): DeliveryMode {
  return weight === null ? DeliveryMode.Default : mode;
}

// PRD-18: what a copy's name ends with.
const COPY_SUFFIX = ' (copy)';

/** PRD-18: "<name> (copy)", the name shortened if it would not fit otherwise. */
function copyName(name: string): string {
  const room = PRODUCT_NAME_MAX_LENGTH - COPY_SUFFIX.length;
  return `${name.length > room ? name.slice(0, room).trimEnd() : name}${COPY_SUFFIX}`;
}

/** PRD-17: what a stored chart shows, to copy it: its table or its image. */
function chartContent(chart: SizeChartRecord): SizeChartContent | null {
  if (chart.imageId !== null) return { imageId: chart.imageId };
  return chart.tableRows !== null ? { rows: chart.tableRows } : null;
}

function variantChangeOf(spec: VariantSpec | null): VariantChange {
  if (!spec) return {};
  const change: VariantChange = {};
  const price = money(spec.price);
  if (price !== undefined) change.price = price;
  const weight = money(spec.weightKg);
  if (weight !== undefined) change.weightKg = weight;
  const charge = money(spec.deliveryCharge);
  if (charge !== undefined) change.deliveryCharge = charge;
  if (spec.sku !== undefined) change.sku = spec.sku;
  if (spec.barcode !== undefined) change.barcode = spec.barcode;
  if (spec.deliveryMode !== undefined) change.deliveryMode = spec.deliveryMode;
  if (spec.active !== undefined) change.active = spec.active;
  return change;
}

/**
 * PRD-01 to PRD-05, PRD-13 to PRD-18, ATR-03 to ATR-15, ATL-02 to ATL-04, PST-02, PST-06, PYG-16, LND-04: a shop's
 * products.
 * A product saves with its attributes and variants in one transaction, counts once against the plan's product
 * limit however many variants it has, is charged the pay-as-you-go fee once at creation, keeps its link slug
 * through renames, and moves the catalogue version with every change (CCH-02).
 */
/**
 * INV-15: the database refused to let go of a variant or product while units are held for orders -- retiring it,
 * deleting it for good. Those orders ship or are cancelled first.
 */
function refuseHeld(error: unknown): never {
  if (error instanceof StockRefused && error.kind === 'held') {
    throw new ApiError('conflict', 'UnitsHeldForOrders', {});
  }
  throw error;
}

@Injectable()
export class ProductService {
  constructor(
    @Inject(CATALOGUE_TRANSACTIONS) private readonly transactions: CatalogueTransactions,
    @Inject(PRODUCT_STORE) private readonly products: ProductStore,
    @Inject(CATEGORY_STORE) private readonly categories: CategoryStore,
    @Inject(ATTRIBUTE_STORE) private readonly attributes: AttributeStore,
    @Inject(SIZE_CHART_STORE) private readonly charts: SizeChartStore,
    @Inject(PresetService) private readonly presets: PresetService,
    @Inject(ShopPaymentPolicyService) private readonly shopPolicy: ShopPaymentPolicyService,
    @Inject(PayAsYouGoBillingService) private readonly payAsYouGo: PayAsYouGoBillingService,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
    @Inject(CATALOGUE_IMAGE_STORE) private readonly photos: CatalogueImageStore,
    @Inject(CatalogueImages) private readonly images: CatalogueImages,
    @Inject(UsageWarnings) private readonly warnings: UsageWarnings,
  ) {}

  /** LIM-02, PRD-04: the products the shop's limit counts. */
  liveCount(tenantId: string): Promise<number> {
    return this.transactions.run((tx) => this.products.countLiveProducts(tx, tenantId));
  }

  /** PRD-12: the dashboard's list, 20 to a page by default, archived products left out. */
  list(tenantId: string, query: ListProductsQuery): Promise<ProductPage> {
    return this.transactions.run(async (tx) => {
      const { rows, total } = await this.products.listProducts(tx, tenantId, {
        search: query.search,
        categoryId: query.categoryId,
        offset: (query.page - 1) * query.limit,
        limit: query.limit,
      });
      // PRD-11: each product's first photo, for the list.
      const photos = await this.images.ofProducts(
        tx,
        tenantId,
        rows.map(({ product }) => product.id),
      );
      const products: ProductListItem[] = rows.map(({ product, variantCount }) => ({
        id: product.id,
        name: product.name,
        slug: product.slug,
        basePrice: product.basePrice,
        minPrice: product.minPrice,
        maxPrice: product.maxPrice,
        active: product.active,
        stockState: product.stockState,
        primaryCategoryId: product.primaryCategoryId,
        variantCount,
        image: photos.get(product.id)?.[0] ?? null,
        createdAt: product.createdAt,
      }));
      return {
        products,
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      };
    });
  }

  get(tenantId: string, productId: string): Promise<ProductDetail> {
    return this.transactions.run((tx) => this.detail(tx, tenantId, productId));
  }

  /** PRD-01, ATR-03, ATR-11: a product, its attributes and its variants, saved together or not at all. */
  async create(
    shop: CatalogueShop,
    input: CreateProductInput,
    actor: CatalogueActor,
    stock?: ProductStockHooks,
  ): Promise<ProductDetail> {
    const who = await this.activity.resolve(shop.id, actor);
    return this.transactions.run(async (tx) => {
      // PRD-04: product creations count against the limit one after the other.
      await this.products.lockCatalogue(tx, shop.id);
      await this.refuseOverLimit(tx, shop);

      const categoryIds = await this.checkCategories(
        tx,
        shop.id,
        input.categoryIds ?? (input.primaryCategoryId ? [input.primaryCategoryId] : []),
      );
      const primaryCategoryId = input.primaryCategoryId ?? categoryIds[0] ?? null;
      // PST-06: the primary category, or the nearest one above it, may make it behave like another shop type.
      const defaults =
        (await this.presets.defaultsWithin(tx, shop, primaryCategoryId)) ??
        (await this.presets.defaultsFor(shop.businessType));
      const matrix = await this.resolveMatrix(
        tx,
        shop.id,
        input.variantAttributes ?? [],
        input.variants,
      );
      const described = await this.resolveDescriptions(
        tx,
        shop.id,
        input.attributes ?? [],
        new Set(matrix.attributes.map((entry) => entry.attribute.id)),
      );

      const fields = this.newProductFields(input, defaults);
      this.checkOpeningStock(input, fields);
      this.checkSerialUnits(fields);
      const shared = fields.sharedStock === true;
      this.checkPacks(input.variants, shared, fields.stockUnit);
      await this.refuseTakenSerials(tx, shop.id, input, fields, stock);

      const base = slugOf(input.name, 'product');
      const slug = nextFreeSlug(base, await this.products.slugsLike(tx, shop.id, base));
      const product = await this.products.insertProduct(tx, {
        tenantId: shop.id,
        slug,
        ...fields,
        primaryCategoryId,
      });
      await this.products.replaceCategoryLinks(tx, shop.id, product.id, categoryIds);
      await this.writeMatrixAttributes(tx, shop.id, product.id, matrix, new Set());
      await this.writeDescriptions(tx, shop.id, product.id, described, matrix.attributes.length);
      await this.writeVariants(tx, shop.id, product.id, matrix.planned, [], input.variants, shared);
      await this.products.refreshPriceRange(tx, shop.id, product.id);
      const holderId = shared ? await this.ensureStockHolder(tx, shop.id, product.id) : null;
      const opening = await this.openingLines(
        tx,
        shop.id,
        product.id,
        matrix.planned,
        product.serialFormat,
      );
      // INV-24: stock already on the shelf loose, in the product's unit, on top of any given as packs.
      if (holderId !== null && (input.sharedOpeningStock ?? 0) > 0) {
        opening.push({
          variantId: holderId,
          quantity: String(input.sharedOpeningStock),
          ...(input.sharedOpeningBatch ? { batch: input.sharedOpeningBatch } : {}),
        });
      }
      if (opening.length > 0) {
        if (!stock) throw new Error('opening stock is recorded through the inventory hooks');
        await stock.recordOpeningStock(tx, shop.id, product.id, opening, who);
      }

      // PYG-16: once, at creation, whatever the number of variants; part of this transaction, so a creation that
      // fails takes its charge with it.
      if (shop.state === TenantState.PayAsYouGo) {
        await this.payAsYouGo.chargeProductCreationFee(tx, shop.id, product.id);
      }
      await this.record(tx, shop.id, who, AuditAction.ProductCreated, product.id, {
        name: product.name,
        price: product.basePrice,
        variants: matrix.planned.length,
        ...(shared ? { sharedStock: true } : {}),
        ...(opening.length > 0 ? { openingStock: opening.length } : {}),
      });
      await this.products.bumpVersion(tx, shop.id);
      return this.detail(tx, shop.id, product.id);
    });
  }

  /**
   * PRD-18: a copy of the product in one action: its fields, categories, attributes, live variants (with their
   * prices, weights and delivery overrides, but no SKU or barcode, which stay the original's) and its own size
   * chart. The copy is inactive, named "<name> (copy)" with a new slug, holds no stock, and counts toward the
   * product limit and the pay-as-you-go fee like any new product.
   */
  async duplicate(
    shop: CatalogueShop,
    productId: string,
    actor: CatalogueActor,
  ): Promise<ProductDetail> {
    const who = await this.activity.resolve(shop.id, actor);
    return this.transactions.run(async (tx) => {
      await this.products.lockCatalogue(tx, shop.id);
      await this.refuseOverLimit(tx, shop);
      const source = await this.findLive(tx, shop.id, productId);

      const name = copyName(source.name);
      const base = slugOf(name, 'product');
      const slug = nextFreeSlug(base, await this.products.slugsLike(tx, shop.id, base));
      const copy = await this.products.insertProduct(tx, {
        tenantId: shop.id,
        slug,
        name,
        description: source.description,
        basePrice: source.basePrice,
        stockUnit: source.stockUnit,
        stockTracking: source.stockTracking,
        batchTracked: source.batchTracked,
        serialTracked: source.serialTracked,
        serialFormat: source.serialFormat,
        sharedStock: source.sharedStock,
        lowStockThreshold: source.lowStockThreshold,
        deliveryCharge: source.deliveryCharge,
        weightKg: source.weightKg,
        deliveryMode: source.deliveryMode,
        paymentPolicy: source.paymentPolicy,
        advanceAmount: source.advanceAmount,
        primaryCategoryId: source.primaryCategoryId,
        // PRD-11, PRD-18: the copy shows the same video, one item in the library.
        videoId: source.videoId,
        sortOrder: source.sortOrder,
        active: false,
        itemCondition: source.itemCondition,
        stockState:
          source.stockTracking === StockTracking.NotTracked ? StockState.In : StockState.Out,
      });

      const links = await this.products.listCategoryLinks(tx, shop.id, [productId]);
      await this.products.replaceCategoryLinks(
        tx,
        shop.id,
        copy.id,
        links.map((link) => link.categoryId),
      );
      const attributeRows = await this.products.listProductAttributes(tx, shop.id, productId);
      await this.products.insertProductAttributes(
        tx,
        attributeRows.map((row) => ({ ...row, productId: copy.id })),
      );
      const values = await this.products.listAttributeValues(tx, shop.id, productId);
      await this.products.insertAttributeValues(
        tx,
        values.map((value) => ({
          tenantId: shop.id,
          productId: copy.id,
          attributeId: value.attributeId,
          optionId: value.optionId,
          textValue: value.textValue,
          numberValue: value.numberValue,
          boolValue: value.boolValue,
        })),
      );

      const variants = await this.products.listVariants(tx, shop.id, productId, false);
      const variantValues = await this.products.listVariantValues(
        tx,
        shop.id,
        variants.map((variant) => variant.id),
      );
      const copiedValues: VariantValueRecord[] = [];
      for (const variant of variants) {
        const row = await this.products.insertVariant(tx, {
          tenantId: shop.id,
          productId: copy.id,
          combinationKey: variant.combinationKey,
          price: variant.price,
          weightKg: variant.weightKg,
          deliveryCharge: variant.deliveryCharge,
          deliveryMode: variant.deliveryMode,
          packAmount: variant.packAmount,
          active: variant.active,
        });
        for (const value of variantValues) {
          if (value.variantId === variant.id) {
            copiedValues.push({ ...value, productId: copy.id, variantId: row.id });
          }
        }
      }
      await this.products.insertVariantValues(tx, copiedValues);
      // INV-24: the copy shares its stock the same way, with a stock holder of its own, empty.
      if (source.sharedStock) await this.ensureStockHolder(tx, shop.id, copy.id);

      const chart = await this.charts.findChart(tx, shop.id, { productId });
      const content = chart ? chartContent(chart) : null;
      if (content) await this.charts.putChart(tx, shop.id, { productId: copy.id }, content);
      // PRD-11, PRD-18: the copy shows the same photos, in the same order; each stays one item in the library.
      const photos = await this.photos.listProductImages(tx, shop.id, [productId]);
      if (photos.length > 0) {
        await this.photos.setProductImages(
          tx,
          shop.id,
          copy.id,
          photos.map((photo) => photo.mediaId),
        );
      }
      // DLV-07: the copy goes where the original goes.
      await this.products.replaceDeliveryZones(
        tx,
        shop.id,
        copy.id,
        await this.products.listDeliveryZoneIds(tx, shop.id, productId),
      );
      await this.products.refreshPriceRange(tx, shop.id, copy.id);

      if (shop.state === TenantState.PayAsYouGo) {
        await this.payAsYouGo.chargeProductCreationFee(tx, shop.id, copy.id);
      }
      await this.record(tx, shop.id, who, AuditAction.ProductCreated, copy.id, {
        name: copy.name,
        price: copy.basePrice,
        variants: variants.length,
        duplicateOf: productId,
      });
      await this.products.bumpVersion(tx, shop.id);
      return this.detail(tx, shop.id, copy.id);
    });
  }

  /**
   * PRD-11: the product's photos become these, in the order shown -- each a ready image of the shop's; an empty list
   * removes them all. Removing a photo keeps it in the library.
   */
  async setImages(
    shop: CatalogueShop,
    productId: string,
    input: ProductImagesInput,
    actor: CatalogueActor,
  ): Promise<ProductDetail> {
    const who = await this.activity.resolve(shop.id, actor);
    return this.transactions.run(async (tx) => {
      await this.findLive(tx, shop.id, productId);
      try {
        await this.photos.setProductImages(tx, shop.id, productId, input.mediaIds);
      } catch (error) {
        refuseUnattachable(error, 'mediaIds');
      }
      await this.record(tx, shop.id, who, AuditAction.ProductImagesSaved, productId, {
        mediaIds: input.mediaIds,
      });
      await this.products.bumpVersion(tx, shop.id);
      return this.detail(tx, shop.id, productId);
    });
  }

  /** PRD-11: the product's one video, a ready video of the shop's, or none. Removing it keeps it in the library. */
  async setVideo(
    shop: CatalogueShop,
    productId: string,
    input: ProductVideoInput,
    actor: CatalogueActor,
  ): Promise<ProductDetail> {
    const who = await this.activity.resolve(shop.id, actor);
    return this.transactions.run(async (tx) => {
      await this.findLive(tx, shop.id, productId);
      try {
        await this.products.updateProduct(tx, shop.id, productId, { videoId: input.mediaId });
      } catch (error) {
        refuseUnattachable(error, 'mediaId');
      }
      await this.record(tx, shop.id, who, AuditAction.ProductVideoSaved, productId, {
        mediaId: input.mediaId,
      });
      await this.products.bumpVersion(tx, shop.id);
      return this.detail(tx, shop.id, productId);
    });
  }

  /** DLV-07: limits where the product may be delivered; an empty list lifts the limit. */
  async setDeliveryZones(
    shop: CatalogueShop,
    productId: string,
    input: ProductDeliveryZonesInput,
    actor: CatalogueActor,
  ): Promise<ProductDetail> {
    const who = await this.activity.resolve(shop.id, actor);
    return this.transactions.run(async (tx) => {
      await this.findLive(tx, shop.id, productId);
      const zoneIds = [...new Set(input.zoneIds)];
      try {
        await this.products.replaceDeliveryZones(tx, shop.id, productId, zoneIds);
      } catch (error) {
        if (error instanceof MissingReference) {
          throw new FieldsError([
            {
              field: 'zoneIds',
              problem: ServerFieldProblemCode.NotFound,
              messageKey: 'DeliveryZoneNotFound',
            },
          ]);
        }
        throw error;
      }
      await this.record(tx, shop.id, who, AuditAction.ProductUpdated, productId, {
        deliveryZoneIds: zoneIds,
      });
      await this.products.bumpVersion(tx, shop.id);
      return this.detail(tx, shop.id, productId);
    });
  }

  /** PRD-01, PRD-05: the product's own fields. The slug stays (LND-04); a price change records old and new. */
  async update(
    shop: CatalogueShop,
    productId: string,
    input: UpdateProductInput,
    actor: CatalogueActor,
    stock?: ProductStockHooks,
  ): Promise<ProductDetail> {
    const who = await this.activity.resolve(shop.id, actor);
    return this.transactions.run(async (tx) => {
      const current = await this.findLive(tx, shop.id, productId);
      const change = this.changedFields(current, input);

      if (input.categoryIds !== undefined || input.primaryCategoryId !== undefined) {
        const linked = (await this.products.listCategoryLinks(tx, shop.id, [productId])).map(
          (link) => link.categoryId,
        );
        const wanted = input.categoryIds ?? linked;
        const primary =
          input.primaryCategoryId !== undefined
            ? input.primaryCategoryId
            : current.primaryCategoryId !== null && wanted.includes(current.primaryCategoryId)
              ? current.primaryCategoryId
              : (wanted[0] ?? null);
        const filed = primary !== null && !wanted.includes(primary) ? [...wanted, primary] : wanted;
        const categoryIds = await this.checkCategories(tx, shop.id, filed);
        await this.products.replaceCategoryLinks(tx, shop.id, productId, categoryIds);
        change.primaryCategoryId = primary;
      }

      // INV-24: a product sharing its stock is never serial-numbered.
      if (current.sharedStock && change.serialTracked === true) {
        throw new FieldsError([{ field: 'serialTracked', problem: FieldProblemCode.NotAllowed }]);
      }
      this.checkSerialUnits({
        serialTracked: change.serialTracked ?? current.serialTracked,
        stockUnit: change.stockUnit ?? current.stockUnit,
      });
      // INV-02: a product going made to order first writes off what it holds, so the ledger stays true. One sharing
      // its stock stops sharing it with that (INV-24): a made-to-order product holds no stock to share.
      const untracking =
        change.stockTracking === StockTracking.NotTracked &&
        current.stockTracking === StockTracking.Tracked;
      if (untracking) {
        if (!stock) throw new Error('a tracking change goes through the inventory hooks');
        await stock.beforeUntracking(tx, shop.id, productId, who);
        if (current.sharedStock) change.sharedStock = false;
      }
      let updated: ProductRecord | null;
      try {
        updated = await this.products.updateProduct(tx, shop.id, productId, change);
      } catch (error) {
        if (error instanceof StockRefused && error.kind === 'serials_held') {
          throw new FieldsError(
            [
              {
                field: 'serialTracked',
                problem: FieldProblemCode.NotAllowed,
                messageKey: 'SerialsStillHeld',
              },
            ],
            'conflict',
          );
        }
        if (error instanceof StockRefused && error.kind === 'expired_waiting') {
          throw new FieldsError(
            [
              {
                field: 'batchTracked',
                problem: FieldProblemCode.NotAllowed,
                messageKey: 'ExpiredStockAwaitsWriteOff',
              },
            ],
            'conflict',
          );
        }
        if (error instanceof StockRefused && error.kind === 'held') {
          throw new ApiError('conflict', 'UnitsHeldForOrders', {});
        }
        if (error instanceof StockRefused) {
          throw new FieldsError([
            {
              field: 'stockUnit',
              problem: FieldProblemCode.NotAllowed,
              messageKey: 'WholeUnitsOnly',
            },
          ]);
        }
        throw error;
      }
      if (!updated) throw new ApiError('not_found', 'ProductNotFound', {});
      if (change.sharedStock === false) await this.retireStockHolder(tx, shop.id, productId);
      if (change.stockTracking !== undefined || change.lowStockThreshold !== undefined) {
        await stock?.refreshStockState(tx, shop.id, productId);
      }
      const priceChanged = updated.basePrice !== current.basePrice;
      if (priceChanged) await this.products.refreshPriceRange(tx, shop.id, productId);

      await this.record(tx, shop.id, who, AuditAction.ProductUpdated, productId, {
        fields: Object.keys(input),
        ...(priceChanged ? { oldPrice: current.basePrice, newPrice: updated.basePrice } : {}),
      });
      await this.products.bumpVersion(tx, shop.id);
      return this.detail(tx, shop.id, productId);
    });
  }

  /**
   * ATR-11: replaces the variant-defining attributes and the variants. A combination no longer listed is retired
   * (its stock history keeps its subject); one listed again comes back; an attribute that described the product
   * and now splits it moves over, while the product has no orders (ATR-15).
   */
  async saveVariants(
    shop: CatalogueShop,
    productId: string,
    input: SaveVariantsInput,
    actor: CatalogueActor,
    stock?: ProductStockHooks,
  ): Promise<ProductDetail> {
    const who = await this.activity.resolve(shop.id, actor);
    return this.transactions.run(async (tx) => {
      const product = await this.findLive(tx, shop.id, productId);
      // INV-24: left out, sharing stays as it is; switching it needs a counted product without serials, holding nothing.
      const shared = input.sharedStock ?? product.sharedStock;
      const switching = shared !== product.sharedStock;
      if (switching) await this.checkSwitch(tx, shop.id, product, shared, stock);
      this.checkPacks(input.variants, shared, product.stockUnit);
      const current = await this.products.listProductAttributes(tx, shop.id, productId);
      const splitting = new Set(
        current
          .filter((row) => row.role === AttributeRole.VariantDefining)
          .map((row) => row.attributeId),
      );
      const matrix = await this.resolveMatrix(tx, shop.id, input.variantAttributes, input.variants);
      const wanted = new Set(matrix.attributes.map((entry) => entry.attribute.id));

      const existing = await this.products.listVariants(tx, shop.id, productId, true);
      const keep = new Set(matrix.planned.map((plan) => plan.key));
      const retiring = existing.filter(
        (row) => row.deletedAt === null && !keep.has(row.combinationKey),
      );
      await this.products
        .retireVariants(
          tx,
          shop.id,
          retiring.map((row) => row.id),
        )
        .catch(refuseHeld);

      // Attributes that no longer split it, and descriptive ones that now do, leave their old rows.
      const leaving = current
        .filter((row) =>
          row.role === AttributeRole.VariantDefining
            ? !wanted.has(row.attributeId)
            : wanted.has(row.attributeId),
        )
        .map((row) => row.attributeId);
      await this.products.deleteProductAttributes(tx, shop.id, productId, leaving);
      const stillSplitting = new Set([...splitting].filter((id) => wanted.has(id)));
      await this.writeMatrixAttributes(tx, shop.id, productId, matrix, stillSplitting);

      await this.writeVariants(
        tx,
        shop.id,
        productId,
        matrix.planned,
        existing,
        input.variants,
        shared,
      );
      if (switching) {
        if (shared) await this.ensureStockHolder(tx, shop.id, productId);
        else await this.retireStockHolder(tx, shop.id, productId);
        await this.switchSharing(tx, shop.id, productId, shared);
      }
      await this.products.refreshPriceRange(tx, shop.id, productId);
      // CCH-08: a retired variant no longer sells, whatever it still holds (its stock stays, visible to the shop).
      await stock?.refreshStockState(tx, shop.id, productId);
      await this.record(tx, shop.id, who, AuditAction.ProductVariantsSaved, productId, {
        variants: matrix.planned.length,
        retired: retiring.length,
        ...(switching ? { sharedStock: shared } : {}),
      });
      await this.products.bumpVersion(tx, shop.id);
      return this.detail(tx, shop.id, productId);
    });
  }

  /** ATL-02, ATR-08: replaces the attributes that describe the product or are asked when ordering. */
  async saveAttributes(
    shop: CatalogueShop,
    productId: string,
    input: SaveProductAttributesInput,
    actor: CatalogueActor,
  ): Promise<ProductDetail> {
    const who = await this.activity.resolve(shop.id, actor);
    return this.transactions.run(async (tx) => {
      await this.findLive(tx, shop.id, productId);
      const current = await this.products.listProductAttributes(tx, shop.id, productId);
      const splitting = current.filter((row) => row.role === AttributeRole.VariantDefining);
      const described = await this.resolveDescriptions(
        tx,
        shop.id,
        input.attributes,
        new Set(splitting.map((row) => row.attributeId)),
      );
      await this.products.deleteProductAttributes(
        tx,
        shop.id,
        productId,
        current
          .filter((row) => row.role !== AttributeRole.VariantDefining)
          .map((row) => row.attributeId),
      );
      await this.writeDescriptions(tx, shop.id, productId, described, splitting.length);
      await this.record(tx, shop.id, who, AuditAction.ProductUpdated, productId, {
        attributes: described.map((entry) => entry.attribute.id),
      });
      await this.products.bumpVersion(tx, shop.id);
      return this.detail(tx, shop.id, productId);
    });
  }

  /**
   * LND-04: a deliberate change of the product's link. The old slug keeps leading here; a slug another product holds,
   * now or as one of its old links, is taken; one of this product's own old links can be taken back.
   */
  async changeSlug(
    shop: CatalogueShop,
    productId: string,
    slug: string,
    actor: CatalogueActor,
  ): Promise<ProductDetail> {
    const who = await this.activity.resolve(shop.id, actor);
    return this.transactions.run(async (tx) => {
      await this.products.lockCatalogue(tx, shop.id);
      const product = await this.findLive(tx, shop.id, productId);
      if (slug !== product.slug) {
        const holder = await this.products.slugHolder(tx, shop.id, slug);
        if (holder && holder.productId !== productId) this.refuseTakenSlug();
        if (holder && !holder.current) await this.products.deleteRedirect(tx, shop.id, slug);
        await this.products.insertRedirect(tx, shop.id, product.slug, productId);
        try {
          await this.products.updateProduct(tx, shop.id, productId, { slug });
        } catch (error) {
          if (error instanceof UniqueViolation) this.refuseTakenSlug();
          throw error;
        }
        await this.record(tx, shop.id, who, AuditAction.ProductSlugChanged, productId, {
          from: product.slug,
          to: slug,
        });
        await this.products.bumpVersion(tx, shop.id);
      }
      return this.detail(tx, shop.id, productId);
    });
  }

  /**
   * PRD-13: archives the product (hidden from lists and the shop, no longer counted against the limit), or with
   * `hard` removes it for good with its variants, attributes and old links.
   */
  async delete(
    shop: CatalogueShop,
    productId: string,
    hard: boolean,
    actor: CatalogueActor,
  ): Promise<void> {
    const who = await this.activity.resolve(shop.id, actor);
    await this.transactions.run(async (tx) => {
      const product = await this.products.findProduct(tx, shop.id, productId, true);
      if (!product) throw new ApiError('not_found', 'ProductNotFound', {});
      if (hard) {
        await this.products.deleteProduct(tx, shop.id, productId).catch(refuseHeld);
      } else if (product.deletedAt === null) {
        await this.products.updateProduct(tx, shop.id, productId, { deletedAt: new Date() });
      }
      await this.record(tx, shop.id, who, AuditAction.ProductDeleted, productId, {
        name: product.name,
        hard,
      });
      await this.products.bumpVersion(tx, shop.id);
    });
  }

  // --- Building blocks ---

  private async findLive(
    tx: Transaction,
    tenantId: string,
    productId: string,
  ): Promise<ProductRecord> {
    const product = await this.products.findProduct(tx, tenantId, productId, false);
    if (!product) throw new ApiError('not_found', 'ProductNotFound', {});
    return product;
  }

  /** PRD-04, ATR-12, DWN-07, PLN-19, TRL-03: one more product only while the shop is under its limit. */
  private async refuseOverLimit(tx: Transaction, shop: CatalogueShop): Promise<void> {
    const limit = limitOf(shop.planLimits, 'products');
    // null is unlimited (PLN-19), and so is a plan that sets no product limit at all.
    if (limit === null) return;
    const live = await this.products.countLiveProducts(tx, shop.id);
    if (live >= limit) {
      throw new ApiError(
        'plan_limit_reached',
        'ProductLimitReached',
        { metric: UsageMetric.Products, products: limit },
        undefined,
        {
          products: limit,
        },
      );
    }
    // LIM-01: the one this makes, warned of with its write.
    await this.warnings.check(tx, {
      tenantId: shop.id,
      metric: UsageMetric.Products,
      used: live + 1,
      limit,
    });
  }

  private async checkCategories(
    tx: Transaction,
    tenantId: string,
    ids: string[],
  ): Promise<string[]> {
    const unique = [...new Set(ids)];
    const found = new Set(
      (await this.categories.findCategories(tx, tenantId, unique)).map((row) => row.id),
    );
    const problems: InvalidField[] = ids
      .map((id, index) => ({ id, index }))
      .filter((entry) => !found.has(entry.id))
      .map((entry) => ({
        field: `categoryIds.${String(entry.index)}`,
        problem: ServerFieldProblemCode.NotFound,
        messageKey: 'CategoryNotFound',
      }));
    if (problems.length > 0) throw new FieldsError(problems);
    return unique;
  }

  /**
   * INV-02, UOM-03: opening stock is for a tracked product only, and in whole numbers unless its unit is measured
   * (kg, g, liter, ml). The database refuses both too; this names the field. For a product sharing its stock (INV-24),
   * a variant's opening stock is a whole number of its packs, and the loose stock follows the unit.
   */
  private checkOpeningStock(
    input: CreateProductInput,
    fields: Pick<
      ProductChange,
      | 'stockTracking'
      | 'stockUnit'
      | 'sharedStock'
      | 'batchTracked'
      | 'serialTracked'
      | 'serialFormat'
    >,
  ): void {
    const measured =
      fields.stockUnit !== undefined && MEASURED_STOCK_UNITS.includes(fields.stockUnit);
    const shared = fields.sharedStock === true;
    const problems = (input.variants ?? []).flatMap((spec, index): InvalidField[] => {
      const quantity = spec.openingStock ?? 0;
      if (quantity === 0) return [];
      const field = `variants.${String(index)}.openingStock`;
      if (fields.stockTracking === StockTracking.NotTracked) {
        return [
          { field, problem: FieldProblemCode.NotAllowed, messageKey: 'MadeToOrderHasNoStock' },
        ];
      }
      if (!Number.isInteger(quantity) && (shared || !measured)) {
        return [
          {
            field,
            problem: FieldProblemCode.NotAllowed,
            messageKey: shared ? 'WholePacksOnly' : 'WholeUnitsOnly',
          },
        ];
      }
      return [];
    });
    const loose = input.sharedOpeningStock ?? 0;
    if (shared && !measured && !Number.isInteger(loose)) {
      problems.push({
        field: 'sharedOpeningStock',
        problem: FieldProblemCode.NotAllowed,
        messageKey: 'WholeUnitsOnly',
      });
    }
    // INV-12: an opening batch is for a batch-tracked product, and never expired already.
    const today = dhakaDate(new Date());
    const batches: [string, { expiresOn?: string } | undefined][] = [
      ...(input.variants ?? []).map((spec, index): [string, { expiresOn?: string } | undefined] => [
        `variants.${String(index)}.openingBatch`,
        spec.openingBatch,
      ]),
      ['sharedOpeningBatch', input.sharedOpeningBatch],
    ];
    // INV-14, INV-23: opening serials are a serial-numbered product's, at most one per unit, each once in the product.
    const seen = new Set<string>();
    (input.variants ?? []).forEach((spec, index) => {
      if (!spec.openingSerials) return;
      const field = `variants.${String(index)}.openingSerials`;
      if (fields.serialTracked !== true) {
        problems.push({
          field,
          problem: FieldProblemCode.NotAllowed,
          messageKey: 'SerialsNotTracked',
        });
        return;
      }
      const read = readSerials(spec.openingSerials, fields.serialFormat ?? SerialFormat.Any, field);
      problems.push(...read.problems);
      read.serials.forEach((serial) => {
        if (seen.has(serial)) {
          const at = spec.openingSerials?.findIndex(
            (raw) => normalizeSerial(raw, fields.serialFormat ?? SerialFormat.Any) === serial,
          );
          problems.push({
            field: `${field}.${String(at ?? 0)}`,
            problem: FieldProblemCode.NotAllowed,
            messageKey: 'SerialRepeated',
          });
        }
        seen.add(serial);
      });
      if (read.serials.length > (spec.openingStock ?? 0)) {
        problems.push({
          field,
          problem: FieldProblemCode.TooMany,
          max: spec.openingStock ?? 0,
          messageKey: 'TooManySerials',
        });
      }
    });
    for (const [field, batch] of batches) {
      if (!batch) continue;
      if (fields.batchTracked !== true) {
        problems.push({
          field,
          problem: FieldProblemCode.NotAllowed,
          messageKey: 'BatchesNotTracked',
        });
      } else if (batch.expiresOn !== undefined && batch.expiresOn < today) {
        problems.push({
          field: `${field}.expiresOn`,
          problem: FieldProblemCode.NotAllowed,
          messageKey: 'ExpiryInThePast',
        });
      }
    }
    if (problems.length > 0) throw new FieldsError(problems);
  }

  /**
   * INV-24, UOM-03: a product sharing its stock lists its variants, each with its pack amount, a whole number unless
   * the product is counted in a measured unit; one that does not share has none. The database refuses a fraction too;
   * this names the field.
   */
  private checkPacks(
    variants: VariantSpec[] | undefined,
    shared: boolean,
    stockUnit: ProductChange['stockUnit'],
  ): void {
    if (shared && (!variants || variants.length === 0)) {
      throw new FieldsError([{ field: 'variants', problem: FieldProblemCode.Required }]);
    }
    const measured = stockUnit !== undefined && MEASURED_STOCK_UNITS.includes(stockUnit);
    const problems = (variants ?? []).flatMap((spec, index): InvalidField[] => {
      const field = `variants.${String(index)}.packAmount`;
      if (!shared) {
        return spec.packAmount !== undefined
          ? [{ field, problem: FieldProblemCode.NotAllowed }]
          : [];
      }
      if (spec.packAmount === undefined) return [{ field, problem: FieldProblemCode.Required }];
      if (!measured && !Number.isInteger(spec.packAmount)) {
        return [{ field, problem: FieldProblemCode.NotAllowed, messageKey: 'WholeUnitsOnly' }];
      }
      return [];
    });
    if (problems.length > 0) throw new FieldsError(problems);
  }

  /**
   * INV-24: shared stock is turned on only for a counted product without serial numbers, and on or off only while the
   * product holds nothing, since its stock is never converted between the two.
   */
  private async checkSwitch(
    tx: Transaction,
    tenantId: string,
    product: ProductRecord,
    shared: boolean,
    stock: ProductStockHooks | undefined,
  ): Promise<void> {
    if (shared && product.stockTracking !== StockTracking.Tracked) {
      throw new FieldsError([
        {
          field: 'sharedStock',
          problem: FieldProblemCode.NotAllowed,
          messageKey: 'MadeToOrderHasNoStock',
        },
      ]);
    }
    if (shared && product.serialTracked) {
      throw new FieldsError([{ field: 'sharedStock', problem: FieldProblemCode.NotAllowed }]);
    }
    if (!stock) throw new Error('a shared stock switch goes through the inventory hooks');
    if (await stock.holdsStock(tx, tenantId, product.id)) {
      throw new ApiError('conflict', 'SharedStockNeedsEmpty', {});
    }
  }

  /** INV-24: the flag itself; the database refuses it too if stock arrived since the check. */
  private async switchSharing(
    tx: Transaction,
    tenantId: string,
    productId: string,
    shared: boolean,
  ): Promise<void> {
    try {
      await this.products.updateProduct(tx, tenantId, productId, { sharedStock: shared });
    } catch (error) {
      if (error instanceof StockRefused && error.kind === 'not_empty') {
        throw new ApiError('conflict', 'SharedStockNeedsEmpty', {});
      }
      throw error;
    }
  }

  /** INV-24: the product's stock holder, made, or brought back when the product shared its stock before. */
  private async ensureStockHolder(
    tx: Transaction,
    tenantId: string,
    productId: string,
  ): Promise<string> {
    const holder = await this.products.findStockHolder(tx, tenantId, productId);
    if (holder) {
      if (holder.deletedAt !== null) {
        await this.products.updateVariant(tx, tenantId, holder.id, { deletedAt: null });
      }
      return holder.id;
    }
    const made = await this.products.insertVariant(tx, {
      tenantId,
      productId,
      combinationKey: STOCK_HOLDER_KEY,
      isStockHolder: true,
    });
    return made.id;
  }

  /**
   * INV-24: a product that stops sharing its stock retires its holder, keeping it and its history for when the product
   * shares again, and keeps no pack amounts.
   */
  private async retireStockHolder(
    tx: Transaction,
    tenantId: string,
    productId: string,
  ): Promise<void> {
    const holder = await this.products.findStockHolder(tx, tenantId, productId);
    if (holder && holder.deletedAt === null) {
      await this.products.retireVariants(tx, tenantId, [holder.id]).catch(refuseHeld);
    }
    await this.products.clearPackAmounts(tx, tenantId, productId);
  }

  /** INV-14: a serial is one per unit, so serial numbers need a product counted in whole units. */
  private checkSerialUnits(fields: Pick<ProductChange, 'serialTracked' | 'stockUnit'>): void {
    if (
      fields.serialTracked === true &&
      fields.stockUnit !== undefined &&
      MEASURED_STOCK_UNITS.includes(fields.stockUnit)
    ) {
      throw new FieldsError([
        {
          field: 'serialTracked',
          problem: FieldProblemCode.NotAllowed,
          messageKey: 'SerialsNeedWholeUnits',
        },
      ]);
    }
  }

  /** INV-14, INV-23: no opening serial may be one a unit the shop holds already has. */
  private async refuseTakenSerials(
    tx: Transaction,
    tenantId: string,
    input: CreateProductInput,
    fields: Pick<ProductChange, 'serialFormat'>,
    stock: ProductStockHooks | undefined,
  ): Promise<void> {
    const format = fields.serialFormat ?? SerialFormat.Any;
    const entered = (input.variants ?? []).flatMap((spec, index) =>
      (spec.openingSerials ?? []).map((raw, at) => ({
        field: `variants.${String(index)}.openingSerials.${String(at)}`,
        serial: normalizeSerial(raw, format),
      })),
    );
    if (entered.length === 0) return;
    if (!stock) throw new Error('opening serials are checked through the inventory hooks');
    const taken = new Set(
      await stock.takenSerials(
        tx,
        tenantId,
        entered.map((entry) => entry.serial),
      ),
    );
    const problems: InvalidField[] = entered
      .filter((entry) => taken.has(entry.serial))
      .map((entry) => ({
        field: entry.field,
        problem: ServerFieldProblemCode.Taken,
        messageKey: 'SerialTaken',
      }));
    if (problems.length > 0) throw new FieldsError(problems, 'conflict');
  }

  /**
   * INV-03, INV-12, INV-14: the opening stock each new variant was given, by the variant it became, with its batch and
   * the serials of its units, as stored.
   */
  private async openingLines(
    tx: Transaction,
    tenantId: string,
    productId: string,
    planned: PlannedVariant<VariantSpec>[],
    format: SerialFormat,
  ): Promise<Parameters<ProductStockHooks['recordOpeningStock']>[3]> {
    const stocked = planned.filter((plan) => (plan.spec?.openingStock ?? 0) > 0);
    if (stocked.length === 0) return [];
    const ids = new Map(
      (await this.products.listVariants(tx, tenantId, productId, false)).map((row) => [
        row.combinationKey,
        row.id,
      ]),
    );
    return stocked.flatMap((plan) => {
      const variantId = ids.get(plan.key);
      const batch = plan.spec?.openingBatch;
      const serials = plan.spec?.openingSerials?.map((raw) => normalizeSerial(raw, format));
      return variantId
        ? [
            {
              variantId,
              quantity: String(plan.spec?.openingStock ?? 0),
              ...(batch ? { batch } : {}),
              ...(serials ? { serials } : {}),
            },
          ]
        : [];
    });
  }

  /** PST-02: a new product's settings, with the shop type's defaults for whatever the request leaves out. */
  private newProductFields(
    input: CreateProductInput,
    defaults: ProductDefaults,
  ): ProductChange & Pick<ProductRecord, 'name' | 'basePrice'> {
    const stockTracking =
      input.stockTracking ??
      (input.batchTracked || input.serialTracked ? StockTracking.Tracked : defaults.stockTracking);
    const untracked = stockTracking === StockTracking.NotTracked;
    const serialTracked = untracked
      ? false
      : (input.serialTracked ?? (input.batchTracked ? false : defaults.serialTracked));
    const batchTracked = untracked
      ? false
      : (input.batchTracked ?? (serialTracked ? false : defaults.batchTracked));
    const weightKg = money(input.weightKg) ?? null;
    return {
      name: input.name,
      description: input.description ?? null,
      basePrice: String(input.basePrice),
      stockUnit: input.stockUnit ?? defaults.stockUnit,
      stockTracking,
      batchTracked,
      serialTracked,
      serialFormat: input.serialFormat ?? defaults.serialFormat,
      sharedStock: input.sharedStock ?? false,
      lowStockThreshold:
        input.lowStockThreshold !== undefined
          ? String(input.lowStockThreshold)
          : defaults.lowStockThreshold,
      deliveryCharge: money(input.deliveryCharge) ?? null,
      weightKg,
      // PRD-16: a product given a weight is charged by it unless the request says otherwise.
      deliveryMode:
        input.deliveryMode ?? (weightKg !== null ? DeliveryMode.Adjustable : DeliveryMode.Default),
      paymentPolicy: input.paymentPolicy ?? null,
      advanceAmount: money(input.advanceAmount) ?? null,
      active: input.active ?? true,
      itemCondition: input.condition ?? ItemCondition.New,
      // Slice 2's stock ledger keeps this exact; until then a counted product holds nothing yet.
      stockState: untracked ? StockState.In : StockState.Out,
    };
  }

  /** The fields a PATCH changes, checked against the product they land on (INV-02/12/14, PRD-08). */
  private changedFields(current: ProductRecord, input: UpdateProductInput): ProductChange {
    const change: ProductChange = {};
    if (input.name !== undefined) change.name = input.name;
    if (input.description !== undefined) change.description = input.description;
    if (input.basePrice !== undefined) change.basePrice = String(input.basePrice);
    if (input.stockUnit !== undefined) change.stockUnit = input.stockUnit;
    if (input.serialFormat !== undefined) change.serialFormat = input.serialFormat;
    if (input.lowStockThreshold !== undefined)
      change.lowStockThreshold = String(input.lowStockThreshold);
    if (input.deliveryCharge !== undefined)
      change.deliveryCharge = money(input.deliveryCharge) ?? null;
    if (input.weightKg !== undefined) change.weightKg = money(input.weightKg) ?? null;
    if (input.deliveryMode !== undefined) change.deliveryMode = input.deliveryMode;
    if (input.active !== undefined) change.active = input.active;
    if (input.condition !== undefined) change.itemCondition = input.condition;

    if (
      input.stockTracking !== undefined ||
      input.batchTracked !== undefined ||
      input.serialTracked !== undefined
    ) {
      const stockTracking =
        input.stockTracking ??
        (input.batchTracked || input.serialTracked ? StockTracking.Tracked : current.stockTracking);
      const untracked = stockTracking === StockTracking.NotTracked;
      const serialTracked = untracked
        ? false
        : (input.serialTracked ?? (input.batchTracked ? false : current.serialTracked));
      const batchTracked = untracked
        ? false
        : (input.batchTracked ?? (serialTracked ? false : current.batchTracked));
      Object.assign(change, { stockTracking, batchTracked, serialTracked });
      if (stockTracking !== current.stockTracking) {
        change.stockState = untracked ? StockState.In : StockState.Out;
      }
    }

    if (input.paymentPolicy !== undefined || input.advanceAmount !== undefined) {
      // PRD-08: null follows the shop's default policy.
      const settled = settlePaymentPolicy(
        { policy: current.paymentPolicy, advance: current.advanceAmount },
        { policy: input.paymentPolicy, advance: input.advanceAmount },
        'advanceAmount',
      );
      change.paymentPolicy = settled.policy;
      change.advanceAmount = settled.advance;
    }
    return change;
  }

  /** ATR-04, ATR-06, ATR-14, ATL-02, ATL-04: checks every id, then plans the combinations to store. */
  private async resolveMatrix(
    tx: Transaction,
    tenantId: string,
    input: MatrixInput,
    variants: VariantSpec[] | undefined,
  ): Promise<ResolvedMatrix> {
    const problems: InvalidField[] = [];
    const attributes = new Map(
      (
        await this.attributes.findAttributes(
          tx,
          tenantId,
          input.map((entry) => entry.attributeId),
        )
      ).map((row) => [row.id, row]),
    );
    const listed = input.map((entry) => ({ ...entry, optionIds: [...new Set(entry.optionIds)] }));
    const options = new Map(
      (
        await this.attributes.findOptions(
          tx,
          tenantId,
          listed.flatMap((entry) => entry.optionIds),
        )
      ).map((row) => [row.id, row]),
    );

    const resolved: ResolvedMatrix['attributes'] = [];
    listed.forEach((entry, index) => {
      const attribute = attributes.get(entry.attributeId);
      if (!attribute) {
        problems.push({
          field: `variantAttributes.${String(index)}.attributeId`,
          problem: ServerFieldProblemCode.NotFound,
          messageKey: 'AttributeNotFound',
        });
        return;
      }
      if (!VARIANT_DATA_TYPES.includes(attribute.dataType)) {
        problems.push({
          field: `variantAttributes.${String(index)}.attributeId`,
          problem: FieldProblemCode.NotAllowed,
          messageKey: 'AttributeCannotSplitVariants',
        });
        return;
      }
      entry.optionIds.forEach((optionId, position) => {
        if (options.get(optionId)?.attributeId !== attribute.id) {
          problems.push({
            field: `variantAttributes.${String(index)}.optionIds.${String(position)}`,
            problem: ServerFieldProblemCode.NotFound,
            messageKey: 'OptionNotOfAttribute',
          });
        }
      });
      resolved.push({ attribute, optionIds: entry.optionIds });
    });
    if (problems.length > 0) throw new FieldsError(problems);

    const optionAttribute = new Map(
      [...options.values()].map((option) => [option.id, option.attributeId]),
    );
    const plan = planVariants(
      resolved.map((entry) => ({ attributeId: entry.attribute.id, optionIds: entry.optionIds })),
      optionAttribute,
      variants,
      MAX_VARIANTS_PER_PRODUCT,
    );
    if (plan.problems.length > 0) this.refuseMatrix(plan.problems);
    return { attributes: resolved, planned: plan.planned };
  }

  private refuseMatrix(problems: MatrixProblem[]): never {
    const repeated = problems.some((problem) => problem.kind === 'combination_repeated');
    throw new FieldsError(
      problems.map((problem): InvalidField => {
        switch (problem.kind) {
          case 'option_not_listed':
            return {
              field: problem.field,
              problem: ServerFieldProblemCode.NotFound,
              messageKey: 'OptionNotOfAttribute',
            };
          case 'attribute_twice':
            return {
              field: problem.field,
              problem: FieldProblemCode.NotAllowed,
              messageKey: 'OneOptionPerAttribute',
            };
          case 'combination_repeated':
            return {
              field: problem.field,
              problem: ServerFieldProblemCode.AlreadyUsed,
              messageKey: 'VariantCombinationRepeated',
            };
          case 'too_many':
            return {
              field: problem.field,
              problem: FieldProblemCode.TooMany,
              max: problem.max,
              messageKey: 'TooManyVariants',
              params: { max: problem.max },
            };
        }
      }),
      // ATR-06: a repeated combination is a conflict, not a malformed request.
      repeated ? 'conflict' : 'validation_error',
    );
  }

  /** ATL-02, ATR-08: each describing attribute fits its role and its type; values name the attribute's own options. */
  private async resolveDescriptions(
    tx: Transaction,
    tenantId: string,
    input: DescriptionInput[],
    splitting: ReadonlySet<string>,
  ): Promise<ResolvedDescription[]> {
    const attributes = new Map(
      (
        await this.attributes.findAttributes(
          tx,
          tenantId,
          input.map((entry) => entry.attributeId),
        )
      ).map((row) => [row.id, row]),
    );
    const options = new Map(
      (
        await this.attributes.findOptions(
          tx,
          tenantId,
          input.flatMap((entry) => entry.optionIds ?? []),
        )
      ).map((row): [string, OptionRecord] => [row.id, row]),
    );
    const problems: InvalidField[] = [];
    const resolved: ResolvedDescription[] = [];
    input.forEach((entry, index) => {
      const at = `attributes.${String(index)}`;
      const attribute = attributes.get(entry.attributeId);
      if (!attribute) {
        problems.push({
          field: `${at}.attributeId`,
          problem: ServerFieldProblemCode.NotFound,
          messageKey: 'AttributeNotFound',
        });
        return;
      }
      if (splitting.has(attribute.id)) {
        problems.push({
          field: `${at}.attributeId`,
          problem: FieldProblemCode.NotAllowed,
          messageKey: 'AttributeAlreadyMakesVariants',
        });
        return;
      }
      const optionIds = [...new Set(entry.optionIds ?? [])];
      const given = [
        optionIds.length > 0,
        entry.textValue !== undefined,
        entry.numberValue !== undefined,
        entry.boolValue !== undefined,
      ].filter(Boolean).length;
      if (entry.role === AttributeRole.CapturedAtOrder) {
        if (!CAPTURED_DATA_TYPES.includes(attribute.dataType)) {
          problems.push({
            field: `${at}.role`,
            problem: FieldProblemCode.NotAllowed,
            messageKey: 'CapturedAttributeWrongType',
          });
        } else if (given > 0) {
          problems.push({
            field: at,
            problem: FieldProblemCode.NotAllowed,
            messageKey: 'AttributeValueWrongKind',
          });
        }
      } else if (!this.fitsType(attribute.dataType, entry, optionIds)) {
        problems.push({
          field: at,
          problem: FieldProblemCode.NotAllowed,
          messageKey: 'AttributeValueWrongKind',
        });
      }
      optionIds.forEach((optionId, position) => {
        if (options.get(optionId)?.attributeId !== attribute.id) {
          problems.push({
            field: `${at}.optionIds.${String(position)}`,
            problem: ServerFieldProblemCode.NotFound,
            messageKey: 'OptionNotOfAttribute',
          });
        }
      });
      resolved.push({
        attribute,
        role: entry.role,
        optionIds,
        textValue: entry.textValue ?? null,
        numberValue: entry.numberValue !== undefined ? String(entry.numberValue) : null,
        boolValue: entry.boolValue ?? null,
      });
    });
    if (problems.length > 0) throw new FieldsError(problems);
    return resolved;
  }

  /** An informational value matches its attribute's type; leaving it empty is always allowed (ATR-03). */
  private fitsType(type: AttributeDataType, entry: DescriptionInput, optionIds: string[]): boolean {
    const text = entry.textValue !== undefined;
    const number = entry.numberValue !== undefined;
    const bool = entry.boolValue !== undefined;
    switch (type) {
      case AttributeDataType.EnumSingle:
        return optionIds.length <= 1 && !text && !number && !bool;
      case AttributeDataType.EnumMulti:
        return !text && !number && !bool;
      case AttributeDataType.NumberWithUnit:
        return optionIds.length === 0 && !text && !bool;
      case AttributeDataType.Text:
        return optionIds.length === 0 && !number && !bool;
      case AttributeDataType.Boolean:
        return optionIds.length === 0 && !text && !number;
    }
  }

  /** The variant-defining attribute rows: new ones inserted, every one placed in the requested order. */
  private async writeMatrixAttributes(
    tx: Transaction,
    tenantId: string,
    productId: string,
    matrix: ResolvedMatrix,
    existing: ReadonlySet<string>,
  ): Promise<void> {
    await this.products.insertProductAttributes(
      tx,
      matrix.attributes
        .map((entry, sortOrder) => ({ entry, sortOrder }))
        .filter(({ entry }) => !existing.has(entry.attribute.id))
        .map(({ entry, sortOrder }) => ({
          tenantId,
          productId,
          attributeId: entry.attribute.id,
          role: AttributeRole.VariantDefining,
          sortOrder,
        })),
    );
    for (const [sortOrder, entry] of matrix.attributes.entries()) {
      if (existing.has(entry.attribute.id)) {
        await this.products.setAttributeOrder(
          tx,
          tenantId,
          productId,
          entry.attribute.id,
          sortOrder,
        );
      }
    }
  }

  private async writeDescriptions(
    tx: Transaction,
    tenantId: string,
    productId: string,
    described: ResolvedDescription[],
    offset: number,
  ): Promise<void> {
    await this.products.insertProductAttributes(
      tx,
      described.map((entry, index) => ({
        tenantId,
        productId,
        attributeId: entry.attribute.id,
        role: entry.role,
        sortOrder: offset + index,
      })),
    );
    await this.products.insertAttributeValues(
      tx,
      described.flatMap((entry): Omit<ProductAttributeValueRecord, 'id'>[] => {
        const base = { tenantId, productId, attributeId: entry.attribute.id };
        const empty = { optionId: null, textValue: null, numberValue: null, boolValue: null };
        if (entry.optionIds.length > 0) {
          return entry.optionIds.map((optionId) => ({ ...base, ...empty, optionId }));
        }
        if (entry.textValue !== null) return [{ ...base, ...empty, textValue: entry.textValue }];
        if (entry.numberValue !== null)
          return [{ ...base, ...empty, numberValue: entry.numberValue }];
        if (entry.boolValue !== null) return [{ ...base, ...empty, boolValue: entry.boolValue }];
        return [];
      }),
    );
  }

  /**
   * Writes the planned variants: a live one with the same combination keeps its row (and its overrides unless the
   * request changes them), a retired one comes back, anything else is new. On a product sharing its stock, each takes
   * the pack amount listed for it (INV-24).
   */
  private async writeVariants(
    tx: Transaction,
    tenantId: string,
    productId: string,
    planned: PlannedVariant<VariantSpec>[],
    existing: VariantRecord[],
    requested: VariantSpec[] | undefined,
    shared: boolean,
  ): Promise<void> {
    const byKey = new Map(existing.map((row) => [row.combinationKey, row]));
    const values: Parameters<ProductStore['insertVariantValues']>[1] = [];
    for (const plan of planned) {
      const change = variantChangeOf(plan.spec);
      if (shared && plan.spec?.packAmount !== undefined) {
        change.packAmount = String(plan.spec.packAmount);
      }
      const at = plan.spec && requested ? requested.indexOf(plan.spec) : -1;
      try {
        const found = byKey.get(plan.key);
        if (found && found.deletedAt === null) {
          if (Object.keys(change).length > 0)
            await this.products.updateVariant(tx, tenantId, found.id, change);
          continue;
        }
        const row = found
          ? await this.products.updateVariant(tx, tenantId, found.id, {
              ...change,
              deletedAt: null,
            })
          : await this.products.insertVariant(tx, {
              tenantId,
              productId,
              combinationKey: plan.key,
              ...change,
            });
        if (!row) throw new ApiError('not_found', 'ProductNotFound', {});
        for (const pair of plan.pairs)
          values.push({ tenantId, productId, variantId: row.id, ...pair });
      } catch (error) {
        if (error instanceof StockRefused && error.kind === 'whole_units') {
          throw new FieldsError([
            {
              field: at >= 0 ? `variants.${String(at)}.packAmount` : 'variants',
              problem: FieldProblemCode.NotAllowed,
              messageKey: 'WholeUnitsOnly',
            },
          ]);
        }
        if (error instanceof UniqueViolation && error.target === 'sku') {
          throw new FieldsError(
            [
              {
                field: at >= 0 ? `variants.${String(at)}.sku` : 'variants',
                problem: ServerFieldProblemCode.Taken,
                messageKey: 'SkuTaken',
              },
            ],
            'conflict',
          );
        }
        throw error;
      }
    }
    await this.products.insertVariantValues(tx, values);
  }

  private refuseTakenSlug(): never {
    throw new FieldsError(
      [{ field: 'slug', problem: ServerFieldProblemCode.Taken, messageKey: 'ProductSlugTaken' }],
      'conflict',
    );
  }

  private record(
    tx: Transaction,
    tenantId: string,
    who: ResolvedActor,
    action: AuditAction,
    productId: string,
    summary: Record<string, unknown>,
  ): Promise<void> {
    return this.activity.record(
      tx,
      tenantId,
      who,
      action,
      { type: 'product', id: productId },
      summary,
    );
  }

  /** Everything the product edit screen shows (ATR-11, ATR-17), in one read. */
  private async detail(
    tx: Transaction,
    tenantId: string,
    productId: string,
  ): Promise<ProductDetail> {
    const product = await this.products.findProduct(tx, tenantId, productId, true);
    if (!product) throw new ApiError('not_found', 'ProductNotFound', {});
    const [links, oldSlugs, productAttributes, values, variants] = [
      await this.products.listCategoryLinks(tx, tenantId, [productId]),
      await this.products.listRedirects(tx, tenantId, productId),
      await this.products.listProductAttributes(tx, tenantId, productId),
      await this.products.listAttributeValues(tx, tenantId, productId),
      await this.products.listVariants(tx, tenantId, productId, false),
    ];
    const variantValues = await this.products.listVariantValues(
      tx,
      tenantId,
      variants.map((row) => row.id),
    );
    const attributes = new Map(
      (
        await this.attributes.findAttributes(
          tx,
          tenantId,
          productAttributes.map((row) => row.attributeId),
        )
      ).map((row) => [row.id, row]),
    );
    const optionIds = [
      ...new Set([
        ...values.flatMap((row) => (row.optionId ? [row.optionId] : [])),
        ...variantValues.map((row) => row.optionId),
      ]),
    ];
    const options = new Map(
      (await this.attributes.findOptions(tx, tenantId, optionIds)).map(
        (row): [string, OptionRecord] => [row.id, row],
      ),
    );
    // ATR-18: the swatch images of the options its variants use.
    const swatches = await this.images.viewsOf(
      tx,
      tenantId,
      [...options.values()].map((option) => option.swatchImageId),
    );
    const byOrder = (a: OptionRecord, b: OptionRecord, numeric: boolean) =>
      numeric
        ? Number(a.value) - Number(b.value)
        : a.sortOrder - b.sortOrder || a.value.localeCompare(b.value);

    const splitting = productAttributes.filter((row) => row.role === AttributeRole.VariantDefining);
    const variantAttributes: VariantAttributeView[] = splitting.flatMap((row) => {
      const attribute = attributes.get(row.attributeId);
      if (!attribute) return [];
      const numeric = attribute.dataType === AttributeDataType.NumberWithUnit;
      const used = [
        ...new Set(
          variantValues
            .filter((value) => value.attributeId === row.attributeId)
            .map((value) => value.optionId),
        ),
      ]
        .flatMap((id) => {
          const option = options.get(id);
          return option ? [option] : [];
        })
        .sort((a, b) => byOrder(a, b, numeric));
      return [
        {
          attributeId: attribute.id,
          name: attribute.name,
          dataType: attribute.dataType,
          unitKind: attribute.unitKind,
          options: used.map((option) => ({
            id: option.id,
            value: option.value,
            swatchColor: option.swatchColor,
            swatchImage:
              option.swatchImageId === null ? null : (swatches.get(option.swatchImageId) ?? null),
          })),
        },
      ];
    });

    const described: ProductAttributeView[] = productAttributes
      .filter((row) => row.role !== AttributeRole.VariantDefining)
      .flatMap((row) => {
        const attribute = attributes.get(row.attributeId);
        if (!attribute || row.role === AttributeRole.VariantDefining) return [];
        const own = values.filter((value) => value.attributeId === row.attributeId);
        const chosen = own.flatMap((value) => (value.optionId ? [value.optionId] : []));
        return [
          {
            attributeId: attribute.id,
            name: attribute.name,
            dataType: attribute.dataType,
            unitKind: attribute.unitKind,
            role: row.role,
            optionIds: chosen,
            optionValues: chosen.flatMap((id) => {
              const option = options.get(id);
              return option ? [option.value] : [];
            }),
            textValue: own.find((value) => value.textValue !== null)?.textValue ?? null,
            numberValue: own.find((value) => value.numberValue !== null)?.numberValue ?? null,
            boolValue: own.find((value) => value.boolValue !== null)?.boolValue ?? null,
          },
        ];
      });

    const attributeOrder = new Map(splitting.map((row, index) => [row.attributeId, index]));
    const variantViews: VariantView[] = variants.map((variant) => {
      const weight = variant.weightKg ?? product.weightKg;
      const mode = variant.deliveryMode ?? product.deliveryMode;
      return {
        id: variant.id,
        optionIds: variantValues
          .filter((value) => value.variantId === variant.id)
          .sort(
            (a, b) =>
              (attributeOrder.get(a.attributeId) ?? 0) - (attributeOrder.get(b.attributeId) ?? 0),
          )
          .map((value) => value.optionId),
        sku: variant.sku,
        barcode: variant.barcode,
        price: variant.price,
        effectivePrice: variant.price ?? product.basePrice,
        weightKg: variant.weightKg,
        deliveryCharge: variant.deliveryCharge,
        deliveryMode: variant.deliveryMode,
        effectiveDeliveryMode: effectiveMode(weight, mode),
        packAmount: variant.packAmount,
        active: variant.active,
        stockState: variant.stockState,
      };
    });

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      oldSlugs,
      description: product.description,
      basePrice: product.basePrice,
      stockUnit: product.stockUnit,
      stockTracking: product.stockTracking,
      batchTracked: product.batchTracked,
      serialTracked: product.serialTracked,
      serialFormat: product.serialFormat,
      sharedStock: product.sharedStock,
      lowStockThreshold: product.lowStockThreshold,
      deliveryCharge: product.deliveryCharge,
      weightKg: product.weightKg,
      deliveryMode: product.deliveryMode,
      effectiveDeliveryMode: effectiveMode(product.weightKg, product.deliveryMode),
      paymentPolicy: product.paymentPolicy,
      advanceAmount: product.advanceAmount,
      ...(await this.effectivePolicy(tx, tenantId, product)),
      active: product.active,
      archived: product.deletedAt !== null,
      condition: product.itemCondition,
      categoryIds: links.map((link) => link.categoryId),
      primaryCategoryId: product.primaryCategoryId,
      minPrice: product.minPrice,
      maxPrice: product.maxPrice,
      stockState: product.stockState,
      variantAttributes,
      attributes: described,
      variants: variantViews,
      sizeChart: await this.sizeChartOf(tx, tenantId, product),
      images: (await this.images.ofProducts(tx, tenantId, [productId])).get(productId) ?? [],
      video: await this.images.videoOf(tx, tenantId, product.videoId),
      deliveryZoneIds: await this.products.listDeliveryZoneIds(tx, tenantId, productId),
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  /** PRD-08: the product's own policy and advance when it has a policy, else the shop's default pair. */
  private async effectivePolicy(
    tx: Transaction,
    tenantId: string,
    product: ProductRecord,
  ): Promise<Pick<ProductDetail, 'effectivePaymentPolicy' | 'effectiveAdvanceAmount'>> {
    if (product.paymentPolicy !== null) {
      return {
        effectivePaymentPolicy: product.paymentPolicy,
        effectiveAdvanceAmount: product.advanceAmount,
      };
    }
    const shop = await this.shopPolicy.within(tx, tenantId);
    return {
      effectivePaymentPolicy: shop.defaultPaymentPolicy,
      effectiveAdvanceAmount: shop.defaultAdvanceAmount,
    };
  }

  /** PRD-17: the product's own chart, else the one on its primary category or the nearest category above it. */
  private async sizeChartOf(
    tx: Transaction,
    tenantId: string,
    product: ProductRecord,
  ): Promise<SizeChartView | null> {
    const shown = async (
      chart: SizeChartRecord,
      categoryId: string | null,
    ): Promise<SizeChartView> => {
      const images = await this.images.viewsOf(tx, tenantId, [chart.imageId]);
      return {
        source: categoryId === null ? 'product' : 'category',
        categoryId,
        rows: chart.tableRows,
        image: chart.imageId === null ? null : (images.get(chart.imageId) ?? null),
      };
    };
    const own = await this.charts.findChart(tx, tenantId, { productId: product.id });
    if (own) return shown(own, null);
    if (product.primaryCategoryId === null) return null;
    const charts = new Map(
      (await this.charts.listCategoryCharts(tx, tenantId)).map((chart) => [
        chart.categoryId,
        chart,
      ]),
    );
    if (charts.size === 0) return null;
    for (const category of await this.categories.lineage(tx, tenantId, product.primaryCategoryId)) {
      const chart = charts.get(category.id);
      if (chart) return shown(chart, category.id);
    }
    return null;
  }
}
