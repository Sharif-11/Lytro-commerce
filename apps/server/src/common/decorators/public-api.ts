import { SetMetadata } from '@nestjs/common';

export const PUBLIC_API = 'publicApi';

/**
 * API-05, API-14: marks a public API route: served on the API host at /v1/..., with the shop taken from the key the
 * route's own guard checks, not from the host. TenantGuard reads this; public-api's PublicApi() applies it with that
 * guard.
 */
export const PublicApiRoute = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_API, true);
