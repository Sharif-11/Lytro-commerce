import { DeliveryMode } from '@lytronix/validators';

/** What a product or one of its variants states for itself; a variant's null follows its product. */
interface OwnValues {
  weightKg: string | null;
  deliveryCharge: string | null;
  deliveryMode: DeliveryMode | null;
}

/** What a variant sells and delivers at. */
export interface EffectiveVariant {
  price: string;
  weightKg: string | null;
  /** DLV-03: its own delivery charge, or null to be charged the order's zone (ORD-06a). */
  deliveryCharge: string | null;
  deliveryMode: DeliveryMode;
}

/** PRD-16, ATR-13: with no weight in play the mode is Default, whatever is stored. */
export function effectiveMode(weight: string | null, mode: DeliveryMode): DeliveryMode {
  return weight === null ? DeliveryMode.Default : mode;
}

/**
 * ATR-05, ATR-13, DLV-03: a variant's price, weight, delivery charge and mode: its own where it sets one, else its
 * product's. The one read the product editor, the public catalogue and order pricing all use (D4-9).
 */
export function effectiveVariant(
  product: OwnValues & { basePrice: string; deliveryMode: DeliveryMode },
  variant: OwnValues & { price: string | null },
): EffectiveVariant {
  const weightKg = variant.weightKg ?? product.weightKg;
  return {
    price: variant.price ?? product.basePrice,
    weightKg,
    deliveryCharge: variant.deliveryCharge ?? product.deliveryCharge,
    deliveryMode: effectiveMode(weightKg, variant.deliveryMode ?? product.deliveryMode),
  };
}
