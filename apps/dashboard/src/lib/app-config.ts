// The one place this app reads import.meta.env. Everything else receives settings through a constructor or a
// prop (CODING-CONVENTIONS §6, applied to the dashboard).
export class AppConfig {
  readonly platformDomain: string;
  readonly siteUrl: string;
  readonly apiBase = '/api/v1';

  constructor(env: ImportMetaEnv = import.meta.env) {
    this.platformDomain = env.VITE_PLATFORM_DOMAIN ?? 'lytro.app';
    this.siteUrl = (env.VITE_SITE_URL ?? 'https://lytro.app').replace(/\/+$/, '');
  }

  /** A shop's public address (TEN-31). */
  shopHost(slug: string): string {
    return `${slug}.${this.platformDomain}`;
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
