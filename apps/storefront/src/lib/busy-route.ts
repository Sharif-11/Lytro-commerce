import { ShopBusy } from './api/storefront-api';

/** Slice 9.10 (STOREFRONT-DESIGN §7h): a figure the browser asks the storefront for (the delivery charge, a list's next
    page, the thanas) passes a busy server's refusal on as it came, its status (429 or 503) and its wait, so the page can
    say so in the figure's place; before, it answered 500. Every other fault goes on as thrown. */
export function withBusyAnswer<A extends unknown[]>(
  handle: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args) => {
    try {
      return await handle(...args);
    } catch (error) {
      if (!(error instanceof ShopBusy)) throw error;
      return Response.json(null, {
        status: error.status,
        headers: { 'retry-after': String(error.retryAfter), 'cache-control': 'no-store' },
      });
    }
  };
}
