import { AttributeDataType, MAX_VARIANT_ATTRIBUTES } from '@lytronix/validators';
import type { ProductDetail, UsedOption } from '@/types/product';
import { keyOf, reconcile, type SplitAttribute, type VariantRow } from './variant-matrix';

/**
 * ATR-19 (PHOTO-DESIGNS-PLAN PD-2, PD-14): one design as the editor holds it. Its key names it in a save: its id once
 * saved; a new one's is made up, shaped like an id, so a new product's variants can name it in the same request.
 */
export interface FormDesign {
  key: string;
  /** Its id once saved; null for one this edit makes. */
  id: string | null;
  /** A saved one's number (PD-14); null for a new one, which takes the product's next. */
  number: number | null;
  /** Its name as stored or typed; empty for one the seller hasn't named, which is "ডিজাইন n". */
  name: string;
}

/** The photos in order, the design each shows (by key, null for a plain photo), and the designs in number order. */
export interface DesignState {
  imageIds: string[];
  photoDesigns: Record<string, string | null>;
  designs: FormDesign[];
}

/** What a photo is (TENANT-DASHBOARD-DESIGN §7.42's `pd-photo`): its own design, another angle of one, or plain. */
export type PhotoChoice = { kind: 'own' } | { kind: 'same'; key: string } | { kind: 'not' };

export const newDesignKey = (): string => globalThis.crypto.randomUUID();

/** A saved product's photos and designs; a design's key is its id. */
export function designStateOf(product: ProductDetail): DesignState {
  return {
    imageIds: product.images.map((image) => image.id),
    photoDesigns: Object.fromEntries(product.images.map((image) => [image.id, image.designId])),
    designs: product.designs.map((design) => ({
      key: design.id,
      id: design.id,
      number: design.number,
      name: design.name,
    })),
  };
}

/**
 * The design split of a saved product, named in the shop's own word: the server names the platform's attribute in English
 * ("Design"). It is the split whose options are the product's designs.
 */
export function withDesignWord<T extends DesignState & { splits: SplitAttribute[] }>(
  form: T,
  word: string,
): T {
  const keys = new Set(form.designs.map((design) => design.key));
  if (keys.size === 0) return form;
  return {
    ...form,
    splits: form.splits.map((split) =>
      split.options.length > 0 && split.options.every((option) => keys.has(option.id))
        ? { ...split, name: word }
        : split,
    ),
  };
}

/** A design's photos, in the order shown; the first is its cover. */
export const photosOf = (state: DesignState, key: string): string[] =>
  state.imageIds.filter((id) => state.photoDesigns[id] === key);

/** A design no photo shows any more goes (a saved one is retired by the save, PD-16). */
function pruned(state: DesignState): DesignState {
  const shown = new Set(Object.values(state.photoDesigns));
  return { ...state, designs: state.designs.filter((design) => shown.has(design.key)) };
}

/** PD-3: photos added in turn, each a new design of its own, or each plain. */
export function withPhotos(
  state: DesignState,
  mediaIds: readonly string[],
  asDesigns: boolean,
): DesignState {
  const photoDesigns = { ...state.photoDesigns };
  const designs = [...state.designs];
  for (const id of mediaIds) {
    if (asDesigns) {
      const key = newDesignKey();
      designs.push({ key, id: null, number: null, name: '' });
      photoDesigns[id] = key;
    } else photoDesigns[id] = null;
  }
  return { imageIds: [...state.imageIds, ...mediaIds], photoDesigns, designs };
}

/** A photo off the product; a design left with no photo goes with it. */
export function withoutPhoto(state: DesignState, mediaId: string): DesignState {
  const photoDesigns = Object.fromEntries(
    Object.entries(state.photoDesigns).filter(([id]) => id !== mediaId),
  );
  return pruned({
    ...state,
    imageIds: state.imageIds.filter((id) => id !== mediaId),
    photoDesigns,
  });
}

/** PD-2, PD-3: a photo made its own design, another angle of a design, or a plain photo. */
export function withChoice(state: DesignState, mediaId: string, choice: PhotoChoice): DesignState {
  const current = state.photoDesigns[mediaId] ?? null;
  if (choice.kind === 'own') {
    // Already a design on its own: nothing changes.
    if (current !== null && photosOf(state, current).length === 1) return state;
    const key = newDesignKey();
    return pruned({
      ...state,
      photoDesigns: { ...state.photoDesigns, [mediaId]: key },
      designs: [...state.designs, { key, id: null, number: null, name: '' }],
    });
  }
  const next = choice.kind === 'same' ? choice.key : null;
  return pruned({ ...state, photoDesigns: { ...state.photoDesigns, [mediaId]: next } });
}

export function withName(state: DesignState, key: string, name: string): DesignState {
  return {
    ...state,
    designs: state.designs.map((design) => (design.key === key ? { ...design, name } : design)),
  };
}

/**
 * PD-14: each design's name as the seller sees it: a saved one's, a typed one, or "ডিজাইন n" for a new one, n being the
 * number the server will give it (new designs take the product's next numbers, in order).
 */
export function designLabels(
  designs: readonly FormDesign[],
  nextNumber: number,
  word: string,
): Map<string, string> {
  const labels = new Map<string, string>();
  let n = nextNumber;
  for (const design of designs) {
    const number = design.number ?? n;
    if (design.number === null) n += 1;
    labels.set(design.key, design.name.trim() || `${word} ${String(number)}`);
  }
  return labels;
}

/** Whether a product may gain designs (PD-11, ATR-15): never a combo, and not once an order names it without designs. */
export function mayHaveDesigns(o: {
  combo: boolean;
  hasOrders: boolean;
  designs: number;
  splits: readonly SplitAttribute[];
  designAttributeId: string | null;
}): boolean {
  if (o.combo || o.designAttributeId === null) return false;
  if (o.designs > 0) return true;
  if (o.hasOrders) return false;
  // ATR-14: the design split would be a 4th.
  return (
    o.splits.filter((split) => split.attributeId !== o.designAttributeId).length <
    MAX_VARIANT_ATTRIBUTES
  );
}

/** The design split as the variants card shows it: the designs as its options, by their keys and names. */
export function designSplit(
  state: DesignState,
  labels: ReadonlyMap<string, string>,
  attributeId: string,
  name: string,
): SplitAttribute {
  return {
    attributeId,
    name,
    dataType: AttributeDataType.EnumSingle,
    unitKind: null,
    options: state.designs.map((design): UsedOption => ({
      id: design.key,
      value: labels.get(design.key) ?? design.name,
      swatchColor: null,
      swatchImage: null,
    })),
  };
}

/**
 * The splits and rows once the designs change: the design split first (where it already is, if it was), gone with the
 * last design (PD-1). Rows keep what was typed in them, by their options.
 */
export function withDesignSplit(
  splits: readonly SplitAttribute[],
  rows: readonly VariantRow[],
  saved: readonly VariantRow[],
  attributeId: string,
  split: SplitAttribute | null,
): { splits: SplitAttribute[]; variants: VariantRow[] } {
  const at = splits.findIndex((each) => each.attributeId === attributeId);
  let next: SplitAttribute[];
  if (split === null || split.options.length === 0) {
    next = splits.filter((each) => each.attributeId !== attributeId);
  } else if (at >= 0) {
    next = splits.map((each, index) => (index === at ? split : each));
  } else next = [split, ...splits];
  // Nothing about the options moved: the rows stay as they are (their order included).
  const optionsOf = (list: readonly SplitAttribute[]): string =>
    list
      .map((each) => `${each.attributeId}:${keyOf(each.options.map((option) => option.id))}`)
      .join(';');
  const same = optionsOf(next) === optionsOf(splits);
  if (same) return { splits: next, variants: [...rows] };
  return { splits: next, variants: next.length === 0 ? [] : reconcile(next, rows, saved) };
}

/** PUT /products/:id/images, and a new product's photos: each photo with its design, each design with its name. */
export function imagesBody(state: DesignState, labels: ReadonlyMap<string, string>) {
  return {
    photos: state.imageIds.map((mediaId) => ({
      mediaId,
      design: state.photoDesigns[mediaId] ?? null,
    })),
    designs: state.designs.map((design) => ({
      key: design.key,
      ...(design.id === null ? {} : { id: design.id }),
      name: labels.get(design.key) ?? design.name,
    })),
  };
}

/** After a photos save: each new design's id, found by one of its photos in the product the save answered. */
export function savedDesignIds(state: DesignState, product: ProductDetail): Map<string, string> {
  const ids = new Map<string, string>();
  for (const design of state.designs) {
    if (design.id !== null) continue;
    const photo = photosOf(state, design.key)[0];
    const found = product.images.find((image) => image.id === photo)?.designId;
    if (found) ids.set(design.key, found);
  }
  return ids;
}

/** A group of a product's variants under one design, or of those without one (`design` null). */
export interface DesignGroup<T> {
  design: { id: string; name: string; image: string | null } | null;
  variants: T[];
}

/**
 * ATR-20 (PD-22, Part 40's `pd-add-variant`): a product's variants grouped by design, each group with its design's name
 * and cover, in the order the variants come; variants without a design come as one group of their own.
 */
export function byDesign<
  T extends { design: { id: string; name: string } | null; image: string | null },
>(variants: readonly T[]): DesignGroup<T>[] {
  const groups: DesignGroup<T>[] = [];
  for (const variant of variants) {
    const id = variant.design?.id ?? null;
    const found = groups.find((group) => (group.design?.id ?? null) === id);
    if (found) found.variants.push(variant);
    else
      groups.push({
        design: variant.design ? { ...variant.design, image: variant.image } : null,
        variants: [variant],
      });
  }
  return groups;
}

/** Option ids with each new design's key swapped for its id. */
export const withIdsFor = (optionIds: readonly string[], ids: ReadonlyMap<string, string>) =>
  optionIds.map((id) => ids.get(id) ?? id);
