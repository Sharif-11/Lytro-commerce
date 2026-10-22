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
- **Rate-limit headers (RTE-02):** every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`; a limited response adds `Retry-After`. With a public key they describe the visitor's own minute (RTE-06, 120 requests by default, an operator setting): a public key has no per-minute limit of its own (RTE-01).
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
| GET | `/api/v1/shop-settings` | session, `settings:manage` | The shop's own settings: `contactPhone`, `contactEmail`, `businessAddress` (TEN-30), `extraDeliveryChargePerKg` (RAT-14), and `defaultPaymentPolicy` with `defaultAdvanceAmount` (PRD-08: what a product with no policy of its own follows; `none` until set). |
| GET | `/api/v1/ad-tracking` | session, `settings:manage` | LND-15 to LND-17 (Slice 9b): `{ metaPixelId, conversionsApiConnected, updatedAt }`; the Conversions API token is never returned. |
| PUT | `/api/v1/ad-tracking` | session, `settings:manage` | `{ metaPixelId: digits \| null, conversionsApiToken?: string \| null }`: the Pixel (null disconnects it); the token left out stays, null removes it. Sealed (SEC-10); each change in the activity log, never the token. |
| DELETE | `/api/v1/ad-tracking` | session, `settings:manage` | Disconnects the Pixel and removes the token; in the activity log. |
| GET | `/api/v1/catalog-feed` | session, `settings:manage` | FED-01, FED-06 (Slice 9b): `{ url, regeneratedAt }`, the shop's Meta catalog feed link, made on first asking. |
| POST | `/api/v1/catalog-feed/regenerate` | session, `settings:manage` | FED-05: a new link; the old one answers 404 at once; in the activity log. |
| PATCH | `/api/v1/shop-settings` | session, `settings:manage` | Any of the fields above; `null` clears a contact field. A `partial_advance` default needs `defaultAdvanceAmount`, no other policy takes one, and leaving a partial advance drops its amount. |

---

## 4. Catalogue

Public reads always require a **public key** (decided 2026-10-02: no keyless/anonymous path — every request is attributable to a key from the first call, so RTE-06/07's per-key and per-IP limits apply uniformly with no separate unauthenticated code path to secure); the tenant's shared storefront build fetches its key once per tenant, not per visitor. **Amended 2026-10-21 (Slice 9):** these reads are on the API host, `api.lytro.app/v1/...`, and Cloudflare stores none of them, so every request passes the limits and is counted (RTE-04, CCH-01 amended); shoppers' browsers keep them for the CCH-03 lifetimes (`Cache-Control: private`, an ETag answered 304), and the server's memory cache serves repeats. Writes need a session or secret key with `products:manage`.

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/v1/catalogue/products` | public key | `?category=<slug>&search=&sort=&cursor=&limit=`: a category includes its subcategories; `sort` is `featured` (the shop's order, then newest), `newest`, `price_low`, `price_high` or `relevance` (the default with a search); 24 to a page, 60 at most. Active products only. Slim rows (CCH-11): id, slug, name, min and max price, stock state (in, low, out), first photo; and `nextCursor`. A search matches whole words and word starts in the name and description, then, if nothing matches, close spellings of the name (CCH-12). 30 s, stale for 120 more (search: 30 s). Built in Slice 9a. |
| GET | `/v1/catalogue/products/:slug` | public key | An active product: images, video, description, the options its variants on sale use, informational attributes as written, variants on sale (`price`, `stockState`, `available`: a sold-out one is listed and unavailable, ATR-07), size chart, payment policy and advance. An old slug answers with the current `slug`, to redirect to (LND-04). Never cost, exact stock, SKU or notes. 60 s. |
| GET | `/v1/catalogue/categories` | public key | The visible tree with banners, in the shop's order; a hidden category hides everything under it. 300 s (CCH-03). |
| GET | `/v1/shop` | public key | `{ name, slug, metaPixelId }`: the key's own shop, and the Meta Pixel its pages load, null when none is connected (API-07, LND-15). |
| GET | `/v1/feeds/meta/<token>.csv` | the token | FED-01 to FED-05 (Slice 9b): the shop's Meta catalog feed, one CSV row per variant on sale of each active product, in Meta's columns (`id` the variant, `item_group_id` the product, `title`, `description`, `availability`, `condition`, `price` as `1200.00 BDT`, `link` to the landing page with `?v=`, `image_link`, `additional_image_link`, `brand`, `color`, `size`). No key or website: the 256-bit token is the credential. A wrong token, or a shop whose landing pages are offline, answers 404. Each fetch counts one request toward the month (RTE-03); an ETag answers 304. |
| GET | `/v1/catalogue/version` | public key | `{ version }`: the shop's version and the platform library's, `<shop>.<platform>`; 5 s. Put it in the catalogue addresses after it as `v`, so a change is seen at once without purging (CCH-04). |
| POST | `/api/v1/catalogue/delivery-estimate` | public key | `{ items: [{variantId, quantity}], locationId? }` → `{ deliveryCharge, exact: boolean }`. Same calculation function as order pricing (SFT-20, ORD-06a) — never a separate approximation. |
| GET | `/api/v1/products` | session/secret, `products:read` | Dashboard list (PRD-12): `?search=&categoryId=<id\|uncategorized>&page=&limit=` (20 by default). Archived products left out; inactive ones included. Each item: id, name, slug, prices (base, min, max), active, stock state, primary category, variant count. |
| POST | `/api/v1/products` | session/secret, `products:manage` | One transaction (ATR-11): the product's fields (`name` and `basePrice` required, ATR-03; the rest default from the shop type, PST-02, or from the type its primary category behaves like, PST-06), `categoryIds` and `primaryCategoryId` (PRD-15), `variantAttributes: [{ attributeId, optionIds }]` (at most 3, ATR-14), `variants: [{ optionIds, price?, sku?, barcode?, weightKg?, deliveryCharge?, deliveryMode?, active?, openingStock? }]` (omitted: every combination; at most 100; `openingStock` is the stock already on the shelf, recorded as an `initial` movement in the same transaction: tracked products only, whole numbers unless the unit is kg, g, liter or ml), and `attributes: [{ attributeId, role: informational\|captured_at_order, optionIds?\|textValue?\|numberValue?\|boolValue? }]`. With `sharedStock: true` (INV-24) the variants draw on one stock in the product's unit: `variants` must be listed, each with its `packAmount` (how much of the stock one unit sold uses; a whole number unless the unit is measured), `openingStock` is a whole number of that variant's packs, and `sharedOpeningStock` adds loose stock in the unit; each is an `initial` movement on the shared stock. Not with serial numbers or a made-to-order product. Refuses past the plan's product limit with `plan_limit_reached` (PRD-04); a pay-as-you-go shop is charged the product fee once, in the same transaction (PYG-16). Returns the product detail. |
| GET | `/api/v1/products/:id` | session/secret, `products:read` | The detail: fields, `oldSlugs`, categories, `variantAttributes` with the options in use and their `swatchColor` (ATR-18), describing `attributes`, `variants` with their effective price and delivery mode (PRD-16, ATR-13), `archived`, and `sizeChart`: `{ source: product\|category, categoryId, rows }`, its own chart, else the one on its primary category or the nearest category above it, else null (PRD-17), `deliveryZoneIds`, the zones it is limited to (DLV-07; empty means wherever the shop delivers), and `effectivePaymentPolicy` with `effectiveAdvanceAmount`: the product's own policy and advance when it sets a policy, else the shop's default pair (PRD-08). Its own `paymentPolicy` stays null while it follows the shop; `none` opts it out of the default. `sharedStock`, and each variant's `packAmount` (null unless the product shares its stock, INV-24); the hidden variant holding a shared stock is never listed. |
| PATCH | `/api/v1/products/:id` | session/secret, `products:manage` | The product's own fields and categories. The slug never follows a rename (LND-04). A price change is logged with the old and new price (PRD-05). Turning a tracked product made to order writes its stock off to zero with a recorded movement first; tracking it again starts at 0 (INV-02). A product sharing its stock stops sharing it with that (INV-24). A whole-number unit is refused while the product holds a fraction of stock or of a pack (UOM-03). `sharedStock` is refused here: it is switched where the variants are saved. |
| DELETE | `/api/v1/products/:id` | session/secret, `products:manage` | Archives by default: hidden from lists, not counted against the limit, still readable. `?hard=true` removes it for good (PRD-13). |
| PUT | `/api/v1/products/:id/variants` | session/secret, `products:manage` | `{ sharedStock?, variantAttributes, variants? }`, replacing what is stored (ATR-11). A combination no longer listed is retired; listed again, the same variant comes back. A repeated combination is `conflict` (ATR-06). While the product shares its stock (INV-24), `variants` must be listed with each `packAmount`; `sharedStock` turns sharing on or off, only while the product holds no stock (`conflict` otherwise, never a conversion), on a counted product without serial numbers. Turning it off clears the pack amounts; turning it on again brings back the same shared stock and its history. |
| PUT | `/api/v1/products/:id/attributes` | session/secret, `products:manage` | `{ attributes }`: the describing and captured-at-order attributes, replacing what is stored (ATL-02, ATR-08). |
| PUT | `/api/v1/products/:id/slug` | session/secret, `products:manage` | `{ slug }`: a deliberate link change. The old slug keeps redirecting, and no other product may take it (LND-04). |
| POST | `/api/v1/products/:id/duplicate` | session/secret, `products:manage` | No body (PRD-18). Copies the fields, categories, attributes, live variants (prices, weights and delivery overrides; never the SKU or barcode) and its own size chart into a new, inactive product named "<name> (copy)" with a new slug and no stock. Counts toward the product limit (`plan_limit_reached`) and is charged the pay-as-you-go fee like any new product. Returns the copy's detail. Images join the copy with Slice 6. |
| PUT | `/api/v1/products/:id/size-chart` | session/secret, `products:manage` | `{ rows }`: the product's own chart, replacing its category's (PRD-17). A table of up to 15 rows of up to 10 cells, every row as wide as the first, each cell at most 40 characters. Returns `{ rows }`. The image chart (MED-03) comes with Slice 6. |
| GET | `/api/v1/products/:id/stock` | session/secret, `inventory:read` | Each live variant's stock, and each retired variant still holding some (INV-01): `variantId`, `optionIds`, `sku`, `retired`, `onHand`, `reserved`, `available`, `packAmount`, `state` (in, low or out against the product's threshold), `incoming` (ordered and not yet received on placed, open purchases, never part of `available`, PUR-05), and `avgCost` only with `inventory:manage` (D3-9). With the product's `stockTracking`, `stockUnit`, `lowStockThreshold` and public `state`, its best variant's (CCH-08). `shared` is the stock the variants share (INV-24), null otherwise: `{ variantId, onHand, reserved, available, incoming, state, avgCost? }`, in the product's unit; its `variantId` is what the stock, cost, history, addition and stock-check routes take. A variant drawing on it has `onHand`, `reserved` and `incoming` null, `available` the whole packs the shared stock makes, a state from the shared stock (out with no whole pack left, low with the shared stock at or under the threshold), and `avgCost` its pack's share. |
| PUT | `/api/v1/products/:id/variants/:variantId/stock` | session/secret, `inventory:manage` | `{ onHand, reason?, note?, batch?, batchId?, serials? }` (`serials`, on a serial-numbered product, names the units arriving or the units leaving; a fall naming fewer takes units with no serial first, and is `conflict` when every unit has one, INV-14): the stock the variant now has (INV-06). On a batch-tracked product (INV-12) a rise may describe its new batch (`batch: { batchCode?, expiresOn? }`, YYYY-MM-DD, never past) or name one (`batchId`), and a fall may name the batch it leaves; otherwise a rise goes into the "no expiry" batch and a fall leaves in the picking order. The difference is recorded as one movement: `reason` is `new_stock` (rising; recorded as a purchase received in full, numbered, with no supplier or cost, PUR-07), `counted_again` (a recount), `damaged_or_lost` (falling; damaged) or `other` (a manual adjustment, also when skipped). A reason that contradicts the change is refused, as is a fraction of a whole-unit product. In the activity log (INV-21). Returns the product's stock. |
| PUT | `/api/v1/products/:id/variants/:variantId/cost` | session/secret, `inventory:manage` | `{ avgCost }` (null clears it): the average unit cost typed by hand, until a purchase receipt carrying a cost sets it (INV-10, `conflict` after; a receipt with no cost leaves it to the hand). Never public. In the activity log. For a product sharing its stock, set on the shared stock, per unit; this route and the stock route answer `conflict` for a variant drawing on it (INV-24). |
| POST | `/api/v1/products/:id/variants/:variantId/stock-additions` | session/secret, `inventory:manage` | `{ quantity, supplierId?, supplierName?, unitCost?, note?, batch?, batchId?, serials? }` (`serials` one per unit arriving, at most `quantity`, INV-14) (the batch as for the stock route): stock that arrived, added to what is held (INV-06, INV-24). On a variant drawing on a shared stock, a whole number of its packs (a `100 ml` variant, `quantity: 1`, adds 100 ml); on the shared stock, its unit; on any other variant, units. Recorded as a purchase received in full in one step (PUR-07): the shop's next number, one item, one receipt, a `purchase_receipt` movement. The supplier is optional: a live one by `supplierId` (an archived one is `conflict`), or `supplierName`, which uses the live supplier of that name (ignoring case) or adds one; not both. `unitCost` (per pack on a size of a shared stock, kept per unit of the shared stock) is taken into the average cost (INV-10). In the activity log as the purchase received. Returns the product's stock. |
| GET | `/api/v1/products/:id/variants/:variantId/stock-history` | session/secret, `inventory:read` | `?page=&limit=` (20 by default): the variant's movements, newest first (INV-09): `delta`, `onHandAfter`, `reason`, `reference`, `note`, `actor { userId, name }`, `createdAt`, and `unitCost` only with `inventory:manage`. |
| GET | `/api/v1/products/:id/variants/:variantId/serials` | session/secret, `inventory:read` | `?status=&page=&limit=` (50 by default): the variant's serials, newest first; the units it holds unless a `status` is asked (INV-14). Each: `id`, `serial`, `status`, `receivedMovementId`, `leftMovementId`, `createdAt`. Readable after serial tracking is turned off. |
| POST | `/api/v1/products/:id/variants/:variantId/serials` | session/secret, `inventory:manage` | `{ serials }`: serials for units already held that have none yet, at most one each (INV-14). Each line is checked (INV-23): an IMEI for its 15 digits and check digit, any other serial for letters, digits and dashes; a line repeated, or held by any unit in the shop, is refused, and then nothing is saved. In the activity log. |
| PATCH | `/api/v1/products/:id/serials/:serialId` | session/secret, `inventory:manage` | `{ serial }`: a serial typed wrong, corrected while its unit is in stock; `conflict` for a unit that has left (its serial is history). In the activity log. |
| DELETE | `/api/v1/products/:id/serials/:serialId` | session/secret, `inventory:manage` | A serial removed while its unit is in stock; the unit then has no serial again. In the activity log. |
| GET | `/api/v1/products/:id/batches` | session/secret, `inventory:read` | The product's open batches holding stock, its shared stock's included, in the picking order (INV-12): `id`, `variantId`, `optionIds`, `batchCode`, `expiresOn`, `noExpiry`, `quantity`, `receivedAt`, `state` (`fine`, `expiring` within 30 days, or `expired`). |
| POST | `/api/v1/products/:id/batches/:batchId/write-off` | session/secret, `inventory:manage` | No body (INV-13). What an expired batch holds, written off as one `expired` movement at the cost of the moment; `conflict` for a batch not yet expired. In the activity log. Returns the product's batches. |
| GET | `/api/v1/batches` | session/secret, `inventory:read` | `?state=expiring\|expired&page=&limit=` (20 by default): the shop's batches holding stock that expire within 30 days, or have expired, soonest first, each with its `productId` and `productName` (INV-13). |
| POST | `/api/v1/stock-checks` | session/secret, `inventory:manage` | `{ lines: [{ variantId, batchId?, counted, missingSerials? }], note? }` (`missingSerials` names the serial-numbered units found missing, written off with the recount), 1 to 500 lines (INV-07). A batch-tracked variant is counted as a whole or batch by batch, never both in one check; counted as a whole, a shortfall leaves in the picking order and a surplus goes into its "no expiry" batch (INV-12). Each variant's stock is locked and compared; each difference is recorded as one `recount` movement whose `reference` is the check. A made-to-order product, a fraction of a whole-unit product and another shop's variant are refused per line, and then nothing is recorded. In the activity log (INV-21). Returns the check, as `GET /stock-checks/:id` does. |
| GET | `/api/v1/stock-checks` | session/secret, `inventory:read` | `?page=&limit=` (20 by default): the shop's checks, newest first: `id`, `note`, `actor`, `createdAt`, `totals { lines, changed }`, and with `inventory:manage` also `valueGained`, `valueLost` (to the paisa, each line rounded half up) and `unknownCost` (changed lines with no cost, not in the values). |
| GET | `/api/v1/stock-checks/:id` | session/secret, `inventory:read` | One check and its `lines`: `productId`, `variantId`, `productName` (null once the product is deleted for good), `optionIds`, `expected`, `counted`, `difference`, and with `inventory:manage` also `unitCost` (the average cost when counted; null is unknown) and `value`. `not_found` for another shop's check. |
| GET | `/api/v1/inventory/figures` | session/secret, `inventory:manage` | `?dateFrom=&dateTo=` (YYYY-MM-DD, whole Asia/Dhaka days, both included; by default the first of this month to today) (INV-18): `stockValue { value, unknownCost }` (now, at average cost), `costOfGoodsSold { value, movements, unknownCost }` (sales in the period at the cost each recorded, INV-11) and `losses { value, movements, unknownCost, byReason[] }` (every other outgoing movement, by reason). A movement or variant with no cost adds nothing and is counted in `unknownCost`. |
| GET | `/api/v1/products/:id/variants/:variantId/purchases` | session/secret, `inventory:read` | `?page=&limit=` (20 by default): the variant's deliveries, newest first (PUR-09): `receiptId`, `purchaseOrderId`, `number`, `supplier`, `receivedAt`, `accepted`, `rejected`, `rejectReason`, and with `inventory:manage` the `unitCost`. A product sharing its stock is bought by its shared stock, so a size drawing on it is `conflict`; ask by the shared stock's `variantId`. |
| GET | `/api/v1/suppliers` | session/secret, `inventory:read` | `?q=&archived=&page=&limit=` (20 by default): the live suppliers by name, A to Z, or with `archived=true` the archived ones; `q` finds a name containing it, ignoring case (PUR-01). Each: `id`, `name`, `phone`, `email`, `postalAddress`, `notes`, `archived`, `createdAt`, `updatedAt`. |
| POST | `/api/v1/suppliers` | session/secret, `inventory:manage` | `{ name, phone?, email?, postalAddress?, notes? }` (PUR-01); a detail left blank is cleared. A name a live supplier already has, ignoring case, is `conflict` on `name`. In the activity log. |
| GET | `/api/v1/suppliers/:id` | session/secret, `inventory:read` | One supplier. `not_found` for another shop's. |
| PATCH | `/api/v1/suppliers/:id` | session/secret, `inventory:manage` | Any of the details, and `archived`: archived, a supplier is no longer offered for new purchases and its past ones still show its name; `false` brings it back (`conflict` on `name` if a live one took the name meanwhile). Never deleted. In the activity log. |
| GET | `/api/v1/purchase-orders` | session/secret, `inventory:read` | `?status=&supplierId=&page=&limit=` (20 by default): the shop's purchases, newest first (PUR-02). Each: `id`, `number` (null for a draft), `status` (`draft`, `ordered`, `partially_received`, `received`, `closed_short`, `cancelled`), `supplier { id, name }` or null, `expectedOn`, `createdAt`, `orderedAt`, `items` (how many), and with `inventory:manage` also `total` (quantity times unit cost, each item rounded to the paisa) and `unknownCost` (items with no cost, not in the total). |
| POST | `/api/v1/purchase-orders` | session/secret, `inventory:manage` | `{ supplierId?, expectedOn?, notes?, items: [{ variantId, quantity, unitCost? }] }`, 1 to 200 items, each variant once (PUR-02): saved as a `draft`, with no number. `quantity` is in the product's stock unit, whole unless it is measured (UOM-03); a product sharing its stock is bought by its shared stock's `variantId` (INV-24), never by one of its sizes. A made-to-order product, a retired variant, another shop's variant and an archived supplier are refused per field, and then nothing is saved. In the activity log. Returns the purchase, as `GET /purchase-orders/:id` does. |
| GET | `/api/v1/purchase-orders/:id` | session/secret, `inventory:read` | One purchase and its `items`: `id`, `productId`, `variantId`, `productName` (null once the product is deleted for good), `optionIds`, `sharedStock`, `stockUnit`, `quantityOrdered`, `quantityReceived`, `outstanding`, and with `inventory:manage` also `unitCost` and `total`; with the purchase's `notes`, `updatedAt`, `closeReason`, `total` and `unknownCost`, and its `receipts`, oldest first: `id`, `receivedAt`, `actor`, `note`, and `items` (`itemId`, `accepted`, `rejected`, `rejectReason`, `batch { id, batchCode, expiresOn }` or null, and with `inventory:manage` the `unitCost`). The outstanding quantity of a placed, open purchase is its variants' `incoming` stock (PUR-05). `not_found` for another shop's. |
| PATCH | `/api/v1/purchase-orders/:id` | session/secret, `inventory:manage` | Any of `supplierId`, `expectedOn`, `notes`, and `items`, the whole list as it should now be (an item kept, matched by its variant, keeps its `id`). The items and supplier change until the first delivery is received, and after it only the expected date and notes (`conflict`); a received, closed or cancelled purchase never changes (`conflict`). In the activity log. |
| POST | `/api/v1/purchase-orders/:id/place` | session/secret, `inventory:manage` | Places a draft with the supplier: `ordered`, with `orderedAt` and the shop's next `number`, gap-free (PUR-03; a draft deleted takes none, and two placed at once get consecutive numbers). Its items and supplier are checked again (`conflict` per field for one no longer allowed). `conflict` for one already placed. In the activity log with its number. |
| POST | `/api/v1/purchase-orders/:id/cancel` | session/secret, `inventory:manage` | Cancels a placed purchase with nothing received: `cancelled`, no longer incoming. `conflict` for a draft (deleted instead), for one with a delivery received, even one rejected in full (closed short instead), and for one already finished. In the activity log with its number. |
| POST | `/api/v1/purchase-orders/:id/receipts` | session/secret, `inventory:manage` | `{ items: [{ itemId, accepted, rejected?, rejectReason?, unitCost?, batch?, batchId?, serials? }], note? }`, each item once (PUR-04): one delivery against a placed, open purchase (a draft is `conflict`, place it first; a finished one is `conflict`). Accepted units go into stock as one `purchase_receipt` movement per item, naming the receipt, into a batch (`batch` or `batchId`, as for stock additions, INV-12) and with their serials (at most one per unit, INV-14). Rejected units need a `rejectReason` and stay outstanding. Accepted and rejected together never exceed what is still to come on the item. `unitCost` left out is the item's; `null` is unknown; a cost is taken into the average (INV-10). Refused per field: an item not on this purchase, one whose product has changed since (made to order, deleted for good, sharing differently; close short instead), more than outstanding, a fraction of a whole-unit product, a batch or serials with nothing accepted. The purchase becomes `received` once every item is, `partially_received` once any has stock received; a delivery rejected in full leaves it as it was. Two deliveries at once take turns. A receipt never changes (PUR-08). In the activity log. Returns the purchase. |
| POST | `/api/v1/purchase-orders/:id/close` | session/secret, `inventory:manage` | `{ reason }` (PUR-06): closes a placed, open purchase that has had a delivery short: `closed_short`, with `closeReason`; what is still to come is dropped from incoming, and stock is not touched. `conflict` with nothing received yet (cancel it instead), for a draft, and for one already finished. In the activity log with its number. |
| DELETE | `/api/v1/purchase-orders/:id` | session/secret, `inventory:manage` | Deletes a draft and its items. A placed purchase is kept (`conflict`; cancel it instead). In the activity log. |
| PUT | `/api/v1/products/:id/delivery-zones` | session/secret, `products:manage` | `{ zoneIds }`: the zones the product may be delivered to (DLV-07); an empty list lifts the limit. A zone the shop does not have is `not_found`. Duplicating the product copies its limit. Refusing an order outside the limit comes with order creation (Phase 4). |
| DELETE | `/api/v1/products/:id/size-chart` | session/secret, `products:manage` | Removes the product's own chart, so its category's shows again. Removing none is not an error. |
| GET | `/api/v1/categories` | session/secret, `products:read` | The tree, top level first: each category with its parent, depth, slug, visibility, product count, suggested attribute ids, `behavesLike` and its own `sizeChart` rows (or null). |
| POST | `/api/v1/categories` | session/secret, `products:manage` | `{ name, parentId?, sortOrder?, visible?, behavesLike? }`, up to four levels deep (PRD-03). `behavesLike` is a preset key (PST-06); an unknown one is `not_found` on the field. |
| PATCH | `/api/v1/categories/:id` | session/secret, `products:manage` | Rename, move (with everything under it), reorder, show or hide. The slug stays. |
| DELETE | `/api/v1/categories/:id` | session/secret, `products:manage` | Refused with the count while it has sub-categories or products; `?products=uncategorize` moves its products to Uncategorized (PRD-03). |
| PUT | `/api/v1/categories/:id/attributes` | session/secret, `products:manage` | `{ attributeIds }`: the attributes suggested for its products, in order (ATR-02, ATL-05). Suggestions only. |
| PUT | `/api/v1/categories/:id/size-chart` | session/secret, `products:manage` | `{ rows }`, as for a product: shown on every product filed under it, or under a category below it, that has no chart of its own (PRD-17). |
| DELETE | `/api/v1/categories/:id/size-chart` | session/secret, `products:manage` | Removes the category's chart. |
| GET | `/api/v1/attributes` | session/secret, `products:read` | The platform's attributes and the shop's own, each with `scope` and its options; `?includeRetired=true` for retired ones too (ATL-01, ATR-10). |
| POST | `/api/v1/attributes` | session/secret, `products:manage` | `{ name, dataType, unitKind? }`: one of the shop's own attributes (ATR-01). A name the shop already sees is `conflict` with `details.attributeId`, the one to use. |
| PATCH | `/api/v1/attributes/:id` | session/secret, `products:manage` | Rename or retire the shop's own attribute; a platform one answers `not_found`. Its type never changes. |
| POST | `/api/v1/attributes/:id/options` | session/secret, `products:manage` | `{ value, swatchColor? }`: the shop's own value of an attribute with options, its own or the platform's. A number with a unit takes a number in its kind's base unit (UOM-02). `swatchColor` is `#RRGGBB`, stored upper-case (ATR-18). A value already there is `conflict` with `details.optionId`. |
| POST | `/api/v1/attributes/:id/options/batch` | session/secret, `products:manage` | `{ values }` (1 to 50): several values at once, as tapping an option set adds them (ATR-16). Returns the options in the order given; a value the shop already sees, the platform's (with its swatch) or its own, is reused rather than doubled, and one of its own it had retired comes back. |
| PATCH | `/api/v1/attributes/:id/options/:optionId` | session/secret, `products:manage` | Rename, re-colour (`swatchColor`, null clears it) or retire the shop's own value. |
| GET | `/api/v1/option-sets` | session/secret, `products:read` | The option sets (ATR-16): the platform's, those for the shop's own type first, then the shop's own. Each `{ id, name, options, scope, presetKey }`. |
| POST | `/api/v1/option-sets` | session/secret, `products:manage` | `{ name, options }`: one of the shop's own sets, its values once each. A name the shop already sees, its own or the platform's, is `conflict`. |
| DELETE | `/api/v1/option-sets/:id` | session/secret, `products:manage` | Deletes one of the shop's own sets; a platform set answers `not_found`. Values already inserted from it stay. |
| GET | `/api/v1/presets` | session/secret, `products:read` | The shop types and the defaults each gives a new product (PST-01, PST-02). The same for every shop. |
| GET | `/api/v1/product-defaults` | session/secret, `products:read` | What a new product starts with in this shop, from its business type ("Other" when none is chosen); with `?categoryId=`, from the type of that category or the nearest one above it that behaves like one (PST-06), with the category's own suggested attributes first. Carries `presetKey` (the type the defaults come from), `fromCategoryId` (the category that chose it, or null) and `upFrontFields`, the optional product-form fields shown before "More settings" (PST-05). A category the shop does not have is `not_found`. |
| PUT | `/api/v1/business-type` | session/secret, `settings:manage` | `{ businessType }`: a preset key, or null. Existing products keep their settings (PST-03). |
| GET | `/api/v1/locations` | session (any member of the shop); public key from Slice 8 | The canonical zilla/thana list (CUS-08), the same for every tenant: `{ cities: [{ code, nameEn, nameBn }], zillas: [{ id, nameEn, nameBn, thanas: [{ id, nameEn, nameBn, cityCode }] }] }`, 11 cities, 64 zillas, 572 thanas. A thana's `id` is what zones and (from Phase 4) orders hold. **Built in Slice 1c** for the dashboard; the public storefront reads it with a public key once keys exist (Slice 8). |
| GET | `/api/v1/delivery-zones` | session/secret, `products:read` | The delivery settings (DLV-05): `{ homeArea: { kind: city\|zilla\|thanas, label }, zones, maxZones }`. Each zone: `id`, `name` (the tenant's own, or null while it follows the home area), `label: { en, bn }` (what to show, "Inside Dhaka city" / "ঢাকা সিটির ভিতরে"), `charge`, `isHome`, `isFallback`, `noDelivery` (DLV-06) and its `areas` (`zillas`, `cities`, `thanas`). A shop gets its two default zones the first time anything reads or writes them. |
| GET | `/api/v1/delivery-zones/resolve` | session/secret, `products:read` | `?locationId=`: the zone a thana falls in and why (`matchedBy`: thana, city, zilla or fallback), DLV-02. The same rule order pricing uses (ORD-06a, Phase 4). |
| PUT | `/api/v1/delivery-zones/home-area` | session/secret, `settings:manage` | `{ areas: { cityCodes } \| { zillaIds } \| { locationIds } }`: one city, one district, or the tenant's own thanas (DLV-01). Refills the home zone, keeps both charges, and renames the two zones only while they follow the home area. An area another zone holds is `conflict`, with `details.zoneIds`. |
| POST | `/api/v1/delivery-zones` | session/secret, `settings:manage` | `{ name, charge, noDelivery?, areas: { zillaIds?, cityCodes?, locationIds? } }`: another zone, up to 20 in all (`conflict` past that). No area may be in two zones (`conflict` naming each one); a different level is a different area, so a district may sit in one zone and its city in another. |
| PATCH | `/api/v1/delivery-zones/:id` | session/secret, `settings:manage` | `{ name?, charge?, noDelivery? }`. A null `name` puts the home or fallback zone back on its automatic name; other zones always have one. Existing orders keep their stored charge (DLV-04). |
| PUT | `/api/v1/delivery-zones/:id/areas` | session/secret, `settings:manage` | `{ areas }`: replaces one of the shop's own zones' areas. The home zone's areas are set through the home area, and the fallback has none (`conflict` for either). |
| DELETE | `/api/v1/delivery-zones/:id` | session/secret, `settings:manage` | Deletes one of the shop's own zones. The home and fallback zones never go (`conflict`), and neither does a zone a product's delivery limit names (`conflict`, with `details.products: [{ id, name }]`, DLV-07). |
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
| POST | `/api/v1/billing/quote` | session, `payments:manage` | `{ planId, billingTermId }` → prices a purchase or a renewal of the tenant's current plan (picked automatically, not a separate endpoint) — a `control.plan_payments` row in `pending` (`kind: purchase` or `renewal`). A renewal's `amount` includes every add-on of the period being renewed that is set to renew, at the catalogue's price now times its quantity and the term's months (PLN-14); each is a pending purchase on the payment, started with the new period once paid, and an invoice line of its own. Paid from the balance, it is charged as two ledger entries: `plan_payment` and `addon`. |
| POST | `/api/v1/billing/purchase` | session, `payments:manage` | `{ paymentId, method: 'balance'\|'wallet', transactionId?, senderNumber?, amountPaid? }` — `'balance'` activates the plan at once; `'wallet'` enters the operator's payment-queue review (§18). |
| GET | `/api/v1/billing/invoices` | session, `payments:read` | Available in every lifecycle state, including after deletion (BIL-13). Each invoice carries its `lines` (`{ kind: 'plan' \| 'addon' \| 'credit', description, quantity, amount }`, adding up to its amount; none on invoices issued before 2026-10-22), and an add-on's own invoice (`kind: 'addon'`) names no plan or term (BIL-12, PLN-14). For the owner, also the invoices of their earlier, deleted shops, each with `earlierShop: true` (LIF-21); staff see this shop's only. |
| GET | `/api/v1/billing/invoices/:id` | session, `payments:read` | One invoice, including its plan-limits snapshot at the time (BIL-12); the owner may also open an earlier, deleted shop's invoice (`earlierShop: true`). Each invoice also states `shopName`, `ownerName`, `planName`, `planVersion`, `periodStart`, `periodEnd`, `discountAmount`, `paymentMethod` (`balance`\|`wallet`) and `paymentReference` (the wallet transaction ID), as at issue; all but `discountAmount` are null on invoices issued before 2026-10-18. |

---

## 9. Operator console

Entirely separate base path and session type.

**ADM-08, 2026-10-20:** every operator change below (plans and their prices, billing terms, platform wallets, rates,
settings, limit overrides, plan assignment, suspend and restore, the platform library, backup codes) writes its
platform audit entry in the change's own transaction, so a change that stands always has its entry, and one that
fails leaves neither.

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
| GET | `/api/v1/operator/addons` | operator | The add-on catalogue, retired items included (PLN-13). |
| POST | `/api/v1/operator/addons` | operator | `{ key, kind, limitKey?, unitSize?, price, labelEn, labelBn }`: a limit add-on or a pack names the limit it raises and how much one adds, in that limit's unit; a feature names neither, and its key is the plan feature it switches on. `price` is whole taka -- a month, or one pack. A taken key is a field error. Audited (ADM-08). |
| PATCH | `/api/v1/operator/addons/:id` | operator | Any of `price`, `unitSize`, `labelEn`, `labelBn`; applies to the next purchase, never one already made. Audited. |
| POST | `/api/v1/operator/addons/:id/retire` | operator | No longer for sale; what shops bought runs to its end (PLN-13). Audited. |
| GET | `/api/v1/operator/tenants/:tenantId/limit-overrides` | operator | A tenant's own per-limit overrides (PLN-11). |
| POST | `/api/v1/operator/tenants/:tenantId/limit-overrides` | operator | `{ limitKey, value, reason }` — reason required. |
| DELETE | `/api/v1/operator/tenants/:tenantId/limit-overrides/:limitKey` | operator | Removes one override. |
| GET | `/api/v1/operator/rates` | operator | |
| GET | `/api/v1/operator/rates/:key/history` | operator | Every change to one rate (RAT-09). |
| PATCH | `/api/v1/operator/rates/:key` | operator | `{ value, noticeId? }` — immediate effect, never retroactive (RAT-02). |
| GET | `/api/v1/operator/presets` | operator | The shop-type presets with their defaults, suggestions and up-front fields (PST-04). |
| PATCH | `/api/v1/operator/presets/:key` | operator | Any of `labelBn`, `labelEn`, `defaultStockUnit`, `defaultBatch`, `defaultSerial`, `defaultSerialFormat` (`imei` or `any`), `defaultNotTracked`, `defaultLowStock`, `suggestedAttributeIds` (platform attributes only), `suggestedCategories`, `upFrontFields` (PST-04, PST-05). Batches and serials together are refused. Applies to the next product created, never an existing one (PST-03). Audited. |
| GET | `/api/v1/operator/attributes` | operator | The platform's attributes with their platform values, retired ones included (ATL-01). Shops' own are never listed here. |
| POST | `/api/v1/operator/attributes` | operator | `{ name, dataType, unitKind? }`: a platform attribute every shop sees. Audited. |
| PATCH | `/api/v1/operator/attributes/:id` | operator | Rename or retire a platform attribute; its type never changes. Audited. |
| POST | `/api/v1/operator/attributes/:id/options` | operator | `{ value, swatchColor? }`: a platform value (ATR-18). Audited. |
| PATCH | `/api/v1/operator/attributes/:id/options/:optionId` | operator | Rename, re-colour or retire a platform value. Audited. |
| GET | `/api/v1/operator/option-sets` | operator | The platform's option sets (ATR-16). |
| POST | `/api/v1/operator/option-sets` | operator | `{ name, options, presetKey? }`: a platform set, offered first to shops of `presetKey`'s type. Audited. |
| PATCH | `/api/v1/operator/option-sets/:id` | operator | Rename, change its values or its shop type. Audited. |
| DELETE | `/api/v1/operator/option-sets/:id` | operator | Deletes a platform set; values shops already inserted from it stay. Audited. |
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
| POST | `/api/v1/billing/upgrade/quote` | session, `payments:manage` | `{ planId, billingTermId }` → credit, amount due (UPG-03..06). Only valid while `active` with a live period and a real current plan; refused otherwise. The amount due includes extending each add-on set to renew from its own end to the new period's end, at the new term's rate (UPG-14); an add-on with its renewal off keeps its end. |
| POST | `/api/v1/billing/upgrade/confirm` | session, `payments:manage` | `{ paymentId, method: 'balance'\|'wallet', transactionId?, senderNumber?, amountPaid? }` — same two-method shape as `billing/purchase`; applies at once on a balance confirmation (UPG-09..12). Only one pending upgrade per tenant (UPG-08, `conflict`). |
| POST | `/api/v1/billing/downgrade/preview` | session, `payments:manage` | `{ planId }` → the limits currently over the target plan (DWN-03), each `{ key, used, limit }` for `staff`, `products` and `storage_mb` (used in whole MB), judged by the target's limits with the shop's overrides — informational, never blocks scheduling. |
| GET | `/api/v1/billing/downgrade/checklist` | session, `payments:read` | `{ checklist }`: the last downgrade's 30 days (DWN-12, DWN-14) — `{ downgradedAt, endsAt, items: [{ key, used, limit, fixed }], finalWarningAt }`, each limit it left the shop over ticked off live as it is fixed; `null` when nothing was left over, or once the 30 days have passed with everything fixed. Kept apart from `GET /billing/downgrade`, which the dashboard reads as the scheduled change or `null`. |
| POST | `/api/v1/billing/downgrade/schedule` | session, `payments:manage` | `{ planId }` → schedules for period end (DWN-01). |
| POST | `/api/v1/billing/downgrade/cancel` | session, `payments:manage` | Cancels a scheduled downgrade or pay-as-you-go switch before it takes effect (DWN-04). No body. |
| GET | `/api/v1/billing/downgrade` | session, `payments:read` | The scheduled change (`kind: 'downgrade' \| 'pay_as_you_go_switch'`; `targetPlanId` is null for a switch), or `null` when nothing is scheduled (DWN-02). |
| POST | `/api/v1/billing/pay-as-you-go` | session, `payments:manage` | Choose pay-as-you-go (PYG-01). No body. `active` with a running period → `{ effective: 'period_end', effectiveAt }`, scheduled like a downgrade and replacing one (PYG-10). `grace`/`read_only`/`locked`/`archived`, or `active` with no running period → `{ effective: 'now', effectiveAt: null }`, restored at once (LIF-15). Trial, already pay-as-you-go or deleted → `409 conflict`. Open in every lapsed state. |
| POST | `/api/v1/billing/cancel` | session, `payments:manage` | Cancels at period end (LIF-01). No body. |
| POST | `/api/v1/billing/close` | session, owner only | Closes a pay-as-you-go shop now (PYG-09): `archived` at once, balance frozen, data deleted 60 days later after warnings at days 45 and 57. The owner gets an SMS and an email naming the deletion date. Any other state answers `409 conflict`; a staff member gets `403 forbidden`. Choosing pay-as-you-go or buying a plan reopens it (LIF-15). No body. |
| POST | `/api/v1/billing/cancel/undo` | session, `payments:manage` | Undoes a cancellation before period end (LIF-01). No body. **No corresponding GET exists** — there is currently no way to read back whether a cancellation is pending; both actions are fire-and-forget from the client's own point of view. |
| | | | Switching *from* pay-as-you-go *to* a subscription plan (PYG-11) has no endpoint of its own — it is a plain `billing/quote` + `billing/purchase` call (§8) at full price, no credit line, exactly as any other purchase. |
| GET | `/api/v1/addons` | session, `payments:read` | The add-ons for sale (PLN-13), each `{ addon, price, expiresAt }`: `price` is whole taka for one, from now to the running period's end (PLN-14) -- or, on pay-as-you-go or a no-expiry plan, a month at the full price for the add-on's own 30 days -- and `expiresAt` that end; both `null` where the shop can't buy it now -- a trial, a lapsed shop, a limit already unlimited (PLN-19), or a feature it already has. A pack's `price` is its own, whole, and its `expiresAt` is `null`: it never expires (PLN-13). |
| GET | `/api/v1/addons/mine` | session, `payments:read` | `{ addons, brandIdentity, packs }`: the add-ons counting now -- including, through grace, those that ended with the plan's period (LIF-05) -- each with its quantity, its end, its `renews` switch, `renewal` -- `with_plan`, `from_balance` (its own 30 days, renewed at its end), `off`, `retired`, `unlimited` (the plan leaves it nothing to raise or switch on) or `balance_short` (set to renew from the balance, which is short of it today) -- and `endsSoon`, true within 7 days of an end it will not renew past (the dashboard's banner); and whether the shop may switch its brand identity on: bought, or included in its plan (BRN-05); and `packs`, one `{ metric, left, autoBuy }` each for `bandwidth` (bytes) and `requests`: what is left of the shop's packs and its auto-buy switch (PLN-15). |
| PATCH | `/api/v1/addons/mine/:id` | session, `payments:manage` | `{ renews }`: the add-on's renewal switch (PLN-14), audited. Answers the add-ons as they now stand. `404` for another shop's add-on, `409` once it has ended. |
| POST | `/api/v1/addons/packs` | session, `payments:manage` | `{ addonId, quantity? }` (1 to [10]) → `{ payment, invoice }`: buys packs from the balance at once, with no quote (PLN-15); the cycle's allowance grows by them, and one bought during the grace adds its full amount on top of what is used (BND-03). The invoice is kind `addon` with one line and no period. Idempotent. `404` for an item that is not a pack or is retired, `402 plan_feature_unavailable` for a shop that may not buy add-ons (PLN-14), `429 quota_exceeded` for too little balance. |
| PATCH | `/api/v1/addons/auto-buy` | session, `payments:manage` | `{ bandwidth?, requests? }`, at least one: the auto-buy switches (PLN-15), audited. With one on, reaching the allowance buys one pack from the balance, up to [3] a cycle, and emails the owner; a short balance buys none and emails the owner. Answers `packs` as `addons/mine` does. |
| POST | `/api/v1/addons/quote` | session, `payments:manage` | `{ addonId, quantity? }` (1 to [10], a feature only 1) → `{ payment, addon, quantity, expiresAt }`: a `plan_payments` row of kind `addon`, priced to the period's end and held 30 minutes (BIL-09). Refused `402 plan_feature_unavailable` with no running paid period, `409 conflict` for an unlimited limit or a feature already held, `404` for a retired item. |
| POST | `/api/v1/addons/purchase` | session, `payments:manage` | `{ paymentId, method?, transactionId?, senderNumber?, amountPaid? }` → `{ payment, invoice }`, the same shape as `billing/purchase` with `method` defaulting to `balance`. From the balance (BIL-08) the add-on counts at once, until the end of the paid period running then; its invoice is kind `addon` with one line and no plan (BIL-12). By wallet (BIL-02) the payment waits in the operator's queue and `invoice` is `null`; approving it activates the add-on into the period running at approval, never shorter than quoted and never re-priced, or, if the shop can no longer take it, credits the amount to its balance as a top-up and tells the owner why (PLN-14). Idempotent. `409` once the hold has passed or for a feature bought meanwhile; `429 quota_exceeded` for too little balance. The plan routes refuse an add-on's payment. |
| GET | `/api/v1/usage` | session, `payments:read` | Every metric against its limit, for the usage page (LIM-02): products, seats, storage, bandwidth (with each day), the cycle's API requests and the free essential SMS, each `{ metric, used, limit, unit, perCycle, level, packLeft, stopAt }` with `limit: null` for unlimited -- for bandwidth and requests the cycle's allowance, the shop's own limit with its packs (PLN-15) -- `level` the highest share reached (50, 80, 95, 100, or `stopped` past the grace) for the banner, `packLeft` what is left of the packs (`null` for a metric with none) and `stopAt` where a metric that serves shoppers stops, the allowance and the grace of the shop's own limit (`null` otherwise); the cycle's start and end; `suggestions` (`{ first, alternative }`, each a plan with its price and term, limit add-ons and packs on the shop's own plan -- `{ kind: 'addons', items: [{ addonId, key, name, quantity, monthly }], monthly }` -- or `contact`) once any metric is at 80% or more, add-ons judged by the shop's plan's price a month with theirs added, and the next plan first once packs were bought for a metric two cycles running; `fastSpendAlertedAt` (RTE-12); and `packs`, one `{ metric, offer, autoBuy, autoPacks, autoBuyFailed }` each for bandwidth and requests: the pack for sale (`{ addonId, name, price }`, or `null`) and how auto-buy stands this cycle. A `plan_limit_reached` refusal for products, seats or storage carries the same `suggestions` in its `details`, beside its `metric`. |

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
| GET | `/api/v1/operator/payment-queue` | operator | `control.plan_payments` rows (`kind`: `top_up`/`purchase`/`renewal`/`upgrade`/`addon`) plus Phase 5's shopper "I have paid" claims, all awaiting review (ADM-06/17, D2-1). The one operator queue for every pending-payment flow in §8/§9/§11. Each row lists the `addons` it pays for -- `{ id, key, labelEn, labelBn, quantity, price, status, startsAt, expiresAt }` -- an add-on's own, or those a renewal or upgrade carries, so the operator sees what the money is for. |
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
