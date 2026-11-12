import type {
  ProductImage,
  ProductOption,
  ProductVariant,
  PublicProduct,
} from '../api/storefront-api';

// ATR-19, ATR-20 (PHOTO-DESIGNS-PLAN PD-4 to PD-7, PD-12, PD-17, PD-28): a product's photos as the choice of its designs.
// A design is a value of the product's designs option; its photos are the product's photos naming it, its first one its
// cover. The shopper chooses by tapping a photo, never by a name.

/** One photo a shopper can choose by: where it sits in the gallery, and the design it shows. */
export interface PhotoCard {
  /** Its place among the product's photos, which is its place in the gallery. */
  at: number;
  image: ProductImage;
  designId: string;
}

/** The product's designs option, or null for a product without designs. */
export function designOptionOf(product: Pick<PublicProduct, 'options'>): ProductOption | null {
  return product.options.find((option) => option.designs) ?? null;
}

/**
 * PD-4, PD-12: the photo cards: every photo that is a design, in the gallery's order. None for a product with one design
 * (that design is chosen) or none at all.
 */
export function photoCardsOf(product: Pick<PublicProduct, 'options' | 'images'>): PhotoCard[] {
  const option = designOptionOf(product);
  if (!option || option.values.length < 2) return [];
  const offered = new Set(option.values.map((value) => value.id));
  return product.images.flatMap((image, at) =>
    image.designId !== null && offered.has(image.designId)
      ? [{ at, image, designId: image.designId }]
      : [],
  );
}

/** PD-7: a design's cover, its first photo. */
export function designCoverOf(
  product: Pick<PublicProduct, 'images'>,
  designId: string,
): ProductImage | null {
  return product.images.find((image) => image.designId === designId) ?? null;
}

/** The design a variant shows, or null for a variant of a product without designs. */
export function designOfVariant(
  product: Pick<PublicProduct, 'options'>,
  variant: Pick<ProductVariant, 'optionIds'>,
): string | null {
  const option = designOptionOf(product);
  if (!option) return null;
  return option.values.find((value) => variant.optionIds.includes(value.id))?.id ?? null;
}

/**
 * PD-6: the photo a cart line, the landing page's summary and the order show for a variant: its design's cover, else the
 * product's first photo; the thumbnail's address, or null for a product without photos.
 */
export function lineImageOf(
  product: Pick<PublicProduct, 'options' | 'images'>,
  variant: Pick<ProductVariant, 'optionIds'> | null,
): string | null {
  const designId = variant ? designOfVariant(product, variant) : null;
  const cover = designId === null ? null : designCoverOf(product, designId);
  return (cover ?? product.images[0] ?? null)?.urls.thumbnail ?? null;
}

/** PD-17: a design none of whose variants can be bought: its cards are greyed and can't be chosen. */
export function designSoldOut(product: Pick<PublicProduct, 'variants'>, designId: string): boolean {
  return !product.variants.some(
    (variant) => variant.available && variant.optionIds.includes(designId),
  );
}

// PD-28: the gallery's shape is held between these, so a very tall photo isn't a strip and a wide one shows square.
const TALLEST = 9 / 16;
const WIDEST = 1;
/** The prototype's 4:5, for a product whose first photo's size isn't known. */
const DRAWN = 4 / 5;

/** PD-28: the gallery's shape, width over height: the product's first photo's, held between 9:16 and 1:1. */
export function galleryShapeOf(product: Pick<PublicProduct, 'images'>): number {
  const first = product.images[0];
  if (!first || !first.width || !first.height) return DRAWN;
  return Math.min(WIDEST, Math.max(TALLEST, first.width / first.height));
}
