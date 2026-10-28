import { describe, expect, it } from 'vitest';
import { heightOf, moved, siblingsOf, subtreeOf, treeOrder } from '../src/lib/category-tree';

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

describe('moving a category (PRD-03, Slice 11.8)', () => {
  const tree = [
    category('tshirts', null, 'T-shirts', 0),
    category('men', 'tshirts', 'Men', 0),
    category('boys', 'men', 'Boys', 0),
    category('women', 'tshirts', 'Women', 1),
    category('jackets', null, 'Jackets', 1),
    category('sarees', null, 'Sarees', 2),
  ];

  it('knows what sits under a category, so it is never moved inside itself', () => {
    expect([...subtreeOf(tree, 'tshirts')].sort()).toEqual(['boys', 'men', 'tshirts', 'women']);
    expect([...subtreeOf(tree, 'jackets')]).toEqual(['jackets']);
  });

  it('counts the levels a category takes with it, itself included', () => {
    expect(heightOf(tree, 'tshirts')).toBe(3);
    expect(heightOf(tree, 'men')).toBe(2);
    expect(heightOf(tree, 'sarees')).toBe(1);
  });

  it('moves one a place among its siblings, and leaves the ends as they are', () => {
    const top = siblingsOf(tree, 'jackets');
    expect(top.map((each) => each.id)).toEqual(['tshirts', 'jackets', 'sarees']);
    expect(moved(top, 'jackets', -1).map((each) => each.id)).toEqual([
      'jackets',
      'tshirts',
      'sarees',
    ]);
    expect(moved(top, 'jackets', 1).map((each) => each.id)).toEqual([
      'tshirts',
      'sarees',
      'jackets',
    ]);
    expect(moved(top, 'tshirts', -1).map((each) => each.id)).toEqual([
      'tshirts',
      'jackets',
      'sarees',
    ]);
    expect(siblingsOf(tree, 'women').map((each) => each.id)).toEqual(['men', 'women']);
  });
});
