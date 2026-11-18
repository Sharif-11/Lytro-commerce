// STOREFRONT-BUILDER-PLAN DC-1 to DC-3: a card's link and key where a product may give a card per design, and whether
// the shop spreads its designs. No imports, so client components (the theme's card) can use it.

/** DC-3: a card's page -- a design's card opens its product with that design chosen (`?d=`, applied as `?v=` is). */
export function cardHref(card: { slug: string; designId?: string | null }): string {
  return card.designId
    ? `/p/${card.slug}?d=${encodeURIComponent(card.designId)}`
    : `/p/${card.slug}`;
}

/** DC-1: a card's key in a list, where one product may give a card per design. */
export function cardKey(card: { id: string; designId?: string | null }): string {
  return `${card.id}:${card.designId ?? ''}`;
}

/** DC-1, DC-2: whether the shop's lists spread its products' designs into cards. */
export function spreadsDesigns(info: { design?: { designCards?: boolean } }): boolean {
  return info.design?.designCards === true;
}
