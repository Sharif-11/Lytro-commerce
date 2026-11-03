import { createHash } from 'node:crypto';
import {
  AttributeDataType,
  ItemCondition,
  OrderStatus,
  PaymentPolicy,
  StockState,
  StockUnit,
} from '@lytronix/validators/enums';
import type {
  DeliveryZoneView,
  Locations,
  ProductCard,
  ProductVariant,
  PublicCategory,
  PublicProduct,
  PublicShop,
  TrackedOrder,
} from '../../src/lib/api/storefront-api';

// A shop as the mocked server answers for it (docs/brand/lytro-storefront.html's fixtures: Megh Fashion, its zones, its
// products), in the language a test or a picture asks for.

export type Language = 'bn' | 'en';

export interface ProductFixture {
  product: PublicProduct;
  card: ProductCard;
  /** TAX-02: the class its price includes. */
  tax?: { name: string; rate: string } | null;
}

/** What the server does with the next order, before anything else about it. */
export type NextOrder =
  | { refuse: { status: number; code: string; details?: Record<string, unknown> } }
  /** The connection drops; with `placed`, only after the order was made, as a timeout can. */
  | { drop: { placed: boolean } };

export interface ShopFixture {
  slug: string;
  outcome: 'open' | 'closed';
  storefrontEnabled: boolean;
  info: PublicShop;
  categories: PublicCategory[];
  products: ProductFixture[];
  /** LND-04: old links. */
  moved: Record<string, string>;
  locations: Locations;
  /** DLV-02: the zone each thana falls in. */
  thanaZones: Record<number, string>;
  tracked: Record<string, TrackedOrder>;
  nextOrders: NextOrder[];
  /** The tracking ID the next order gets. */
  trackingId: string;
  orderNumber: string;
}

/** An order as the mocked server was sent it. */
export interface SentOrder {
  key: string;
  body: Record<string, unknown>;
  trackingId: string;
}

const pick = (language: Language, bn: string, en: string) => (language === 'bn' ? bn : en);

/** A real-looking id for a name, the same each time: the storefront's own routes hold ids to being UUIDs, as the server
    does. A test names a variant by what it is (`idOf('panjabi-M White')`). */
export function idOf(name: string): string {
  const hash = createHash('sha1').update(name).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `a${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join('-');
}

export const THANA = { dhanmondi: 2, mirpur: 3, ruma: 21 } as const;
export const VAT = { name: 'VAT', rate: '5.00' };
// A date past any product's New tag.
const LONG_AGO = '2026-01-01T00:00:00.000Z';

export function meghLocations(): Locations {
  const places = (rows: [number, string, string][]) =>
    rows.map(([id, nameBn, nameEn]) => ({ id, nameBn, nameEn, cityCode: null }));
  return {
    cities: [],
    zillas: [
      {
        id: 1,
        nameBn: 'ঢাকা',
        nameEn: 'Dhaka',
        thanas: places([
          [1, 'গুলশান', 'Gulshan'],
          [THANA.dhanmondi, 'ধানমন্ডি', 'Dhanmondi'],
          [THANA.mirpur, 'মিরপুর', 'Mirpur'],
          [4, 'উত্তরা', 'Uttara'],
          [5, 'মোহাম্মদপুর', 'Mohammadpur'],
          [6, 'বাড্ডা', 'Badda'],
          [7, 'সাভার', 'Savar'],
          [8, 'ধামরাই', 'Dhamrai'],
        ]),
      },
      {
        id: 2,
        nameBn: 'গাজীপুর',
        nameEn: 'Gazipur',
        thanas: places([
          [11, 'গাজীপুর সদর', 'Gazipur Sadar'],
          [12, 'টঙ্গী', 'Tongi'],
        ]),
      },
      { id: 3, nameBn: 'চট্টগ্রাম', nameEn: 'Chattogram', thanas: [] },
      { id: 4, nameBn: 'সিলেট', nameEn: 'Sylhet', thanas: [] },
      { id: 5, nameBn: 'রাজশাহী', nameEn: 'Rajshahi', thanas: [] },
      { id: 6, nameBn: 'কুমিল্লা', nameEn: 'Cumilla', thanas: [] },
      {
        id: 7,
        nameBn: 'বান্দরবান',
        nameEn: 'Bandarban',
        thanas: places([
          [20, 'বান্দরবান সদর', 'Bandarban Sadar'],
          [THANA.ruma, 'রুমা', 'Ruma'],
        ]),
      },
    ],
  };
}

export const ZONES: DeliveryZoneView[] = [
  { id: 'inside', name: { bn: 'ঢাকা শহর', en: 'Dhaka city' }, charge: '70.00', noDelivery: false },
  {
    id: 'outside',
    name: { bn: 'ঢাকার বাইরে', en: 'Outside Dhaka' },
    charge: '130.00',
    noDelivery: false,
  },
  { id: 'none', name: { bn: 'বান্দরবান', en: 'Bandarban' }, charge: '0.00', noDelivery: true },
];

function zoneOfThana(): Record<number, string> {
  const zones: Record<number, string> = {};
  for (const id of [1, 2, 3, 4, 5, 6]) zones[id] = 'inside';
  for (const id of [7, 8, 11, 12]) zones[id] = 'outside';
  for (const id of [20, 21]) zones[id] = 'none';
  return zones;
}

const category = (id: string, name: string, productCount: number): PublicCategory => ({
  id,
  slug: id,
  name,
  image: null,
  productCount,
  children: [],
});

interface ProductSpec {
  id: string;
  slug: string;
  name: string;
  price: number;
  categoryId?: string | null;
  stockState?: StockState;
  createdAt?: string;
  description?: string | null;
  sizes?: string[];
  colours?: [string, string][];
  paymentPolicy?: PaymentPolicy;
  advanceAmount?: string | null;
  deliveryZoneIds?: string[];
  soldOutPairs?: string[];
  tax?: ProductFixture['tax'];
  extra?: Partial<PublicProduct>;
}

const money = (amount: number) => amount.toFixed(2);

/** A product, its variants the sizes by the colours, or one with no options. */
export function makeProduct(spec: ProductSpec): ProductFixture {
  const sizes = spec.sizes ?? [];
  const colours = spec.colours ?? [];
  const stockState = spec.stockState ?? StockState.In;
  const optionFor = (kind: string, value: string) => `${spec.id}-${kind}-${value}`;
  const options: PublicProduct['options'] = [];
  if (sizes.length > 0) {
    options.push({
      attributeId: `${spec.id}-size`,
      name: 'Size',
      dataType: AttributeDataType.EnumSingle,
      unitKind: null,
      values: sizes.map((size) => ({
        id: optionFor('size', size),
        value: size,
        swatchColor: null,
        swatchImage: null,
      })),
    });
  }
  if (colours.length > 0) {
    options.push({
      attributeId: `${spec.id}-colour`,
      name: 'Colour',
      dataType: AttributeDataType.EnumSingle,
      unitKind: null,
      values: colours.map(([name, swatch]) => ({
        id: optionFor('colour', name),
        value: name,
        swatchColor: swatch,
        swatchImage: null,
      })),
    });
  }
  const variant = (id: string, optionIds: string[], label: string): ProductVariant => {
    const out = stockState === StockState.Out || (spec.soldOutPairs ?? []).includes(label);
    return {
      id,
      optionIds,
      price: money(spec.price),
      stockState: out ? StockState.Out : stockState,
      available: !out,
    };
  };
  const variants: ProductVariant[] = [];
  const sizeRows = sizes.length > 0 ? sizes : [''];
  const colourRows = colours.length > 0 ? colours.map(([name]) => name) : [''];
  for (const size of sizeRows) {
    for (const colour of colourRows) {
      const label = [size, colour].filter((part) => part !== '').join(' ');
      const optionIds = [
        ...(size === '' ? [] : [optionFor('size', size)]),
        ...(colour === '' ? [] : [optionFor('colour', colour)]),
      ];
      variants.push(variant(idOf(`${spec.id}-${label === '' ? 'v' : label}`), optionIds, label));
    }
  }
  const product: PublicProduct = {
    id: spec.id,
    slug: spec.slug,
    name: spec.name,
    description: spec.description ?? null,
    minPrice: money(spec.price),
    maxPrice: money(spec.price),
    stockState,
    stockUnit: StockUnit.Piece,
    condition: ItemCondition.New,
    primaryCategoryId: spec.categoryId ?? null,
    categoryIds: spec.categoryId ? [spec.categoryId] : [],
    images: [],
    video: null,
    options,
    attributes: [],
    variants,
    sizeChart: null,
    paymentPolicy: spec.paymentPolicy ?? PaymentPolicy.None,
    advanceAmount: spec.advanceAmount ?? null,
    deliveryZoneIds: spec.deliveryZoneIds ?? [],
    modifierGroups: [],
    asked: [],
    combo: null,
    ...spec.extra,
  };
  return {
    product,
    tax: spec.tax ?? null,
    card: {
      id: spec.id,
      slug: spec.slug,
      name: spec.name,
      minPrice: product.minPrice,
      maxPrice: product.maxPrice,
      stockState,
      image: null,
      createdAt: spec.createdAt ?? LONG_AGO,
      swatches: options[1]?.values ?? [],
    },
  };
}

/** Megh's Cotton panjabi as the prototype's `PRODUCT` draws it, its size and colour rows, its description and details. */
export function panjabi(language: Language, extra: Partial<ProductSpec> = {}): ProductFixture {
  const made = makeProduct({
    id: 'panjabi',
    slug: 'cotton-panjabi',
    name: pick(language, 'কটন পাঞ্জাবি', 'Cotton Panjabi'),
    price: 1250,
    categoryId: 'panjabi',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    colours: [
      [pick(language, 'সাদা', 'White'), '#fff'],
      [pick(language, 'নেভি', 'Navy'), '#1f2f5c'],
    ],
    description: pick(
      language,
      '১০০% কটন, প্রি-শ্রাঙ্ক। ধোয়ার পর সাইজ বদলায় না।\nঈদের জন্য হালকা এমব্রয়ডারি, রেগুলার ফিট।',
      '100% cotton, pre-shrunk. Keeps its size after washing.\nLight embroidery for Eid, regular fit.',
    ),
    tax: VAT,
    ...extra,
    extra: {
      attributes: [
        ['কাপড়', 'Fabric', 'কটন', 'Cotton'],
        ['ফিট', 'Fit', 'রেগুলার', 'Regular'],
        ['কলার', 'Collar', 'ব্যান্ড', 'Band'],
      ].map(([bn, en, valueBn, valueEn]) => ({
        name: pick(language, bn ?? '', en ?? ''),
        dataType: AttributeDataType.Text,
        unitKind: null,
        values: [],
        text: pick(language, valueBn ?? '', valueEn ?? ''),
        number: null,
        yes: null,
      })),
      sizeChart: {
        rows: [
          ['Size', 'Chest', 'Length', 'Sleeve'],
          ['M', '40', '41', '24.5'],
        ],
        image: null,
      },
      ...extra.extra,
    },
  });
  // Size M in the first colour first, as the prototype opens with it.
  const opening = made.product.variants.findIndex((row) => row.optionIds[0] === 'panjabi-size-M');
  const [first] = made.product.variants.splice(opening, 1);
  if (first) made.product.variants.unshift(first);
  return made;
}

export const WRAP = idOf('wrap');
export const GIFT_WRAP = {
  id: idOf('gift-wrap'),
  name: 'Gift wrap',
  minSelect: 0,
  maxSelect: 1,
  options: [{ id: WRAP, name: 'Gift wrap', priceChange: '50.00', isDefault: false }],
};

export const PACKING = {
  id: idOf('packing'),
  name: 'Packing',
  minSelect: 1,
  maxSelect: 1,
  options: [
    { id: idOf('plain'), name: 'Plain', priceChange: '0.00', isDefault: false },
    { id: idOf('box'), name: 'Gift box', priceChange: '80.00', isDefault: false },
  ],
};

export const EMBROIDER = {
  attributeId: idOf('embroider'),
  name: 'Name to embroider',
  dataType: AttributeDataType.Text,
};

export function hijab(language: Language): ProductFixture {
  return makeProduct({
    id: 'hijab',
    slug: 'chiffon-hijab',
    name: pick(language, 'শিফন হিজাব', 'Chiffon Hijab'),
    price: 350,
    categoryId: 'hijab',
    colours: [
      [pick(language, 'কালো', 'Black'), '#10201f'],
      [pick(language, 'ধূসর', 'Grey'), '#5b6e6d'],
    ],
    tax: VAT,
  });
}

export function threePiece(language: Language): ProductFixture {
  return makeProduct({
    id: 'lawn',
    slug: 'lawn-three-piece',
    name: pick(language, 'লন থ্রি-পিস', 'Lawn three-piece'),
    price: 1850,
    categoryId: 'three-piece',
    sizes: ['L'],
    stockState: StockState.Low,
    paymentPolicy: PaymentPolicy.PartialAdvance,
    advanceAmount: '200.00',
  });
}

export function jacket(language: Language): ProductFixture {
  return makeProduct({
    id: 'jacket',
    slug: 'denim-jacket',
    name: pick(language, 'ডেনিম জ্যাকেট', 'Denim jacket'),
    price: 1890,
    categoryId: 'shirts',
    sizes: ['M'],
  });
}

export function frock(language: Language): ProductFixture {
  return makeProduct({
    id: 'frock',
    slug: 'kids-frock',
    name: pick(language, 'বাচ্চাদের ফ্রক', 'Kids Frock'),
    price: 690,
    categoryId: 'kids',
    stockState: StockState.Out,
  });
}

/** `combo`: a size for the panjabi, the lungi that comes with it, what it saves. */
export function eidCombo(language: Language): ProductFixture {
  const lungi = pick(language, 'চেক লুঙ্গি', 'Check lungi');
  const panjabiName = pick(language, 'কটন পাঞ্জাবি', 'Cotton Panjabi');
  return makeProduct({
    id: 'eid',
    slug: 'eid-combo',
    name: pick(language, 'ঈদ কম্বো: পাঞ্জাবি + লুঙ্গি', 'Eid Combo: Panjabi + Lungi'),
    price: 1500,
    categoryId: 'panjabi',
    tax: VAT,
    extra: {
      combo: {
        saving: '170.00',
        parts: [
          {
            position: 1,
            quantity: '1.000',
            productName: panjabiName,
            image: null,
            choice: true,
            variants: [
              ...['S', 'M', 'L', 'XL'].map((size) => ({
                variantId: `combo-${size}`,
                productName: panjabiName,
                label: size,
                available: true,
              })),
              { variantId: 'combo-XXL', productName: panjabiName, label: 'XXL', available: false },
            ],
          },
          {
            position: 2,
            quantity: '1.000',
            productName: lungi,
            image: null,
            choice: false,
            variants: [
              { variantId: 'combo-lungi', productName: lungi, label: '', available: true },
            ],
          },
        ],
      },
    },
  });
}

/** A new product, for its tag on a card (SFT-03). */
export function newShirt(language: Language, now: Date = new Date()): ProductFixture {
  return makeProduct({
    id: 'linen',
    slug: 'linen-shirt',
    name: pick(language, 'লিনেন শার্ট', 'Linen Shirt'),
    price: 1150,
    categoryId: 'shirts',
    createdAt: new Date(now.getTime() - 86_400_000).toISOString(),
  });
}

/** Megh Fashion, the shop every test and picture starts from. */
export function meghShop(language: Language, overrides: Partial<ShopFixture> = {}): ShopFixture {
  return {
    slug: 'megh',
    outcome: 'open',
    storefrontEnabled: true,
    info: {
      name: pick(language, 'মেঘ ফ্যাশন', 'Megh Fashion'),
      slug: 'megh',
      metaPixelId: null,
      logo: null,
      contact: {
        phone: '01711-223344',
        email: 'hello@meghfashion.com',
        address: pick(
          language,
          'শপ ১২, রাপা প্লাজা, ধানমন্ডি, ঢাকা',
          'Shop 12, Rapa Plaza, Dhanmondi, Dhaka',
        ),
      },
      deliveryZones: ZONES,
      brand: null,
    },
    categories: [
      category('panjabi', pick(language, 'পাঞ্জাবি', 'Panjabi'), 24),
      category('sarees', pick(language, 'শাড়ি', 'Sarees'), 18),
      category('three-piece', pick(language, 'থ্রি-পিস', 'Three-piece'), 31),
      category('shirts', pick(language, 'শার্ট', 'Shirts'), 9),
      category('kids', pick(language, 'বাচ্চাদের', 'Kids'), 15),
      category('hijab', pick(language, 'হিজাব', 'Hijab'), 7),
    ],
    products: [
      panjabi(language),
      hijab(language),
      threePiece(language),
      jacket(language),
      frock(language),
      eidCombo(language),
      newShirt(language),
    ],
    moved: {},
    locations: meghLocations(),
    thanaZones: zoneOfThana(),
    tracked: {},
    nextOrders: [],
    trackingId: 'K7F2M9QX',
    orderNumber: '261031-0047',
    ...overrides,
  };
}

/** The tracking page's order: a panjabi and an Eid combo with its parts, at any stage. */
export function trackedOrder(
  language: Language,
  stage: 'placed' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled' | 'returned',
): TrackedOrder {
  const times: [TrackedOrder['timeline'][number]['step'], string][] = [
    ['placed', '2026-10-31T05:42:00.000Z'],
  ];
  if (stage === 'cancelled') times.push(['cancelled', '2026-10-31T06:05:00.000Z']);
  else {
    const order = ['confirmed', 'shipped', 'delivered'] as const;
    const reach = stage === 'returned' ? 3 : order.indexOf(stage as (typeof order)[number]) + 1;
    const at = ['2026-10-31T06:10:00.000Z', '2026-10-31T12:12:00.000Z', '2026-11-01T09:30:00.000Z'];
    order.slice(0, reach).forEach((step, index) => {
      times.push([step, at[index] ?? '']);
    });
  }
  const status = {
    placed: OrderStatus.Pending,
    confirmed: OrderStatus.Confirmed,
    shipped: OrderStatus.Shipped,
    delivered: OrderStatus.Delivered,
    cancelled: OrderStatus.Cancelled,
    returned: OrderStatus.Returned,
  }[stage];
  const size = { name: 'Size', value: 'M', variantDefining: true };
  const colour = { name: 'Colour', value: pick(language, 'সাদা', 'White'), variantDefining: true };
  return {
    orderNumber: '261031-0047',
    trackingId: 'K7F2M9QX',
    status,
    timeline: times.map(([step, at]) => ({ step, at })),
    items: [
      {
        variantId: idOf('panjabi-M White'),
        productName: pick(language, 'কটন পাঞ্জাবি', 'Cotton Panjabi'),
        attributes: [size, colour],
        quantity: '1.000',
        stockUnit: StockUnit.Piece,
        unitPrice: '1300.00',
        itemTotal: '1300.00',
        modifiers: [
          {
            groupName: 'Gift wrap',
            optionName: pick(language, 'গিফট র‍্যাপ', 'Gift wrap'),
            priceChange: '50.00',
          },
        ],
        captured: [
          { name: pick(language, 'যে নাম এমব্রয়ডারি হবে', 'Name to embroider'), value: 'Rafi' },
        ],
        components: [],
      },
      {
        variantId: idOf('eid-v'),
        productName: pick(language, 'ঈদ কম্বো', 'Eid combo'),
        attributes: [],
        quantity: '1.000',
        stockUnit: StockUnit.Piece,
        unitPrice: '1500.00',
        itemTotal: '1500.00',
        modifiers: [],
        captured: [],
        components: [
          {
            productName: pick(language, 'পাঞ্জাবি', 'Panjabi'),
            attributes: [{ name: 'Size', value: 'L', variantDefining: true }],
            quantity: '1.000',
          },
          {
            productName: pick(language, 'চেক লুঙ্গি', 'Check lungi'),
            attributes: [],
            quantity: '1.000',
          },
        ],
      },
    ],
    subtotal: '2800.00',
    deliveryCharge: '70.00',
    discount: '0.00',
    grandTotal: '2870.00',
    codAmount: '2870.00',
    taxes: [{ name: 'VAT', rate: '5.00', amount: '133.33' }],
    due: '2870.00',
    courier:
      stage === 'shipped' || stage === 'delivered' || stage === 'returned'
        ? {
            name: 'Steadfast',
            trackingCode: 'SF-2610-4471',
            trackingLink: 'https://steadfast.example/track/SF-2610-4471',
          }
        : null,
  };
}
