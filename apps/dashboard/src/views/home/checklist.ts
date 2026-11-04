import type { HomeView } from '@/types/home';

export type Checklist = NonNullable<HomeView['checklist']>;

/** The first group's items (SUP-01): the shop, its delivery, a product, the link shared, the logo, a wallet number. */
export const FIRST_GROUP = 6;

export function doneOf(checklist: Checklist): number {
  return [
    true,
    true,
    checklist.firstProduct,
    checklist.linkShared,
    checklist.logo,
    checklist.wallet,
  ].filter(Boolean).length;
}
