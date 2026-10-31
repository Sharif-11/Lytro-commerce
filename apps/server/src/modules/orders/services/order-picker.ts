import { Inject, Injectable } from '@nestjs/common';
import { listProductsSchema, ProductKind, StockTracking } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { ProductService } from '../../catalogue/services/product.service';
import type { CatalogueShop, ProductDetail } from '../../catalogue/types/catalogue';
import { StockService } from '../../inventory/services/stock.service';
import type { ProductStockView } from '../../inventory/types/inventory';
import type { OrderPickerPage, OrderPickerProduct } from '../types/orders';

/** Units on sale, as a decimal string; null when nothing limits it (made to order, INV-02). */
function onSale(stock: ProductStockView): string | null {
  // A combo holds no stock of its own: its units are what its parts make (CMB-02).
  if (stock.combo) return stock.combo.canMake === null ? null : String(stock.combo.canMake);
  if (stock.stockTracking !== StockTracking.Tracked) return null;
  const total = stock.variants
    .filter((variant) => !variant.retired)
    .reduce((sum, variant) => sum + Number(variant.available), 0);
  return total.toFixed(3);
}

/** A variant's options as the shop names them ("L · Black"); empty for a product's one variant. */
function labelOf(product: ProductDetail, optionIds: readonly string[]): string {
  const names = new Map(
    product.variantAttributes.flatMap((attribute) =>
      attribute.options.map((option) => [option.id, option.value] as const),
    ),
  );
  return optionIds.flatMap((id) => names.get(id) ?? []).join(' · ');
}

/**
 * New order's Add an item (Slice 4.8a, agreed 2026-10-31): the shop's products and, for one, its variants with the
 * units each has on sale, a combo's parts and an ordinary product's add-on groups -- for whoever may enter orders,
 * without the stock or catalogue permissions those screens need. No cost is ever in it.
 */
@Injectable()
export class OrderPicker {
  constructor(
    @Inject(ProductService) private readonly products: ProductService,
    @Inject(StockService) private readonly stock: StockService,
  ) {}

  /** A page of products found by name (archived ones left out; staff may order one off sale, PRD-06). */
  async list(
    shop: CatalogueShop,
    search: string | undefined,
    page: number,
  ): Promise<OrderPickerPage> {
    const found = await this.products.list(shop, listProductsSchema.parse({ search, page }));
    const products = [];
    for (const product of found.products) {
      const stock = await this.stock.view(shop.id, product.id, false);
      products.push({
        id: product.id,
        name: product.name,
        kind: product.kind,
        minPrice: product.minPrice ?? product.basePrice,
        maxPrice: product.maxPrice ?? product.basePrice,
        active: product.active,
        image: product.image?.urls.thumbnail ?? null,
        variantCount: product.variantCount,
        available: onSale(stock),
      });
    }
    return { products, page: found.page, pages: found.pages, total: found.total };
  }

  /** One product to add: its variants on sale with their units, a combo's parts likewise, its add-on groups. */
  async product(tenantId: string, productId: string): Promise<OrderPickerProduct> {
    const product = await this.products.get(tenantId, productId);
    if (product.archived) throw new ApiError('not_found', 'ProductNotFound', {});
    const stock = await this.stock.view(tenantId, productId, false);
    const own = new Map(stock.variants.map((variant) => [variant.variantId, variant]));
    const tracked = stock.stockTracking === StockTracking.Tracked;
    // CMB-03: each part's variants with the units their own products have on sale.
    const parts = [];
    for (const part of product.parts) {
      const units = new Map<string, string | null>();
      for (const productOf of new Set(part.variants.map((variant) => variant.productId))) {
        const of = await this.stock.view(tenantId, productOf, false);
        for (const variant of of.variants) {
          units.set(
            variant.variantId,
            of.stockTracking === StockTracking.Tracked ? variant.available : null,
          );
        }
      }
      parts.push({
        position: part.position,
        quantity: part.quantity,
        variants: part.variants.map((variant) => ({
          variantId: variant.variantId,
          productName: variant.productName,
          label: variant.label,
          onSale: variant.available,
          available: units.get(variant.variantId) ?? null,
        })),
      });
    }
    return {
      id: product.id,
      name: product.name,
      kind: product.kind,
      active: product.active,
      variants:
        product.kind === ProductKind.Combo
          ? product.variants.map((variant) => ({
              variantId: variant.id,
              label: '',
              price: variant.effectivePrice,
              available: onSale(stock),
            }))
          : product.variants
              .filter((variant) => !own.get(variant.id)?.retired)
              .map((variant) => ({
                variantId: variant.id,
                label: labelOf(product, variant.optionIds),
                price: variant.effectivePrice,
                available: tracked ? (own.get(variant.id)?.available ?? '0.000') : null,
              })),
      parts,
      modifierGroups: product.modifierGroups,
    };
  }
}
