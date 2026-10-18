// The one place this app reads process.env (CODING-CONVENTIONS §6, "Configuration", applied to the site).
// Everything else receives settings through a constructor or a prop.

export interface SupportContact {
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
}

let shared: SiteEnvironment | undefined;

export class SiteEnvironment {
  readonly serverUrl: string;
  readonly edgeSecret: string | undefined;
  readonly appUrl: string;
  readonly siteUrl: string;
  readonly liveFeatures: ReadonlySet<string>;
  readonly contactWebhookUrl: string | undefined;
  readonly support: SupportContact;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.serverUrl = SiteEnvironment.trimSlash(env.SERVER_URL ?? 'http://localhost:3000');
    this.edgeSecret = SiteEnvironment.blankToUndefined(env.TRUSTED_EDGE_SECRET);
    this.appUrl = SiteEnvironment.trimSlash(env.APP_URL ?? 'https://app.lytro.app');
    this.siteUrl = SiteEnvironment.trimSlash(env.SITE_URL ?? 'https://lytro.app');
    this.liveFeatures = new Set(
      (env.LIVE_FEATURES ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    );
    this.contactWebhookUrl = SiteEnvironment.blankToUndefined(env.CONTACT_WEBHOOK_URL);
    this.support = {
      whatsapp: SiteEnvironment.blankToUndefined(env.SUPPORT_WHATSAPP) ?? null,
      phone: SiteEnvironment.blankToUndefined(env.SUPPORT_PHONE) ?? null,
      email: SiteEnvironment.blankToUndefined(env.SUPPORT_EMAIL) ?? null,
    };
  }

  /** The process-wide settings, read once. Tests build their own instance from a plain object instead. */
  static current(): SiteEnvironment {
    shared ??= new SiteEnvironment();
    return shared;
  }

  private static trimSlash(value: string): string {
    return value.replace(/\/+$/, '');
  }

  private static blankToUndefined(value: string | undefined): string | undefined {
    return value !== undefined && value.trim().length > 0 ? value.trim() : undefined;
  }
}
