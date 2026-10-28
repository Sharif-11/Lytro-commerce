import { AttributeDataType, AttributeRole } from '@lytronix/validators';
import type { ImageView } from '../../../common/media-links';
import type {
  AttributeRecord,
  OptionRecord,
  ProductAttributeRecord,
  VariantAttributeView,
  VariantValueRecord,
} from '../types/catalogue';

/** An attribute's options in its own order: a number by size, any other by the shop's order, then by name. */
function byOrder(a: OptionRecord, b: OptionRecord, numeric: boolean): number {
  return numeric
    ? Number(a.value) - Number(b.value)
    : a.sortOrder - b.sortOrder || a.value.localeCompare(b.value);
}

/**
 * ATR-11, ATR-18: a product's variant-defining attributes in its own order, each with the options the given variants
 * use, in the attribute's order, with their swatches. The product's edit screen, the Stock page and a stock check's
 * lines all name variants by it (Slice 11.9).
 */
export function variantAttributesOf(
  productAttributes: readonly ProductAttributeRecord[],
  attributes: ReadonlyMap<string, AttributeRecord>,
  variantValues: readonly VariantValueRecord[],
  options: ReadonlyMap<string, OptionRecord>,
  swatches: ReadonlyMap<string, ImageView>,
): VariantAttributeView[] {
  return productAttributes
    .filter((row) => row.role === AttributeRole.VariantDefining)
    .flatMap((row) => {
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
}

/**
 * Variants in their product's order: by the first attribute's options in its order, then the next's ("S · Black",
 * "S · Blue", "M · Black"), as the product's screen lists them. Each carries its option ids in the attributes' order.
 */
export function inProductOrder<V extends { optionIds: string[] }>(
  splits: readonly VariantAttributeView[],
  variants: readonly V[],
): V[] {
  const rank = (variant: V): number[] =>
    splits.map((split, index) => {
      const at = split.options.findIndex((option) => option.id === variant.optionIds[index]);
      return at < 0 ? Number.MAX_SAFE_INTEGER : at;
    });
  return variants
    .map((variant) => ({ ...variant, optionIds: optionIdsInOrder(splits, variant.optionIds) }))
    .map((variant) => ({ variant, rank: rank(variant) }))
    .sort((a, b) => {
      for (let index = 0; index < a.rank.length; index += 1) {
        const difference = (a.rank[index] ?? 0) - (b.rank[index] ?? 0);
        if (difference !== 0) return difference;
      }
      return 0;
    })
    .map(({ variant }) => variant);
}

/**
 * A variant's option ids in its product's order of attributes (a combination key lists them by attribute id), so the
 * dashboard names it "M · Black" as the product's screen does.
 */
export function optionIdsInOrder(
  splits: readonly VariantAttributeView[],
  optionIds: readonly string[],
): string[] {
  return splits.flatMap((split) => {
    const found = split.options.find((option) => optionIds.includes(option.id));
    return found ? [found.id] : [];
  });
}
