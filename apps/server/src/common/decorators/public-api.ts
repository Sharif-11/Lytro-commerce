import { SetMetadata } from '@nestjs/common';

export const PUBLIC_API = 'publicApi';

/**
 * API-05, API-14: marks a public API route: served on the API host at /v1/..., with the shop taken from the key the
 * route's own guard checks, not from the host. TenantGuard reads this; public-api's PublicApi() applies it with that
 * guard.
 */
export const PublicApiRoute = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_API, true);

export const TAKES_ORDERS = 'publicApiTakesOrders';

/**
 * QTA-07 (agreed 2026-11-04): a route an order can't be placed without: past the month's requests (RTE-03) it is still
 * counted and still served, so a plan limit never turns a sale away. The per-minute limits hold as anywhere.
 */
export const TakesOrders = (): MethodDecorator => SetMetadata(TAKES_ORDERS, true);
