// SEC-02: every shop-owned route and the isolation case that proves it refuses another shop's IDs.
//
// Add an entry in the same pull request as the route. The suite fails when:
//   - a shop-owned route has no entry (the endpoint shipped without its isolation case), or
//   - an entry has no matching route (the endpoint was removed or renamed).
//
// Key: "METHOD /path", exactly as the route is registered (for example "GET /orders/:id").
// Value: what the case checks. Every case expects `not_found` for another shop's ID (TEN-03).
//
// GET /me: a session of one shop is refused on another shop's host (TEN-28), and the summary shows only its own shop.
// Checked over HTTP in test/dashboard.e2e.spec.ts.
export const ISOLATION_REGISTRY: Readonly<Record<string, string>> = {
  'GET /me': 'session of shop A on shop B host is refused; summary shows only the session shop',
};
