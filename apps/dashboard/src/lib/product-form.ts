import type { ProductDetail } from '@/types/product';
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

/**
 * What the product editor holds while it is typed (TENANT-DASHBOARD-DESIGN §7.4): Basics -- the photos in order and
 * the one video, the name, the price as typed, the categories with the primary one, the description -- whether it is on
 * sale (Slice 11.7a), and its options and variants (Slice 11.7b): the attributes that split it, a row per variant, the
 * attributes that describe it or are asked when ordering, and whether its variants share one stock.
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
}

/** A new product: nothing typed, on sale once saved, one default variant. */
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
};

/** A price as the seller typed it, Western digits, at most two decimals ("450", "99.5"). */
const PRICE = /^\d+(\.\d{1,2})?$/;

/** A stored price as a field shows it: "450.00" is 450, "99.50" is 99.5. */
export function priceText(price: string): string {
  return String(Number(price));
}

/** The form a saved product opens with. */
export function formOf(product: ProductDetail): ProductForm {
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

/**
 * ATR-11: the options and variants as one save takes them; with no splitting attribute, the one default variant.
 * `opening` says whether a new product counts its stock, so its variants carry what is already on the shelf (INV-03).
 */
function variantPartOf(form: ProductForm, opening: boolean) {
  if (form.splits.length === 0) return { variantAttributes: [] };
  return {
    variantAttributes: splitsBody(form.splits),
    variants: variantsBody(form.variants, { shared: form.sharedStock, opening }),
  };
}

/**
 * POST /products: a new product with its photos and video, its options and variants and its descriptions, in one
 * request (agreed for Slice 11.7a, point 7; Slice 11.7b keeps it one).
 */
export function createBody(form: ProductForm, options: { opening: boolean } = { opening: true }) {
  const opening = form.sharedOpeningStock.trim();
  const shared = form.sharedStock && form.splits.length > 0;
  return {
    ...fieldsOf(form),
    ...(form.imageIds.length > 0 ? { imageIds: form.imageIds } : {}),
    ...(form.videoId ? { videoId: form.videoId } : {}),
    ...(form.splits.length > 0 ? variantPartOf(form, options.opening) : {}),
    ...(form.descriptions.length > 0 ? { attributes: descriptionsBody(form.descriptions) } : {}),
    ...(shared ? { sharedStock: true } : {}),
    ...(shared && options.opening && opening !== '' ? { sharedOpeningStock: Number(opening) } : {}),
  };
}

/**
 * One part of an edit, saved by its own request: the product's own fields, its options and variants, its descriptions,
 * its photos, or its video.
 */
export type EditPart =
  | { part: 'fields'; body: Partial<ReturnType<typeof fieldsOf>> }
  | { part: 'variants'; body: ReturnType<typeof variantPartOf> & { sharedStock?: boolean } }
  | { part: 'attributes'; body: { attributes: ReturnType<typeof descriptionsBody> } }
  | { part: 'images'; body: { mediaIds: string[] } }
  | { part: 'video'; body: { mediaId: string | null } };

const same = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((each, index) => each === b[index]);

/** What the variant table saves of a row, to tell whether it changed. */
const rowText = (row: VariantRow): string =>
  [keyOf(row.optionIds), row.price.trim(), row.sku.trim(), row.packAmount.trim()].join('|');

const splitText = (form: ProductForm): string =>
  form.splits
    .map((split) => `${split.attributeId}:${split.options.map((option) => option.id).join(',')}`)
    .join(';');

/** Whether the options or variants changed: an attribute, an option or its order, a row's price, SKU or pack. */
function variantsChanged(saved: ProductForm, form: ProductForm): boolean {
  return (
    splitText(saved) !== splitText(form) ||
    saved.sharedStock !== form.sharedStock ||
    saved.variants.map(rowText).join(';') !== form.variants.map(rowText).join(';')
  );
}

const descriptionsText = (form: ProductForm): string =>
  JSON.stringify(descriptionsBody(form.descriptions));

/**
 * Agreed for Slice 11.7a (point 7): an edit sends only what changed, part by part -- the product's own fields that
 * changed (the categories with their primary together), the options and variants when any of them changed, the
 * descriptions when one changed (Slice 11.7b), the photos when their list or order changed, the video when it changed.
 */
export function changedParts(saved: ProductForm, form: ProductForm): EditPart[] {
  const before = fieldsOf(saved);
  const after = fieldsOf(form);
  const fields: Partial<typeof after> = {};
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
  }
  if (parts.includes('variants')) {
    next.splits = form.splits;
    next.sharedStock = form.sharedStock;
    next.variants = withIds(form.variants, product);
  }
  if (parts.includes('attributes')) next.descriptions = form.descriptions;
  if (parts.includes('images')) next.imageIds = form.imageIds;
  if (parts.includes('video')) next.videoId = form.videoId;
  return next;
}
