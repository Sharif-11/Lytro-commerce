// The one place this app reads process.env (CODING-CONVENTIONS §6, "Configuration", as the marketing site does).
// Everything else receives settings through a constructor or a prop. Nothing here ever reaches a browser.

let shared: StorefrontEnvironment | undefined;

export class StorefrontEnvironment {
  /** The server, inside the deployment; the storefront never goes through the edge to reach it. */
  readonly serverUrl: string;
  /** The platform's domain; the public API answers on `api.<domain>`. */
  readonly platformDomain: string;
  /** DEPLOYMENT §6: the secret the server expects on a request that did not come through the edge. */
  readonly edgeSecret: string | undefined;
  /** Slice 12: the secret only the storefront's server holds, to read which shop a host serves. */
  readonly storefrontSecret: string | undefined;
  /** D14: the header the edge sets with the shopper's address, read from each request and passed on. */
  readonly clientIpHeader: string;

  constructor(env: Readonly<Record<string, string | undefined>> = process.env) {
    this.serverUrl = StorefrontEnvironment.trimSlash(env.SERVER_URL ?? 'http://localhost:3000');
    this.platformDomain = env.PLATFORM_DOMAIN ?? 'localhost';
    this.edgeSecret = StorefrontEnvironment.blankToUndefined(env.TRUSTED_EDGE_SECRET);
    this.storefrontSecret = StorefrontEnvironment.blankToUndefined(env.STOREFRONT_SECRET);
    this.clientIpHeader = (env.CLIENT_IP_HEADER ?? 'x-forwarded-for').toLowerCase();
  }

  /** The process-wide settings, read once. Tests build their own instance from a plain object instead. */
  static shared(): StorefrontEnvironment {
    shared ??= new StorefrontEnvironment();
    return shared;
  }

  private static trimSlash(value: string): string {
    return value.replace(/\/+$/, '');
  }

  private static blankToUndefined(value: string | undefined): string | undefined {
    return value !== undefined && value.trim() !== '' ? value : undefined;
  }
}
