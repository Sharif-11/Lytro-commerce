import type { Language } from './mock-api';
import { drawnProducts, type ProductsFixture } from './products';
import { drawnLibrary, type AttributeFixture } from './variants';

// The Attributes page's shops (Slice 11.8, Part 19): the drawn library with the shop's own beside it, and its sets;
// and the shop as the prototype draws it, in either language, for the pictures beside the sketch.

/** The drawn library, Colour with a value of the shop's own, and three attributes of the shop's (Part 19's `ATTRS`). */
export function attributeShop(): ProductsFixture {
  const library = drawnLibrary();
  const colour = library.find((each) => each.id === 'a-2');
  colour?.options.push({ id: 'o-2-Maroon', value: 'Maroon', scope: 'shop' });
  const own: AttributeFixture[] = [
    {
      id: 'a-own-1',
      name: 'Thread count',
      dataType: 'number_with_unit',
      unitKind: 'count',
      scope: 'shop',
      options: [],
    },
    {
      id: 'a-own-2',
      name: 'Cotton type',
      dataType: 'enum_single',
      scope: 'shop',
      options: [
        { id: 'o-c-1', value: '100% cotton', scope: 'shop' },
        { id: 'o-c-2', value: 'Cotton blend', scope: 'shop' },
        { id: 'o-c-3', value: 'Linen', scope: 'shop' },
        { id: 'o-c-4', value: 'Silk blend', scope: 'shop', retired: true },
      ],
    },
    {
      id: 'a-own-3',
      name: 'Old fit',
      dataType: 'enum_single',
      scope: 'shop',
      retired: true,
      options: [
        { id: 'o-f-1', value: 'Boxy', scope: 'shop' },
        { id: 'o-f-2', value: 'Cropped', scope: 'shop' },
      ],
    },
  ];
  return {
    ...drawnProducts(),
    library: [...library, ...own],
    optionSets: [
      {
        id: 'set-1',
        name: 'S–XXL',
        options: ['S', 'M', 'L', 'XL', 'XXL'],
        scope: 'platform',
        presetKey: 'clothing',
      },
      {
        id: 'set-own',
        name: 'Kids sizes',
        options: ['2–3', '4–5', '6–7', '8–9'],
        scope: 'shop',
        presetKey: null,
      },
    ],
  };
}

/** The prototype's `ATTRS` and its sets (Part 19), named in the language the picture is taken in. */
export function sketchedAttributes(language: Language): ProductsFixture {
  const L = (bn: string, en: string) => (language === 'bn' ? bn : en);
  const values = (prefix: string, names: string[], scope: 'platform' | 'shop' = 'platform') =>
    names.map((value) => ({ id: `${prefix}-${value}`, value, scope }));
  const colours = [
    'Black',
    'White',
    'Navy',
    'Red',
    'Blue',
    'Green',
    'Maroon',
    'Grey',
    'Pink',
    'Olive',
    'Cream',
    'Brown',
  ];
  return {
    ...drawnProducts(),
    library: [
      {
        id: 'a-1',
        name: L('সাইজ', 'Size'),
        dataType: 'enum_single',
        scope: 'platform',
        options: [
          ...values('o-1', ['S', 'M', 'L', 'XL', 'XXL']),
          { id: 'o-1-XXXL', value: 'XXXL', scope: 'shop' },
        ],
      },
      {
        id: 'a-2',
        name: L('রং', 'Colour'),
        dataType: 'enum_single',
        scope: 'platform',
        options: values('o-2', colours),
      },
      { id: 'a-3', name: L('কাপড়', 'Material'), dataType: 'text', scope: 'platform', options: [] },
      {
        id: 'a-4',
        name: L('ওজন', 'Weight'),
        dataType: 'number_with_unit',
        unitKind: 'weight',
        scope: 'platform',
        options: [],
      },
      {
        id: 'a-5',
        name: L('থ্রেড কাউন্ট', 'Thread count'),
        dataType: 'number_with_unit',
        unitKind: 'count',
        scope: 'shop',
        options: [],
      },
      {
        id: 'a-6',
        name: L('সুতির ধরন', 'Cotton type'),
        dataType: 'enum_single',
        scope: 'shop',
        options: [
          { id: 'o-6-1', value: L('100% কটন', '100% cotton'), scope: 'shop' },
          { id: 'o-6-2', value: L('কটন মিক্স', 'Cotton blend'), scope: 'shop' },
          { id: 'o-6-3', value: L('লিনেন', 'Linen'), scope: 'shop' },
          { id: 'o-6-4', value: L('সিল্ক মিক্স', 'Silk blend'), scope: 'shop', retired: true },
        ],
      },
      {
        id: 'a-7',
        name: L('পুরোনো ফিট', 'Old fit'),
        dataType: 'enum_single',
        scope: 'shop',
        retired: true,
        options: values('o-7', ['Boxy', 'Cropped'], 'shop'),
      },
    ],
    optionSets: [
      {
        id: 'set-1',
        name: 'S–XXL',
        options: ['S', 'M', 'L', 'XL', 'XXL'],
        scope: 'platform',
        presetKey: 'clothing',
      },
      {
        id: 'set-2',
        name: '38–44',
        options: ['38', '39', '40', '41', '42', '43', '44'],
        scope: 'platform',
        presetKey: null,
      },
      {
        id: 'set-3',
        name: L('সাধারণ রং', 'Common colours'),
        options: colours.slice(0, 8),
        scope: 'platform',
        presetKey: null,
      },
      {
        id: 'set-own',
        name: L('বাচ্চাদের সাইজ', 'Kids sizes'),
        options: ['2–3', '4–5', '6–7', '8–9'],
        scope: 'shop',
        presetKey: null,
      },
    ],
  };
}
