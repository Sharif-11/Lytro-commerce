import type { OfferPick } from '@/types/offers';

// OFFERS-PLAN OF-9, OF-25: what the picker holds, as plain functions -- a product whole, or some of its designs (all of
// them is the product whole) -- so they are tested without the screen.

/** The product is picked whole. */
export function isWhole(picks: readonly OfferPick[], productId: string): boolean {
  return picks.some((pick) => pick.productId === productId && pick.designId === null);
}

/** The designs of the product picked one by one. */
export function designsPicked(picks: readonly OfferPick[], productId: string): Set<string> {
  return new Set(
    picks.flatMap((pick) =>
      pick.productId === productId && pick.designId !== null ? [pick.designId] : [],
    ),
  );
}

function without(picks: readonly OfferPick[], productId: string): OfferPick[] {
  return picks.filter((pick) => pick.productId !== productId);
}

/** Ticking a product: whole when nothing of it was picked; anything of it picked, it leaves. */
export function toggleProduct(picks: readonly OfferPick[], productId: string): OfferPick[] {
  const had = picks.some((pick) => pick.productId === productId);
  return had ? without(picks, productId) : [...picks, { productId, designId: null }];
}

/**
 * Ticking one design of a product with `designIds`: a whole product keeps every other design; every design ticked is
 * the product whole; none, the product leaves.
 */
export function toggleDesign(
  picks: readonly OfferPick[],
  productId: string,
  designIds: readonly string[],
  designId: string,
): OfferPick[] {
  const chosen = isWhole(picks, productId) ? new Set(designIds) : designsPicked(picks, productId);
  if (chosen.has(designId)) chosen.delete(designId);
  else chosen.add(designId);
  const rest = without(picks, productId);
  if (chosen.size === 0) return rest;
  if (designIds.every((id) => chosen.has(id))) return [...rest, { productId, designId: null }];
  return [
    ...rest,
    ...designIds.filter((id) => chosen.has(id)).map((id) => ({ productId, designId: id })),
  ];
}

/** How many products the picks touch: the "Add 14 products" count. */
export function productCount(picks: readonly OfferPick[]): number {
  return new Set(picks.map((pick) => pick.productId)).size;
}

/** The picks without one product, or without one of its designs. */
export function removePick(picks: readonly OfferPick[], gone: OfferPick): OfferPick[] {
  return picks.filter(
    (pick) => !(pick.productId === gone.productId && pick.designId === gone.designId),
  );
}
