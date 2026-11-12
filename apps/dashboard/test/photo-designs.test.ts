import { AttributeDataType } from '@lytronix/validators';
import { describe, expect, it } from 'vitest';
import {
  byDesign,
  designLabels,
  designSplit,
  imagesBody,
  mayHaveDesigns,
  photosOf,
  withChoice,
  withDesignSplit,
  withName,
  withoutPhoto,
  withPhotos,
  type DesignState,
} from '../src/lib/photo-designs';
import {
  changedParts,
  createBody,
  NEW_PRODUCT,
  withDesignIds,
  type ProductForm,
} from '../src/lib/product-form';
import { blankRow, type SplitAttribute } from '../src/lib/variant-matrix';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMPTY: DesignState = { imageIds: [], photoDesigns: {}, designs: [] };

/** A saved burka: photo p-1 is design 1, p-2 and p-3 are design 2's two angles. */
const BURKA: DesignState = {
  imageIds: ['p-1', 'p-2', 'p-3'],
  photoDesigns: { 'p-1': 'd-1', 'p-2': 'd-2', 'p-3': 'd-2' },
  designs: [
    { key: 'd-1', id: 'd-1', number: 1, name: 'ডিজাইন 1' },
    { key: 'd-2', id: 'd-2', number: 2, name: 'স্ট্রাইপ' },
  ],
};

const SIZE: SplitAttribute = {
  attributeId: 'a-size',
  name: 'Size',
  dataType: AttributeDataType.EnumSingle,
  unitKind: null,
  options: [
    { id: 'o-54', value: '54', swatchColor: null, swatchImage: null },
    { id: 'o-56', value: '56', swatchColor: null, swatchImage: null },
  ],
};

describe("a product's photos as its designs (ATR-19, TENANT-DASHBOARD-DESIGN §7.42)", () => {
  it('makes each new photo a design of its own, named by the number it will take (PD-3, PD-14)', () => {
    const added = withPhotos(BURKA, ['p-4', 'p-5'], true);
    expect(added.imageIds).toEqual(['p-1', 'p-2', 'p-3', 'p-4', 'p-5']);
    const fresh = added.designs.slice(2);
    expect(fresh).toHaveLength(2);
    for (const design of fresh) {
      // An id-like key, so a new product's variants can name it in the same request.
      expect(design.key).toMatch(UUID);
      expect(design.id).toBeNull();
    }
    expect(added.photoDesigns['p-4']).toBe(fresh[0]?.key);
    // The product's next number is 3, unless a retired design took it; then 6 and 7.
    const labels = designLabels(added.designs, 6, 'ডিজাইন');
    expect([...labels.values()]).toEqual(['ডিজাইন 1', 'স্ট্রাইপ', 'ডিজাইন 6', 'ডিজাইন 7']);
    // A name typed wins; a saved name cleared shows its own number.
    const named = withName(withName(added, String(fresh[0]?.key), 'চেক'), 'd-1', ' ');
    expect([...designLabels(named.designs, 6, 'ডিজাইন').values()]).toEqual([
      'ডিজাইন 1',
      'স্ট্রাইপ',
      'চেক',
      'ডিজাইন 7',
    ]);
    // Plain, when the product can't take a design.
    expect(withPhotos(BURKA, ['p-4'], false).photoDesigns['p-4']).toBeNull();
  });

  it('makes a photo another angle of a design, its own design, or plain, dropping a design left with none (PD-2)', () => {
    // p-1 joins Stripe: design 1 has no photo left, so it goes.
    const joined = withChoice(BURKA, 'p-1', { kind: 'same', key: 'd-2' });
    expect(photosOf(joined, 'd-2')).toEqual(['p-1', 'p-2', 'p-3']);
    expect(joined.designs.map((design) => design.key)).toEqual(['d-2']);
    // p-3 leaves Stripe as its own design.
    const own = withChoice(BURKA, 'p-3', { kind: 'own' });
    expect(own.designs).toHaveLength(3);
    expect(own.photoDesigns['p-3']).toMatch(UUID);
    // A photo already alone in its design stays as it is.
    expect(withChoice(BURKA, 'p-1', { kind: 'own' })).toBe(BURKA);
    // Plain: Stripe keeps its other angle.
    const plain = withChoice(BURKA, 'p-2', { kind: 'not' });
    expect(plain.photoDesigns['p-2']).toBeNull();
    expect(photosOf(plain, 'd-2')).toEqual(['p-3']);
    // Taken off the product: design 1 goes with its only photo.
    const removed = withoutPhoto(BURKA, 'p-1');
    expect(removed.imageIds).toEqual(['p-2', 'p-3']);
    expect(removed.designs.map((design) => design.key)).toEqual(['d-2']);
    expect('p-1' in removed.photoDesigns).toBe(false);
  });

  it('may give a product designs unless it is a combo, or has orders and none yet (PD-11, ATR-15)', () => {
    const base = {
      combo: false,
      hasOrders: false,
      designs: 0,
      splits: [],
      designAttributeId: 'a-d',
    };
    expect(mayHaveDesigns(base)).toBe(true);
    expect(mayHaveDesigns({ ...base, combo: true })).toBe(false);
    expect(mayHaveDesigns({ ...base, hasOrders: true })).toBe(false);
    // Once it has designs, an ordered product may gain more: they add variants, re-keying none.
    expect(mayHaveDesigns({ ...base, hasOrders: true, designs: 2 })).toBe(true);
    // ATR-14: not as a fourth split.
    expect(mayHaveDesigns({ ...base, splits: [SIZE, SIZE, SIZE] })).toBe(false);
    expect(mayHaveDesigns({ ...base, designAttributeId: null })).toBe(false);
  });

  it('splits the variants by design, first, and drops the split with the last design (PD-1)', () => {
    const labels = designLabels(BURKA.designs, 3, 'ডিজাইন');
    const split = designSplit(BURKA, labels, 'a-design', 'ডিজাইন');
    expect(split.options.map((option) => [option.id, option.value])).toEqual([
      ['d-1', 'ডিজাইন 1'],
      ['d-2', 'স্ট্রাইপ'],
    ]);
    const typed = { ...blankRow(['o-54']), price: '2600' };
    const made = withDesignSplit([SIZE], [typed, blankRow(['o-56'])], [], 'a-design', split);
    expect(made.splits.map((each) => each.attributeId)).toEqual(['a-design', 'a-size']);
    expect(made.variants.map((row) => row.optionIds)).toEqual([
      ['d-1', 'o-54'],
      ['d-1', 'o-56'],
      ['d-2', 'o-54'],
      ['d-2', 'o-56'],
    ]);
    const gone = withDesignSplit(made.splits, made.variants, [], 'a-design', null);
    expect(gone.splits.map((each) => each.attributeId)).toEqual(['a-size']);
    expect(gone.variants.map((row) => row.optionIds)).toEqual([['o-54'], ['o-56']]);
  });

  it('saves photos with their designs, before the variants that name them (PD-16)', () => {
    const labels = designLabels(BURKA.designs, 3, 'ডিজাইন');
    expect(imagesBody(BURKA, labels)).toEqual({
      photos: [
        { mediaId: 'p-1', design: 'd-1' },
        { mediaId: 'p-2', design: 'd-2' },
        { mediaId: 'p-3', design: 'd-2' },
      ],
      designs: [
        { key: 'd-1', id: 'd-1', name: 'ডিজাইন 1' },
        { key: 'd-2', id: 'd-2', name: 'স্ট্রাইপ' },
      ],
    });
    const saved: ProductForm = { ...NEW_PRODUCT, name: 'Irani burka', price: '2450', ...BURKA };
    const added = withPhotos(saved, ['p-4'], true);
    const key = String(added.designs[2]?.key);
    const typed: ProductForm = {
      ...saved,
      ...added,
      splits: [{ ...SIZE, attributeId: 'a-design', options: [] }],
      variants: [blankRow([key])],
    };
    const parts = changedParts(saved, typed, designLabels(added.designs, 3, 'ডিজাইন'));
    expect(parts.map((part) => part.part)).toEqual(['images', 'variants']);
    expect(parts[0]?.body).toMatchObject({
      designs: [{ key: 'd-1' }, { key: 'd-2' }, { key, name: 'ডিজাইন 3' }],
    });
    // The new design's key becomes its id once the photos save gives it one, everywhere the form names it.
    const named = withDesignIds(typed, new Map([[key, 'd-3']]));
    expect(named.photoDesigns['p-4']).toBe('d-3');
    expect(named.designs[2]).toMatchObject({ key: 'd-3', id: 'd-3' });
    expect(named.variants[0]?.optionIds).toEqual(['d-3']);
  });

  it('makes a new product with its designs in one request, its variants naming them by key', () => {
    const state = withPhotos(EMPTY, ['p-1', 'p-2'], true);
    const [one, two] = state.designs.map((design) => design.key);
    const form: ProductForm = {
      ...NEW_PRODUCT,
      name: 'Abaya',
      price: '2450',
      ...state,
      splits: [
        {
          attributeId: 'a-design',
          name: 'Design',
          dataType: AttributeDataType.EnumSingle,
          unitKind: null,
          options: state.designs.map((design) => ({
            id: design.key,
            value: '',
            swatchColor: null,
            swatchImage: null,
          })),
        },
      ],
      variants: [blankRow([String(one)]), blankRow([String(two)])],
    };
    const body = createBody(form, designLabels(state.designs, 1, 'ডিজাইন'));
    expect(body).not.toHaveProperty('imageIds');
    expect(body).toMatchObject({
      photos: [
        { mediaId: 'p-1', design: one },
        { mediaId: 'p-2', design: two },
      ],
      designs: [
        { key: one, name: 'ডিজাইন 1' },
        { key: two, name: 'ডিজাইন 2' },
      ],
      variantAttributes: [{ attributeId: 'a-design', optionIds: [one, two] }],
    });
  });

  it("groups a picker's variants by design, in the order they come (PD-22)", () => {
    const variant = (id: string, design: string | null) => ({
      id,
      design: design === null ? null : { id: design, name: design.toUpperCase() },
      image: design === null ? null : `${design}.jpg`,
    });
    const groups = byDesign([
      variant('v-1', 'd-1'),
      variant('v-2', 'd-2'),
      variant('v-3', 'd-1'),
      variant('v-4', null),
    ]);
    expect(
      groups.map((group) => [group.design?.name ?? null, group.variants.map((each) => each.id)]),
    ).toEqual([
      ['D-1', ['v-1', 'v-3']],
      ['D-2', ['v-2']],
      [null, ['v-4']],
    ]);
    expect(groups[0]?.design?.image).toBe('d-1.jpg');
  });
});
