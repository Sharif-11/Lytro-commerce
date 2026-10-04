import { SetMetadata } from '@nestjs/common';

export const SKIP_TENANT = 'skipTenant';

/** Marks a route that works without a shop, such as /health or sign-up (decision R6). */
export const SkipTenant = (): MethodDecorator & ClassDecorator => SetMetadata(SKIP_TENANT, true);
