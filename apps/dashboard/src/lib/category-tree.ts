import { CATEGORY_MAX_DEPTH } from '@lytronix/validators';

/** A category with what places it in the tree. */
export interface TreeNode {
  id: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
}

/** One row of the tree as a list shows it: the category, and how deep it sits (1 at the top). */
export interface TreeRow<C extends TreeNode> {
  category: C;
  depth: number;
}

/**
 * ATR-07: the shop's categories as the tree reads, each under its parent, siblings in the shop's own order then by name,
 * as `GET /categories` sorts them within a level. A category whose parent is not in the list sits at the top.
 */
export function treeOrder<C extends TreeNode>(categories: readonly C[]): TreeRow<C>[] {
  const ids = new Set(categories.map((each) => each.id));
  const children = new Map<string | null, C[]>();
  for (const category of categories) {
    const parent =
      category.parentId !== null && ids.has(category.parentId) ? category.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), category]);
  }
  const rows: TreeRow<C>[] = [];
  const visit = (parent: string | null, depth: number): void => {
    const siblings = [...(children.get(parent) ?? [])].sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
    );
    for (const category of siblings) {
      rows.push({ category, depth });
      visit(category.id, depth + 1);
    }
  };
  visit(null, 1);
  return rows;
}

/** A category and everything under it, by id: where it cannot be moved to (PRD-03). */
export function subtreeOf(categories: readonly TreeNode[], id: string): Set<string> {
  const inside = new Set([id]);
  for (const { category } of treeOrder(categories)) {
    if (category.parentId !== null && inside.has(category.parentId)) inside.add(category.id);
  }
  return inside;
}

/** How many levels a category's subtree spans, itself included: 1 for one with nothing under it. */
export function heightOf(categories: readonly TreeNode[], id: string): number {
  const rows = treeOrder(categories);
  const inside = subtreeOf(categories, id);
  const own = rows.find((row) => row.category.id === id)?.depth ?? 1;
  return Math.max(
    1,
    ...rows.filter((row) => inside.has(row.category.id)).map((row) => row.depth - own + 1),
  );
}

/** A category's siblings in the tree's order, itself among them (Move up and Move down). */
export function siblingsOf<C extends TreeNode>(categories: readonly C[], id: string): C[] {
  const parentId = categories.find((each) => each.id === id)?.parentId ?? null;
  return treeOrder(categories)
    .map((row) => row.category)
    .filter((each) => each.parentId === parentId);
}

/**
 * D8-72: where a move puts a category -- under `parentId` (null for the top level), after `afterId` among that parent's
 * sub-categories, or first when it is null -- as `POST /categories/:id/move` takes it.
 */
export interface CategoryPlace {
  parentId: string | null;
  afterId: string | null;
}

/** Why a category can't go under a parent: inside itself or one of its own sub-categories, or past four levels. */
export type MoveRefusal = 'self' | 'deep';

/** A parent's sub-categories in the tree's order, leaving out the one being moved. */
function childrenOf<C extends TreeNode>(
  categories: readonly C[],
  parentId: string | null,
  leaving: string,
): C[] {
  return treeOrder(categories)
    .map((row) => row.category)
    .filter((each) => each.parentId === parentId && each.id !== leaving);
}

/** Where a category sits now: the place a move takes it back to (Undo). */
export function placeOf(categories: readonly TreeNode[], id: string): CategoryPlace {
  const siblings = siblingsOf(categories, id);
  const at = siblings.findIndex((each) => each.id === id);
  return {
    parentId: categories.find((each) => each.id === id)?.parentId ?? null,
    afterId: siblings[at - 1]?.id ?? null,
  };
}

/** Whether a place is the one the category already has, so moving there changes nothing. */
export function isSamePlace(
  categories: readonly TreeNode[],
  id: string,
  place: CategoryPlace,
): boolean {
  const now = placeOf(categories, id);
  return now.parentId === place.parentId && now.afterId === place.afterId;
}

/**
 * PRD-03, D8-72: why a category can't go under `parentId`, as the server refuses it, or null when it can. The top level
 * always takes one.
 */
export function refusalOf(
  categories: readonly TreeNode[],
  id: string,
  parentId: string | null,
): MoveRefusal | null {
  if (parentId === null) return null;
  if (subtreeOf(categories, id).has(parentId)) return 'self';
  const parentDepth = treeOrder(categories).find((row) => row.category.id === parentId)?.depth ?? 1;
  return parentDepth + heightOf(categories, id) > CATEGORY_MAX_DEPTH ? 'deep' : null;
}

/** Dropped on a row's middle: inside it, last among its sub-categories (D8-72). */
export function placeInside(
  categories: readonly TreeNode[],
  id: string,
  parentId: string,
): CategoryPlace {
  return { parentId, afterId: childrenOf(categories, parentId, id).at(-1)?.id ?? null };
}

/** Dropped near a row's top edge: before it, at its level. */
export function placeBefore(
  categories: readonly TreeNode[],
  id: string,
  rowId: string,
): CategoryPlace {
  const parentId = categories.find((each) => each.id === rowId)?.parentId ?? null;
  const siblings = childrenOf(categories, parentId, id);
  const at = siblings.findIndex((each) => each.id === rowId);
  return { parentId, afterId: siblings[at - 1]?.id ?? null };
}

/** Dropped near a row's bottom edge: after it, at its level, past everything under it. */
export function placeAfter(categories: readonly TreeNode[], rowId: string): CategoryPlace {
  return {
    parentId: categories.find((each) => each.id === rowId)?.parentId ?? null,
    afterId: rowId,
  };
}

/** Move up (-1) or Move down (1) among its siblings; null at either end. */
export function stepPlace(
  categories: readonly TreeNode[],
  id: string,
  step: -1 | 1,
): CategoryPlace | null {
  const siblings = siblingsOf(categories, id);
  const at = siblings.findIndex((each) => each.id === id);
  const to = at + step;
  if (at < 0 || to < 0 || to >= siblings.length) return null;
  const rest = siblings.filter((each) => each.id !== id);
  return { parentId: siblings[at]?.parentId ?? null, afterId: rest[to - 1]?.id ?? null };
}

/**
 * Where a place shows in the list as it stands: the line goes before the row at `index` of `treeOrder` (the list's
 * length is after the last), `depth` levels in.
 */
export function lineOf(
  categories: readonly TreeNode[],
  place: CategoryPlace,
): { index: number; depth: number } {
  const rows = treeOrder(categories);
  const indexOf = (rowId: string) => rows.findIndex((row) => row.category.id === rowId);
  const parentRow = place.parentId === null ? -1 : indexOf(place.parentId);
  const depth = parentRow < 0 ? 1 : (rows[parentRow]?.depth ?? 0) + 1;
  if (place.afterId === null) return { index: parentRow + 1, depth };
  const inside = subtreeOf(categories, place.afterId);
  let index = indexOf(place.afterId) + 1;
  while (index < rows.length && inside.has(rows[index]?.category.id ?? '')) index += 1;
  return { index, depth };
}

/**
 * D8-72's keyboard: the places between the rows left once the moving category and everything under it are lifted out,
 * `spot` 0 before the first row and `spot` n after the last, each at a level from the row below's to one past the row
 * above's. The place at a spot and level, and the levels a spot allows.
 */
export class KeyboardPlaces {
  private readonly rows: TreeRow<TreeNode>[];

  constructor(
    private readonly categories: readonly TreeNode[],
    private readonly id: string,
  ) {
    const lifted = subtreeOf(categories, id);
    this.rows = treeOrder(categories).filter((row) => !lifted.has(row.category.id));
  }

  get spots(): number {
    return this.rows.length;
  }

  /** The spot and level the category has now. */
  start(): { spot: number; depth: number } {
    const all = treeOrder(this.categories);
    const own = all.findIndex((row) => row.category.id === this.id);
    const lifted = subtreeOf(this.categories, this.id);
    const before = all.slice(0, own).filter((row) => !lifted.has(row.category.id)).length;
    return { spot: before, depth: all[own]?.depth ?? 1 };
  }

  /** The levels a spot allows: the row below's level up to one past the row above's. */
  depths(spot: number): { min: number; max: number } {
    const above = this.rows[spot - 1];
    const below = this.rows[spot];
    return { min: below?.depth ?? 1, max: above ? above.depth + 1 : 1 };
  }

  /** The place at a spot and level (clamped to what the spot allows). */
  placeAt(spot: number, depth: number): CategoryPlace {
    const { min, max } = this.depths(spot);
    const level = Math.min(max, Math.max(min, depth));
    const above = spot - 1;
    // One past the row above's level: inside it, first.
    const aboveRow = this.rows[above];
    if (aboveRow && level === aboveRow.depth + 1) {
      return { parentId: aboveRow.category.id, afterId: null };
    }
    // Otherwise after the row above's ancestor at that level, or first at the top.
    for (let index = above; index >= 0; index -= 1) {
      const row = this.rows[index];
      if (row && row.depth === level) {
        return { parentId: row.category.parentId, afterId: row.category.id };
      }
    }
    return { parentId: null, afterId: null };
  }
}
