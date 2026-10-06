# API contract design — full platform

Status: draft v1, for review before implementation. Companion to `DATABASE-SCHEMA.md`; requirement IDs cited for traceability. Scope matches the database design: every module in the SRS.

## 1. Conventions (apply to every endpoint below)

- **Base path and versioning (API-14):** `/api/v1/...`. A breaking change ships as `/api/v2/...` alongside v1, which keeps working with `Deprecation`/`Sunset` headers and at least 90 days' notice.
- **Tenant resolution (TEN-24):** for storefront/public traffic, the tenant comes from the request's hostname alone — never from a body field, header or query parameter. For dashboard/operator traffic, the tenant comes from the session. On a shop host, a dashboard request must match the session's shop; otherwise it is `forbidden` (TEN-28). A request that tries to set `tenantId` anywhere in its payload has that field silently ignored (TEN-02).
- **Auth, three kinds:**
  - **Dashboard session** — cookie-based, scoped to the exact hostname (TEN-29), used by the admin dashboard and native app.
  - **Public API key** — `Authorization: Bearer pk_...`, sent from browser code, restricted to the allow-listed action set (API-07): read catalogue/categories, read courier locations, create an order, read an order by tracking ID, create a payment session, shopper OTP sign-in, shopper-token endpoints, send chat messages.
  - **Secret API key** — `Authorization: Bearer sk_...`, server-to-server, carries scopes matching dashboard permission names (`orders:manage`, `payments:verify`, ...).
  - **Operator session** — entirely separate login, separate cookie, for `/api/v1/operator/...` only.
- **Errors (2.6 of the detailed SRS):** every error is `{ "error": { "code", "message", "details": {} } }`. Standard codes: `validation_error` (400), `unauthenticated` (401), `forbidden` / `plan_limit_reached` / `plan_feature_unavailable` / `tenant_offline` (403), `not_found` (404), `conflict` (409), `rate_limited` / `quota_exceeded` (429). `code` is a fixed, never-translated identifier — integrate against it, not against `message`. `message` is a short, non-technical sentence, localized per I18N-01 (Bangla by default, English via `Accept-Language`) — its wording can change; `code` cannot. In production, a response never contains a stack trace or internal error detail (SEC-16); that detail is server-side only.
- **Pagination:** `?page=&limit=` (max 100), response carries `total` and `pages` (API-17).
- **Idempotency (API-11):** every POST with a cost or side effect accepts `Idempotency-Key`; same key + same body within 24h replays the original response with `Idempotent-Replay: true`; same key + different body is `422 idempotency_conflict`.
- **Rate-limit headers (RTE-02):** every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`; a limited response adds `Retry-After`.
- **Request id (API-27):** every response carries `X-Request-Id`, echoed in logs.
- **Trusted edge (R3, D14):** every route except `/health` refuses a request that lacks the edge header `x-lytronix-edge-secret` (403), including the sign-in routes. The client address is read from `CF-Connecting-IP` only when that header is valid (D14).

---

## 2. Auth and tenant onboarding

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/phone/code` | none | `{ phone }`. Sends a sign-in code. Same reply for every valid number, whether or not an account exists (AUTH-12, AUTH-13). Sign-up and sign-in share this step (PHASE-1-PLAN D12). |
| POST | `/api/v1/auth/phone/verify` | none | `{ phone, code }`. Creates the account for a new number, or signs in a known one. Returns a session on the current host (D13). Sets the session cookie. Response includes `next`: `create-shop` (no shop yet), `set-password` (must set a password first), `renewal` (shop locked or archived), `purchase` (shop deleted), `unavailable` (shop suspended), or `dashboard`; and `tenantId`. The `unavailable` screen reads "This shop is not available right now." with a support contact and no reason. |
| POST | `/api/v1/shops` | session (no tenant yet) | `{ shopName, ownerName, address? }`. The create-shop step: creates the owner user, the trial tenant and the subdomain, sends the shop-ready SMS, and sets `tenant_id` on the session (AUTH-10, AUTH-11, D13). Refused with `conflict` if this identity already has a shop (TEN-15). Response includes `next: set-password` on first creation (AUTH-28). |
| POST | `/api/v1/auth/oauth/{provider}/start` | none | `provider` = google \| facebook. Redirects into the provider's OAuth flow (AUTH-24). |
| GET | `/api/v1/auth/oauth/{provider}/callback` | none | Completes OAuth; new identity → same as `auth/phone/verify` for a new number; existing identity → signs in. |
| POST | `/api/v1/auth/signin` | none | `{ phone, password }`. Phone only until slice 6 adds email. Only for accounts that have set a password (AUTH-12). Returns the same `next` values as `auth/phone/verify`. The same generic `unauthenticated` error for an unknown number, an account with no password and a wrong password (AUTH-13). Counts toward the account's lockout (AUTH-14). |
| POST | `/api/v1/auth/signout` | session | Ends the session (AUTH-16). |
| POST | `/api/v1/auth/forgot-password` | none | `{ phone }`. Sends a dedicated reset code by SMS. Always returns 200; the SMS is sent only if the account exists (AUTH-17, AUTH-18). Rate-limited to one per 2 minutes per account. |
| POST | `/api/v1/auth/forgot-password/verify` | none | `{ phone, code }`. Verifies the reset code. On success creates a session flagged `must_set_password` on the current host. The dashboard is blocked until the password endpoint is called (AUTH-19). |
| POST | `/api/v1/auth/password` | session | `{ currentPassword?, newPassword }`. Sets or changes the password. `currentPassword` may be omitted when the session carries `must_set_password` or a sign-in code was verified within the last 10 minutes (AUTH-20). Always ends other sessions. |
| GET | `/api/v1/me` | session | Account summary: subscriber id, and the shop summary (slug, shop name, state, plan name, period end) or `null` when the session has no shop yet. Works on the platform host and on the shop's own host. Owners can call it in `locked`, `archived` and `deleted` so the renewal and purchase screens load. Balance is added once the balance tables exist. |
| POST | `/api/v1/me/identities` | session | Add a second/third verified identity to this account (AUTH-26). |
| DELETE | `/api/v1/me/identities/:id` | session | Refused if it's the last remaining identity. |

---

## 3. Staff and roles

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/staff` | session, `staff:read` | List staff, seat usage. |
| POST | `/api/v1/staff` | session, `staff:manage` | `{ phone, password, name?, roleIds[] }`; 403 `plan_limit_reached` above seat limit. |
| PATCH | `/api/v1/staff/:id` | session, `staff:manage` | Edit, deactivate/reactivate (STF-03/04). |
| GET | `/api/v1/roles` | session, `staff:read` | |
| POST | `/api/v1/roles` | session, `staff:manage` | `{ name, permissions[] }`. |
| DELETE | `/api/v1/roles/:id` | session, `staff:manage` | 409 `conflict` if a user still holds it (STF-09). |

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
| GET | `/api/v1/products` | session/secret, `products:read` | Dashboard list, unfiltered by active flag, with internal fields. |
| POST | `/api/v1/products` | session/secret, `products:manage` | `{ name, price, deliveryCharge, weightKg?, deliveryMode, categoryIds[], ... }`. |
| PATCH | `/api/v1/products/:id` | session/secret, `products:manage` | |
| DELETE | `/api/v1/products/:id` | session/secret, `products:manage` | Soft by default; `?hard=true` for hard delete (PRD-13). |
| POST | `/api/v1/products/:id/variants` | session/secret, `products:manage` | |
| GET | `/api/v1/categories` | session/secret, `products:read` | |
| POST | `/api/v1/categories` | session/secret, `products:manage` | |
| GET | `/api/v1/locations` | public key | The canonical zilla/thana list (CUS-08) — same response for every tenant. |

**Every write above increments `tenant.catalogue_state.version` in the same transaction** (CCH-02); the client never sets the version.

---

## 5. Orders

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/api/v1/orders` | public key or session/secret `orders:manage` | Creation is **never** limited by handling quotas (QTA-07) — only rate limits (RTE-06/08) apply. `{ customerName, customerPhone, locationId, address, items: [{variantId, quantity}], notes? }`. Public key sets no status/discount; server decides `pending` vs `unverified` (ORD-07). |
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
| POST | `/api/v1/orders/:id/book` | session/secret `orders:manage` | `{ courierKey }`. Resolves `location → control.courier_location_map` (CUS-12); on success sets `handled_at` (QTA-01) and moves `pending → processing`. Idempotent (CRR-08). |
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

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/balance` | session, `balance:read` | Amount, frozen flag. |
| GET | `/api/v1/balance/ledger` | session, `balance:read` | `?type=&from=&to=` (BAL-14). |
| POST | `/api/v1/balance/top-up` | session, `balance:manage` | Creates a payment session against the platform's own wallet (BAL-03). |
| GET | `/api/v1/plans` | public key | For-sale plans only — not-for-sale plans never appear here, enforced server-side (PLN-10). |
| POST | `/api/v1/plans/:id/purchase` | session | `{ billingTermId }` → payment session. |
| GET | `/api/v1/invoices` | session | Available in every lifecycle state, including after deletion (BIL-13). |

---

## 9. Operator console

Entirely separate base path and session type.

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/operator/tenants` | operator | Search/filter (ADM-02). |
| GET | `/api/v1/operator/tenants/:id` | operator | Full detail (ADM-03). |
| POST | `/api/v1/operator/tenants/:id/suspend` | operator | `{ reason }` (ADM-04). |
| POST | `/api/v1/operator/tenants/:id/balance-adjust` | operator | `{ amount, reason }` (ADM-04). |
| POST | `/api/v1/operator/tenants/:id/view-as` | operator | `{ reason }` — issues a scoped, read-only, time-limited session (ADM-05). |
| GET | `/api/v1/operator/plans` | operator | Includes not-for-sale plans. |
| POST | `/api/v1/operator/plans/:id/assign` | operator | `{ tenantId, expiry?, reason }` — no payment step (PLN-17). |
| GET | `/api/v1/operator/rates` | operator | |
| PATCH | `/api/v1/operator/rates/:key` | operator | Immediate effect, never retroactive (RAT-02). |
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

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/api/v1/plans/:id/upgrade` | session | `{ billingTermId }` → quote (credit, amount due, new dates), then confirm via payment session (UPG-01..09). |
| POST | `/api/v1/plans/downgrade` | session | `{ targetPlanId }`, schedules for period end; preview of every limit that would be exceeded (DWN-01..03). |
| DELETE | `/api/v1/plans/downgrade` | session | Cancels a scheduled downgrade (DWN-04). |
| POST | `/api/v1/plans/cancel` | session | Cancels at period end (LIF-01), undoable until then. |
| POST | `/api/v1/plans/switch-to-payg` | session | Effective at period end, following downgrade timing (PYG-10). |
| GET | `/api/v1/addons` | session | Priced catalogue (PLN-13). |
| POST | `/api/v1/addons/:key/purchase` | session, `balance:manage` | Prorated, takes effect at once (PLN-14). |
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
| GET | `/api/v1/operator/payment-queue` | operator | Plan payments, top-ups and "I have paid" claims awaiting review (ADM-06/17). |
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

1. **Public catalogue auth**: decided — a public key is always required, no keyless/anonymous path. See §4.
2. **Fulfillment endpoints**: decided — kept as two separate endpoints (`/book`, `/mark-shipped`), not merged into one `/fulfill` with a `method` field.
3. **OpenAPI generation**: decided — generated from the NestJS decorators, not hand-authored, so API-15's "a build check shall fail when a route is missing from the description" is enforced by construction.
4. **Chat delivery**: decided — long-poll at launch, no WebSocket/SSE infrastructure yet. See §13.
