import { SetMetadata } from '@nestjs/common';
import type { MessageKey } from '../i18n/message-key';

export const RESPONSE_MESSAGE = 'response_message';

/** Overrides ResponseEnvelopeInterceptor's default per-status message (e.g. "Created") with a specific one. */
export const ResponseMessage = (key: MessageKey): MethodDecorator =>
  SetMetadata(RESPONSE_MESSAGE, key);
