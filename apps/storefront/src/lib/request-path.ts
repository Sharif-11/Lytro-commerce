// The not-found page says what is missing by the path it was asked for (a product link, LND-03, or anything else), and
// Next gives that page no path of its own, so the middleware puts it on every request as this header.
export const STOREFRONT_PATH_HEADER = 'x-storefront-path';
