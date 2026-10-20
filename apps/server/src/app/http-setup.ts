import type { NestExpressApplication } from '@nestjs/platform-express';
import { UNVERSIONED_ROUTES } from '../common/unversioned-routes';
import { PublicApiHost } from '../modules/public-api/services/public-api-host';

// API-26: a request body over this size is refused with 413 before any handler runs.
const BODY_LIMIT = '1mb';

/**
 * The HTTP settings the server and the end-to-end tests both start with, so the two never drift apart: the
 * /api/v1 prefix and the public API host's /v1/ address and preflights (API-14, API-23), and the body-size limit
 * (API-26). Applied before the app initialises, so these run ahead of every route and these parsers replace Nest's
 * own 100 KB defaults rather than running after them.
 */
export class HttpSetup {
  /**
   * `publicApiHost: false` only for a test that builds a module without the public API; the server and every test
   * of the whole app mount it, so leaving it out of the app is an error at start, never a silent gap.
   */
  apply(app: NestExpressApplication, options: { publicApiHost?: boolean } = {}): void {
    if (options.publicApiHost !== false) app.use(app.get(PublicApiHost).handle);
    app.setGlobalPrefix('api/v1', { exclude: UNVERSIONED_ROUTES });
    app.useBodyParser('json', { limit: BODY_LIMIT });
    app.useBodyParser('urlencoded', { limit: BODY_LIMIT, extended: true });
  }
}
