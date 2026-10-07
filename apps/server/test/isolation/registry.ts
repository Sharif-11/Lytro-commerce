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
// The identity routes: a signed-in account can list, add and remove only its own identities (AUTH-26). Checked in
// test/identities.e2e.spec.ts, including a removal of another account's identity, which answers 404.
export const ISOLATION_REGISTRY: Readonly<Record<string, string>> = {
  'GET /me': 'session of shop A on shop B host is refused; summary shows only the session shop',
  'GET /me/identities': 'lists only the session account identities',
  'POST /me/identities/code': 'code is sent to the session account only',
  'POST /me/identities/verify':
    'adds an identity to the session account only; a held identity is refused',
  'POST /me/identities/oauth/:provider/start':
    'attaches the provider account to the session account only',
  'DELETE /me/identities/:id': 'another account identity answers 404; the last identity is refused',
  // The staff routes: a shop lists, adds and changes only its own staff. Checked in test/staff.e2e.spec.ts.
  'GET /staff': 'lists only the session shop staff and seats',
  'POST /staff': 'creates staff in the session shop only; seats are counted in that shop',
  'PATCH /staff/:id': 'another shop staff member answers 404',
  // Checked in test/staff.e2e.spec.ts: roles are the shop's own, and a held role cannot be deleted.
  'GET /roles': 'lists only the session shop roles and holder counts',
  'POST /roles': 'creates a role in the session shop only',
  'PATCH /roles/:id': 'another shop role answers 404',
  'DELETE /roles/:id': 'another shop role answers 404; a held role is refused',
};
