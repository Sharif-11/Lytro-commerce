import { SETUP_FIRST_GROUP, setupDoneOf } from '@lytronix/validators';
import type { HomeView } from '@/types/home';

export type Checklist = NonNullable<HomeView['checklist']>;

/** The first group's items (SUP-01): the shop, its delivery, a product, the link shared, the logo, a wallet number. */
export const FIRST_GROUP = SETUP_FIRST_GROUP;

/** SUP-01: one rule with the server, which folds Home's tutorial videos with the card (§7.49a). */
export function doneOf(checklist: Checklist): number {
  return setupDoneOf(checklist);
}
