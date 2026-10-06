import { SetMetadata } from '@nestjs/common';

export const SKIP_EDGE = 'skipEdge';

/** Marks a route that load balancers call directly, without the edge secret (decision R6). */
export const SkipEdge = (): MethodDecorator & ClassDecorator => SetMetadata(SKIP_EDGE, true);
