# API contract design — full platform

Status: draft v1, for review before implementation. Companion to `DATABASE-SCHEMA.md`; requirement IDs cited for traceability. Scope matches the database design: every module in the SRS.

## 1. Conventions (apply to every endpoint below)

- **Base path and versioning (API-14):** `/api/v1/...`. A breaking change ships as `/api/v2/...` alongside v1, which keeps working with `Deprecation`/`Sunset` headers and at least 90 days' notice.
- **Tenant resolution (TEN-24):** for storefront/public traffic, the tenant comes from the request's hostname alone — never from a body field, header or query parameter. For dashboard traffic (updated 2026-10-19, TEN-31): the dashboard runs on the platform host only (`app.lytro.app`), never on a shop's host. Every call from a shop's page names that shop in the `x-lytro-shop` header (`SHOP_HEADER` in `@lytronix/shared-types`). The server opens it only when the signed-in person owns it or works in it, and otherwise answers `not_found`, exactly as for an unknown shop. A call with no shop header (checkout, set-up) works on the shop the session started on. A staff sign-in opens only the shop the person works in. A state-changing dashboard or operator request whose `Origin` is not the app's own is refused with `forbidden` (TEN-29). Operator traffic takes no shop from anywhere. A request that tries to set `tenantId` anywhere in its payload has that field silently ignored (TEN-02).
- **Auth, three kinds:**
  - **Dashboard session** — cookie-based, scoped to the exact hostname (TEN-29), used by the admin dashboard and native app.
  - **Public API key** — `Authorization: Bearer pk_...`, sent from browser code, restricted to the allow-listed action set (API-07): read catalogue/categories, read courier locations, create an order, read an order by tracking ID, create a payment session, shopper OTP sign-in, shopper-token endpoints, send chat messages.
  - **Secret API key** — `Authorization: Bearer sk_...`, server-to-server, carries scopes matching dashboard permission names (`orders:manage`, `payments:verify`, ...).
  - **Operator session** — entirely separate login, separate cookie, for `/api/v1/operator/...` only.
- **Response envelope (2.6 of the detailed SRS):** every response is one of two shapes, so a client can branch on `success` without inspecting the status code first. Success: `{ "success": true, "statusCode", "message", "data": {...} }` — `data` is exactly what each endpoint below is documented as returning. Error: `{ "success": false, "statusCode", "message", "errors": { "code", "details": {} } }`. Standard codes: `validation_error` (400), `unauthenticated` (401), `forbidden` / `plan_limit_reached` / `plan_feature_unavailable` / `tenant_offline` (403), `not_found` (404), `conflict` (409), `rate_limited` / `quota_exceeded` (429). `errors.code` is a fixed, never-translated identifier — integrate against it, not against `message`. `message` is a short, non-technical sentence, localized per I18N-01 (Bangla by default, English via `Accept-Language`) — its wording can change; `code` cannot. In production, a response never contains a stack trace or internal error detail (SEC-16); that detail is server-side only.
- **Invalid fields (API-16, updated 2026-10-18):** a request refused because of its fields lists each one in `errors.details.fields` as `{ field, problem, message, min?, max?, length?, exclusive? }`:
  - `field` is the path, such as `items.0.name`; it is empty for the request as a whole.
  - `problem` is a stable code: a format problem (`required`, `too_short`, `too_long`, `wrong_length`, `too_small`, `too_large`, `too_few`, `too_many`, `not_a_number`, `not_whole_number`, `too_many_decimals`, `invalid_format`, `invalid_email`, `invalid_url`, `invalid_date`, `not_allowed`, `wrong_type`, `nothing_to_change`), or one only the server can find (`taken`, `already_used`, `incorrect`, `expired`, `not_found`, `out_of_range`).
  - `message` is the plain sentence to show next to the field, in the request's language: "New password is too short. Use at least 8 characters." / "নিউ পাসওয়ার্ড খুব ছোট। কমপক্ষে 8 অক্ষর দিন।".
  - The envelope's `message` is that field's message when only one field is invalid, and "2 fields need fixing. Check the highlighted fields." when several are.
  - Other keys in `details` stay as each endpoint documents them, for example `suggestion` on a taken shop address.
  - A client can run the same check before sending with `fieldProblemsOf` and `fieldProblemMessage` from `@lytronix/validators`, and gets the same codes and messages.
- **Rejections before any handler runs** are worded the same way, never with the framework's own text. A body that isn't valid JSON → 400 `validation_error`. A body over 1 MB (API-26) → 413 `validation_error`. An unknown route → 404 `not_found`.
- **Pagination:** `?page=&limit=` (max 100), response carries `total` and `pages` (API-17).
- **Idempotency (API-11):** every POST with a cost or side effect accepts `Idempotency-Key`; same key + same body within 24h replays the original response with `Idempotent-Replay: true`; same key + different body is `422 idempotency_conflict`.
- **Rate-limit headers (RTE-02):** every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`; a limited response adds `Retry-After`.
- **Request id (API-27):** every response carries `X-Request-Id`, echoed in logs.
- **Trusted edge (R3, D14):** the server is reached only through an edge (any reverse proxy or load balancer). The edge adds the header `x-lytronix-edge-secret` to every request. Every route except `/health` refuses a request without a current or rotation secret with 403, including sign-in and reset. The client address comes from the header named by `CLIENT_IP_HEADER`, read only with a valid edge secret: a list header (default `x-forwarded-for`) takes the entry `TRUSTED_PROXY_HOPS` places from the end; a single-value header is read as one address.

---

## 2. Auth and tenant onboarding

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/phone/code` | none | `{ phone }`. Sends a sign-in code. Same reply for every valid number, whether or not an account exists (AUTH-12, AUTH-13). Sign-up and sign-in share this step (PHASE-1-PLAN D12). |
| POST | `/api/v1/auth/phone/verify` | none | `{ phone, code }`. Creates the account for a new number, or signs in a known one. Returns a session on the current host (D13). Sets the session cookie. Response includes `next`: `create-shop` (no shop yet), `set-password` (must set a password first), `renewal` (shop locked or archived), `unavailable` (shop suspended), or `dashboard`; an owner whose shop was deleted gets `create-shop` (LIF-21); and `tenantId`. The `unavailable` screen reads "Your shop is not available right now. Contact support for help." with a support button and no reason. |
| POST | `/api/v1/shops` | session (no tenant yet) | `{ shopName, ownerName, address? }`. The create-shop step: creates the owner user, the trial tenant and the subdomain, sends the shop-ready SMS, and sets `tenant_id` on the session (AUTH-10, AUTH-11, D13). Refused with `conflict` if this identity already has a shop (TEN-15). Response includes `next: set-password` on first creation (AUTH-28). |
| POST | `/api/v1/auth/oauth/{provider}/start` | none | `provider` = google \| facebook. Redirects into the provider's OAuth flow (AUTH-24). |
| GET | `/api/v1/auth/oauth/{provider}/callback` | none | Completes OAuth; new identity → same as `auth/phone/verify` for a new number; existing identity → signs in. |
| POST | `/api/v1/auth/signin` | none | `{ phone, password }`. Phone only until slice 6 adds email. Only for accounts that have set a password (AUTH-12). Returns the same `next` values as `auth/phone/verify`. The same generic `unauthenticated` error for an unknown number, an account with no password and a wrong password (AUTH-13). Counts toward the account's lockout (AUTH-14). |
| POST | `/api/v1/auth/signout` | session | Ends the session (AUTH-16). |
| POST | `/api/v1/auth/forgot-password` | none | `{ phone }`. Sends a dedicated reset code by SMS. Always returns 200; the SMS is sent only if the account exists (AUTH-17, AUTH-18). Rate-limited to one per 2 minutes per account. |
| POST | `/api/v1/auth/forgot-password/verify` | none | `{ phone, code }`. Verifies the reset code. On success creates a session flagged `must_set_password` on the current host. The dashboard is blocked until the password endpoint is called (AUTH-19). |
| POST | `/api/v1/auth/password` | session | `{ currentPassword?, newPassword }`. Sets or changes the password. `currentPassword` may be omitted when the session carries `must_set_password` or a sign-in code was verified within the last 10 minutes (AUTH-20). Always ends other sessions. |
| GET | `/api/v1/me` | session | Account summary: subscriber id, the shop summary of the shop the call names (slug, shop name, state, plan name, period end) or `null` when there is none, and `shops`: every shop the person may open, as `{ slug, shopName, role: 'owner' \| 'staff' }`, for the shop picker (TEN-31). Platform host only. Owners can call it in `locked`, `archived` and `deleted` so the renewal and purchase screens load. Balance is added once the balance tables exist. |
| POST | `/api/v1/auth/email/code` | none | `{ email }`. Sends a sign-in code by email. Same reply for every valid address (AUTH-08). |
| POST | `/api/v1/auth/email/verify` | none | `{ email, code }`. Signs in a known address, or creates an account with no password for a new one. Returns `next` and `tenantId` and sets the session cookie. |
| POST | `/api/v1/auth/forgot-password/email` | none | `{ email }`. Sends a reset code by email when the address has an account; the same reply either way (AUTH-27). |
| POST | `/api/v1/auth/forgot-password/email/verify` | none | `{ email, code }`. Opens a session flagged `must_set_password` (AUTH-19, AUTH-27). |
| GET | `/api/v1/auth/providers` | none | `{ providers }`: the Google and Facebook sign-in methods switched on by configuration (AUTH-24). Empty when both are off. |
| GET | `/api/v1/auth/oauth/{provider}/start` | none | `provider` = google or facebook. Returns `{ url }` for the provider sign-in. A provider switched off answers 404. |
| GET | `/api/v1/auth/oauth/{provider}/callback` | none | `?code&state`. Checks the single-use state, signs the account in (creating it with no password when new), and returns `next`, `tenantId` and `recovery`. `recovery: facebook-only` is returned once, when a Facebook account is created with no email (AUTH-27). |
| GET | `/api/v1/me/identities` | session | Lists the sign-in methods on the account (AUTH-26). |
| POST | `/api/v1/me/identities/code` | session | `{ kind: phone or email, value }`. Sends a code to the number or address being added. |
| POST | `/api/v1/me/identities/verify` | session | `{ kind, value, code }`. Adds the verified identity. A value held by another account is refused with `conflict`. |
| POST | `/api/v1/me/identities/oauth/{provider}/start` | session | Returns `{ url }` to add a Google or Facebook account to this account. Its callback returns `{ attached }` instead of signing in. |
| DELETE | `/api/v1/me/identities/:id` | session | Removes one identity. Refused with `conflict` when it is the last remaining identity, or when it owns a shop. Another account's identity answers 404 (AUTH-26). |

---

## 3. Staff and roles

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/staff` | session, `staff:read` | List staff, seat usage. |
| POST | `/api/v1/staff` | session, `staff:manage` | `{ phone, password, name?, roleIds[] }`; 402 `plan_limit_reached` above seat limit; 409 `conflict` for a phone already used in the shop. |
| PATCH | `/api/v1/staff/:id` | session, `staff:manage` | `{ active?, roleIds? }`: deactivate/reactivate (STF-03/04) and change roles (STF-07). The owner row cannot change (403). |
| GET | `/api/v1/roles` | session, `staff:read` | Roles with the number of holders (STF-09). |
| POST | `/api/v1/roles` | session, `staff:manage` | `{ name, permissions[] }`; permissions come from the platform list; 409 `conflict` for a name already used. |
| PATCH | `/api/v1/roles/:id` | session, `staff:manage` | `{ name?, permissions? }` (STF-07). |
| DELETE | `/api/v1/roles/:id` | session, `staff:manage` | 409 `conflict` with `holders` if a user still holds it (STF-09). |
| POST | `/auth/staff/signin` | none, on `app.lytro.app` | `{ phone, password }` with the password the owner set, from the staff sign-in page (AUTH-31). An unknown phone, an owner's phone and a wrong password get the same 401 (AUTH-13); 403 `tenant_offline` when the shop is locked, archived or suspended (AUTH-22). On success a session flagged `must_set_password` on the first sign-in or after an owner reset (AUTH-19), and the shop's path. |
| POST | `/api/v1/staff/:id/password` | session, `staff:manage` | `{ newPassword }`: the owner sets a new password; the member's sessions end and they must choose their own at the next sign-in (STF-13). |
| POST | `/auth/staff/password` | session of a staff member, open while a change is pending | `{ currentPassword?, newPassword }`; the current password is needed unless the owner asked for a change (AUTH-19, AUTH-20). |
| GET | `/api/v1/activity` | session, `audit:read` | `?dateFrom&dateTo&actorId&action&cursor&limit`; keyset-paginated, newest first (AUD-04). |

---

## 4. Catalogue

Public reads always require a **public key** (decided 2026-10-02: no keyless/anonymous path — every request is attributable to a key from the first call, so RTE-06/07's per-key and per-IP limits apply uniformly with no separate unauthenticated code path to secure); the tenant's shared storefront build fetches its key once per tenant, not per visitor. These reads stay edge-cacheable (SFT-11, CCH-01). Writes need a session or secret key with `products:manage`.

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/catalogue/products` | public key | `?category=&search=&cursor=&limit=`. Slim payload: name, price/range, one thumbnail, stock state (CCH-11). Edge-cacheable (CCH-01/03). |
| GET | `/api/v1/catalogue/products/:slug` | public key | Full detail: variants, attributes, images. |
| GET | `/api/v1/catalogue/categories` | public key | Tree, cached ~5 min (CCH-03). |
| GET | `/api/v1/catalogue/version` | public key | `{ version }`, cached 5s — the freshness primitive CCH-04 relies on instead of purging. |
| POST | `/api/v1/catalogue/delivery-estimate` | public key | `{ items: [{variantId, quantity}], locationId? }` → `{ deliveryCharge, exact: boolean }`. Same calculation function as order pricing (SFT-20, ORD-06a) — never a separate approximation. |
| GET | `/api/v1/products` | session/secret, `products:read` | Dashboard list (PRD-12): `?search=&categoryId=<id\|uncategorized>&page=&limit=` (20 by default). Archived products left out; inactive ones included. Each item: id, name, slug, prices (base, min, max), active, stock state, primary category, variant count. |
| POST | `/api/v1/products` | session/secret, `products:manage` | One transaction (ATR-11): the product's fields (`name` and `basePrice` required, ATR-03; the rest default from the shop type, PST-02), `categoryIds` and `primaryCategoryId` (PRD-15), `variantAttributes: [{ attributeId, optionIds }]` (at most 3, ATR-14), `variants: [{ optionIds, price?, sku?, barcode?, weightKg?, deliveryCharge?, deliveryMode?, active? }]` (omitted: every combination; at most 100), and `attributes: [{ attributeId, role: informational\|captured_at_order, optionIds?\|textValue?\|numberValue?\|boolValue? }]`. Refuses past the plan's product limit with `plan_limit_reached` (PRD-04); a pay-as-you-go shop is charged the product fee once, in the same transaction (PYG-16). Returns the product detail. |
| GET | `/api/v1/products/:id` | session/secret, `products:read` | The detail: fields, `oldSlugs`, categories, `variantAttributes` with the options in use, describing `attributes`, `variants` with their effective price and delivery mode (PRD-16, ATR-13), `archived`. |
| PATCH | `/api/v1/products/:id` | session/secret, `products:manage` | The product's own fields and categories. The slug never follows a rename (LND-04). A price change is logged with the old and new price (PRD-05). |
| DELETE | `/api/v1/products/:id` | session/secret, `products:manage` | Archives by default: hidden from lists, not counted against the limit, still readable. `?hard=true` removes it for good (PRD-13). |
| PUT | `/api/v1/products/:id/variants` | session/secret, `products:manage` | `{ variantAttributes, variants? }`, replacing what is stored (ATR-11). A combination no longer listed is retired; listed again, the same variant comes back. A repeated combination is `conflict` (ATR-06). |
| PUT | `/api/v1/products/:id/attributes` | session/secret, `products:manage` | `{ attributes }`: the describing and captured-at-order attributes, replacing what is stored (ATL-02, ATR-08). |
| PUT | `/api/v1/products/:id/slug` | session/secret, `products:manage` | `{ slug }`: a deliberate link change. The old slug keeps redirecting, and no other product may take it (LND-04). |
| GET | `/api/v1/categories` | session/secret, `products:read` | The tree, top level first: each category with its parent, depth, slug, visibility, product count and suggested attribute ids. |
| POST | `/api/v1/categories` | session/secret, `products:manage` | `{ name, parentId?, sortOrder?, visible? }`, up to four levels deep (PRD-03). |
| PATCH | `/api/v1/categories/:id` | session/secret, `products:manage` | Rename, move (with everything under it), reorder, show or hide. The slug stays. |
| DELETE | `/api/v1/categories/:id` | session/secret, `products:manage` | Refused with the count while it has sub-categories or products; `?products=uncategorize` moves its products to Uncategorized (PRD-03). |
| PUT | `/api/v1/categories/:id/attributes` | session/secret, `products:manage` | `{ attributeIds }`: the attributes suggested for its products, in order (ATR-02, ATL-05). Suggestions only. |
| GET | `/api/v1/attributes` | session/secret, `products:read` | The platform's attributes and the shop's own, each with `scope` and its options; `?includeRetired=true` for retired ones too (ATL-01, ATR-10). |
| POST | `/api/v1/attributes` | session/secret, `products:manage` | `{ name, dataType, unitKind? }`: one of the shop's own attributes (ATR-01). A name the shop already sees is `conflict` with `details.attributeId`, the one to use. |
| PATCH | `/api/v1/attributes/:id` | session/secret, `products:manage` | Rename or retire the shop's own attribute; a platform one answers `not_found`. Its type never changes. |
| POST | `/api/v1/attributes/:id/options` | session/secret, `products:manage` | `{ value }`: the shop's own value of an attribute with options, its own or the platform's. A number with a unit takes a number in its kind's base unit (UOM-02). A value already there is `conflict` with `details.optionId`. |
| PATCH | `/api/v1/attributes/:id/options/:optionId` | session/secret, `products:manage` | Rename or retire the shop's own value. |
| GET | `/api/v1/presets` | session/secret, `products:read` | The shop types and the defaults each gives a new product (PST-01, PST-02). The same for every shop. |
| GET | `/api/v1/product-defaults` | session/secret, `products:read` | What a new product starts with in this shop, from its business type ("Other" when none is chosen). |
| PUT | `/api/v1/business-type` | session/secret, `settings:manage` | `{ businessType }`: a preset key, or null. Existing products keep their settings (PST-03). |
| GET | `/api/v1/locations` | public key | The canonical zilla/thana list (CUS-08) — same response for every tenant. |
| GET | `/api/v1/locations/:locationId/courier-areas` | public key or session | A courier's areas inside one thana (CUS-10, CUS-13): the shop's default courier, or `?courierKey=` for staff choosing an area before booking. An empty list for a courier that books by address text. |

**Every write above increments `tenant.catalogue_state.version` in the same transaction** (CCH-02); the client never sets the version.

---

## 5. Orders

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/api/v1/orders` | public key or session/secret `orders:manage` | Creation is **never** limited by handling quotas (QTA-07) — only rate limits (RTE-06/08) apply. `{ customerName, customerPhone, locationId, courierAreaCode?, address, items: [{variantId, quantity}], notes? }`; `courierAreaCode` is the default courier's area, required from staff and optional from a public key, refused if it is not in `locationId` (CUS-13). Public key sets no status/discount; server decides `pending` vs `unverified` (ORD-07). |
| GET | `/api/v1/orders` | session/secret `orders:read` | `?status=&search=&from=&to=&page=&limit=` (ORD-13). |
| GET | `/api/v1/orders/:id` | session/secret `orders:read` | Full detail incl. line snapshots, payment ledger, timeline. |
| PATCH | `/api/v1/orders/:id` | session/secret `orders:manage` | Edit customer/items/notes; warns if already courier-booked (ORD-11). |
| POST | `/api/v1/orders/:id/status` | session/secret `orders:manage` | `{ override: "hold"\|"cancelled"\|"in_review"\|null }` (ORD-41). |
| GET | `/api/v1/track/:trackingId` | public key | Status, timeline, item names/qty, totals only — no address/phone (ORD-17). |
| GET | `/api/v1/track/by-phone` | shopper token | Shopper's own orders for this tenant (ORD-18). |

**Order pricing is always server-computed** (ORD-06/06a) — client-sent totals and unit prices are ignored unless a staff session explicitly overrides a line's price.

---

## 6. Couriers

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/couriers/adapters` | session/secret | Available adapters + required credential fields (CRR-01). |
| POST | `/api/v1/couriers/connections` | session, `couriers:manage` | `{ courierKey, credentials }`; validated with a test call before saving (CRR-02). |
| DELETE | `/api/v1/couriers/connections/:key` | session, `couriers:manage` | Revokes webhook token; past orders keep their tracking data (CRR-20). |
| POST | `/api/v1/orders/:id/book` | session/secret `orders:manage` | `{ courierKey, courierAreaCode? }`. Uses the order's stored area for that courier, else that courier's only area in the thana; otherwise sends nothing and returns `validation_error` on `courierAreaCode` with the areas to choose from (CUS-12, CRR-10); on success sets `handled_at` (QTA-01) and moves `pending → processing`. Idempotent (CRR-08). |
| POST | `/api/v1/orders/:id/mark-shipped` | session/secret `orders:manage` | `{ trackingLink }` for a courier without an API (CRR-16, ORD-09); also sets `handled_at`. |
| POST | `/api/v1/webhooks/courier/:tenantId/:courierKey/:token` | courier callback | Unguessable per-tenant-per-courier token (CRR-11); updates the matching order only. |

---

## 7. Payments

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/wallets` | session/secret `wallets:read` | |
| POST | `/api/v1/wallets` | session, `wallets:manage` | Add an account (WAL-01/14). |
| PATCH | `/api/v1/wallets/:id/activate` | session, `wallets:manage` | Exactly one active per provider (WAL-03). |
| POST | `/api/v1/payment-sessions` | public key or session/secret | `{ amount?, orderId?, returnUrl, cancelUrl? }` — amount fixed by server when `orderId` is given (PAY-02). |
| GET | `/api/v1/payment-sessions/:id` | secret key | Status only, never trusts a redirect param as proof (PAY-11). |
| GET | `/pay/:sessionId` | none (hosted page) | The shopper-facing hosted payment page itself, not a JSON endpoint. |
| POST | `/api/v1/payment-sessions/:id/submit` | none (hosted page) | `{ senderNumber, transactionId }` from the hosted page → `checking` (PAY-07). |
| POST | `/api/v1/orders/:id/payments` | session/secret `payments:manage` | Manual entry of an offline payment (ORD-15). |
| POST | `/api/v1/payments/:id/verify` | session, `payments:verify` | Approve/reject a `needs_review` payment (PAY-14). |

---

## 8. Balance, plans, billing

**Plan payments and top-ups do not create a `tenant.payment_sessions` row.** That table is Phase 5's shopper-order mechanism (`WAL-*`/`PAY-*`), built against `tenant.orders`, which doesn't exist yet and can't be depended on. A plan purchase or top-up instead creates a `control.plan_payments` row (`pending` → `needs_review`/`verified`) — the tenant submits a transaction ID the same way a shopper would on a hosted page, and today's confirmation step is an operator action standing in for Phase 5's real hosted page/gateway (`PHASE-2-PLAN.md` D2-1); only the confirmation *trigger* changes once Phase 5 ships, not this shape.

**Updated 2026-10-16 (Phase 2 shipped):** the rows below replace an earlier pre-implementation sketch of
this section — `/api/v1/plans/:id/purchase`, `/api/v1/plan-payments/:id/submit` and `/api/v1/invoices` never
shipped under those names; the real routes are a `billing`-prefixed quote-then-confirm pair, same D2-1 shape,
plus a split top-up quote/confirm pair instead of one combined submit.

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/balance` | session, `balance:read` | Amount, frozen flag. |
| GET | `/api/v1/balance/ledger` | session, `balance:read` | `?type=&dateFrom=&dateTo=&cursor=&limit=`, keyset-paginated (BAL-14). |
| GET | `/api/v1/balance/current-rates` | session | The tenant-facing current-rates page (RAT-06). |
| POST | `/api/v1/balance/top-up/quote` | session, `balance:manage` | `{ amount }` → a `control.plan_payments` row in `pending` (`kind: top_up`) (BAL-03, D2-1). |
| POST | `/api/v1/balance/top-up/confirm` | session, `balance:manage` | `{ paymentId, method: 'balance'\|'wallet', transactionId?, senderNumber?, amountPaid? }` — the wallet fields are required when `method` is `'wallet'`, refused otherwise. `'balance'` exists for shape-symmetry with purchase/upgrade (§8/§11 below); a top-up paying itself from the balance it's topping up has no real use, but nothing currently blocks it. |
| GET | `/api/v1/plans` | none | For-sale plans only — not-for-sale plans never appear here, enforced server-side (PLN-10). No key or session: reachable by an anonymous marketing-site visitor as well as a signed-in tenant (D2-12) — plans are platform-wide data, not tenant-scoped catalogue data, so a public *key* (which is always tenant-scoped, §4) doesn't apply here. |
| GET | `/api/v1/billing-terms` | none | Visible, platform-wide terms (TRM-02, TRM-13); a tenant-specific term (TRM-14) never appears here. Same no-auth reasoning as `/plans`. |
| GET | `/api/v1/plans/:id/prices` | none | **Added for D2-12.** A for-sale plan's price per billing term — without this, neither the marketing site nor the dashboard's own comparison grid can show a real figure, only `/plans`' limits/features. Same no-auth reasoning as `/plans`; a not-for-sale plan answers `404`, same guard the quote endpoint below uses. |
| POST | `/api/v1/billing/quote` | session, `payments:manage` | `{ planId, billingTermId }` → prices a purchase or a renewal of the tenant's current plan (picked automatically, not a separate endpoint) — a `control.plan_payments` row in `pending` (`kind: purchase` or `renewal`). |
| POST | `/api/v1/billing/purchase` | session, `payments:manage` | `{ paymentId, method: 'balance'\|'wallet', transactionId?, senderNumber?, amountPaid? }` — `'balance'` activates the plan at once; `'wallet'` enters the operator's payment-queue review (§18). |
| GET | `/api/v1/billing/invoices` | session, `payments:read` | Available in every lifecycle state, including after deletion (BIL-13). For the owner, also the invoices of their earlier, deleted shops, each with `earlierShop: true` (LIF-21); staff see this shop's only. |
| GET | `/api/v1/billing/invoices/:id` | session, `payments:read` | One invoice, including its plan-limits snapshot at the time (BIL-12); the owner may also open an earlier, deleted shop's invoice (`earlierShop: true`). Each invoice also states `shopName`, `ownerName`, `planName`, `planVersion`, `periodStart`, `periodEnd`, `discountAmount`, `paymentMethod` (`balance`\|`wallet`) and `paymentReference` (the wallet transaction ID), as at issue; all but `discountAmount` are null on invoices issued before 2026-10-18. |

---

## 9. Operator console

Entirely separate base path and session type.

**Updated 2026-10-16 (Phase 2 slice 8 shipped):** `operator/tenants` (list) and its suspend/restore pair
built ahead of ADM-02's own later phase, since LIF-24 (operator suspend/restore) needed a way to find a
tenant id at all — scoped narrowly to that, not the rest of this section's ADM-03/04/05 detail/balance-
adjust/view-as screens, which are still genuinely not built.

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/operator/tenants` | operator | **Built for LIF-24, not ADM-02 as originally planned.** `?query=&cursor=&limit=` — shop name or slug substring, keyset-paginated. No per-tenant detail route exists yet (ADM-03 below is still unbuilt). |
| GET | `/api/v1/operator/tenants/:id` | operator | **Not built.** Full detail (ADM-03) — still genuinely future work. |
| POST | `/api/v1/operator/tenants/:id/suspend` | operator | `{ reason }` (LIF-24). **Built.** |
| POST | `/api/v1/operator/tenants/:id/restore` | operator | **Built, missing from this doc until now** — no body. Lifts a suspension independent of the tenant's own lifecycle `state` (LIF-24). |
| POST | `/api/v1/operator/tenants/:id/balance-adjust` | operator | `{ amount, reason }` (ADM-04). **Built**, as a manual balance correction (`BAL-17`) — response is the resulting `LedgerEntry`, not a bare ok. |
| POST | `/api/v1/operator/tenants/:id/view-as` | operator | **Not built.** `{ reason }` — issues a scoped, read-only, time-limited session (ADM-05) — still genuinely future work. |
| GET | `/api/v1/operator/plans` | operator | Includes not-for-sale plans. |
| POST | `/api/v1/operator/plans` | operator | `{ name, description?, rank, forSale, limits, features }` — creates version 1 (PLN-01/03). Prices are set separately, per term, below — never inline on create. |
| PATCH | `/api/v1/operator/plans/:id` | operator | Same body, partial; every edit snapshots the prior version to `control.plan_versions` first and increments `version` (PLN-02, D2-3). Never changes a period already paid for (PLN-06). |
| DELETE | `/api/v1/operator/plans/:id` | operator | `409 conflict` if any snapshot references it — retire (`forSale: false` via PATCH) instead (PLN-08). |
| GET | `/api/v1/operator/plans/:id/versions` | operator | Every prior version, each exactly as it stood when retired by the next edit (PLN-02, D2-3). |
| POST | `/api/v1/operator/plans/:id/assign` | operator | `{ tenantId, expiry?, reason }` — no payment step (PLN-17). |
| GET | `/api/v1/operator/plans/:planId/prices` | operator | A plan's price across every billing term — nested under the plan, not the term, since a price is a (plan, term) pair (TRM-03). |
| PUT | `/api/v1/operator/plans/:planId/prices/:billingTermId` | operator | `{ price }` — sets or replaces the price for that pair (TRM-03). |
| DELETE | `/api/v1/operator/plans/:planId/prices/:billingTermId` | operator | Removes the price for that pair. |
| GET | `/api/v1/operator/billing-terms` | operator | Includes hidden/retired terms. |
| POST | `/api/v1/operator/billing-terms` | operator | `{ labelBn, labelEn, months, visible, displayOrder, defaultDiscountPct?, tenantId? }` (TRM-01, TRM-14). |
| PATCH | `/api/v1/operator/billing-terms/:id` | operator | Affects future purchases only — an existing snapshot keeps the term as bought (TRM-11). |
| DELETE | `/api/v1/operator/billing-terms/:id` | operator | `409 conflict` if any snapshot used it — retire (`visible: false` via PATCH) instead (TRM-05). |
| GET | `/api/v1/operator/tenants/:tenantId/limit-overrides` | operator | A tenant's own per-limit overrides (PLN-11). |
| POST | `/api/v1/operator/tenants/:tenantId/limit-overrides` | operator | `{ limitKey, value, reason }` — reason required. |
| DELETE | `/api/v1/operator/tenants/:tenantId/limit-overrides/:limitKey` | operator | Removes one override. |
| GET | `/api/v1/operator/rates` | operator | |
| GET | `/api/v1/operator/rates/:key/history` | operator | Every change to one rate (RAT-09). |
| PATCH | `/api/v1/operator/rates/:key` | operator | `{ value, noticeId? }` — immediate effect, never retroactive (RAT-02). |
| | | | Reviewing a pending top-up, purchase or upgrade's `control.plan_payments` row (D2-1) is not a separate endpoint — it's the same `/api/v1/operator/payment-queue` and `/approve`/`/reject` pair in §18, which already covers every kind of pending payment. |
| POST | `/api/v1/operator/tenants/:id/verification/request` | operator | Opens a KYC request (KYC-01). |
| GET | `/api/v1/operator/verifications` | operator, `kyc:review` | Queue, masked NID only (KYC-09). |
| GET | `/api/v1/operator/verifications/:id` | operator, `kyc:review` | Masked detail and status history (KYC-08, KYC-09). |
| POST | `/api/v1/operator/verifications/:id/reveal-nid` | operator, `kyc:review` | `{ reason }` — returns the full NID number and DOB, audited (KYC-09). |
| GET | `/api/v1/operator/verifications/:id/images/:side` | operator, `kyc:review` | `side` = `front`, `back` or `photo`. Returns a signed URL valid for [5] minutes (KYC-06). Not metered (KYC-13). |
| POST | `/api/v1/operator/verifications/:id/approve` | operator, `kyc:review` | Reviewer must differ from requester where the four-eyes rule applies (KYC-07). |
| POST | `/api/v1/operator/verifications/:id/reject` | operator, `kyc:review` | `{ reason }` — reason required (KYC-07). |
| POST | `/api/v1/operator/tenants/:id/verification/revoke` | operator, `kyc:review` | `{ reason }` — sets the tenant's status to `revoked`; reason required (KYC-16). |

**Tenant side** (session; submission is owner-only, since staff cannot act for the owner's identity):

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/verification` | session | Current status, consent text and version to show, and the masked last four digits of any submission (KYC-02, KYC-08). |
| GET | `/api/v1/verification/images/:side` | session, owner | `side` = `front`, `back` or `photo`. Returns a signed view-only URL valid for [5] minutes for the owner's own submission (KYC-06, KYC-10). Not metered (KYC-13). |
| POST | `/api/v1/verification/uploads` | session, owner | `{ side }` = `front`, `back` or `photo` (owner's face). Returns a signed upload URL into the KYC bucket's temporary area, valid for [5] minutes, one per side (KYC-15). Not metered (KYC-13). |
| POST | `/api/v1/verification` | session, owner | JSON: `{ nidNumber, dateOfBirth, frontUploadId, backUploadId, photoUploadId, consentVersion, consent: true }`. The upload ids come from the uploads endpoint. Validated per KYC-03/04; invalid images are deleted from the temporary area and nothing is created. Returns 201 with status `submitted`. |

---

## 10. Webhooks a tenant receives

| Event | Fired when |
| --- | --- |
| `order.created` | A new order is created (any source). |
| `order.status_changed` | `payment_status` or `fulfillment_status` changes. |
| `payment.verified` / `payment.failed` / `payment.needs_review` | Hosted-page or manual payment outcome. |
| `courier.status_changed` | A courier webhook or sync updates an order. |
| `balance.low` | Crossing the low-balance threshold. |
| `plan.state_changed` | Lifecycle transition (grace, locked, ...). |

Delivered as signed JSON (`HMAC-SHA256`, timestamp + signature headers, 5-minute replay window — PAY-09), retried with backoff for 24h (PAY-10), an endpoint failing 50 times in a row is auto-disabled (API-13).

---

## 11. Plan lifecycle depth

**Updated 2026-10-16 (Phase 2 shipped):** every route below moved under `billing/`, matching §8's own
purchase pair — not the standalone `plans/:id/...` shape this section originally sketched. A trial converts to
pay-as-you-go automatically, by the trial-expiry job (TRL-07). **Updated 2026-10-18:** a shop on a plan, or a
lapsed one, chooses it with `billing/pay-as-you-go` (PYG-10, LIF-15).

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/api/v1/billing/upgrade/quote` | session, `payments:manage` | `{ planId, billingTermId }` → credit, amount due (UPG-03..06). Only valid while `active` with a live period and a real current plan; refused otherwise. |
| POST | `/api/v1/billing/upgrade/confirm` | session, `payments:manage` | `{ paymentId, method: 'balance'\|'wallet', transactionId?, senderNumber?, amountPaid? }` — same two-method shape as `billing/purchase`; applies at once on a balance confirmation (UPG-09..12). Only one pending upgrade per tenant (UPG-08, `conflict`). |
| POST | `/api/v1/billing/downgrade/preview` | session, `payments:manage` | `{ planId }` → the limits currently over the target plan (DWN-03) — informational, never blocks scheduling. |
| POST | `/api/v1/billing/downgrade/schedule` | session, `payments:manage` | `{ planId }` → schedules for period end (DWN-01). |
| POST | `/api/v1/billing/downgrade/cancel` | session, `payments:manage` | Cancels a scheduled downgrade or pay-as-you-go switch before it takes effect (DWN-04). No body. |
| GET | `/api/v1/billing/downgrade` | session, `payments:read` | The scheduled change (`kind: 'downgrade' \| 'pay_as_you_go_switch'`; `targetPlanId` is null for a switch), or `null` when nothing is scheduled (DWN-02). |
| POST | `/api/v1/billing/pay-as-you-go` | session, `payments:manage` | Choose pay-as-you-go (PYG-01). No body. `active` with a running period → `{ effective: 'period_end', effectiveAt }`, scheduled like a downgrade and replacing one (PYG-10). `grace`/`read_only`/`locked`/`archived`, or `active` with no running period → `{ effective: 'now', effectiveAt: null }`, restored at once (LIF-15). Trial, already pay-as-you-go or deleted → `409 conflict`. Open in every lapsed state. |
| POST | `/api/v1/billing/cancel` | session, `payments:manage` | Cancels at period end (LIF-01). No body. |
| POST | `/api/v1/billing/close` | session, owner only | Closes a pay-as-you-go shop now (PYG-09): `archived` at once, balance frozen, data deleted 60 days later after warnings at days 45 and 57. The owner gets an SMS and an email naming the deletion date. Any other state answers `409 conflict`; a staff member gets `403 forbidden`. Choosing pay-as-you-go or buying a plan reopens it (LIF-15). No body. |
| POST | `/api/v1/billing/cancel/undo` | session, `payments:manage` | Undoes a cancellation before period end (LIF-01). No body. **No corresponding GET exists** — there is currently no way to read back whether a cancellation is pending; both actions are fire-and-forget from the client's own point of view. |
| | | | Switching *from* pay-as-you-go *to* a subscription plan (PYG-11) has no endpoint of its own — it is a plain `billing/quote` + `billing/purchase` call (§8) at full price, no credit line, exactly as any other purchase. |
| GET | `/api/v1/addons` | session | Priced catalogue (PLN-13). Deferred by Phase 2 (`PHASE-2-PLAN.md` D2-4); scheduled 2026-10-18 for Phase 3, Slice 10a. |
| POST | `/api/v1/addons/:key/purchase` | session, `balance:manage` | Prorated; from the balance it takes effect at once, paid directly it takes effect on confirmation (PLN-14). Phase 3, Slice 10a. |
| GET | `/api/v1/usage` | session | Every metric against its limit, for the usage page (LIM-02). |

## 12. SMS and notifications

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/sms/settings` | session, `sms:read` | Event on/off state, spend cap. |
| PATCH | `/api/v1/sms/settings` | session, `sms:manage` | Toggle events; essential events are locked on (SMS-02). |
| GET | `/api/v1/sms/templates` | session, `sms:read` | Live character/unit count uses the tenant's real shop name (SMS-10). |
| PATCH | `/api/v1/sms/templates/:eventKey` | session, `sms:manage` | Refused if a required variable is missing. |
| GET | `/api/v1/sms/log` | session, `sms:read` | `?eventKey=&from=&to=&page=` — parts, cost, blocked counts (SMS-14). |
| GET | `/api/v1/notifications` | session | In-app notification centre, permission-scoped (NTF-01). |
| PATCH | `/api/v1/notifications/:id/read` | session | |
| POST | `/api/v1/push/subscribe` | session | Web Push subscription (NTF-02). |
| DELETE | `/api/v1/push/subscribe` | session | |

## 13. Chat and AI

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/api/v1/chat/threads` | public key | Shopper starts a thread; `{ visitorId, message, mediaUrl? }` (CHT-01). |
| GET | `/api/v1/chat/threads/:id/messages` | public key (shopper) or session (staff) | Long-poll for new messages within the 5s reply target (decided 2026-10-02: long-poll at launch, no WebSocket/SSE infrastructure yet — revisit if real chat volume shows latency complaints). |
| GET | `/api/v1/chat/threads` | session, `chat:read` | Dashboard inbox, unread counts, search (CHT-02). |
| POST | `/api/v1/chat/threads/:id/messages` | session, `chat:reply` | Staff reply; pauses AI on that thread for 30 min (AI-06). |
| POST | `/api/v1/chat/messenger/webhook` | Meta signature | Facebook Messenger inbound (CHT-06/CHT-08). |
| GET | `/api/v1/ai/settings` | session, `chat:manage` | |
| PATCH | `/api/v1/ai/settings` | session, `chat:manage` | `{ enabled, instructions, spendCap }` (AI-01/04). |

## 14. Fraud checking

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/api/v1/fraud/check` | session/secret, `fraud:check` | `{ phone, orderId? }` → level, summary, sources (FRD-01/02). Charged only when a result is returned (FRD-03). |
| GET | `/api/v1/fraud/rules` | session, `fraud:read` | |
| PATCH | `/api/v1/fraud/rules` | session, `fraud:manage` | `{ autoCheckCodAbove?, contributeToSharedData }` (FRD-05/10). |

## 15. SMS listener app

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/api/v1/listener/pair` | session, `listener:manage` | Issues a single-use QR/code, 10-minute expiry (LSN-01/09). |
| POST | `/api/v1/listener/register` | pairing code (device) | Exchanges the code for a device token; refused above the plan's device limit (LSN-01/08). |
| GET | `/api/v1/listener/devices` | session, `listener:read` | Name, model, last seen, uploads today (LSN-20). |
| DELETE | `/api/v1/listener/devices/:id` | session, `listener:manage` | Revokes at once (LSN-19). |
| POST | `/api/v1/listener/messages` | device token | Batch upload of forwarded SMS receipts; checked against tenant state first (LSN-07/13). |
| POST | `/api/v1/listener/heartbeat` | device token | At most 4/hour (LSN-13). |

## 16. Tenant-configured outbound webhooks

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/webhooks` | session/secret, `webhooks:read` | |
| POST | `/api/v1/webhooks` | session/secret, `webhooks:manage` | `{ url, events[] }`, up to 5, HTTPS only; secret shown once (API-12). |
| DELETE | `/api/v1/webhooks/:id` | session/secret, `webhooks:manage` | |
| GET | `/api/v1/webhooks/:id/deliveries` | session/secret, `webhooks:read` | Attempts, status codes, first 1 KB of response (API-13). |
| POST | `/api/v1/webhooks/:id/deliveries/:deliveryId/resend` | session/secret, `webhooks:manage` | |

## 17. Notice board

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/notices` | session | Audience-filtered, pinned first then newest (NTC-01..03). |
| POST | `/api/v1/notices/:id/acknowledge` | session (owner) | Records user + time (NTC-05). |
| GET | `/api/v1/operator/notices` | operator | |
| POST | `/api/v1/operator/notices` | operator | `{ title, bodyBn, bodyEn, category, severity, audience, publishAt, endAt?, pinned, requiresAck }`. |
| PATCH | `/api/v1/operator/notices/:id` | operator | Edited notices are marked "edited" with the earlier version kept (NTC-08). |
| DELETE | `/api/v1/operator/notices/:id` | operator | Withdraw — hidden from tenants, kept in operator history. |

## 18. Operator console depth and support

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/operator/reports/summary` | operator | Tenant counts by state/plan, revenue by period (ADM-09). |
| GET | `/api/v1/operator/reports/top-consumers` | operator | Storage/bandwidth/SMS, CSV export. |
| POST | `/api/v1/operator/manual-payments` | operator | `{ tenantId, kind, amount, wallet, transactionId, senderNumber, paymentTime, evidenceUrl, reason }` (ADM-14/15). |
| GET | `/api/v1/operator/payment-queue` | operator | `control.plan_payments` rows (`kind`: `top_up`/`purchase`/`upgrade`) plus Phase 5's shopper "I have paid" claims, all awaiting review (ADM-06/17, D2-1). The one operator queue for every pending-payment flow in §8/§9/§11. |
| POST | `/api/v1/operator/payment-queue/:id/approve` \| `/reject` | operator | |
| GET | `/api/v1/operator/page-reports` | operator | "Report this page" queue (ADM-12). |
| POST | `/api/v1/operator/page-reports/:id/suspend` \| `/dismiss` | operator | |
| GET | `/api/v1/tickets` | session | Tenant's own support tickets (SUP-02/04). |
| POST | `/api/v1/tickets` | session | `{ subject, message, imageUrls[] }`; tenant ID, plan, state and recent errors attached automatically. |
| GET | `/api/v1/operator/tickets` | operator | Filter by status/plan/age, flag overdue (SUP-05). |
| POST | `/api/v1/operator/tickets/:id/reply` | operator | |

## 19. What's out of scope for an HTTP contract

Observability (MON/OBS) is external services reading the database and application metrics, not endpoints this API exposes. The job queue (SCL-08) and cache layers (CCH/RED) are internal to the server process, not client-facing routes.

## 20. Open questions — resolved 2026-10-02

1. **Public catalogue auth**: decided — a public key is always required, no keyless/anonymous path, for tenant-scoped storefront data. See §4. **Updated 2026-10-13, extended 2026-10-16**: this does not extend to platform-wide, non-tenant-scoped data — `/api/v1/plans`, `/api/v1/billing-terms` and `/api/v1/plans/:id/prices` (§8) are deliberately keyless, since a public key is always tenant-scoped and these aren't tenant data at all (D2-12).
2. **Fulfillment endpoints**: decided — kept as two separate endpoints (`/book`, `/mark-shipped`), not merged into one `/fulfill` with a `method` field.
3. **OpenAPI generation**: decided — generated from the NestJS decorators, not hand-authored, so API-15's "a build check shall fail when a route is missing from the description" is enforced by construction.
4. **Chat delivery**: decided — long-poll at launch, no WebSocket/SSE infrastructure yet. See §13.
