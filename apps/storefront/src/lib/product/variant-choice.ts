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

  /**
   * What a product page opens with (PD-4, PD-24): as `initial`, except that a product with more than one design opens with
   * none chosen, so a design is only ever the shopper's own tap; a shared link (`?v=`) opens on its variant's design.
   */
  opening(linkedVariantId?: string | null): Selection {
    const selection = this.initial(linkedVariantId);
    const linked =
      linkedVariantId !== null &&
      linkedVariantId !== undefined &&
      this.variants.some((variant) => variant.id === linkedVariantId);
    const designs = this.options.find((option) => option.designs);
    if (linked || !designs || designs.values.length < 2) return selection;
    return Object.fromEntries(
      Object.entries(selection).filter(([attributeId]) => attributeId !== designs.attributeId),
    );
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

  /** Whether picking this value, keeping the other picks, leads to a variant that can be bought; a choice not made yet
      (a design before its photo is tapped, PD-4) is open to any of its values. */
  canBuyWith(selection: Selection, attributeId: string, valueId: string): boolean {
    const picked = Object.values({ ...selection, [attributeId]: valueId });
    return this.variants.some(
      (variant) => variant.available && picked.every((value) => variant.optionIds.includes(value)),
    );
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
