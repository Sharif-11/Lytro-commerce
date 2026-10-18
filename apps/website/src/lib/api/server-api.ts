// Server-side reads of the backend. The marketing host forwards no /api (docs/DEPLOYMENT.md §5), so the site
// calls the server inside the deployment with the trusted-edge secret the backend requires (§6). Nothing in
// this file ever runs in a browser.

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export interface ServerApiSettings {
  baseUrl: string;
  edgeSecret: string | undefined;
  timeoutMs: number;
  revalidateSeconds: number;
}

export class ServerApi {
  constructor(private readonly settings: ServerApiSettings) {}

  /** GET `/api/v1<path>`. Returns null on any failure (unreachable, timeout, non-2xx, bad envelope): a
      marketing page degrades to its static copy rather than failing a visitor or a crawler. The timeout is
      what keeps `next build` and a request against a dead backend from hanging. */
  async get<T>(path: string): Promise<T | null> {
    try {
      const headers: Record<string, string> = { accept: 'application/json' };
      if (this.settings.edgeSecret) headers['x-lytronix-edge-secret'] = this.settings.edgeSecret;
      const response = await fetch(`${this.settings.baseUrl}/api/v1${path}`, {
        headers,
        next: { revalidate: this.settings.revalidateSeconds },
        signal: AbortSignal.timeout(this.settings.timeoutMs),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as ApiEnvelope<T>;
      return body.success ? body.data : null;
    } catch {
      return null;
    }
  }
}
