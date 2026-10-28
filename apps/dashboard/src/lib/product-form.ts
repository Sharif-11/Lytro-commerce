import { StockTracking } from '@lytronix/validators';
import type { ProductDetail } from '@/types/product';
import {
  BLANK_CHART,
  changedSettings,
  chartBody,
  chartOf,
  settingsBody,
  settingsFrom,
  settingsOf,
  type ChartForm,
  type ProductSettings,
} from './product-settings';
import {
  descriptionOf,
  descriptionsBody,
  keyOf,
  rowsOf,
  splitsBody,
  splitsOf,
  variantsBody,
  type Description,
  type SplitAttribute,
  type VariantRow,
} from './variant-matrix';

/** A product with no options: its one variant's SKU and barcode, under More settings (agreed 2026-10-28). */
export interface SingleVariant {
  sku: string;
  barcode: string;
}

/**
 * What the product editor holds while it is typed (TENANT-DASHBOARD-DESIGN §7.4): Basics -- the photos in order and
 * the one video, the name, the price as typed, the categories with the primary one, the description -- whether it is on
 * sale (Slice 11.7a); its options and variants (Slice 11.7b): the attributes that split it, a row per variant, the
 * attributes that describe it or are asked when ordering, and whether its variants share one stock; and its stock,
 * delivery and payment settings, its size chart, where it delivers, and a new product's stock on the shelf (Slice
 * 11.7c).
 */
export interface ProductForm {
  name: string;
  price: string;
  description: string;
  categoryIds: string[];
  primaryCategoryId: string | null;
  active: boolean;
  imageIds: string[];
  videoId: string | null;
  splits: SplitAttribute[];
  variants: VariantRow[];
  descriptions: Description[];
  sharedStock: boolean;
  /** INV-24: a new product's shared stock already on the shelf, in its unit, as typed. */
  sharedOpeningStock: string;
  settings: ProductSettings;
  /** INV-03: a new product with no options: its stock already on the shelf, as typed. */
  openingStock: string;
  single: SingleVariant;
  /** DLV-07: the zones it may be delivered to; none for wherever the shop delivers. */
  deliveryZoneIds: string[];
  chart: ChartForm;
}

/** A new product: nothing typed, on sale once saved, one default variant, the shop's defaults until they load. */
export const NEW_PRODUCT: ProductForm = {
  name: '',
  price: '',
  description: '',
  categoryIds: [],
  primaryCategoryId: null,
  active: true,
  imageIds: [],
  videoId: null,
  splits: [],
  variants: [],
  descriptions: [],
  sharedStock: false,
  sharedOpeningStock: '',
  settings: settingsFrom(undefined),
  openingStock: '',
  single: { sku: '', barcode: '' },
  deliveryZoneIds: [],
  chart: { own: false, mode: 'table', rows: BLANK_CHART, image: null },
};

/** A price as the seller typed it, Western digits, at most two decimals ("450", "99.5"). */
const PRICE = /^\d+(\.\d{1,2})?$/;

/** A stored price as a field shows it: "450.00" is 450, "99.50" is 99.5. */
export function priceText(price: string): string {
  return String(Number(price));
}

/** The form a saved product opens with. */
export function formOf(product: ProductDetail): ProductForm {
  const only = product.variantAttributes.length === 0 ? product.variants[0] : undefined;
  return {
    name: product.name,
    price: priceText(product.basePrice),
    description: product.description ?? '',
    categoryIds: product.categoryIds,
    primaryCategoryId: product.primaryCategoryId,
    active: product.active,
    imageIds: product.images.map((image) => image.id),
    videoId: product.video?.id ?? null,
    splits: splitsOf(product),
    variants: rowsOf(product),
    descriptions: product.attributes.map(descriptionOf),
    sharedStock: product.sharedStock,
    sharedOpeningStock: '',
    settings: settingsOf(product),
    openingStock: '',
    single: { sku: only?.sku ?? '', barcode: only?.barcode ?? '' },
    deliveryZoneIds: product.deliveryZoneIds,
    chart: chartOf(product.sizeChart),
  };
}

/** What the editor finds wrong before asking the server (PRD-01: a name and a price are all a product needs). */
export type FormProblem = 'required' | 'notAPrice';

export function problemsOf(form: ProductForm): Partial<Record<'name' | 'price', FormProblem>> {
  const problems: Partial<Record<'name' | 'price', FormProblem>> = {};
  if (form.name.trim() === '') problems.name = 'required';
  if (form.price.trim() === '') problems.price = 'required';
  else if (!PRICE.test(form.price.trim())) problems.price = 'notAPrice';
  return problems;
}

/** PRD-01, PRD-15: the product's own fields as the server takes them. A blank description is none. */
function fieldsOf(form: ProductForm) {
  return {
    name: form.name.trim(),
    basePrice: Number(form.price.trim()),
    description: form.description === '' ? null : form.description,
    categoryIds: form.categoryIds,
    primaryCategoryId: form.primaryCategoryId,
    active: form.active,
  };
}

const textOf = (typed: string): string | null => (typed.trim() === '' ? null : typed.trim());

/**
 * ATR-11: the options and variants as one save takes them; with no splitting attribute, the one default variant, with
 * its SKU and barcode. `opening` says whether a new product counts its stock, so its variants carry what is already on
 * the shelf (INV-03).
 */
function variantPartOf(form: ProductForm, opening: boolean) {
  if (form.splits.length === 0) {
    const shelf =
      opening && form.openingStock.trim() !== '' ? Number(form.openingStock.trim()) : null;
    return {
      variantAttributes: [],
      variants: [
        {
          optionIds: [],
          sku: textOf(form.single.sku),
          barcode: textOf(form.single.barcode),
          ...(shelf === null ? {} : { openingStock: shelf }),
        },
      ],
    };
  }
  return {
    variantAttributes: splitsBody(form.splits),
    variants: variantsBody(form.variants, { shared: form.sharedStock, opening }),
  };
}

/** Whether a new product's one variant says anything of its own. */
const singleSaysSomething = (form: ProductForm, opening: boolean): boolean =>
  form.single.sku.trim() !== '' ||
  form.single.barcode.trim() !== '' ||
  (opening && form.openingStock.trim() !== '');

/**
 * POST /products: a new product with its photos and video, its options and variants, its descriptions, its settings,
 * where it delivers and its size chart, in one request (agreed for Slice 11.7a, point 7; kept by 11.7b and 11.7c).
 */
export function createBody(form: ProductForm) {
  const opening = form.settings.stockTracking === StockTracking.Tracked;
  const shelf = form.sharedOpeningStock.trim();
  const shared = form.sharedStock && form.splits.length > 0;
  const chart = chartBody(form.chart);
  return {
    ...fieldsOf(form),
    ...settingsBody(form.settings),
    ...(form.imageIds.length > 0 ? { imageIds: form.imageIds } : {}),
    ...(form.videoId ? { videoId: form.videoId } : {}),
    ...(form.splits.length > 0 || singleSaysSomething(form, opening)
      ? variantPartOf(form, opening)
      : {}),
    ...(form.descriptions.length > 0 ? { attributes: descriptionsBody(form.descriptions) } : {}),
    ...(shared ? { sharedStock: true } : {}),
    ...(shared && opening && shelf !== '' ? { sharedOpeningStock: Number(shelf) } : {}),
    ...(form.deliveryZoneIds.length > 0 ? { deliveryZoneIds: form.deliveryZoneIds } : {}),
    ...(chart ? { sizeChart: chart } : {}),
  };
}

/**
 * One part of an edit, saved by its own request: the product's own fields and settings, its options and variants, its
 * descriptions, where it delivers, its size chart (null takes its own off), its photos, or its video.
 */
export type EditPart =
  | {
      part: 'fields';
      body: Partial<ReturnType<typeof fieldsOf>> & ReturnType<typeof changedSettings>;
    }
  | { part: 'variants'; body: ReturnType<typeof variantPartOf> & { sharedStock?: boolean } }
  | { part: 'attributes'; body: { attributes: ReturnType<typeof descriptionsBody> } }
  | { part: 'zones'; body: { zoneIds: string[] } }
  | { part: 'chart'; body: ReturnType<typeof chartBody> }
  | { part: 'images'; body: { mediaIds: string[] } }
  | { part: 'video'; body: { mediaId: string | null } };

const same = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((each, index) => each === b[index]);

/** What the variant table and sheet save of a row, to tell whether it changed. */
const rowText = (row: VariantRow): string =>
  JSON.stringify([
    keyOf(row.optionIds),
    row.price.trim(),
    row.sku.trim(),
    row.packAmount.trim(),
    row.barcode.trim(),
    row.weightKg.trim(),
    row.deliveryCharge.trim(),
    row.adjustByWeight,
    row.active,
  ]);

const splitText = (form: ProductForm): string =>
  form.splits
    .map((split) => `${split.attributeId}:${split.options.map((option) => option.id).join(',')}`)
    .join(';');

/**
 * Whether the options or variants changed: an attribute, an option or its order, a row's own settings, or the one
 * variant's SKU or barcode.
 */
function variantsChanged(saved: ProductForm, form: ProductForm): boolean {
  return (
    splitText(saved) !== splitText(form) ||
    saved.sharedStock !== form.sharedStock ||
    saved.variants.map(rowText).join(';') !== form.variants.map(rowText).join(';') ||
    (form.splits.length === 0 &&
      (saved.single.sku.trim() !== form.single.sku.trim() ||
        saved.single.barcode.trim() !== form.single.barcode.trim()))
  );
}

const descriptionsText = (form: ProductForm): string =>
  JSON.stringify(descriptionsBody(form.descriptions));

/**
 * Agreed for Slice 11.7a (point 7): an edit sends only what changed, part by part -- the product's own fields and
 * settings that changed (the categories with their primary together), the options and variants when any of them
 * changed, the descriptions when one changed (Slice 11.7b), where it delivers and its size chart (Slice 11.7c), the
 * photos when their list or order changed, the video when it changed.
 */
export function changedParts(saved: ProductForm, form: ProductForm): EditPart[] {
  const before = fieldsOf(saved);
  const after = fieldsOf(form);
  const fields: Partial<typeof after> & ReturnType<typeof changedSettings> = changedSettings(
    saved.settings,
    form.settings,
  );
  if (after.name !== before.name) fields.name = after.name;
  if (form.price.trim() !== saved.price.trim()) fields.basePrice = after.basePrice;
  if (after.description !== before.description) fields.description = after.description;
  if (
    !same([...after.categoryIds].sort(), [...before.categoryIds].sort()) ||
    after.primaryCategoryId !== before.primaryCategoryId
  ) {
    fields.categoryIds = after.categoryIds;
    fields.primaryCategoryId = after.primaryCategoryId;
  }
  if (after.active !== before.active) fields.active = after.active;
  const parts: EditPart[] = [];
  if (Object.keys(fields).length > 0) parts.push({ part: 'fields', body: fields });
  // Variants before descriptions: an attribute moving from one to the other leaves the first before joining the second.
  if (variantsChanged(saved, form)) {
    parts.push({
      part: 'variants',
      body: {
        ...variantPartOf(form, false),
        ...(form.sharedStock !== saved.sharedStock ? { sharedStock: form.sharedStock } : {}),
      },
    });
  }
  if (descriptionsText(saved) !== descriptionsText(form)) {
    parts.push({ part: 'attributes', body: { attributes: descriptionsBody(form.descriptions) } });
  }
  if (!same([...saved.deliveryZoneIds].sort(), [...form.deliveryZoneIds].sort())) {
    parts.push({ part: 'zones', body: { zoneIds: form.deliveryZoneIds } });
  }
  const chart = chartBody(form.chart);
  if (JSON.stringify(chartBody(saved.chart)) !== JSON.stringify(chart)) {
    parts.push({ part: 'chart', body: chart });
  }
  if (!same(form.imageIds, saved.imageIds))
    parts.push({ part: 'images', body: { mediaIds: form.imageIds } });
  if (form.videoId !== saved.videoId)
    parts.push({ part: 'video', body: { mediaId: form.videoId } });
  return parts;
}

/** Whether anything typed is not saved yet, so leaving asks first (Part 13's `sh-leave`). */
export function isDirty(saved: ProductForm, form: ProductForm): boolean {
  return changedParts(saved, form).length > 0;
}

/**
 * PRD-03, PRD-15 (the prototype's `sh-category`): ticking a category files the product there, the first one ticked being
 * primary; unticking the primary passes it to the next one still ticked.
 */
export function toggleCategory(
  form: Pick<ProductForm, 'categoryIds' | 'primaryCategoryId'>,
  id: string,
): Pick<ProductForm, 'categoryIds' | 'primaryCategoryId'> {
  if (!form.categoryIds.includes(id)) {
    return {
      categoryIds: [...form.categoryIds, id],
      primaryCategoryId: form.primaryCategoryId ?? id,
    };
  }
  const categoryIds = form.categoryIds.filter((each) => each !== id);
  return {
    categoryIds,
    primaryCategoryId:
      form.primaryCategoryId === id ? (categoryIds[0] ?? null) : form.primaryCategoryId,
  };
}

/** The rows with the ids of the variants the product now has, matched by their options. */
export function withIds(rows: readonly VariantRow[], product: ProductDetail | null): VariantRow[] {
  if (!product) return [...rows];
  const ids = new Map(product.variants.map((variant) => [keyOf(variant.optionIds), variant.id]));
  return rows.map((row) => ({ ...row, id: ids.get(keyOf(row.optionIds)) ?? row.id }));
}

/**
 * What is saved after an edit whose `parts` went through: those parts as typed, the rest as they were. Variants this
 * edit made take their ids from `product`, the product as the save left it.
 */
export function withSaved(
  saved: ProductForm,
  form: ProductForm,
  parts: readonly EditPart['part'][],
  product: ProductDetail | null = null,
): ProductForm {
  const next = { ...saved };
  if (parts.includes('fields')) {
    next.name = form.name;
    next.price = form.price;
    next.description = form.description;
    next.categoryIds = form.categoryIds;
    next.primaryCategoryId = form.primaryCategoryId;
    next.active = form.active;
    next.settings = form.settings;
  }
  if (parts.includes('variants')) {
    next.splits = form.splits;
    next.sharedStock = form.sharedStock;
    next.variants = withIds(form.variants, product);
    next.single = form.single;
  }
  if (parts.includes('attributes')) next.descriptions = form.descriptions;
  if (parts.includes('zones')) next.deliveryZoneIds = form.deliveryZoneIds;
  if (parts.includes('chart')) next.chart = form.chart;
  if (parts.includes('images')) next.imageIds = form.imageIds;
  if (parts.includes('video')) next.videoId = form.videoId;
  return next;
}
