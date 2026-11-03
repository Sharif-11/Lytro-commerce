import { AttributeDataType } from '@lytronix/validators/enums';
import type {
  AskedDetail,
  ModifierChoice,
  ModifierGroup,
  PublicCombo,
} from '../api/storefront-api';
import type { CartAddOn, CartAnswer, CartComboPick } from '../cart/cart-store';

// MNU-01, CMB-09, ATR-08 (Slice 4.8e): what a shopper picks besides the variant -- add-ons, a combo's choices, the answers
// to what the shop asks -- and what the cart keeps of them. The server checks and prices them again when the order is
// placed (MNU-02, CMB-03); this only keeps the page honest until then.

/** The options picked in each add-on group, by the group's id. */
export type AddOnPicks = Readonly<Record<string, readonly string[]>>;
/** A combo's choices, by the part's position: one variant for each of the part's units in one combo. */
export type ComboPicks = Readonly<Record<number, readonly string[]>>;
/** What was typed for each thing asked, by its attribute. */
export type Answers = Readonly<Record<string, string>>;

/** The add-ons a page opens with: each group's defaults, as an order naming nothing would take. */
export function openingAddOns(groups: readonly ModifierGroup[]): AddOnPicks {
  return Object.fromEntries(
    groups.map((group) => [
      group.id,
      group.options.filter((option) => option.isDefault).map((option) => option.id),
    ]),
  );
}

/** One tap on an option. A group of one swaps, or clears when it may be empty; any other stops at its most. */
export function toggleAddOn(picks: AddOnPicks, group: ModifierGroup, optionId: string): AddOnPicks {
  const held = picks[group.id] ?? [];
  const on = held.includes(optionId);
  let next: readonly string[];
  if (group.maxSelect === 1) {
    next = on ? (group.minSelect === 0 ? [] : held) : [optionId];
  } else if (on) {
    next = held.filter((id) => id !== optionId);
  } else {
    next = held.length >= group.maxSelect ? held : [...held, optionId];
  }
  return { ...picks, [group.id]: next };
}

/** The groups still short of their least. */
export function addOnsShort(groups: readonly ModifierGroup[], picks: AddOnPicks): string[] {
  return groups
    .filter((group) => (picks[group.id] ?? []).length < group.minSelect)
    .map((group) => group.id);
}

/** The options picked, in the shop's order, as a line shows them. */
export function pickedAddOns(groups: readonly ModifierGroup[], picks: AddOnPicks): CartAddOn[] {
  return groups.flatMap((group) =>
    group.options
      .filter((option) => (picks[group.id] ?? []).includes(option.id))
      .map((option) => ({ name: option.name, priceChange: option.priceChange })),
  );
}

/** What the picked add-ons add to one unit. */
export function addOnsPrice(groups: readonly ModifierGroup[], picks: AddOnPicks): number {
  return pickedAddOns(groups, picks).reduce((sum, row) => sum + Number(row.priceChange), 0);
}

/** MNU-02: every group named, so one left empty stays empty rather than taking its defaults. */
export function modifierChoicesOf(
  groups: readonly ModifierGroup[],
  picks: AddOnPicks,
): ModifierChoice[] {
  return groups.map((group) => ({ groupId: group.id, optionIds: [...(picks[group.id] ?? [])] }));
}

function unitsOf(quantity: string): number {
  return Math.max(1, Math.round(Number(quantity)));
}

/** The picks a combo opens with: for each unit of a choice part, the first variant that can be had. */
export function openingComboPicks(combo: PublicCombo | null): ComboPicks {
  if (combo === null) return {};
  return Object.fromEntries(
    combo.parts
      .filter((part) => part.choice)
      .map((part) => {
        const first = part.variants.find((variant) => variant.available);
        return [part.position, Array<string>(unitsOf(part.quantity)).fill(first?.variantId ?? '')];
      }),
  );
}

/** CMB-08: whether every part can be had, a choice part by at least one of its variants. */
export function comboCanBeMade(combo: PublicCombo | null): boolean {
  if (combo === null) return true;
  return combo.parts.every((part) => part.variants.some((variant) => variant.available));
}

/** One unit's pick in a part. */
export function pickComboUnit(
  picks: ComboPicks,
  position: number,
  unit: number,
  variantId: string,
): ComboPicks {
  const held = [...(picks[position] ?? [])];
  held[unit] = variantId;
  return { ...picks, [position]: held };
}

/** CMB-03: the choices an order names, a choice part at a time; a fixed part needs none. */
export function comboChoicesOf(picks: ComboPicks): CartComboPick[] {
  return Object.entries(picks)
    .map(([position, variantIds]) => ({ part: Number(position), variantIds: [...variantIds] }))
    .sort((a, b) => a.part - b.part);
}

/** What a variant in a part is called: its product's name when the part mixes products, then its label. */
function partVariantName(
  part: PublicCombo['parts'][number],
  variant: PublicCombo['parts'][number]['variants'][number],
): string {
  return `${variant.productName} ${variant.label}`.trim() || part.productName;
}

/** The parts as a line says them (`Panjabi L, Check lungi`): each choice as picked, each fixed part as it comes. */
export function comboPartsText(combo: PublicCombo | null, picks: ComboPicks): string {
  if (combo === null) return '';
  return combo.parts
    .flatMap((part) => {
      if (part.choice) {
        return (picks[part.position] ?? []).map((id) => {
          const variant = part.variants.find((each) => each.variantId === id);
          return variant ? partVariantName(part, variant) : part.productName;
        });
      }
      const [only] = part.variants;
      const name = only ? partVariantName(part, only) : part.productName;
      const units = Number(part.quantity);
      return [units === 1 ? name : `${name} × ${String(units)}`];
    })
    .join(', ');
}

const isNumberAsked = (each: AskedDetail) => each.dataType === AttributeDataType.NumberWithUnit;

/** Each answer is optional; a number asked holds a number once anything is typed. */
export function answerFits(each: AskedDetail, answers: Answers): boolean {
  const typed = (answers[each.attributeId] ?? '').trim();
  return !isNumberAsked(each) || typed === '' || Number.isFinite(Number(typed));
}

/** Whether this thing asked takes a number. */
export function asksNumber(each: AskedDetail): boolean {
  return isNumberAsked(each);
}

/** The answers given, as a line keeps them. */
export function answersOf(asked: readonly AskedDetail[], answers: Answers): CartAnswer[] {
  return asked.flatMap((each) => {
    const value = (answers[each.attributeId] ?? '').trim();
    return value === '' ? [] : [{ attributeId: each.attributeId, name: each.name, value }];
  });
}
