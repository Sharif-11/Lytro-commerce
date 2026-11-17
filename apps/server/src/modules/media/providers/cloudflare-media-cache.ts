import { CircuitBreaker, CircuitOpen } from '../../../common/circuit-breaker';
import { CacheUnavailable, type MediaCache } from '../ports/media-cache';

/** The zone the media address is in, a token that may purge its cache, and the address itself (env.ts). */
export interface CloudflareCacheSettings {
  zoneId: string;
  apiToken: string;
  /** MEDIA_PUBLIC_BASE_URL: the public media's address, such as `https://media.lytro.app`. */
  mediaBaseUrl: string;
}

const API = 'https://api.cloudflare.com/client/v4';

interface PurgeAnswer {
  success?: boolean;
  errors?: { code?: unknown }[];
}

/**
 * D9-31, LIF-19: Cloudflare's purge by prefix, which every plan has. A refusal is reported by its status and
 * Cloudflare's error codes only, never its text, which may repeat what was sent.
 */
export class CloudflareMediaCache implements MediaCache {
  private readonly folderBase: string;

  constructor(
    private readonly settings: CloudflareCacheSettings,
    private readonly fetcher: (url: string, init: RequestInit) => Promise<Response> = (url, init) =>
      fetch(url, init),
    private readonly breaker: CircuitBreaker = new CircuitBreaker({ service: 'cloudflare' }),
  ) {
    const base = new URL(settings.mediaBaseUrl);
    // A prefix is written without its scheme: the host, then the path.
    this.folderBase = `${base.host}${base.pathname.replace(/\/+$/, '')}/`;
  }

  async purgeFolder(prefix: string): Promise<void> {
    const folder = `${this.folderBase}${prefix.replace(/^\/+/, '')}`;
    try {
      await this.breaker.call('cloudflare:purge', () => this.purge(folder));
    } catch (error) {
      if (error instanceof CircuitOpen) throw new CacheUnavailable(error.message);
      throw error;
    }
  }

  private async purge(folder: string): Promise<void> {
    let response: Response;
    try {
      response = await this.fetcher(`${API}/zones/${this.settings.zoneId}/purge_cache`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.settings.apiToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ prefixes: [folder] }),
      });
    } catch (error) {
      throw new CacheUnavailable(error instanceof Error ? error.name : 'the call failed');
    }
    const answer = (await response.json().catch(() => ({}))) as PurgeAnswer;
    if (!response.ok || answer.success !== true) {
      const codes = (answer.errors ?? []).map((error) => String(error.code)).join(', ');
      throw new CacheUnavailable(
        `Cloudflare answered ${String(response.status)}${codes ? ` (codes ${codes})` : ''}`,
      );
    }
  }
}
