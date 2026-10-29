import type { ProductOption, ProductVariant } from '../api/storefront-api';

/** The value picked for each variant-defining attribute, by attribute id. */
export type Selection = Readonly<Record<string, string>>;

// SFT-04, ATR-07, LND-06: which variant a shopper's picks name, which values lead nowhere they can buy, and what a link
// with `?v=` opens with. A product's variants each name one value of every option attribute (or none, for a product
// without options, which has exactly one variant).
export class VariantChoice {
  private readonly attributeOfValue = new Map<string, string>();

  constructor(
    private readonly options: readonly ProductOption[],
    private readonly variants: readonly ProductVariant[],
  ) {
    for (const option of options) {
      for (const value of option.values) this.attributeOfValue.set(value.id, option.attributeId);
    }
  }

  /** The picks a page opens with: the linked variant's, else the first one that can be bought, else the first. */
  initial(linkedVariantId?: string | null): Selection {
    const linked = linkedVariantId
      ? this.variants.find((variant) => variant.id === linkedVariantId)
      : undefined;
    const opening =
      linked ?? this.variants.find((variant) => variant.available) ?? this.variants[0];
    return opening ? this.selectionOf(opening) : {};
  }

  /** The variant these picks name, or null when no variant has them all. */
  variantFor(selection: Selection): ProductVariant | null {
    if (this.options.length === 0) return this.variants[0] ?? null;
    const picked = this.options.map((option) => selection[option.attributeId]);
    if (picked.some((value) => value === undefined)) return null;
    return (
      this.variants.find(
        (variant) =>
          variant.optionIds.length === picked.length &&
          picked.every((value) => value !== undefined && variant.optionIds.includes(value)),
      ) ?? null
    );
  }

  /** Whether picking this value, keeping the other picks, names a variant that can be bought. */
  canBuyWith(selection: Selection, attributeId: string, valueId: string): boolean {
    const variant = this.variantFor({ ...selection, [attributeId]: valueId });
    return variant?.available ?? false;
  }

  /** Picks one value; the other picks stay, so the shopper sees the combination they asked for, even a sold-out one. */
  pick(selection: Selection, attributeId: string, valueId: string): Selection {
    return { ...selection, [attributeId]: valueId };
  }

  private selectionOf(variant: ProductVariant): Selection {
    const selection: Record<string, string> = {};
    for (const valueId of variant.optionIds) {
      const attributeId = this.attributeOfValue.get(valueId);
      if (attributeId) selection[attributeId] = valueId;
    }
    return selection;
  }
}
