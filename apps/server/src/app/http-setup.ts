import type { NestExpressApplication } from '@nestjs/platform-express';
import { UNVERSIONED_ROUTES } from '../common/unversioned-routes';

// API-26: a request body over this size is refused with 413 before any handler runs.
const BODY_LIMIT = '1mb';

/**
 * The HTTP settings the server and the end-to-end tests both start with, so the two never drift apart: the
 * /api/v1 prefix (API-14) and the body-size limit (API-26). Applied before the app initialises, so these
 * parsers replace Nest's own 100 KB defaults rather than running after them.
 */
export class HttpSetup {
  apply(app: NestExpressApplication): void {
    app.setGlobalPrefix('api/v1', { exclude: UNVERSIONED_ROUTES });
    app.useBodyParser('json', { limit: BODY_LIMIT });
    app.useBodyParser('urlencoded', { limit: BODY_LIMIT, extended: true });
  }
}
