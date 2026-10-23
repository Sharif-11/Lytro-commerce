import type { HomeView } from '@/types/home';

export type Checklist = NonNullable<HomeView['checklist']>;

/** The first group's items (SUP-01): the shop, its delivery, a product, the link shared, the logo. The wallet number
    comes with Phase 5 and does not count until then. */
export const FIRST_GROUP = 5;

export function doneOf(checklist: Checklist): number {
  return [true, true, checklist.firstProduct, checklist.linkShared, checklist.logo].filter(Boolean)
    .length;
}
