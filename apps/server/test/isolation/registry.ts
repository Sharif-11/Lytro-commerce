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
  // Checked in test/staff.e2e.spec.ts: a staff phone of one shop is refused on another shop's host.
  'POST /auth/staff/signin': 'a staff phone of shop A is refused on shop B host',
  // Checked in test/staff.e2e.spec.ts: another shop cannot reset a staff password; a staff member changes only their own.
  'POST /auth/staff/password': 'changes only the session staff member password',
  'POST /staff/:id/password': 'another shop staff member answers 404',
  // Checked in test/staff.e2e.spec.ts: roles are the shop's own, and a held role cannot be deleted.
  'GET /roles': 'lists only the session shop roles and holder counts',
  'POST /roles': 'creates a role in the session shop only',
  'PATCH /roles/:id': 'another shop role answers 404',
  'DELETE /roles/:id': 'another shop role answers 404; a held role is refused',
  // Checked in test/activity.e2e.spec.ts: a shop sees only its own activity log entries.
  'GET /activity': 'lists only the session shop activity log',
  // Checked in test/balance-ledger.e2e.spec.ts: a shop's balance and ledger are its own (BAL-01, tenant.balance_ledger's RLS).
  'GET /balance': "shows only the session shop's own balance and frozen flag",
  'GET /balance/ledger': "lists only the session shop's own ledger entries",
  'GET /balance/ledger/export': "exports only the session shop's own ledger entries",
  // Platform-wide data (control.rates), not tenant-owned: every shop sees the same values, so there is nothing
  // to isolate between tenants — included here only because the route is shop-reachable, not SkipTenant.
  'GET /balance/current-rates':
    'returns the same platform-wide rates regardless of which shop calls it',
  // Checked in test/plan-purchase.e2e.spec.ts: a shop's quotes, invoices and top-ups are its own.
  'POST /balance/top-up/quote': 'creates a top-up quote scoped to the session shop only',
  'POST /balance/top-up/confirm': "another shop's top-up payment id answers not_found",
  'POST /billing/quote': 'creates a purchase quote scoped to the session shop only',
  'POST /billing/auto-renew': "toggles only the session shop's own auto-renew setting",
  'POST /billing/purchase': "another shop's payment id answers not_found",
  'GET /billing/invoices': "lists only the session shop's own invoices",
  'GET /billing/invoices/:id': "another shop's invoice id answers not_found",
  'POST /billing/upgrade/quote': 'creates an upgrade quote scoped to the session shop only',
  'POST /billing/upgrade/confirm': "another shop's payment id answers not_found",
  // Checked in test/plan-downgrade.e2e.spec.ts: a shop schedules, previews, cancels and reads only its own.
  'POST /billing/downgrade/preview': "previews against the session shop's own plan only",
  'POST /billing/downgrade/schedule': 'schedules a downgrade scoped to the session shop only',
  'POST /billing/downgrade/cancel': "cancels only the session shop's own scheduled downgrade",
  'GET /billing/cancellation': "returns only the session shop's own cancellation status",
  'GET /billing/downgrade': "returns only the session shop's own scheduled downgrade",
  // Checked in test/lifecycle.e2e.spec.ts: a shop cancels/undoes only its own subscription.
  'POST /billing/cancel': "cancels only the session shop's own subscription",
  'POST /billing/cancel/undo': "undoes only the session shop's own cancellation",
  // Checked in test/shop-settings.e2e.spec.ts: a shop's own contact details only (TEN-30).
  'GET /shop-settings': "reads only the session shop's own contact details",
  'PATCH /shop-settings': "a session of shop A on shop B's host is refused, never updates shop B",
  // Checked in test/data-export.e2e.spec.ts: a shop's own export requests and files only (LIF-16/17).
  'POST /exports': 'creates an export request scoped to the session shop only',
  'GET /exports': "lists only the session shop's own export requests",
  'GET /exports/:id/download': "another shop's export id answers not_found, never its content",
};
