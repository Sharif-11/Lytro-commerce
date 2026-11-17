// Slice 9.10, D9-32: one product's delivery charge as a product or landing page asks for it -- one variant, a quantity,
// an area or none, no add-ons -- is the same for every shopper, so it is asked by GET and Cloudflare's edge keeps it,
// tagged by the shop and the product. Anything more (a cart, add-ons) is still asked by POST and kept nowhere.

/** What the GET's address carries. */
export interface EstimateQuery {
  productId: string;
  variantId: string;
  quantity: number;
  areaId: number | null;
}

// An ID as the server gives it; the variant's is checked again by the estimate's own schema, and the product's only
// names the tag the answer is kept by.
const ID = /^[\w-]{1,64}$/;
// A whole count, or a weight or length sold by the unit (0.5 kg).
const COUNT = /^\d{1,6}(\.\d{1,3})?$/;
const AREA = /^[1-9]\d{0,8}$/;

/** The address's query, in one order, so one estimate has one address at the edge. */
export function estimateQueryString(query: EstimateQuery): string {
  const params = new URLSearchParams({
    p: query.productId,
    v: query.variantId,
    q: String(query.quantity),
  });
  if (query.areaId !== null) params.set('a', String(query.areaId));
  return params.toString();
}

/** The query back from an address; null when any part isn't what a page sends. */
export function readEstimateQuery(params: URLSearchParams): EstimateQuery | null {
  const productId = params.get('p') ?? '';
  const variantId = params.get('v') ?? '';
  const quantity = params.get('q') ?? '';
  const area = params.get('a');
  if (!ID.test(productId) || !ID.test(variantId) || !COUNT.test(quantity)) return null;
  if (Number(quantity) <= 0) return null;
  if (area !== null && !AREA.test(area)) return null;
  return {
    productId,
    variantId,
    quantity: Number(quantity),
    areaId: area === null ? null : Number(area),
  };
}
