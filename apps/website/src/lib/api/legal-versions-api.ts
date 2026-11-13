import type { LegalVersionsView } from '@lytronix/validators';
import type { SiteEnvironment } from '../env';
import { ServerApi } from './server-api';

/**
 * LEG-01 (Slice 9.8): the terms and privacy versions in force, the platform settings sign-up records, so /terms and
 * /privacy show the text a new shop accepts. Kept for a minute; null when the server can't be reached, and the pages then
 * choose by date (LegalLibrary.inForce).
 */
export class LegalVersionsApi {
  private readonly api: ServerApi;

  constructor(env: SiteEnvironment) {
    this.api = new ServerApi({
      baseUrl: env.serverUrl,
      edgeSecret: env.edgeSecret,
      timeoutMs: 5000,
      revalidateSeconds: 60,
    });
  }

  current(): Promise<LegalVersionsView | null> {
    return this.api.get<LegalVersionsView>('/legal-versions');
  }
}
