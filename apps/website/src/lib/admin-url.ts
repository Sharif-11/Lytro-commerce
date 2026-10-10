// In production, /sign-in and /dashboard* are served by apps/admin on this same host, split by path
// (docs/DEPLOYMENT.md §5) — a plain relative href reaches them with no cross-origin request at all. Locally
// there is no reverse proxy in front of these two dev servers (no Caddyfile exists yet, only the production
// routing description in DEPLOYMENT.md), so a relative link 404s inside apps/website's own router instead of
// ever reaching admin on its separate port. ADMIN_APP_URL overrides the base for local dev only; production
// never sets it, so the relative-path behavior there is unchanged.
const ADMIN_BASE_URL = process.env.ADMIN_APP_URL ?? '';

export function adminUrl(path: string): string {
  return `${ADMIN_BASE_URL}${path}`;
}
