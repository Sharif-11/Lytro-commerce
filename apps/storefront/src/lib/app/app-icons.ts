import type { ServerApi, ServerBytes } from '../api/server-api';
import type { StorefrontEnvironment } from '../env';
import type { StoreIconFile } from './app-manifest';

/** SFT-14 (Slice 12c): the storefront app's icons, drawn by the server -- the brand's square icon, else the logo, else
    the monogram -- and served from the storefront's own address, so they share its origin with the manifest. Asked of
    the shop's app route, which needs no key, through the edge secret like any call from inside the deployment. */
export class AppIcons {
  constructor(
    private readonly server: Pick<ServerApi, 'bytes'>,
    private readonly env: StorefrontEnvironment,
  ) {}

  icon(slug: string, file: StoreIconFile): Promise<ServerBytes> {
    const headers: Record<string, string> = {};
    if (this.env.edgeSecret) headers['x-lytronix-edge-secret'] = this.env.edgeSecret;
    return this.server.bytes({
      method: 'GET',
      path: `/api/v1/shops/${encodeURIComponent(slug)}/icons/${file}`,
      host: this.env.platformDomain,
      headers,
    });
  }
}
