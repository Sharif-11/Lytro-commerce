import { SetMetadata } from '@nestjs/common';

export const RESPONSE_MESSAGE = 'response_message';

/** Overrides ResponseEnvelopeInterceptor's default per-status message (e.g. "Created") with a specific one. */
export const ResponseMessage = (message: string): MethodDecorator =>
  SetMetadata(RESPONSE_MESSAGE, message);
