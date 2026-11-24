// The one place this app reads process.env (CODING-CONVENTIONS §6, "Configuration", applied to the site).
// Everything else receives settings through a constructor or a prop.
import { LISTENER_DOWNLOAD_DEFAULT_URL } from '@lytronix/validators/common';

/** Lytro's support email. Its WhatsApp and phone are the help line's, which the operator sets (GET /help-line, D8-69). */
export interface SupportContact {
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
  /** Where the listener app's file and `latest.json` live (SITE-PAGES-DESIGN §6). */
  readonly listenerDownloadUrl: string;
  /**
   * MKT-01, MKT-05: Lytro's own Meta pixel ID, read at run time from website.env, which only production sets, so the
   * same image on staging loads no pixel. Digits only; anything else is ignored.
   */
  readonly metaPixelId: string | undefined;

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
    this.listenerDownloadUrl = SiteEnvironment.trimSlash(
      env.LISTENER_DOWNLOAD_URL ?? LISTENER_DOWNLOAD_DEFAULT_URL,
    );
    const pixel = SiteEnvironment.blankToUndefined(env.META_PIXEL_ID);
    this.metaPixelId = pixel !== undefined && /^\d{5,20}$/.test(pixel) ? pixel : undefined;
    this.support = {
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
