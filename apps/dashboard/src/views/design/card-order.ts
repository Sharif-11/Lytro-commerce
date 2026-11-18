import { StorefrontCardMode } from '@lytronix/validators';
import type { StorefrontCard } from '@/types/storefront-design';

// STOREFRONT-BUILDER-PLAN DC-6 to DC-8: the Product list as plain functions -- which cards show under each product's
// way, a card moved among the shown ones, and what Save sends -- so they are tested without the screen.

/** A card as one value: its product, and its design or none. */
export function cardKey(card: Pick<StorefrontCard, 'productId' | 'designId'>): string {
  return `${card.productId}:${card.designId ?? ''}`;
}

/** DC-8: each product's way, as the screen holds it while it is changed. */
export type Modes = Readonly<Record<string, StorefrontCardMode>>;

export function modesOf(cards: readonly StorefrontCard[]): Modes {
  const modes: Record<string, StorefrontCardMode> = {};
  for (const card of cards) if (card.mode !== null) modes[card.productId] = card.mode;
  return modes;
}

/**
 * DC-8: whether a card shows under its product's way -- a design's unless the product is one card, a product's own
 * when the product has no way (nothing to spread) or is one card or both. With design cards off, every card shows.
 */
export function isShown(card: StorefrontCard, modes: Modes): boolean {
  const mode = modes[card.productId];
  if (mode === undefined) return card.shown;
  if (card.designId === null) return mode !== StorefrontCardMode.Designs;
  return mode !== StorefrontCardMode.Compact;
}

/** DC-8: a product's own card standing for all its designs (it has designs to spread), drawn on a ground of its own. */
export function isCompact(card: StorefrontCard): boolean {
  return card.designId === null && card.mode !== null;
}

/**
 * DC-6: the order with the shown card at `from` moved to where the shown card at `to` is (among the shown ones); the
 * cards not shown keep their places among the rest.
 */
export function moveShown(
  order: readonly StorefrontCard[],
  modes: Modes,
  from: number,
  to: number,
): StorefrontCard[] {
  const shown = order.filter((card) => isShown(card, modes));
  const moving = shown[from];
  const target = shown[to];
  if (!moving || !target || from === to) return [...order];
  const rest = order.filter((card) => card !== moving);
  const at = rest.indexOf(target);
  rest.splice(from < to ? at + 1 : at, 0, moving);
  return rest;
}

/** DC-6: the shown card at `from` moved first (`top`) or last among the shown ones. */
export function moveToEnd(
  order: readonly StorefrontCard[],
  modes: Modes,
  from: number,
  end: 'top' | 'bottom',
): StorefrontCard[] {
  const count = order.filter((card) => isShown(card, modes)).length;
  return moveShown(order, modes, from, end === 'top' ? 0 : count - 1);
}

/** How many shown cards are not where they were, and products whose way changed: the "N moved" count. */
export function changesFrom(
  before: readonly StorefrontCard[],
  beforeModes: Modes,
  order: readonly StorefrontCard[],
  modes: Modes,
): number {
  const was = before.filter((card) => isShown(card, beforeModes)).map(cardKey);
  const now = order.filter((card) => isShown(card, modes)).map(cardKey);
  const moved = now.filter((key, at) => was[at] !== key).length;
  const ways = Object.keys(modes).filter((id) => modes[id] !== beforeModes[id]).length;
  return moved + ways;
}

/** What Save order sends: the shown cards, first to last, and every product's way. */
export function orderInput(order: readonly StorefrontCard[], modes: Modes) {
  return {
    cards: order
      .filter((card) => isShown(card, modes))
      .map((card) => ({ productId: card.productId, designId: card.designId })),
    modes: Object.entries(modes).map(([productId, mode]) => ({ productId, mode })),
  };
}
