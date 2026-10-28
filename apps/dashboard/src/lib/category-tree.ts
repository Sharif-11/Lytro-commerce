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

/** The siblings with one moved a place up (-1) or down (1); the same order at either end. */
export function moved<C extends TreeNode>(siblings: readonly C[], id: string, step: -1 | 1): C[] {
  const at = siblings.findIndex((each) => each.id === id);
  const to = at + step;
  const self = siblings[at];
  if (at < 0 || to < 0 || to >= siblings.length || !self) return [...siblings];
  const rest = siblings.filter((each) => each.id !== id);
  return [...rest.slice(0, to), self, ...rest.slice(to)];
}
