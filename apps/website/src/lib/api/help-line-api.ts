import type { HelpLineView } from '@lytronix/validators';
import type { SiteEnvironment } from '../env';
import { ServerApi } from './server-api';

/**
 * D8-4, D8-69, D8-73 (Slice 8.8): Lytro's help line, the WhatsApp, phone and hours the operator sets in the console, read
 * by the contact page, the listener page and the footer instead of numbers of the site's own. Kept as long as the
 * route's own five minutes; null when the server can't be reached, and the pages then show no number.
 */
export class HelpLineApi {
  private readonly api: ServerApi;

  constructor(env: SiteEnvironment) {
    this.api = new ServerApi({
      baseUrl: env.serverUrl,
      edgeSecret: env.edgeSecret,
      timeoutMs: 5000,
      revalidateSeconds: 300,
    });
  }

  current(): Promise<HelpLineView | null> {
    return this.api.get<HelpLineView>('/help-line');
  }
}
