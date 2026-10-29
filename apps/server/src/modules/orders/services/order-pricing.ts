import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  DeliveryMode,
  FieldProblemCode,
  FulfilmentType,
  PaymentPolicy,
  ServerFieldProblemCode,
  StockState,
  type DeliveryEstimateInput,
} from '@lytronix/validators';
import { FieldsError, type InvalidField } from '../../../common/api-error';
import {
  fromPaisa,
  quantityTimesCost,
  toPaisa,
  weightExtraPaisa,
} from '../../balance/services/money';
import { ShopDeliveryRateService } from '../../balance/services/shop-delivery-rate.service';
import { ProductService } from '../../catalogue/services/product.service';
import type { OrderableVariant } from '../../catalogue/types/catalogue';
import { DeliveryZoneService } from '../../delivery/services/delivery-zone.service';
import { LocationService } from '../../delivery/services/location.service';
import type { ResolvedZoneView } from '../../delivery/types/delivery';
import type { OrderStore } from '../ports/order-store';
import { ORDER_STORE } from '../tokens';

/** One item as pricing reads it: its price, quantity and discount, and how it delivers and is paid for. */
export interface PricingLine {
  unitPrice: string;
  quantity: string;
  itemDiscount: string;
  /** ATR-13: the effective weight of one unit, in kg. */
  weightKg: string | null;
  /** DLV-03: the variant's or product's own delivery charge; null charges the order's zone. */
  ownDeliveryCharge: string | null;
  deliveryMode: DeliveryMode;
  paymentPolicy: PaymentPolicy;
  /** PRD-08: a partial advance's amount. */
  policyAdvance: string | null;
}

export interface PricingInput {
  fulfilmentType: FulfilmentType;
  /** DLV-02: the charge of the zone the order goes to, for a delivery. */
  zoneCharge: string | null;
  /** RAT-14: the shop's extra charge per kg over 1 kg. */
  extraChargePerKg: string;
  lines: readonly PricingLine[];
  discount: string;
  /** ORD-06: the order's delivery charge set by hand; null works it out. */
  deliveryChargeByHand: string | null;
}

export interface PricedLine {
  itemTotal: string;
  /** ORD-06a: what this line itself adds to the delivery charge. */
  deliveryCharge: string;
  /** PRD-08: the advance this line asks before delivery. */
  advance: string;
}

export interface OrderPrice {
  lines: PricedLine[];
  subtotal: string;
  /** ORD-06a: the zone's charge, charged once when any line is a zone line; null when none is. */
  zoneCharged: string | null;
  deliveryCharge: string;
  discount: string;
  grandTotal: string;
  advanceDue: string;
  codAmount: string;
}

function max(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

function min(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

/**
 * D4-9, ORD-06, ORD-06a, ORD-16, PRD-08, MNU-04: the one pricing rule, used wherever an order is priced. Each item is its
 * price times its quantity less its own discount; the subtotal adds them. Only a delivery has a delivery charge: a line
 * with its own charge is charged by its own mode -- Default, the charge per unit; Adjustable, the charge once plus the
 * shop's rate per kg over 1 kg of the line's weight -- and every other line is a zone line: the zone's charge once per
 * order, plus that rate on each Adjustable zone line's weight over 1 kg. Staff may set the order's delivery charge by
 * hand instead. The grand total is the subtotal less the order's discount plus the delivery charge. The advance asks
 * each partial-advance line's amount (never more than the line), each prepaid line in full, and the delivery charge
 * once when any line is prepaid or asks its delivery charge first; cash on delivery is the rest. A discount larger than
 * what it comes off is refused, naming its field.
 */
export function priceOrder(input: PricingInput): OrderPrice {
  const delivering = input.fulfilmentType === FulfilmentType.Delivery;
  const rate = input.extraChargePerKg;
  const problems: InvalidField[] = [];
  const lines = input.lines.map((line, index) => {
    const amount = quantityTimesCost(line.quantity, line.unitPrice);
    const discount = toPaisa(line.itemDiscount);
    if (discount > amount) {
      problems.push({
        field: `items.${String(index)}.itemDiscount`,
        problem: FieldProblemCode.TooLarge,
        max: Number(fromPaisa(amount)),
      });
    }
    const itemTotal = max(amount - discount, 0n);
    const extra =
      line.deliveryMode === DeliveryMode.Adjustable && line.weightKg !== null
        ? weightExtraPaisa(line.weightKg, line.quantity, rate)
        : 0n;
    let delivery = 0n;
    if (delivering) {
      if (line.ownDeliveryCharge === null) {
        delivery = extra;
      } else if (line.deliveryMode === DeliveryMode.Adjustable) {
        delivery = toPaisa(line.ownDeliveryCharge) + extra;
      } else {
        delivery = quantityTimesCost(line.quantity, line.ownDeliveryCharge);
      }
    }
    let advance = 0n;
    if (line.paymentPolicy === PaymentPolicy.PartialAdvance && line.policyAdvance !== null) {
      advance = min(toPaisa(line.policyAdvance), itemTotal);
    } else if (line.paymentPolicy === PaymentPolicy.FullPrepayment) {
      advance = itemTotal;
    }
    return { itemTotal, delivery, advance };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.itemTotal, 0n);
  const orderDiscount = toPaisa(input.discount);
  if (orderDiscount > subtotal) {
    problems.push({
      field: 'discount',
      problem: FieldProblemCode.TooLarge,
      max: Number(fromPaisa(subtotal)),
    });
  }
  if (problems.length > 0) throw new FieldsError(problems);
  const anyZoneLine = input.lines.some((line) => line.ownDeliveryCharge === null);
  // PRD-08: a prepaid line, or one asking its delivery charge first, asks the order's delivery charge once.
  const deliveryFirst = input.lines.some(
    (line) =>
      line.paymentPolicy === PaymentPolicy.FullPrepayment ||
      line.paymentPolicy === PaymentPolicy.DeliveryChargeOnly,
  );
  const zoneCharged =
    delivering && anyZoneLine && input.zoneCharge !== null ? toPaisa(input.zoneCharge) : null;
  const workedOut = (zoneCharged ?? 0n) + lines.reduce((sum, line) => sum + line.delivery, 0n);
  const deliveryCharge =
    delivering && input.deliveryChargeByHand !== null
      ? toPaisa(input.deliveryChargeByHand)
      : workedOut;
  const grandTotal = subtotal - orderDiscount + deliveryCharge;
  const advance =
    lines.reduce((sum, line) => sum + line.advance, 0n) + (deliveryFirst ? deliveryCharge : 0n);
  const advanceDue = min(advance, grandTotal);
  return {
    lines: lines.map((line) => ({
      itemTotal: fromPaisa(line.itemTotal),
      deliveryCharge: fromPaisa(line.delivery),
      advance: fromPaisa(line.advance),
    })),
    subtotal: fromPaisa(subtotal),
    zoneCharged: zoneCharged === null ? null : fromPaisa(zoneCharged),
    deliveryCharge: fromPaisa(deliveryCharge),
    discount: fromPaisa(orderDiscount),
    grandTotal: fromPaisa(grandTotal),
    advanceDue: fromPaisa(advanceDue),
    codAmount: fromPaisa(grandTotal - advanceDue),
  };
}

/**
 * D4-9: what pricing reads, inside the order's own transaction -- the variants ordered, the zone a thana falls in and
 * the shop's rate per kg -- so an order, the New order screen's quote and (Slice 4.2) the storefront's estimate are all
 * priced from the same reads by `priceOrder`.
 */
@Injectable()
export class OrderPricing {
  constructor(
    @Inject(ORDER_STORE) private readonly orders: OrderStore,
    @Inject(ProductService) private readonly catalogue: ProductService,
    @Inject(LocationService) private readonly locations: LocationService,
    @Inject(DeliveryZoneService) private readonly zones: DeliveryZoneService,
    @Inject(ShopDeliveryRateService) private readonly rates: ShopDeliveryRateService,
  ) {}

  /** The thana delivered to, or a refusal naming `locationId`; read before the order's transaction opens. */
  async thanaOf(locationId: number): Promise<ResolvedZoneView['location']> {
    const location = await this.locations.thana(locationId);
    if (!location) {
      throw new FieldsError([
        {
          field: 'locationId',
          problem: ServerFieldProblemCode.NotFound,
          messageKey: 'LocationNotFound',
        },
      ]);
    }
    return location;
  }

  /** ORD-46: the shop's live, orderable variants among these, by id; a stock holder or a retired one is left out. */
  async variantsWithin(
    tx: Transaction,
    tenantId: string,
    variantIds: readonly string[],
  ): Promise<Map<string, OrderableVariant>> {
    const rows = await this.orders.findVariants(tx, tenantId, [...new Set(variantIds)]);
    const sellable = rows.filter((row) => !row.isStockHolder && !row.retired);
    const read = await this.catalogue.orderableWithin(
      tx,
      tenantId,
      sellable.map((row) => row.productId),
    );
    const wanted = new Set(sellable.map((row) => row.variantId));
    return new Map(
      read
        .filter((variant) => wanted.has(variant.variantId) && !variant.archived)
        .map((variant) => [variant.variantId, variant]),
    );
  }

  /** DLV-02: the zone the thana falls in, and the shop's rate per kg, as they stand now. */
  async deliveryWithin(
    tx: Transaction,
    tenantId: string,
    location: ResolvedZoneView['location'],
  ): Promise<{ zone: ResolvedZoneView['zone']; extraChargePerKg: string }> {
    const resolved = await this.zones.resolveWithin(tx, tenantId, location);
    return { zone: resolved.zone, extraChargePerKg: await this.rates.within(tx, tenantId) };
  }

  price(input: PricingInput): OrderPrice {
    return priceOrder(input);
  }

  /**
   * SFT-20, LND-08, CUS-08 (D4-9), pulled forward for the storefront: each item as it stands now -- its price, its
   * stock, whether it is still sold (Slice 12b: a cart checks its lines here) -- then what delivering the ones that can
   * be ordered to a thana would cost, and whether they can go there (DLV-06, DLV-07); before a thana is chosen, the
   * least and most any zone that delivers would charge. Only what is on sale and not sold out is priced (PRD-06,
   * ATR-07); with none, nothing is.
   */
  async estimate(tenantId: string, input: DeliveryEstimateInput): Promise<DeliveryEstimate> {
    const location = input.locationId !== undefined ? await this.thanaOf(input.locationId) : null;
    return this.orders.run(tenantId, async (tx) => {
      const variants = await this.variantsWithin(
        tx,
        tenantId,
        input.items.map((item) => item.variantId),
      );
      const lines: PricingLine[] = [];
      const products: OrderableVariant[] = [];
      const items: EstimateLine[] = input.items.map((item) => {
        const variant = variants.get(item.variantId);
        if (!variant?.active) {
          return {
            variantId: item.variantId,
            onSale: false,
            price: null,
            stockState: null,
            available: false,
            itemTotal: null,
            advance: null,
          };
        }
        const available = variant.stockState !== StockState.Out;
        if (available) {
          products.push(variant);
          lines.push({
            unitPrice: variant.price,
            quantity: item.quantity.toFixed(3),
            itemDiscount: '0.00',
            weightKg: variant.weightKg,
            ownDeliveryCharge: variant.deliveryCharge,
            deliveryMode: variant.deliveryMode,
            paymentPolicy: variant.paymentPolicy,
            policyAdvance: variant.advanceAmount,
          });
        }
        return {
          variantId: item.variantId,
          onSale: true,
          price: variant.price,
          stockState: variant.stockState,
          available,
          itemTotal: null,
          advance: null,
        };
      });
      if (lines.length === 0) {
        return {
          lines: items,
          subtotal: '0.00',
          zone: null,
          deliveryCharge: null,
          range: null,
          deliverable: false,
          notDeliveredHere: [],
        };
      }
      // The items' own totals and advances, which no zone changes.
      const itemsOnly = priceOrder({
        fulfilmentType: FulfilmentType.Delivery,
        zoneCharge: null,
        extraChargePerKg: '0.00',
        lines,
        discount: '0.00',
        deliveryChargeByHand: null,
      });
      const pricedLines = itemsOnly.lines.values();
      for (const item of items) {
        if (!item.available) continue;
        const priced = pricedLines.next().value;
        item.itemTotal = priced?.itemTotal ?? null;
        item.advance = priced?.advance ?? null;
      }
      const goods = { lines: items, subtotal: itemsOnly.subtotal };
      const chargeAt = (zoneCharge: string, extraChargePerKg: string): string =>
        priceOrder({
          fulfilmentType: FulfilmentType.Delivery,
          zoneCharge,
          extraChargePerKg,
          lines,
          discount: '0.00',
          deliveryChargeByHand: null,
        }).deliveryCharge;
      const limitedAway = (zoneId: string): string[] => [
        ...new Set(
          products
            .filter(
              (row) => row.deliveryZoneIds.length > 0 && !row.deliveryZoneIds.includes(zoneId),
            )
            .map((row) => row.productName),
        ),
      ];
      if (location !== null) {
        const { zone, extraChargePerKg } = await this.deliveryWithin(tx, tenantId, location);
        const notDeliveredHere = limitedAway(zone.id);
        return {
          ...goods,
          zone: { id: zone.id, name: zone.label, charge: zone.charge, noDelivery: zone.noDelivery },
          deliveryCharge: chargeAt(zone.charge, extraChargePerKg),
          range: null,
          deliverable: !zone.noDelivery && notDeliveredHere.length === 0,
          notDeliveredHere,
        };
      }
      const extraChargePerKg = await this.rates.within(tx, tenantId);
      const charges = (await this.zones.zonesWithin(tx, tenantId))
        .filter((zone) => !zone.noDelivery && limitedAway(zone.id).length === 0)
        .map((zone) => chargeAt(zone.charge, extraChargePerKg))
        .sort((a, b) => Number(a) - Number(b));
      const from = charges[0];
      const to = charges.at(-1);
      return {
        ...goods,
        zone: null,
        deliveryCharge: null,
        range: from !== undefined && to !== undefined ? { from, to } : null,
        deliverable: charges.length > 0,
        notDeliveredHere: [],
      };
    });
  }
}

/** SFT-20, Slice 12b: one item of an estimate as it stands now. */
export interface EstimateLine {
  variantId: string;
  /** PRD-06: still sold; false for one removed, retired or taken off sale, whose other fields are then null. */
  onSale: boolean;
  /** Its price now, so a cart can show one that changed since it was added. */
  price: string | null;
  stockState: StockState | null;
  /** ATR-07: on sale and not sold out; only these are priced, and only these could be ordered. */
  available: boolean;
  /** Its price times its quantity by the order's own rule; null when it is not available. */
  itemTotal: string | null;
  /** PRD-08: the advance its product asks before delivery; null when it is not available. */
  advance: string | null;
}

/** SFT-20: a cart's items as they stand, and their delivery, to a thana or, before one is chosen, as a range. */
export interface DeliveryEstimate {
  lines: EstimateLine[];
  /** The available items' total. */
  subtotal: string;
  zone: {
    id: string;
    name: { en: string; bn: string };
    charge: string;
    noDelivery: boolean;
  } | null;
  deliveryCharge: string | null;
  range: { from: string; to: string } | null;
  /** DLV-06, DLV-07: whether the items can go there; a public order to a place they cannot is refused. */
  deliverable: boolean;
  /** DLV-07: the products limited to other zones. */
  notDeliveredHere: string[];
}
