import type { ProductFixture, ProductRefusal, ProductsFixture } from './products';

// Options and variants against a mocked API (Slice 11.7b): the library's attributes and the shop's own, the option
// sets, a new product's defaults, each variant's stock, and the writes -- attributes and options made, a swatch set, a
// set saved, a product's variants and descriptions saved -- each changing the fixture, so the reads after them show
// what was done.

export interface OptionFixture {
  id: string;
  value: string;
  scope: 'platform' | 'shop';
  swatchColor?: string | null;
  swatchImageId?: string | null;
}

export interface AttributeFixture {
  id: string;
  name: string;
  dataType: 'enum_single' | 'enum_multi' | 'number_with_unit' | 'text' | 'boolean';
  unitKind?: 'weight' | 'volume' | 'count' | null;
  scope: 'platform' | 'shop';
  options: OptionFixture[];
}

/** A product's variant as saved, with what it holds. */
export interface VariantFixture {
  id: string;
  optionIds: string[];
  price: string | null;
  sku: string | null;
  packAmount?: string | null;
  onHand?: number;
  /** Slice 11.7c: what it sets of its own (the variant sheet). */
  barcode?: string | null;
  weightKg?: string | null;
  deliveryCharge?: string | null;
  deliveryMode?: string | null;
  active?: boolean;
}

/** A product's variants as saved: the attributes splitting it, with their options, and a row per variant. */
export interface MatrixFixture {
  splits: { attributeId: string; optionIds: string[] }[];
  rows: VariantFixture[];
}

/** A describing or asked attribute on a product, with its value. */
export interface DescriptionFixture {
  attributeId: string;
  role: 'informational' | 'captured_at_order';
  optionIds?: string[];
  textValue?: string | null;
  numberValue?: number | null;
  boolValue?: boolean | null;
}

const shopOptions = (attribute: number, values: string[]): OptionFixture[] =>
  values.map((value) => ({ id: `o-${String(attribute)}-${value}`, value, scope: 'shop' }));

/** The library a clothing shop sees: the platform's attributes, with the shop's own values and colours' swatches. */
export function drawnLibrary(): AttributeFixture[] {
  return [
    {
      id: 'a-1',
      name: 'Size',
      dataType: 'enum_single',
      scope: 'platform',
      options: shopOptions(1, ['S', 'M', 'L', 'XL', 'XXL']),
    },
    {
      id: 'a-2',
      name: 'Colour',
      dataType: 'enum_single',
      scope: 'platform',
      options: [
        { id: 'o-2-Black', value: 'Black', scope: 'platform', swatchColor: '#10201F' },
        { id: 'o-2-Blue', value: 'Blue', scope: 'platform', swatchColor: '#1D4ED8' },
        { id: 'o-2-White', value: 'White', scope: 'platform', swatchColor: '#FFFFFF' },
        { id: 'o-2-Navy', value: 'Navy', scope: 'platform', swatchColor: '#1F2F5C' },
      ],
    },
    { id: 'a-3', name: 'Material', dataType: 'text', scope: 'platform', options: [] },
    {
      id: 'a-4',
      name: 'Fit',
      dataType: 'enum_single',
      scope: 'platform',
      options: [
        { id: 'o-4-Regular', value: 'Regular', scope: 'platform' },
        { id: 'o-4-Slim', value: 'Slim', scope: 'platform' },
        { id: 'o-4-Oversized', value: 'Oversized', scope: 'platform' },
      ],
    },
    {
      id: 'a-5',
      name: 'Sleeve',
      dataType: 'enum_single',
      scope: 'platform',
      options: [
        { id: 'o-5-Half', value: 'Half', scope: 'platform' },
        { id: 'o-5-Full', value: 'Full', scope: 'platform' },
      ],
    },
    {
      id: 'a-6',
      name: 'Compatible models',
      dataType: 'enum_multi',
      scope: 'platform',
      options: [
        { id: 'o-6-13', value: 'iPhone 13', scope: 'platform' },
        { id: 'o-6-14', value: 'iPhone 14', scope: 'platform' },
        { id: 'o-6-14p', value: 'iPhone 14 Pro', scope: 'platform' },
      ],
    },
    { id: 'a-7', name: 'Waterproof', dataType: 'boolean', scope: 'platform', options: [] },
    {
      id: 'a-8',
      name: 'Pack size',
      dataType: 'number_with_unit',
      unitKind: 'weight',
      scope: 'platform',
      options: [
        { id: 'o-8-5', value: '5000', scope: 'platform' },
        { id: 'o-8-10', value: '10000', scope: 'platform' },
      ],
    },
    {
      id: 'a-9',
      name: 'Net weight',
      dataType: 'number_with_unit',
      unitKind: 'weight',
      scope: 'platform',
      options: [],
    },
    { id: 'a-10', name: 'Fabric', dataType: 'text', scope: 'platform', options: [] },
  ];
}

/** The drawn T-shirt's variants (Part 14's `TS_ROWS`): S to XXL in Black and Blue, in the server's order. */
export function drawnTshirt(): MatrixFixture {
  const sizes = ['S', 'M', 'L', 'XL', 'XXL'];
  const held: Record<string, number> = {
    'S-Black': 6,
    'M-Black': 10,
    'L-Black': 9,
    'XL-Black': 5,
    'XXL-Black': 2,
    'S-Blue': 5,
    'M-Blue': 8,
    'L-Blue': 6,
    'XL-Blue': 3,
    'XXL-Blue': 0,
  };
  const rows = sizes.flatMap((size) =>
    ['Black', 'Blue'].map((colour) => ({
      optionIds: [`o-1-${size}`, `o-2-${colour}`],
      price: size.startsWith('X') ? '490.00' : null,
      sku: `TS-${size}-${colour.slice(0, 2).toUpperCase()}`,
      onHand: held[`${size}-${colour}`] ?? 0,
    })),
  );
  return {
    splits: [
      { attributeId: 'a-1', optionIds: sizes.map((size) => `o-1-${size}`) },
      { attributeId: 'a-2', optionIds: ['o-2-Black', 'o-2-Blue'] },
    ],
    rows: rows.map((row, index) => ({ ...row, id: `p-1-v${String(index + 1)}` })),
  };
}

export function drawnOptionSets(): unknown[] {
  return [
    {
      id: 'set-1',
      name: 'S–XXL',
      options: ['S', 'M', 'L', 'XL', 'XXL'],
      scope: 'platform',
      presetKey: 'clothing',
    },
    {
      id: 'set-2',
      name: 'Common colours',
      options: ['Black', 'White', 'Navy'],
      scope: 'platform',
      presetKey: null,
    },
  ];
}

const libraryOf = (fixture: ProductsFixture): AttributeFixture[] =>
  (fixture.library ??= drawnLibrary());

let made = 0;

function optionView(option: OptionFixture): unknown {
  return {
    id: option.id,
    value: option.value,
    swatchColor: option.swatchColor ?? null,
    swatchImage: option.swatchImageId
      ? {
          id: option.swatchImageId,
          urls: {
            main: `/swatch/${option.swatchImageId}`,
            thumbnail: `/swatch/${option.swatchImageId}`,
          },
        }
      : null,
    scope: option.scope,
    retired: false,
  };
}

function attributeView(attribute: AttributeFixture): unknown {
  return {
    id: attribute.id,
    name: attribute.name,
    dataType: attribute.dataType,
    unitKind: attribute.unitKind ?? null,
    scope: attribute.scope,
    retired: false,
    options: attribute.options.map(optionView),
  };
}

/** A product's variants as saved: its own, else made from its options (Slice 11.7a's fixtures). */
export function matrixOf(product: ProductFixture): MatrixFixture {
  if (product.matrix) return product.matrix;
  const options =
    product.options ??
    (product.variantCount > 1
      ? [Array.from({ length: product.variantCount }, (_, index) => `V${String(index + 1)}`)]
      : []);
  const splits = options.map((values, index) => ({
    attributeId: `a-${String(index + 1)}`,
    optionIds: values.map((value) => `o-${String(index + 1)}-${value}`),
  }));
  const combinations = splits.reduce<string[][]>(
    (all, split) => all.flatMap((ids) => split.optionIds.map((id) => [...ids, id])),
    [[]],
  );
  return {
    splits,
    rows: combinations.map((optionIds, index) => ({
      id: `${product.id}-v${String(index + 1)}`,
      optionIds,
      price: null,
      sku: null,
      onHand: product.stockState === 'out' ? 0 : 5,
    })),
  };
}

/** An option by its id, from the library or, for the fixtures' made-up values, from the id itself. */
function optionOf(fixture: ProductsFixture, attributeId: string, optionId: string): OptionFixture {
  const attribute = libraryOf(fixture).find((each) => each.id === attributeId);
  return (
    attribute?.options.find((each) => each.id === optionId) ?? {
      id: optionId,
      value: optionId.split('-').slice(2).join('-'),
      scope: 'shop',
    }
  );
}

/** GET /products/:id's options-and-variants part, as the server answers it. */
export function variantPart(
  product: ProductFixture,
  fixture: ProductsFixture,
): Record<string, unknown> {
  const matrix = matrixOf(product);
  const library = libraryOf(fixture);
  const nameOf = (id: string, index: number) =>
    library.find((each) => each.id === id)?.name ?? (index === 0 ? 'Size' : 'Colour');
  return {
    stockUnit: product.stockUnit ?? 'piece',
    stockTracking: product.stockTracking ?? 'tracked',
    batchTracked: product.settings?.batchTracked === true,
    serialTracked: product.serialTracked ?? false,
    sharedStock: product.sharedStock ?? false,
    variantAttributes: matrix.splits.map((split, index) => {
      const attribute = library.find((each) => each.id === split.attributeId);
      return {
        attributeId: split.attributeId,
        name: nameOf(split.attributeId, index),
        dataType: attribute?.dataType ?? 'enum_single',
        unitKind: attribute?.unitKind ?? null,
        options: split.optionIds.map((id) => {
          const option = optionOf(fixture, split.attributeId, id);
          const view = optionView(option) as Record<string, unknown>;
          return {
            id,
            value: option.value,
            swatchColor: view.swatchColor,
            swatchImage: view.swatchImage,
          };
        }),
      };
    }),
    attributes: (product.descriptions ?? []).map((each) => {
      const attribute = library.find((one) => one.id === each.attributeId);
      return {
        attributeId: each.attributeId,
        name: attribute?.name ?? each.attributeId,
        dataType: attribute?.dataType ?? 'text',
        unitKind: attribute?.unitKind ?? null,
        role: each.role,
        optionIds: each.optionIds ?? [],
        optionValues: (each.optionIds ?? []).map(
          (id) => attribute?.options.find((option) => option.id === id)?.value ?? id,
        ),
        textValue: each.textValue ?? null,
        numberValue:
          each.numberValue === undefined || each.numberValue === null
            ? null
            : String(each.numberValue),
        boolValue: each.boolValue ?? null,
      };
    }),
    variants: (matrix.rows.length > 0
      ? matrix.rows
      : [{ id: `${product.id}-v0`, optionIds: [], price: null, sku: null }]
    ).map((row) => ({
      id: row.id,
      optionIds: row.optionIds,
      sku: row.sku,
      barcode: row.barcode ?? null,
      price: row.price,
      effectivePrice: row.price ?? product.basePrice,
      weightKg: row.weightKg ?? null,
      deliveryCharge: row.deliveryCharge ?? null,
      deliveryMode: row.deliveryMode ?? null,
      effectiveDeliveryMode: row.deliveryMode ?? 'default',
      packAmount: row.packAmount ?? null,
      active: row.active ?? true,
      stockState: (row.onHand ?? 0) > 0 ? product.stockState : 'out',
    })),
  };
}

/** GET /products/:id/stock: what each variant holds and can sell (INV-01). */
export function stockAnswer(product: ProductFixture): unknown {
  const matrix = matrixOf(product);
  return {
    productId: product.id,
    stockTracking: product.stockTracking ?? 'tracked',
    stockUnit: product.stockUnit ?? 'piece',
    lowStockThreshold: (product.settings?.lowStockThreshold as string | undefined) ?? '5',
    state: product.stockState,
    shared: product.sharedStock
      ? {
          variantId: `${product.id}-shared`,
          onHand: '0',
          reserved: '0',
          available: '0',
          incoming: '0',
          state: 'out',
        }
      : null,
    variants: matrix.rows.map((row) => ({
      variantId: row.id,
      optionIds: row.optionIds,
      sku: row.sku,
      retired: false,
      onHand: String(row.onHand ?? 0),
      reserved: '0',
      unsellable: '0',
      reservedExpired: '0',
      available: String(row.onHand ?? 0),
      missingSerials: null,
      incoming: '0',
      packAmount: null,
      state: (row.onHand ?? 0) > 0 ? 'in' : 'out',
    })),
  };
}

/**
 * GET /product-defaults: a clothing shop's, unless the fixture is another kind of shop (PST-02), or the category asked
 * about brings its own type's (PST-06).
 */
export function defaultsAnswer(fixture: ProductsFixture, categoryId: string | null): unknown {
  const brought = categoryId ? fixture.categoryDefaults?.[categoryId] : undefined;
  return {
    businessType: 'clothing',
    presetKey: 'clothing',
    fromCategoryId: null,
    stockUnit: 'piece',
    stockTracking: 'tracked',
    batchTracked: false,
    serialTracked: false,
    serialFormat: 'any',
    lowStockThreshold: '5',
    suggestedAttributeIds: ['a-1', 'a-2', 'a-10'],
    suggestedCategories: [],
    upFrontFields: ['sizeChart'],
    shopPaymentPolicy: { defaultPaymentPolicy: 'none', defaultAdvanceAmount: null },
    ...fixture.defaults,
    ...(brought ? { ...brought, fromCategoryId: categoryId } : {}),
  };
}

/** The options-and-variants reads; undefined for any other path. */
export function variantRead(path: string, fixture: ProductsFixture, url: URL): unknown {
  if (path === '/attributes') return libraryOf(fixture).map(attributeView);
  if (path === '/option-sets') return (fixture.optionSets ??= drawnOptionSets());
  if (path === '/product-defaults') {
    return defaultsAnswer(fixture, url.searchParams.get('categoryId'));
  }
  const stock = /^\/products\/([^/]+)\/stock$/.exec(path);
  const product = fixture.products.find((each) => each.id === stock?.[1]);
  return product ? stockAnswer(product) : undefined;
}

/** A combination's key, whatever its options' order. */
const keyOf = (optionIds: readonly string[]): string => [...optionIds].sort().join('&');

/**
 * PUT /products/:id/variants, as the server plans it: every combination of the options, a kept one keeping its stock,
 * a new one starting at 0 (ATR-11); an SKU the fixture refuses is `conflict` on its row.
 */
function saveVariants(
  product: ProductFixture,
  body: Record<string, unknown>,
  fixture: ProductsFixture,
): ProductRefusal | null {
  const splits = (body.variantAttributes ?? []) as { attributeId: string; optionIds: string[] }[];
  const listed = (body.variants ?? []) as {
    optionIds: string[];
    price: number | null;
    sku: string | null;
    packAmount?: number;
    barcode?: string | null;
    weightKg?: number | null;
    deliveryCharge?: number | null;
    deliveryMode?: string | null;
    active?: boolean;
  }[];
  const taken = listed.findIndex((each) => each.sku !== null && each.sku === fixture.refuse?.sku);
  if (taken >= 0) {
    return {
      status: 409,
      code: 'conflict',
      message: 'Another variant has that SKU.',
      details: {
        fields: [
          {
            field: `variants.${String(taken)}.sku`,
            problem: 'taken',
            message: 'Another variant has that SKU.',
          },
        ],
      },
    };
  }
  const before = new Map(matrixOf(product).rows.map((row) => [keyOf(row.optionIds), row]));
  product.matrix = {
    splits,
    rows: listed.map((each) => {
      const kept = before.get(keyOf(each.optionIds));
      return {
        id: kept?.id ?? `${product.id}-n${String((made += 1))}`,
        optionIds: each.optionIds,
        price: each.price === null ? null : each.price.toFixed(2),
        sku: each.sku,
        packAmount: each.packAmount === undefined ? null : String(each.packAmount),
        onHand: kept?.onHand ?? 0,
        barcode: each.barcode ?? null,
        weightKg:
          each.weightKg === undefined || each.weightKg === null ? null : String(each.weightKg),
        deliveryCharge:
          each.deliveryCharge === undefined || each.deliveryCharge === null
            ? null
            : String(each.deliveryCharge),
        deliveryMode: each.deliveryMode ?? null,
        active: each.active ?? true,
      };
    }),
  };
  if (typeof body.sharedStock === 'boolean') product.sharedStock = body.sharedStock;
  product.variantCount = Math.max(1, listed.length);
  return null;
}

/**
 * The options-and-variants writes; undefined for any other request. `answer` is the product's detail after a write to
 * one product.
 */
export function variantWrite(
  method: string,
  path: string,
  body: Record<string, unknown> | null,
  fixture: ProductsFixture,
  answer: (product: ProductFixture) => unknown,
): { data: unknown } | { refused: ProductRefusal } | undefined {
  const library = libraryOf(fixture);
  if (method === 'POST' && path === '/attributes') {
    const name = typeof body?.name === 'string' ? body.name : '';
    const known = library.find((each) => each.name.toLowerCase() === name.toLowerCase());
    if (known) {
      return {
        refused: {
          status: 409,
          code: 'conflict',
          message: 'The shop already has that attribute.',
          details: { attributeId: known.id },
        },
      };
    }
    const attribute: AttributeFixture = {
      id: `a-new-${String((made += 1))}`,
      name,
      dataType: body?.dataType as AttributeFixture['dataType'],
      unitKind: (body?.unitKind as AttributeFixture['unitKind'] | undefined) ?? null,
      scope: 'shop',
      options: [],
    };
    library.push(attribute);
    return { data: attributeView(attribute) };
  }
  const batch = /^\/attributes\/([^/]+)\/options\/batch$/.exec(path);
  const batched = library.find((each) => each.id === batch?.[1]);
  if (method === 'POST' && batched) {
    const values = (body?.values ?? []) as string[];
    // ATR-16: a value the shop already sees is reused, never doubled.
    const options = values.map((value) => {
      const known = batched.options.find(
        (each) => each.value.toLowerCase() === value.toLowerCase(),
      );
      if (known) return known;
      const option: OptionFixture = { id: `o-new-${String((made += 1))}`, value, scope: 'shop' };
      batched.options.push(option);
      return option;
    });
    return { data: options.map(optionView) };
  }
  const swatch = /^\/attributes\/([^/]+)\/options\/([^/]+)$/.exec(path);
  const option = library
    .find((each) => each.id === swatch?.[1])
    ?.options.find((each) => each.id === swatch?.[2]);
  if (method === 'PATCH' && option) {
    if ('swatchColor' in (body ?? {})) {
      option.swatchColor = (body?.swatchColor as string | null) ?? null;
      option.swatchImageId = null;
    }
    if ('swatchImageId' in (body ?? {})) {
      option.swatchImageId = (body?.swatchImageId as string | null) ?? null;
      option.swatchColor = null;
    }
    return { data: optionView(option) };
  }
  if (method === 'POST' && path === '/option-sets') {
    const set = {
      id: `set-new-${String((made += 1))}`,
      name: body?.name,
      options: body?.options,
      scope: 'shop',
      presetKey: null,
    };
    (fixture.optionSets ??= drawnOptionSets()).push(set);
    return { data: set };
  }
  const part = /^\/products\/([^/]+)\/(variants|attributes)$/.exec(path);
  const product = fixture.products.find((each) => each.id === part?.[1]);
  if (method === 'PUT' && part && product && body) {
    if (part[2] === 'variants') {
      const refused = saveVariants(product, body, fixture);
      if (refused) return { refused };
    } else {
      product.descriptions = body.attributes as DescriptionFixture[];
    }
    return { data: answer(product) };
  }
  return undefined;
}

/** POST /products' options and variants, saved with the new product (ATR-11). */
export function createdMatrix(
  product: ProductFixture,
  body: Record<string, unknown>,
  fixture: ProductsFixture,
): void {
  if (Array.isArray(body.variantAttributes) && body.variantAttributes.length > 0) {
    product.matrix = { splits: [], rows: [] };
    saveVariants(product, body, fixture);
  }
  if (Array.isArray(body.attributes))
    product.descriptions = body.attributes as DescriptionFixture[];
  if (body.sharedStock === true) product.sharedStock = true;
}
