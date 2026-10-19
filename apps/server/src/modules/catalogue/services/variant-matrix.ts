// ATR-04, ATR-06, ATR-11, ATR-14, ATL-04: turning a product's variant-defining attributes and the variants asked
// for into the exact set of combinations to store. Pure: the service checks every id exists and belongs to the
// shop before calling, and turns the problems found here into field errors.

export interface MatrixAttribute {
  attributeId: string;
  optionIds: string[];
}

export interface OptionPair {
  attributeId: string;
  optionId: string;
}

export interface PlannedVariant<S> {
  key: string;
  pairs: OptionPair[];
  /** The request's own entry for this combination, or null when every combination was asked for. */
  spec: S | null;
}

export type MatrixProblem =
  | { field: string; kind: 'option_not_listed' }
  | { field: string; kind: 'attribute_twice' }
  | { field: string; kind: 'combination_repeated' }
  | { field: string; kind: 'too_many'; max: number };

/**
 * ATL-04: a variant's combination key: its "attributeId=optionId" pairs sorted by attribute and joined by "&".
 * The key of a product's one default variant, which has no options, is ''.
 */
/** The option ids a combination key names, in the key's own order; none for a product's one default variant. */
export function optionIdsOfKey(key: string): string[] {
  if (key === '') return [];
  return key.split('&').map((pair) => pair.slice(pair.indexOf('=') + 1));
}

export function combinationKey(pairs: readonly OptionPair[]): string {
  return [...pairs]
    .sort((a, b) => (a.attributeId < b.attributeId ? -1 : a.attributeId > b.attributeId ? 1 : 0))
    .map((pair) => `${pair.attributeId}=${pair.optionId}`)
    .join('&');
}

/** Every combination of the attributes' options, in the order the options are listed. */
function everyCombination(attributes: readonly MatrixAttribute[]): OptionPair[][] {
  let combinations: OptionPair[][] = [[]];
  for (const attribute of attributes) {
    const next: OptionPair[][] = [];
    for (const partial of combinations) {
      for (const optionId of attribute.optionIds) {
        next.push([...partial, { attributeId: attribute.attributeId, optionId }]);
      }
    }
    combinations = next;
  }
  return combinations;
}

/**
 * Plans a product's variants. With no variant-defining attributes, one default variant (ATR-04). With some and no
 * list of variants, one variant per combination of the listed options; with a list, exactly those, each naming
 * one listed option of each attribute. A combination asked for twice (ATR-06) or more than `max` in all (ATR-14)
 * is a problem, never silently dropped.
 */
export function planVariants<S extends { optionIds: string[] }>(
  attributes: readonly MatrixAttribute[],
  optionAttribute: ReadonlyMap<string, string>,
  variants: readonly S[] | undefined,
  max: number,
): { planned: PlannedVariant<S>[]; problems: MatrixProblem[] } {
  const problems: MatrixProblem[] = [];

  if (attributes.length === 0) {
    variants?.forEach((_, index) => {
      if (index > 0)
        problems.push({
          field: `variants.${String(index)}.optionIds`,
          kind: 'combination_repeated',
        });
    });
    return { planned: [{ key: '', pairs: [], spec: variants?.[0] ?? null }], problems };
  }

  if (variants === undefined) {
    const combinations = everyCombination(attributes);
    if (combinations.length > max) {
      return { planned: [], problems: [{ field: 'variants', kind: 'too_many', max }] };
    }
    return {
      planned: combinations.map((pairs) => ({ key: combinationKey(pairs), pairs, spec: null })),
      problems,
    };
  }

  const listed = new Map(
    attributes.map((attribute) => [attribute.attributeId, new Set(attribute.optionIds)]),
  );
  const planned: PlannedVariant<S>[] = [];
  const seen = new Set<string>();
  for (const [index, variant] of variants.entries()) {
    const pairs: OptionPair[] = [];
    const covered = new Set<string>();
    const before = problems.length;
    for (const [position, optionId] of variant.optionIds.entries()) {
      const field = `variants.${String(index)}.optionIds.${String(position)}`;
      const attributeId = optionAttribute.get(optionId);
      if (attributeId === undefined || listed.get(attributeId)?.has(optionId) !== true) {
        problems.push({ field, kind: 'option_not_listed' });
      } else if (covered.has(attributeId)) {
        problems.push({ field, kind: 'attribute_twice' });
      } else {
        covered.add(attributeId);
        pairs.push({ attributeId, optionId });
      }
    }
    if (problems.length > before) continue;
    const key = combinationKey(pairs);
    if (seen.has(key)) {
      problems.push({ field: `variants.${String(index)}.optionIds`, kind: 'combination_repeated' });
      continue;
    }
    seen.add(key);
    planned.push({ key, pairs, spec: variant });
  }
  if (planned.length > max) problems.push({ field: 'variants', kind: 'too_many', max });
  return { planned, problems };
}
