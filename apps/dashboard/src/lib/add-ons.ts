import type { ProductDetail } from '@/types/product';

// Add-on groups on the product editor (TENANT-DASHBOARD-DESIGN §7.33, MNU-01; agreed in the 4.8c read): the plain rules
// a seller picks from, and the numbers the server keeps.

/** One extra as typed: its name, what it adds (a minus takes off), and whether it starts picked. */
export interface AddOnOption {
  name: string;
  priceChange: string;
  isDefault: boolean;
}

/** One group as the form holds it. */
export interface AddOnGroup {
  name: string;
  minSelect: number;
  maxSelect: number;
  options: AddOnOption[];
}

/** How many the customer picks, in plain words; Custom shows the numbers. */
export type AddOnRule = 'any' | 'one' | 'required' | 'custom';

/** The rule a group's numbers say. One option's "any number" and "at most 1" are the same, and read as the second. */
export function ruleOf(group: Pick<AddOnGroup, 'minSelect' | 'maxSelect' | 'options'>): AddOnRule {
  if (group.minSelect === 0 && group.maxSelect === 1) return 'one';
  if (group.minSelect === 1 && group.maxSelect === 1) return 'required';
  if (group.minSelect === 0 && group.maxSelect === group.options.length) return 'any';
  return 'custom';
}

/**
 * The numbers a rule means. "Any number" is every option, the most the server takes; so it follows the options as they
 * come and go.
 */
export function rulesFor(
  rule: AddOnRule,
  optionCount: number,
  least: string,
  most: string,
): { minSelect: number; maxSelect: number } {
  if (rule === 'any') return { minSelect: 0, maxSelect: Math.max(optionCount, 1) };
  if (rule === 'one') return { minSelect: 0, maxSelect: 1 };
  if (rule === 'required') return { minSelect: 1, maxSelect: 1 };
  return { minSelect: Number(least), maxSelect: Number(most) };
}

/** A price change as the server takes it; a typed "−20" is a minus too. */
export const priceChangeOf = (typed: string): number => {
  const value = typed.trim().replace('−', '-');
  return value === '' ? 0 : Number(value);
};

const TWO_DECIMALS = /^-?\d+(\.\d{1,2})?$/;

/**
 * What stops a group being saved, if anything, as the server would refuse it (MNU-01): a name, and an option with a
 * name and a price change; the numbers possible with these options; no more defaults than may be picked.
 */
export function groupProblem(group: AddOnGroup): 'name' | 'options' | 'rule' | 'defaults' | null {
  if (group.name === '') return 'name';
  const priced = group.options.every((each) => {
    const value = each.priceChange.trim().replace('−', '-');
    return value === '' || TWO_DECIMALS.test(value);
  });
  if (group.options.length === 0 || group.options.some((each) => each.name === '') || !priced) {
    return 'options';
  }
  const { minSelect: least, maxSelect: most } = group;
  if (!Number.isInteger(least) || !Number.isInteger(most)) return 'rule';
  if (least < 0 || most < 1 || least > most || most > group.options.length) return 'rule';
  if (group.options.filter((each) => each.isDefault).length > most) return 'defaults';
  return null;
}

/** The form's groups from a saved product. */
export function groupsOf(product: Pick<ProductDetail, 'modifierGroups'>): AddOnGroup[] {
  return product.modifierGroups.map((group) => ({
    name: group.name,
    minSelect: group.minSelect,
    maxSelect: group.maxSelect,
    options: group.options.map((option) => ({
      name: option.name,
      priceChange: String(Number(option.priceChange)),
      isDefault: option.isDefault,
    })),
  }));
}

/** The groups as a save sends them, the whole list. */
export function groupsBody(groups: readonly AddOnGroup[]) {
  return groups.map((group) => ({
    name: group.name,
    minSelect: group.minSelect,
    maxSelect: group.maxSelect,
    options: group.options.map((option) => ({
      name: option.name,
      priceChange: priceChangeOf(option.priceChange),
      isDefault: option.isDefault,
    })),
  }));
}
