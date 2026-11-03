'use client';

// What the account's pages send, by way of the storefront's own server, and what they read of the answer.
export interface ShopperAnswer<T> {
  status: number;
  data: T | null;
  code: string | null;
  /** The fields the server refused, by name, with their problems. */
  fields: Record<string, string>;
}

const UNREACHED = { status: 0, data: null, code: null, fields: {} };

/** A call on the shopper's account; a status of 0 when it never got an answer. */
export async function shopperRequest<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<ShopperAnswer<T>> {
  try {
    const response = await fetch(`/api/shopper/${path}`, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
    const answer = (await response.json().catch(() => null)) as {
      data?: T | null;
      code?: string | null;
      details?: { fields?: { field: string; problem: string }[] };
    } | null;
    return {
      status: response.status,
      data: answer?.data ?? null,
      code: answer?.code ?? null,
      fields: Object.fromEntries(
        (answer?.details?.fields ?? []).map((row) => [row.field, row.problem]),
      ),
    };
  } catch {
    return UNREACHED;
  }
}
