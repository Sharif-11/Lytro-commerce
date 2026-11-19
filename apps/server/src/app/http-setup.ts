import type { Server } from 'node:http';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { RequestIdHandler } from '../common/request-id/request-id-handler';
import { RequestLogger } from '../common/request-id/request-logger';
import { UNVERSIONED_ROUTES } from '../common/unversioned-routes';
import { PaymentPageHost } from '../modules/payment-page/services/payment-page-host';
import { PublicApiHost } from '../modules/public-api/services/public-api-host';

// API-26: a request body over this size is refused with 413 before any handler runs.
const BODY_LIMIT = '1mb';

// How long an idle connection from Caddy is kept open: past Caddy's own 2 minutes (its reverse proxy's default), so Caddy
// always closes one first. Node's 5 seconds let Caddy reuse a connection the API had just closed, and the call came back
// 502, "connection reset by peer" (staging's live run, 2026-11-19: delivery charges, and checkouts through them). The
// headers' time must outlast it. The Dockerfile gives the storefront and the website the same (KEEP_ALIVE_TIMEOUT).
export const KEEP_ALIVE_MS = 125_000;
export const HEADERS_TIMEOUT_MS = KEEP_ALIVE_MS + 1_000;

/**
 * The HTTP settings the server and the end-to-end tests both start with, so the two never drift apart: the
 * /api/v1 prefix, the public API host's /v1/ address and preflights (API-14, API-23), the payment page's own host, and the body-size limit
 * (API-26). First of all, every request's ID and the logger that prints it (API-27), so the hosts' answers and the body
 * parser's 413 carry an ID too. Applied before the app initialises, so these run ahead of every route and these parsers replace Nest's
 * own 100 KB defaults rather than running after them.
 */
export class HttpSetup {
  /**
   * `publicApiHost: false` only for a test that builds a module without the public API; the server and every test
   * of the whole app mount it, so leaving it out of the app is an error at start, never a silent gap.
   */
  apply(app: NestExpressApplication, options: { publicApiHost?: boolean } = {}): void {
    app.useLogger(app.get(RequestLogger));
    app.use(app.get(RequestIdHandler).handle);
    if (options.publicApiHost !== false) {
      app.use(app.get(PublicApiHost).handle);
      app.use(app.get(PaymentPageHost).handle);
    }
    app.setGlobalPrefix('api/v1', { exclude: UNVERSIONED_ROUTES });
    app.useBodyParser('json', { limit: BODY_LIMIT });
    app.useBodyParser('urlencoded', { limit: BODY_LIMIT, extended: true });
    this.keepConnectionsOpen(app.getHttpServer());
  }

  /** Keeps an idle connection from the edge open longer than the edge does (KEEP_ALIVE_MS). */
  keepConnectionsOpen(server: Server): void {
    server.keepAliveTimeout = KEEP_ALIVE_MS;
    server.headersTimeout = HEADERS_TIMEOUT_MS;
  }
}
