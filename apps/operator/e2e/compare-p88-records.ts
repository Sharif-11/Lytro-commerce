import type { Page } from '@playwright/test';
import type { ConsoleState } from './support/mock-api';
import {
  alertedMediaCosts,
  NADIA_ID,
  noEmailMediaCosts,
  offMediaCosts,
} from './support/p88-records-mock';

// OPERATOR-CONSOLE-DESIGN v7 (Phase 8 Slice 8.8): the Records pages and Today's figures, each beside the sketch's drawing,
// in compare.spec's Pair shape.

interface Pair {
  screen: string;
  bare?: boolean;
  path: string;
  state?: ConsoleState;
  then?: (page: Page) => Promise<void>;
  only?: ('phone' | 'tablet' | 'desktop')[];
}

/** Opens the newest entry of the audit log in its panel. */
async function firstEntry(page: Page): Promise<void> {
  await page
    .getByRole('main')
    .getByRole('button', { name: /^(Plan extended|মেয়াদ বাড়ানো)$/ })
    .first()
    .click();
}

export const P88_RECORDS_PAIRS: Pair[] = [
  { screen: 'p88-reports', path: '/reports' },
  { screen: 'p88-reports-year', path: '/reports?preset=thisYear' },
  { screen: 'p88-reports-shops', path: '/reports?view=shops' },
  { screen: 'p88-reports-consumers', path: '/reports?view=consumers' },
  { screen: 'p88-audit', path: '/audit' },
  { screen: 'p88-audit-shop', path: '/audit?tenantId=ten-0001' },
  { screen: 'p88-audit-who', path: `/audit?actorId=${NADIA_ID}` },
  { screen: 'p88-audit-entry', path: '/audit', then: firstEntry },
  { screen: 'p88-media', path: '/media-costs' },
  { screen: 'p88-media-alert', path: '/media-costs', state: { mediaCosts: alertedMediaCosts() } },
  {
    screen: 'p88-media-noemail',
    path: '/media-costs',
    state: { mediaCosts: noEmailMediaCosts() },
  },
  { screen: 'p88-media-off', path: '/media-costs', state: { mediaCosts: offMediaCosts() } },
  { screen: 'p88-today', path: '/' },
];
