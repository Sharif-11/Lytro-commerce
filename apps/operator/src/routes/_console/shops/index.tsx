import { createFileRoute } from '@tanstack/react-router';
import { TenantSort, TenantState } from '@lytronix/validators';
import { Shops } from '@/views/shops';

const STATES = Object.values(TenantState);
const SORTS = Object.values(TenantSort);

/** The enum value a search param names, if it names one. */
function oneOf<T extends string>(values: readonly T[], given: unknown): T | undefined {
  return values.find((value) => {
    const word: string = value;
    return word === given;
  });
}

export interface ShopsSearch {
  q?: string;
  state?: TenantState;
  planId?: string;
  sort?: TenantSort;
}

export const Route = createFileRoute('/_console/shops/')({
  // What the top bar's search was sent with (OPERATOR-CONSOLE-DESIGN rule 7), and the list's filters and order (v7), so a
  // filtered list can be shared as its address.
  validateSearch: (search: Record<string, unknown>): ShopsSearch => ({
    // A phone's digits arrive as a number from the address bar (D8-24).
    ...(typeof search.q === 'string' || typeof search.q === 'number'
      ? { q: String(search.q) }
      : {}),
    ...(oneOf(STATES, search.state) ? { state: oneOf(STATES, search.state) } : {}),
    ...(typeof search.planId === 'string' ? { planId: search.planId } : {}),
    ...(oneOf(SORTS, search.sort) ? { sort: oneOf(SORTS, search.sort) } : {}),
  }),
  component: Shops,
});
