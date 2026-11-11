import { ApiClientError } from '@lytronix/api-client';
import type { HelpLineView } from '@lytronix/validators';

/** D8-69: a help line worth a Help row, a sheet or a Send on WhatsApp: one with a number set. */
export function helpLineReachable(line: HelpLineView | undefined): line is HelpLineView {
  return line !== undefined && (line.whatsapp !== null || line.phone !== null);
}

/** API-27, D8-21: a server fault's ID, from its response's X-Request-Id; none for a refusal or no answer at all. */
export function requestIdOf(error: unknown): string | null {
  return error instanceof ApiClientError ? error.requestId : null;
}
