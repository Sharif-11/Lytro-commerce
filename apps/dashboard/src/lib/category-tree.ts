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
