// STOREFRONT-BUILDER-PLAN SB-32 as amended (sketch `de-*`): the one site that may read /preview/layout from a browser --
// the dashboard, at `app.<domain>`, as it is the one site that may frame /preview (deploy/Caddyfile, SB-12). In
// development, where the platform domain is `localhost`, the dashboard's Vite server on any local port.

export class DashboardOrigin {
  private readonly dashboard: string;
  private readonly local: boolean;

  constructor(platformDomain: string) {
    this.dashboard = `https://app.${platformDomain}`;
    this.local = platformDomain === 'localhost';
  }

  /** Whether a request from `origin` may read the answer. */
  allows(origin: string): boolean {
    if (origin === this.dashboard) return true;
    return (
      this.local && /^https?:\/\/(?:app\.)?(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/.test(origin)
    );
  }

  /** The answer's CORS headers for a request from `origin`; none for any other site, whose browser then reads nothing. */
  headersFor(origin: string | null): Record<string, string> {
    return origin !== null && this.allows(origin)
      ? { 'access-control-allow-origin': origin, vary: 'Origin' }
      : { vary: 'Origin' };
  }
}
