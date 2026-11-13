// The one place this app reads import.meta.env. Everything else receives settings through a constructor or a
// prop (CODING-CONVENTIONS §6, applied to the dashboard).
export class AppConfig {
  readonly platformDomain: string;
  readonly siteUrl: string;
  readonly apiBase = '/api/v1';
  /** OBS-03 (Slice 9.6): Sentry's address for this build; null, no error is sent. */
  readonly sentryDsn: string | null;
  /** The commit this build was made from, which names its errors. */
  readonly release: string;
  /** Which server the dashboard runs on, by its address: production, staging, or development elsewhere. */
  readonly environment: string;

  /**
   * One build serves every environment (Phase 9 §3.6): served from `app.<domain>`, the dashboard takes its platform domain
   * from its own address, so staging's `app.staging.lytro.app` names shops `<slug>.staging.lytro.app`. A setting given at
   * build time still wins (development, where the address is localhost); `lytro.app` otherwise.
   */
  constructor(
    env: ImportMetaEnv = import.meta.env,
    // No `location` outside a browser (the unit tests load this file in Node).
    hostname: string = typeof location === 'undefined' ? '' : location.hostname,
  ) {
    const served = hostname.startsWith('app.') ? hostname.slice('app.'.length) : null;
    this.platformDomain = env.VITE_PLATFORM_DOMAIN ?? served ?? 'lytro.app';
    this.siteUrl = (env.VITE_SITE_URL ?? `https://${this.platformDomain}`).replace(/\/+$/, '');
    this.sentryDsn = env.VITE_SENTRY_DSN || null;
    this.release = env.VITE_RELEASE ?? 'local';
    this.environment =
      served === null
        ? 'development'
        : served === 'lytro.app'
          ? 'production'
          : (served.split('.')[0] ?? served);
  }

  /** A shop's public address (TEN-31). */
  shopHost(slug: string): string {
    return `${slug}.${this.platformDomain}`;
  }

  /** A shop's storefront, as a link to share or open (SFT-02). */
  shopUrl(slug: string): string {
    return `https://${this.shopHost(slug)}`;
  }

  /** The owner's dashboard address for a shop, as shown in previews (TEN-31). */
  dashboardAddress(slug: string): string {
    return `app.${this.platformDomain}/${slug}`;
  }

  termsUrl(): string {
    return `${this.siteUrl}/terms`;
  }

  privacyUrl(): string {
    return `${this.siteUrl}/privacy`;
  }

  contactUrl(): string {
    return `${this.siteUrl}/contact`;
  }
}

export const appConfig = new AppConfig();
