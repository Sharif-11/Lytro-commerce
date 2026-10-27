import { describe, expect, it } from 'vitest';
import { treeOrder } from '../src/lib/category-tree';

const category = (id: string, parentId: string | null, name: string, sortOrder = 0) => ({
  id,
  parentId,
  name,
  sortOrder,
});

describe('the category tree (ATR-07)', () => {
  it('puts each category under its parent, siblings in the shop’s order then by name', () => {
    // As GET /categories sends them: by depth, then order, then name.
    const rows = treeOrder([
      category('jackets', null, 'Jackets', 1),
      category('tshirts', null, 'T-shirts', 0),
      category('women', 'tshirts', 'Women', 0),
      category('men', 'tshirts', 'men', 0),
      category('kids', 'women', 'Girls', 0),
    ]);
    expect(rows.map((row) => [row.category.id, row.depth])).toEqual([
      ['tshirts', 1],
      ['men', 2],
      ['women', 2],
      ['kids', 3],
      ['jackets', 1],
    ]);
  });

  it('puts a category whose parent is missing at the top, and an empty list stays empty', () => {
    expect(treeOrder([category('lost', 'gone', 'Lost')])).toEqual([
      { category: category('lost', 'gone', 'Lost'), depth: 1 },
    ]);
    expect(treeOrder([])).toEqual([]);
  });
});
