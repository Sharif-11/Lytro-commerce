// STOREFRONT-BUILDER-PLAN SB-32 (the owner, 2026-11-26: "category must be rotated automatically along horizontal axis
// if applicable. if the category completely fitted then not necessary"): when the home's category tiles overflow their
// strip, it moves on a tile every ROTATE_EVERY_MS, and holds ROTATE_IDLE_MS after the shopper last touched it. No
// imports, so the strip (a client component) and the tests share it.

export const ROTATE_EVERY_MS = 3_000;
export const ROTATE_IDLE_MS = 4_000;

/** A tile's place in its strip: its left edge from the strip's own, and its width, in CSS pixels. */
export interface TileBox {
  left: number;
  width: number;
}

/** Whether the tiles run past the strip: the first tile's left edge to the last one's right, wider than the strip. */
export function overflows(tiles: readonly TileBox[], stripWidth: number): boolean {
  const first = tiles[0];
  const last = tiles[tiles.length - 1];
  if (!first || !last) return false;
  // A pixel's slack, for widths a zoom or a font leaves fractional.
  return last.left + last.width - first.left > stripWidth + 1;
}

/** Where the strip scrolls to next: the first tile past where it stands; null at the end. */
export function nextStop(tiles: readonly TileBox[], scrolled: number): number | null {
  const first = tiles[0];
  if (!first) return null;
  for (const tile of tiles) {
    const at = tile.left - first.left;
    if (at > scrolled + 1) return at;
  }
  return null;
}
