import { COURIER_CALL_TIMEOUT_SECONDS, COURIER_REFUSAL_MAX_LENGTH } from '@lytronix/validators';
import { CourierNoAnswer } from '../ports/courier-adapter';

export type CourierReply = Record<string, unknown>;

/** A courier's answer: its status, and its body if that was a JSON object. */
export interface CourierResponse {
  status: number;
  body: CourierReply | null;
}

/** CRR-18: one call to a courier, ended after [30] seconds. Anything that isn't an answer is `CourierNoAnswer`. */
export async function callCourier(
  send: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<CourierResponse> {
  let response: Response;
  try {
    response = await send(url, {
      ...init,
      signal: AbortSignal.timeout(COURIER_CALL_TIMEOUT_SECONDS * 1000),
    });
  } catch (error) {
    throw new CourierNoAnswer(error instanceof Error ? error.name : 'no response');
  }
  let body: CourierReply | null = null;
  try {
    const parsed: unknown = await response.json();
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      body = parsed as CourierReply;
    }
  } catch {
    // A page or an empty body is no answer of the courier's; the caller decides what its status means.
  }
  return { status: response.status, body };
}

export function textOf(reply: CourierReply | null, field: string): string | null {
  const value = reply?.[field];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** A value a courier may send as a number or a string. */
export function codeOf(reply: CourierReply | null, field: string): string | null {
  const value = reply?.[field];
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return textOf(reply, field);
}

/**
 * CRR-07, SEC-16 as amended (read agreed 2026-11-04): a courier's own words as staff may read them: plain text on one line, with no
 * markup, cut to [200] characters. Nothing else of a courier's reply ever reaches a person.
 */
export function refusalWords(words: string | null): string | null {
  if (words === null) return null;
  const plain = words
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\p{Cc}\s]+/gu, ' ')
    .trim();
  if (plain.length === 0) return null;
  return plain.slice(0, COURIER_REFUSAL_MAX_LENGTH);
}
