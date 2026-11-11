import { describe, expect, it } from 'vitest';
import {
  heightOf,
  isSamePlace,
  KeyboardPlaces,
  lineOf,
  placeAfter,
  placeBefore,
  placeInside,
  placeOf,
  refusalOf,
  siblingsOf,
  stepPlace,
  subtreeOf,
  treeOrder,
} from '../src/lib/category-tree';

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
    expect(siblingsOf(tree, 'jackets').map((each) => each.id)).toEqual([
      'tshirts',
      'jackets',
      'sarees',
    ]);
    expect(stepPlace(tree, 'jackets', -1)).toEqual({ parentId: null, afterId: null });
    expect(stepPlace(tree, 'jackets', 1)).toEqual({ parentId: null, afterId: 'sarees' });
    expect(stepPlace(tree, 'women', -1)).toEqual({ parentId: 'tshirts', afterId: null });
    expect(stepPlace(tree, 'tshirts', -1)).toBeNull();
    expect(stepPlace(tree, 'sarees', 1)).toBeNull();
    expect(siblingsOf(tree, 'women').map((each) => each.id)).toEqual(['men', 'women']);
  });
});

describe('a move to a parent and a place (D8-72, Slice 8.8)', () => {
  // The sketch's P88_CATS: T-shirts > Men > Formal > Slim fit, T-shirts > Women; Jackets; Sarees; Kids > Baby.
  const tree = [
    category('tshirts', null, 'T-shirts', 0),
    category('men', 'tshirts', 'Men', 0),
    category('formal', 'men', 'Formal', 0),
    category('slim', 'formal', 'Slim fit', 0),
    category('women', 'tshirts', 'Women', 1),
    category('jackets', null, 'Jackets', 1),
    category('sarees', null, 'Sarees', 2),
    category('kids', null, 'Kids', 3),
    category('baby', 'kids', 'Baby', 0),
  ];

  it('knows where a category sits now, for Undo', () => {
    expect(placeOf(tree, 'kids')).toEqual({ parentId: null, afterId: 'sarees' });
    expect(placeOf(tree, 'men')).toEqual({ parentId: 'tshirts', afterId: null });
    expect(isSamePlace(tree, 'kids', { parentId: null, afterId: 'sarees' })).toBe(true);
    expect(isSamePlace(tree, 'kids', { parentId: null, afterId: null })).toBe(false);
  });

  it('refuses inside itself and past four levels, as the server does', () => {
    expect(refusalOf(tree, 'tshirts', 'formal')).toBe('self');
    expect(refusalOf(tree, 'tshirts', 'tshirts')).toBe('self');
    // Kids with Baby under Slim fit (level 4) would reach a sixth level; under Formal, a fifth.
    expect(refusalOf(tree, 'kids', 'slim')).toBe('deep');
    expect(refusalOf(tree, 'kids', 'formal')).toBe('deep');
    expect(refusalOf(tree, 'kids', 'men')).toBeNull();
    expect(refusalOf(tree, 'formal', null)).toBeNull();
  });

  it('places a drop inside a row last, and before or after a row at its level', () => {
    expect(placeInside(tree, 'kids', 'tshirts')).toEqual({ parentId: 'tshirts', afterId: 'women' });
    expect(placeInside(tree, 'kids', 'jackets')).toEqual({ parentId: 'jackets', afterId: null });
    expect(placeBefore(tree, 'kids', 'sarees')).toEqual({ parentId: null, afterId: 'jackets' });
    expect(placeBefore(tree, 'kids', 'tshirts')).toEqual({ parentId: null, afterId: null });
    // Before the row after its own place skips itself: the same place it has.
    expect(placeBefore(tree, 'jackets', 'sarees')).toEqual({ parentId: null, afterId: 'tshirts' });
    expect(placeAfter(tree, 'women')).toEqual({ parentId: 'tshirts', afterId: 'women' });
  });

  it('draws a place as a line before a row, past everything under the one it follows', () => {
    // Between Jackets and Sarees at the top: before row 6 (Sarees).
    expect(lineOf(tree, { parentId: null, afterId: 'jackets' })).toEqual({ index: 6, depth: 1 });
    // After T-shirts at the top: past its five rows, before Jackets.
    expect(lineOf(tree, { parentId: null, afterId: 'tshirts' })).toEqual({ index: 5, depth: 1 });
    // First inside Men: right under Men.
    expect(lineOf(tree, { parentId: 'men', afterId: null })).toEqual({ index: 2, depth: 3 });
    // Last at the top, after Kids and Baby: at the end.
    expect(lineOf(tree, { parentId: null, afterId: 'kids' })).toEqual({ index: 9, depth: 1 });
  });

  it('walks the keyboard through the places between the rows, Kids and Baby lifted out', () => {
    const keys = new KeyboardPlaces(tree, 'kids');
    expect(keys.spots).toBe(7);
    expect(keys.start()).toEqual({ spot: 7, depth: 1 });
    expect(keys.placeAt(7, 1)).toEqual({ parentId: null, afterId: 'sarees' });
    // Up one: between Jackets and Sarees (the sketch's line).
    expect(keys.placeAt(6, 1)).toEqual({ parentId: null, afterId: 'jackets' });
    // Right: inside the one above, Jackets, first.
    expect(keys.depths(6)).toEqual({ min: 1, max: 2 });
    expect(keys.placeAt(6, 2)).toEqual({ parentId: 'jackets', afterId: null });
    // Between Women and Jackets: after Women, after T-shirts, or inside Women.
    expect(keys.depths(5)).toEqual({ min: 1, max: 3 });
    expect(keys.placeAt(5, 1)).toEqual({ parentId: null, afterId: 'tshirts' });
    expect(keys.placeAt(5, 2)).toEqual({ parentId: 'tshirts', afterId: 'women' });
    expect(keys.placeAt(5, 3)).toEqual({ parentId: 'women', afterId: null });
    // The very first spot is first at the top, whatever the level asked.
    expect(keys.placeAt(0, 3)).toEqual({ parentId: null, afterId: null });
    expect(new KeyboardPlaces(tree, 'men').start()).toEqual({ spot: 1, depth: 2 });
    expect(new KeyboardPlaces(tree, 'men').placeAt(1, 2)).toEqual({
      parentId: 'tshirts',
      afterId: null,
    });
  });
});
