// TEN-26, TEN-31: the top-level paths on the dashboard host (app.lytro.app) that are pages, not shops. The dashboard
// reads a shop's slug from any other first path segment, so none of these may ever be a shop's slug: each is a
// reserved slug (migration 0050), and a server test fails if the dashboard gains a top-level page not listed here.
export const DASHBOARD_PATHS = [
  'api',
  'auth',
  'checkout',
  'create-shop',
  'forgot-password',
  'set-password',
  'set-up',
  'shops',
  'sign-in',
  'sign-up',
  'staff-set-password',
  'staff-sign-in',
  'unavailable',
  'verify-code',
] as const;

export type DashboardPath = (typeof DASHBOARD_PATHS)[number];
