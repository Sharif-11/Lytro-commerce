import { CircuitBreaker, CircuitOpen } from '../../../../common/circuit-breaker';
import { CacheUnavailable, type EdgeCache, MOST_PURGED_AT_ONCE } from '../ports/edge-cache';

/** The zone Lytro's names are in, a token that may purge its cache, and the media address when media is served. */
export interface CloudflareCacheSettings {
  zoneId: string;
  apiToken: string;
  /** MEDIA_PUBLIC_BASE_URL: the public media's address, such as `https://media.lytro.app`; null without media. */
  mediaBaseUrl: string | null;
}

const API = 'https://api.cloudflare.com/client/v4';

interface PurgeAnswer {
  success?: boolean;
  errors?: { code?: unknown }[];
}

type PurgeBody = { prefixes: string[] } | { tags: string[] };

/**
 * D9-31, D9-32, LIF-19: Cloudflare's purge by prefix and by tag, which every plan has. A refusal is reported by its
 * status and Cloudflare's error codes only, never its text, which may repeat what was sent.
 */
export class CloudflareEdgeCache implements EdgeCache {
  private readonly folderBase: string | null;

  constructor(
    private readonly settings: CloudflareCacheSettings,
    private readonly fetcher: (url: string, init: RequestInit) => Promise<Response> = (url, init) =>
      fetch(url, init),
    private readonly breaker: CircuitBreaker = new CircuitBreaker({ service: 'cloudflare' }),
  ) {
    if (settings.mediaBaseUrl === null) {
      this.folderBase = null;
    } else {
      const base = new URL(settings.mediaBaseUrl);
      // A prefix is written without its scheme: the host, then the path.
      this.folderBase = `${base.host}${base.pathname.replace(/\/+$/, '')}/`;
    }
  }

  async purgeFolder(prefix: string): Promise<void> {
    // No media address: no media is served through Cloudflare, so none is kept there.
    if (this.folderBase === null) return;
    await this.send({ prefixes: [`${this.folderBase}${prefix.replace(/^\/+/, '')}`] });
  }

  async purgeTags(tags: readonly string[]): Promise<void> {
    if (tags.length === 0) return;
    if (tags.length > MOST_PURGED_AT_ONCE) {
      throw new Error(`at most ${String(MOST_PURGED_AT_ONCE)} tags are purged at once`);
    }
    await this.send({ tags: [...tags] });
  }

  private async send(body: PurgeBody): Promise<void> {
    try {
      await this.breaker.call('cloudflare:purge', () => this.purge(body));
    } catch (error) {
      if (error instanceof CircuitOpen) throw new CacheUnavailable(error.message);
      throw error;
    }
  }

  private async purge(body: PurgeBody): Promise<void> {
    let response: Response;
    try {
      response = await this.fetcher(`${API}/zones/${this.settings.zoneId}/purge_cache`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.settings.apiToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
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
