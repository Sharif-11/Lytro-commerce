import { DASHBOARD_PATHS } from '@lytronix/validators';

/**
 * TEN-31: the shop a dashboard page belongs to -- the first segment of app.lytro.app/<shop>/..., unless that segment
 * is one of the dashboard's own pages (sign-in, checkout, ...), which are never a shop's slug (TEN-26).
 */
export function shopOfPath(pathname: string): string | null {
  const first = pathname.split('/').find((segment) => segment !== '') ?? null;
  if (first === null) return null;
  const pages: readonly string[] = DASHBOARD_PATHS;
  return pages.includes(first) ? null : decodeURIComponent(first);
}
