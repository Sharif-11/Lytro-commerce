# Phase 3 plan: catalogue, inventory, purchasing, media, storefront

Status: draft for discussion, 2026-10-17. Builds on `IMPLEMENTATION-PLAN.md` Phase 3, with three changes
agreed before this plan was written:

- **The product model** adopts the attribute library (ATL) and units of measure (UOM) from
  `PRODUCT-MODEL-PROPOSAL.md`. Tax (TAX), menus (MNU) and formula pricing (FPR) are adopted into the SRS but
  scheduled after this phase.
- **Inventory** becomes a full inventory system — a stock ledger, purchasing, batches/expiry, serials and
  reserve-then-expire — that sits behind deliberately simple, everyday-language screens (INV-22).
- **Shop-type presets** (PST) let one product model serve clothing, cosmetics, grocery, electronics and
  other shops through defaults only, never through locked behaviour.
- **Product landing pages** (LND, added later the same day) give every product a dedicated, shareable,
  single-product sales page with its own order form, payment by the product's payment policy, and Meta
  ad tracking. This phase builds the page; its ordering and payment land in Phases 4 and 5.

Requirement IDs refer to `SRS-detailed.md` §13–§14 (new §14.4–§14.12 added 2026-10-17). Schema refers to
`DATABASE-SCHEMA.md` §3.2, rewritten the same day.

Items marked **Decision** need your answer before the slice they affect starts. Items marked **Proposed** take
effect unless you change them.

---

## 1. Goal and exit criteria

**Goal.** A tenant can build its catalogue — products, variants, attributes, images — keep honest stock
through a full inventory system (stock in through purchasing, stock out through reservations, every change
in a ledger) without needing to know inventory terminology, and an anonymous visitor can browse the
tenant's storefront, or open any product's shareable landing page, fast and cached, in both languages.
No orders flow yet. Phase 4 plugs orders into the
reservation and catalogue machinery this phase builds, and changes neither.

**Phase 3 is complete when all of these hold:**

1. Every requirement in §3.1 ("completed by this phase") has a passing automated test, or, for `MAN`
   requirements, a recorded manual check.
2. The inventory invariant holds under concurrency, proven by test: for every variant, `on_hand` = the sum
   of its stock movements and `reserved` = the sum of its active reservations (INV-05), and concurrent
   reservations can never take `available` below zero (INV-01).
3. **The inventory golden path** (the analogue of Phase 2's P2-E32) passes as one test, for one tenant with
   no manual steps:
   cosmetics preset → product with shade variants → quick "Add stock" with cost and expiry → planned
   purchase received short with rejects → reserve → consume (earliest expiry first) → release → expire an
   unpaid reservation → stock check finding a loss.
   At every step the ledger, the levels, the batches and the average cost all agree.
4. The `IMPLEMENTATION-PLAN.md` milestone: a tenant adds products with images, and an anonymous visitor
   browses the storefront with no login, fully cached, in Bangla and English. A price change is publicly
   visible within 60 seconds with edge purging disabled (CCH-04). Every product's landing page loads with
   a rich link preview, keeps working with the storefront switched off, and survives a product rename.
5. Media is metered per tenant: storage and bandwidth are counted, enforced at 100% with existing data
   untouched (LIM-03), and reconciled against R2 (MED-04).
6. CI is green on `main`, and the pull-request flow has been used for every slice.

---

## 2. Decisions needed

| # | Decision | Proposed | Affects |
|---|---|---|---|
| D3-1 | **The storefront and the public catalogue are read through public API keys** (API-07, SFT-11, RTE-01/07), but `IMPLEMENTATION-PLAN.md` puts `API-01`–`API-23` in Phase 8. Without keys, Phase 3's public endpoints have nothing to authenticate or rate-limit against. | **Pull a public-key subset forward into this phase:** creating public keys with registered origins, bearer auth, revocation and expiry, origin checks/CORS, and two-key rotation (API-01 public half, API-03/04/05/08/10/23/24, API-07 catalogue half). Secret keys, scopes, webhooks and OpenAPI stay in Phase 8. | Slice 8 |
| D3-2 | **Rate limits (RTE-*) are specified on a shared Redis instance (RED-02/03)**, which `IMPLEMENTATION-PLAN.md` builds in Phase 9. There is one application server until then. | Build the limiter behind one interface: per-minute and per-IP windows in process memory for now (RED-05's own fallback behaviour, exact while there's one server), and monthly quota counters flushed to PostgreSQL every 60 s (RED-04's pattern). Phase 9 swaps in the Redis adapter with no caller change. | Slice 8 |
| D3-3 | **The order-handling quota (QTA-01–07)** is listed in Phase 3 by `IMPLEMENTATION-PLAN.md`, but every QTA rule counts on order *handling* (courier booking or marking shipped), and orders don't exist until Phase 4. | Move QTA-01–07 to Phase 4 (the manual mark-shipped trigger, ORD-09); Phase 6 adds the courier-booking trigger. Nothing in this phase builds or tests QTA. | Scope |
| D3-4 | **Media infrastructure**: R2 and a Cloudflare Worker (MED-01/02, BND-01) are real cloud services, and developers and CI need to run without them. | A `MediaStorage` port with an R2 adapter (staging/production) and an S3-compatible local adapter (MinIO in docker-compose) for dev/CI. The Worker's code lives in-repo (`apps/media-worker`), unit-tested with Miniflare, plus a thin in-process stand-in of the same metering contract for server e2e tests. Same stub-provider precedent as D6. | Slices 6, 7 |
| D3-5 | **Notices to the tenant** — low stock (INV-08), expiry (INV-13), limit thresholds (LIM-01, BND-05, RTE-03) — need in-app and push delivery, which is Phase 7's notification module (NTF). | Deliver through a `TenantNotifier` port with a console stub, exactly as `BAL-13` did in Phase 2 (D6 precedent). These requirements count as complete when the once-per-crossing logic is proven; Phase 7 swaps the adapter. | Slices 2, 3, 7, 10 |
| D3-6 | Reservation expiry for unpaid online orders (INV-16) — `[30]` minutes, meant to match the payment session lifetime, which Phase 5 fixes. | Store it as a platform setting (`reservation_expiry_minutes`, default 30). Phase 5 sets it from the real session lifetime. | Slice 5 |
| D3-7 | Module boundaries (`ENGINEERING-STANDARDS.md` §1). | New modules: **`catalogue`** (categories, products, variants, attributes, presets), **`inventory`** (levels, ledger, batches, serials, reservations, stock checks), **`purchasing`** (suppliers, purchase orders, receipts), **`media`** (uploads, processing, storage accounting), **`public-api`** (public keys, rate limiting, public catalogue). `inventory` depends only on `catalogue`; `purchasing` depends on `inventory`. Nothing depends on `purchasing`. | All |
| D3-8 | Shop-type preset list and defaults (PST-01/02). | See §6, Slice 1. The operator can edit presets later without a deploy (PST-04). | Slice 1 |
| D3-9 | Who may see cost and profit (INV-10/18). Profit is sensitive, and not every staff member should see it. | Cost, stock value and profit figures require `inventory:manage`; `inventory:read` sees quantities only. The owner always sees everything. | Slices 2, 11 |
| D3-10 | **Phase size.** At 12 slices, this is larger than Phase 2. | Keep it one phase, with an internal checkpoint after Slice 5 ("3A: catalogue and inventory complete, internally usable") before media and the storefront begin. If velocity suggests otherwise at the checkpoint, the remainder can become Phase 3B without reshuffling anything. | Planning |

---

## 3. Requirement coverage

Rules used below:
- **Completed** means every pass criterion is provable by the end of this phase.
- **Partial** means this phase builds a working part, and a named later phase finishes the rest.
- Notices delivered through the D3-5 stub count as complete, the same rule Phase 2 applied to `BAL-13`.

### 3.1 Completed by this phase (147)

| Family | Requirements | Count |
|---|---|---|
| PRD | PRD-01, 02, 03, 04, 05, 09, 10, 11, 12, 14, 15, 16 | 12 |
| ATR | ATR-01, 02, 03, 04, 05, 06, 10, 11, 12, 14 | 10 |
| ATL | ATL-01, 02, 03, 04, 05 | 5 |
| UOM | UOM-01, 02, 03 | 3 |
| INV | INV-01 – INV-14, INV-18, 19, 20, 21, 22 | 19 |
| PUR | PUR-01 – PUR-10 | 10 |
| PST | PST-01 – PST-04 | 4 |
| MED | MED-01 – 08, MED-10 – 13 | 12 |
| STO | STO-02 – 07 | 6 |
| BND | BND-01, 02, 03, 05, 06, 07, 08, 09 | 8 |
| RTE | RTE-01, 02, 03, 04, 05, 07, 10 | 7 |
| LIM | LIM-01, 03 | 2 |
| SFT | SFT-01, 02, 03, 04, 05, 11, 12, 14, 15, 16, 17, 18, 19, 21 | 14 |
| CCH | CCH-01 – 06, CCH-08 – 12 | 11 |
| I18N | I18N-02 (storefront half; dashboard half done in Phase 1) | 1 |
| TEN | TEN-06, 08, 16, 17 | 4 |
| DWN | DWN-07, 09 (deferred here from Phase 2) | 2 |
| PYG | PYG-16 (deferred here from Phase 2) | 1 |
| API | API-03, 04, 05, 08, 10, 23, 24 (public keys, D3-1) | 7 |
| LND | LND-01, 02, 03, 04, 05, 06, 14, 17, 18 | 9 |
| | **Total** | **147** |

### 3.2 Partially completed by this phase (31)

| Req | Done in this phase | Remaining | Finished in |
|---|---|---|---|
| PRD-06 | inactive products hidden from the public catalogue | a public order containing one is refused; staff orders allowed | Phase 4 |
| PRD-07 | atomic reservation primitive, proven under concurrency (INV-15) | wired into order creation; failed creation restores | Phase 4 |
| PRD-08 | payment policy and advance amount stored per product | per-line advance and COD remainder computed at order creation | Phase 4 |
| PRD-13 | soft and hard delete of products and variants | proof that past orders still display after a hard delete | Phase 4 |
| ATR-07 | public catalogue exposes only available variants | order creation requires a variant ID | Phase 4 |
| ATR-08 | the captured-at-order-time attribute role exists | the value is entered and stored on the order line | Phase 4 |
| ATR-13 | variant weight/charge/mode overrides stored and resolved | used by order pricing (ORD-06) and courier booking (CRR-06) | Phases 4, 6 |
| ATR-15 | role change allowed while a product has no orders | blocked once orders exist (needs `order_lines`) | Phase 4 |
| INV-15 | reserve, consume (FEFO, serials) and release services | order lines hold their stock through it | Phase 4 |
| INV-16 | expiry job releases expired reservations | set on orders awaiting online payment; lifetime from the session | Phases 4, 5 |
| INV-17 | restock-or-damaged return service | the order return flow calls it | Phase 4 |
| MED-09 | delete removes object, row and usage; tenant prefix wiped at LIF-19 | the "N past orders will lose this photo" warning | Phase 4 |
| STO-01 | usage counts product, category and logo media; KYC excluded by design | chat media (Phase 7) and payment-proof images (Phase 5) counted | Phases 5, 7 |
| RTE-06 | per-IP total request limit | per-IP order-creation and shopper-OTP limits | Phase 4 |
| LIM-02 | usage page shows storage, bandwidth, requests, seats, products, essential SMS | orders and payment sessions | Phases 4, 5 |
| LIM-04 | counter accuracy for storage, bandwidth, requests | orders and sessions counters | Phases 4, 5 |
| SFT-10 | out-of-stock variants never offered | disabled payment methods never offered | Phase 5 |
| SFT-13 | shop name and logo on the storefront | chat widget | Phase 7 |
| CCH-07 | authenticated, session-bearing and cart requests bypass shared caches | order-time price and stock read from PostgreSQL | Phase 4 |
| CCH-13 | test that cookies and unknown parameters don't fragment the cache | hit-ratio monitoring and alerting | Phase 9 |
| I18N-01 | storefront defaults to Bangla with a full toggle | hosted payment page | Phase 5 |
| DWN-12 | the downgrade banner lists over-limit products and storage | per-period metrics added by later phases | Phases 4, 5 |
| DWN-14 | the final warning covers products and storage | same as DWN-12 | Phases 4, 5 |
| TRL-03 | trial limits for products, storage and bandwidth enforced | handled orders (Phase 4) and paired device (Phase 5) | Phases 4, 5 |
| PLN-19 | "unlimited" honoured for products, storage, bandwidth, requests | orders, sessions, paired devices | Phases 4, 5 |
| API-01 | public keys (name, registered origins, expiry) | secret keys, scopes, IP allow-list | Phase 8 |
| API-07 | public keys read the catalogue and categories | courier locations, orders, payment sessions, shopper OTP, chat | Phases 4–7 |
| API-21 | key creation and revocation audited | writes made with a key audited | Phase 4 |
| DAT-13 | full-text and trigram indexes for product search | phone/name search on orders and customers | Phase 4 |
| LND-13 | landing-page product content cached and fresh within 60 s | the order form's live price and stock read from PostgreSQL at submission | Phase 4 |
| LND-15 | Meta Pixel `PageView` and `ViewContent` fire on the landing page | `InitiateCheckout` and `Purchase`, which need the order form | Phase 4 |

### 3.3 Listed for Phase 3 but not built here

| Req | Why | Goes to |
|---|---|---|
| QTA-01 – 07 | counted at order handling, which needs orders (D3-3) | Phase 4 (manual trigger), Phase 6 (courier trigger) |
| RTE-08, RTE-09 | order creations and payment sessions per minute or period | Phases 4, 5 |
| BND-04, RTE-11 | auto-buy packs depend on add-ons (PLN-13–15), deferred since Phase 2 | with add-ons |
| SFT-06, 08, 09, 20 | checkout, tracking, shopper accounts, delivery estimate | Phase 4 |
| SFT-07 | hosted payment redirect | Phase 5 |
| ATL-06, UOM-04, ATR-09 | snapshotting and validation on order lines | Phase 4 |
| TAX-01 – 03, MNU-01 – 05 | adopted 2026-10-17, need order lines | with or after Phase 4 |
| FPR-01 – 04 | adopted 2026-10-17; needs only ATL, so it can land any time after Slice 1 | after Phase 3 |
| STA-02, STA-03 | read real order data (INV-18 provides the cost side) | Phase 4 |
| LND-07, 08, 09, 11, 12 | the landing page's order form: fields, live totals, submission through ORD-02, confirmation, per-IP limit | Phase 4 |
| LND-10 | payment by the product's policy: cash on delivery in Phase 4; advance and full prepayment through the hosted payment page in Phase 5 | Phases 4, 5 |
| LND-16 | the server-side Conversions API `Purchase` event fires when an order is created | Phase 4 |

### 3.4 Dependencies between requirements

Read each row as: the requirements on the left can only be built or proven once those on the right exist.

| Requirement(s) | Depend on | Why |
|---|---|---|
| ATR-01–06, 10, 14 | ATL-01–05 | the attribute library *is* their storage |
| ATR-04, ATR-05 | PRD-01 | variants belong to products |
| UOM-03 | UOM-01 | the unit decides whether fractions are allowed |
| INV-01, INV-02 | ATR-04/05, UOM-03 | stock is held per variant, in the product's unit |
| INV-05, 06, 07, 09, 11, 17, 18 | INV-03, INV-04 | all are reads of, or writes to, the ledger |
| INV-08 → CCH-08 → INV-19 → CCH-02 | — | low stock sets the public state, whose change bumps the catalogue version |
| INV-10 | PUR-04 | weighted-average cost is computed at receiving |
| INV-13 | INV-12 | expiry belongs to batches |
| PUR-04 | INV-03, INV-10, INV-12, INV-14 | a receipt writes movements, cost, batches and serials |
| PUR-05, PUR-06, PUR-07 | PUR-02, PUR-04 | incoming, closing short and quick add are views or shortcuts over purchase orders |
| INV-15, INV-16 | INV-01, INV-12, INV-14 | consuming a reservation draws batches FEFO and records serials |
| PRD-07 | INV-15 | order reservation uses the primitive (Phase 4) |
| PST-02 | UOM-01, INV-02, INV-08, INV-12, INV-14, ATR-02 | presets only set defaults for these |
| PRD-04, ATR-12 | PRD-01 | product counting |
| DWN-07, PYG-16, TRL-03, PLN-19 | PRD-04 | product-limit and product-fee consumers |
| STO-01–07, PRD-11, TEN-16, MED-04, MED-09 | MED-03 | every stored object passes through the upload pipeline |
| DWN-09 | STO-03 (storage half), BND-03 (bandwidth half) | downgrade reuses the same enforcement |
| BND-02, 03, 05, 06, MED-10 | MED-02, BND-01 | the Worker is the only place bandwidth is counted |
| RTE-01–07, 10 | API-01, 05, 08 (D3-1), D3-2 limiter | limits are counted per key, against a limiter store |
| PRD-09, PRD-10, CCH-01–12 | ATR-07, INV-19, API-07 | the public catalogue reads available variants and the version |
| CCH-09, CCH-11 | MED-08 | content-hashed thumbnails in the slim list payload |
| SFT-03, 04, 05, 10, 11, 15 | PRD-09, CCH-*, BND-01, RTE-* | the storefront is a client of the public API |
| SFT-14, TEN-17 | TEN-16 | the PWA icon and name come from the logo and shop name |
| LIM-01–04 | STO-02, BND-02, RTE-03, PRD-04 | the usage page reads every counter |
| LND-01, 03, 05, 13, 14 | PRD-09, CCH-01–04, MED-08 | the landing page is a client of the public catalogue and its images |
| LND-02 | TEN-08, SFT-12 | visibility follows the tenant, not the storefront switch (SFT-16) |
| LND-04, 06 | PRD-02 | the share link is the product slug, kept stable across renames |
| LND-15, 18 | LND-17 | tracking fires only once a pixel is configured |
| LND-07–12 (Phase 4) | ORD-02, ORD-06, CUS-08, API-11, RTE-06, INV-15 | the order form creates an ordinary order |
| LND-10 (Phases 4–5) | PRD-08, INV-16, PAY-01, SFT-07 | payment follows the product's policy through the hosted payment page |

---

## 3.5 Architecture for this phase

- **Five new server modules** (D3-7), each with ports and adapters, white-box service tests over the real
  database, and a few HTTP smoke tests — the same pattern every Phase 2 slice used:
  - `catalogue`, `inventory`, `purchasing`, `media`, `public-api`
  - The dependency direction is one-way: `public-api` → `catalogue`/`inventory`; `purchasing` →
    `inventory` → `catalogue`; `media` is a leaf.
- **One write path for stock.** Every stock change goes through a single `InventoryLedger.apply()`, the
  direct analogue of `BalanceService.applyDelta`:
  1. lock the stock level
  2. check the constraints
  3. write the movement
  4. update the level and the batches
  5. recompute the product's stock state
  6. bump the catalogue version when the state changes

  All six steps happen in the caller's transaction. Purchasing, reservations, stock checks and manual
  edits all call it, and nothing else writes `stock_levels`.
- **The variant matrix save** (ATR-11) is one transaction. It diffs the requested attributes and options
  against the stored ones, inserts and retires variants, rebuilds the combination keys, creates empty
  stock levels, and recomputes min/max price.
- **The public catalogue** (`public-api`) is read-only, keyed on (host, catalogue version, normalised
  query), and sits behind the rate-limit check (RTE-04/CCH-05).
- **The storefront** (`apps/storefront`, Next.js) is a pure client of the public API, using the tenant's
  public key resolved by host. It never holds a secret key (SFT-11).
- **Product landing pages** (`/l/<slug>`) live in the same storefront app, as a separate minimal route
  with no shop navigation. They are server-rendered so link-preview tags reach Facebook's crawler, and
  served even when the storefront is switched off (LND-02). Their order form (Phase 4) calls the same
  public order endpoint as checkout, so a landing-page order is an ordinary order with `source =
  landing_page`.
- **Ad tracking**: the tenant's Meta Pixel ID is public data rendered into the page; the Conversions API
  token is a secret, stored encrypted (SEC-10) and used only server-side from the job queue (Phase 4).
  This is the first per-tenant encrypted credential, so it sets the pattern courier and gateway
  credentials reuse in Phases 5–6.
- **The media Worker** (`apps/media-worker`) meters every request and every byte, checks tenant state and
  the blocked list, then serves from cache or R2 (MED-02).

## 4. Database work

All in `DATABASE-SCHEMA.md` §3.2 (rewritten 2026-10-17), plus:

| Area | Tables | Slice |
|---|---|---|
| Catalogue | `catalogue_state`, `categories`, `products`, `product_categories`, `product_images`, `product_variants` | 1 |
| Attributes | `attributes` (scope-aware RLS), `attribute_options`, `product_attributes`, `product_attribute_values`, `variant_attribute_values`, `category_attributes` + limit triggers | 1 |
| Presets | `control.business_type_presets`, `control.tenants.business_type` | 1 |
| Inventory | `stock_levels`, `stock_movements` (insert-only trigger), `stock_checks` | 2 |
| Batches, serials | `stock_batches`, `serial_numbers` | 3 |
| Purchasing | `suppliers`, `purchase_counters`, `purchase_orders`, `purchase_order_lines`, `purchase_receipts`, `purchase_receipt_lines` | 4 |
| Reservations | `stock_reservations` (order FK added in Phase 4) | 5 |
| Media | `media_objects` (MED-04: one row per object), `media_usage` | 6 |
| Bandwidth | `media_bandwidth_counters`, blocked-tenant list | 7 |
| API keys | `api_keys` (hashed, public subset), `api_key_origins`, `request_counters` | 8 |
| Landing links | `product_slug_redirects` (old slug → product, LND-04) | 1 |
| Ad tracking | `ad_tracking_settings` (pixel ID, encrypted Conversions API token, LND-15–17) | 9 |

New permissions in the validators' `Permission` enum: `inventory:read`, `inventory:manage`, `keys:manage`.
New platform settings: `reservation_expiry_minutes`, `expiry_warning_days`, and the cache lifetimes
(CCH-03).

## 5. API surface for this phase

- **Dashboard** (session + `DashboardGuard`): categories, products, variants, attributes, presets;
  stock levels, history, adjustments, stock checks, expiring batches, serials; suppliers, purchase orders,
  receipts, quick add-stock; media uploads; API keys; usage; ad-tracking settings.
- **Operator**: presets (PST-04), platform attribute library (ATL-01).
- **Public** (public key): catalogue lists, product detail (by slug, resolving old slugs to a redirect,
  LND-04), category tree, search, the catalogue-version endpoint (CCH-04), and the tenant's public
  pixel ID for landing pages.
- **Media host** (Worker): content-hashed public objects, signed private links.

---

## 6. Slices

Each slice is its own branch and PR, with a test-first verification of its requirements. Per the standing
rule, **dashboard and storefront UI land as one consolidated pass at the end (Slices 11, 12)**, after
every backend slice. Requirements verified as `E2E` are therefore finished in Slice 11 or 12, even when
their backend ships earlier.

### Slice 1: catalogue core — products, variants, attributes, units, presets
- **Depends on:** none in this phase (reads Phase 2's plan-limit machinery).
- **Delivers:** the catalogue and attribute tables; slugs; the category tree with an "Uncategorized"
  virtual bucket; the variant matrix save; data-layer limit triggers; product counting against plan
  limits; the pay-as-you-go product fee; and presets with this seed list:

  | Preset | Default unit | Batch | Serial | Not tracked | Suggested attributes |
  |---|---|---|---|---|---|
  | Clothing | piece | – | – | – | Size, Color, Fabric |
  | Shoes & bags | piece | – | – | – | Size, Color, Material |
  | Cosmetics | piece | on | – | – | Shade, Size, Skin type |
  | Electronics | piece | – | on | – | Brand, Warranty, Compatible models |
  | Mobiles & gadgets | piece | – | on | – | Storage, RAM, Color |
  | Grocery | kg | on | – | – | Pack size, Brand |
  | Food & bakery | piece | – | – | on | Size, Flavour |
  | Books & stationery | piece | – | – | – | Author, Publisher, Edition |
  | Pharmacy | box | on | – | – | Strength, Pack size |
  | Home & décor | piece | – | – | – | Color, Material, Size |
  | Other | piece | – | – | – | — |
  Slugs are fixed at creation and never follow a rename; a deliberate slug change records the old slug in
  `product_slug_redirects` (LND-04).
- **Requirements completed:** PRD-01, 02, 03, 04, 05, 14, 15, 16; ATR-01, 03, 04, 05, 06, 10, 12, 14;
  ATL-01–05; UOM-01, 02; PST-02, 03, 04; DWN-07; PYG-16; LND-04. *(E2E halves: PRD-03, ATR-02, ATR-11,
  PRD-12, PST-01 finish in Slice 11.)*
- **Partial:** PRD-06, PRD-08, PRD-13, ATR-07, ATR-08, ATR-13, ATR-15, TRL-03 (products), PLN-19 (products).
- **Done when:** a T-shirt with Size × Color saves as one transaction with 6 variants and counts once
  against the limit; a duplicate Red/L and a 4th variant-defining attribute are refused by the database,
  not just the API; a pay-as-you-go tenant is charged once per product.

### Slice 2: inventory ledger core
- **Depends on:** Slice 1.
- **Delivers:** stock levels; the append-only movement ledger; `InventoryLedger.apply()`; manual edits
  with one-tap reasons; stock checks; stock history; low-stock threshold and once-per-crossing notices;
  stock-state recompute with catalogue-version bump; the made-to-order mode; average cost (manual entry
  before any receipt); cost-at-movement; stock value, cost of goods sold and loss figures; inventory
  permissions and audit.
- **Requirements completed:** INV-01, 02, 03, 04, 05, 06 (backend), 07 (backend), 08, 09 (backend), 10
  (manual half; receipt half in Slice 4), 11, 18, 19, 20, 21; UOM-03.
- **Done when:** a concurrency test of 100 simultaneous −1 changes against 50 on hand gives exactly 50
  successes; the ledger-sum invariant holds after every step of a mixed sequence; an UPDATE on a movement
  fails for every role.

### Slice 3: batches, expiry and serial numbers
- **Depends on:** Slice 2.
- **Delivers:** batches with optional code and expiry; first-expiry-first-out picking inside
  `InventoryLedger.apply()`; the daily expiry job (warnings, and moving expired quantity to unsellable);
  the expiry write-off; serial numbers with status lifecycle and uniqueness.
- **Requirements completed:** INV-12, INV-13, INV-14.
- **Done when:** with January and March batches, an outbound movement takes January first; a batch
  expiring in 20 days raises exactly one notice; expired units drop out of `available`; a duplicate IMEI
  is refused.

### Slice 4: purchasing and receiving
- **Depends on:** Slices 2 and 3.
- **Delivers:** suppliers; purchase orders with gap-free numbers; receipts (partial, with rejects, batch
  and serial capture); weighted-average cost on receipt; incoming quantity; closing short; one-step
  "Add stock"; immutable receipts; purchase history; audit.
- **Requirements completed:** PUR-01–06, PUR-08, PUR-10, INV-10 (receipt half). *(E2E halves: PUR-07,
  PUR-09 finish in Slice 11.)*
- **Done when:** receiving 18 accepted and 2 rejected of 20 at ৳750 onto 3 at ৳700 gives on hand 21,
  average cost ৳742.86, a partially-received order, and incoming 2. Two concurrent new purchase orders get
  consecutive numbers.

### Slice 5: stock reservations — *checkpoint "3A" after this slice (D3-10)*
- **Depends on:** Slice 2 (and Slice 3, for consuming against batches and serials).
- **Delivers:** reserve / consume / release services; the expiry job and its platform setting (D3-6); the
  restock-or-damaged return service; **the inventory golden-path test** (exit criterion 3).
- **Requirements completed:** none outright. Everything here needs orders to be fully done.
- **Partial:** INV-15, INV-16, INV-17, PRD-07.
- **Done when:** two simultaneous reservations for the last unit give one `conflict`; an expiring
  reservation is released within a minute with no movement; the golden-path test passes.

### Slice 6: media upload, processing and storage accounting
- **Depends on:** Slice 1 (media attaches to products, categories and the shop logo).
- **Delivers:** the storage port (D3-4); signed direct uploads to a temporary area; the processing job
  (content validation, resize to 1600 px, WebP q80, 300 px thumbnail, video validation); content-hashed
  keys under the tenant prefix; one row per object; storage usage within a minute; limit enforcement;
  delete; daily R2 reconciliation; tenant-prefix wipe at LIF-19; failure handling; key scoping and
  rotation record.
- **Requirements completed:** MED-01, 03, 04, 05 (MAN), 06 (MAN), 07 (MAN), 08, 11, 12; STO-02–07;
  PRD-11 (backend); TEN-06; TEN-16 (storage half).
- **Partial:** STO-01, MED-09, DWN-09 (storage half), TRL-03 (storage), PLN-19 (storage).
- **Done when:** a 4 MB JPEG is stored smaller as WebP with a thumbnail within 30 seconds; a renamed
  `.exe` and a 6 MB image are refused and usage is unchanged; uploading past the limit gives
  `plan_limit_reached` while existing images still load.

### Slice 7: media Worker and bandwidth metering
- **Depends on:** Slice 6.
- **Delivers:** `apps/media-worker` (count requests and bytes including ranges, check tenant state and
  the blocked list, then cache, then R2); per-period counters aggregated within a minute; 429
  `X-Quota: bandwidth` at 100%; 50/80/95% warnings; resets on period start and upgrade; signed private
  links; CORS; daily bandwidth data.
- **Requirements completed:** MED-02, 10, 13; BND-01, 02, 03, 05, 06, 07, 08 (backend), 09; DWN-09.
- **Partial:** TRL-03 (bandwidth), PLN-19 (bandwidth).
- **Done when:** two range requests totalling 10 MB count 10 MB; a tenant crossing its limit is blocked
  within about 2 minutes; a lapsed tenant's media is refused before any R2 read.

### Slice 8: public API keys and rate limits
- **Depends on:** none in this phase (can run in parallel with Slices 1–7).
- **Delivers:** the D3-1 public-key subset (hashed storage, shown once, registered origins, expiry,
  revocation honoured within 5 s, two-key rotation, CORS and preflight); the D3-2 limiter (per-key
  per-minute sliding window, per-IP total, monthly quota with warnings, separate dashboard bucket); rate
  headers; snapshot-and-override driven limits.
- **Requirements completed:** API-03, 04, 05, 08, 10, 23, 24; RTE-01, 02, 03, 04, 05, 07, 10.
- **Partial:** API-01, API-07, API-21, RTE-06, PLN-19 (requests).
- **Done when:** request 61 within a minute on a Starter public key returns 429 with `Retry-After`; an
  unregistered origin gets 403; a revoked key fails within 5 s; a cache hit still decrements the count.

### Slice 9: public catalogue and layered caching
- **Depends on:** Slices 1, 2 (stock state), 6 (thumbnails) and 8 (public keys, rate-limit ordering).
- **Delivers:** public list, detail, category tree and search endpoints returning public fields only;
  keyset pagination; slim list payload from denormalised columns; the catalogue-version endpoint;
  cache-key normalisation; ETag/304; the process-memory LRU (100 MB cap, coalesced misses); edge headers
  with stale-while-revalidate; full-text and trigram search; immutable image URLs; product lookup by
  slug with old-slug redirect resolution; the tenant's ad-tracking settings (pixel ID in public responses,
  Conversions API token encrypted, never returned, changes audited).
- **Requirements completed:** PRD-09, PRD-10; CCH-01–06, CCH-08, 09, 11, 12 (CCH-10 is the storefront's
  service worker, Slice 12); LND-17.
- **Partial:** CCH-07, CCH-13, DAT-13, ATR-07 (catalogue half).
- **Done when:** 200 simultaneous requests for one uncached list cause one database query; a price edit
  is visible within 60 s with purging disabled; a 50,000-product tenant's page and search meet the
  response target; a tracking parameter or a cookie never creates a new cache entry.

### Slice 10: limits, usage and downgrade integration
- **Depends on:** Slices 1, 6, 7, 8.
- **Delivers:** the usage API (every metric that exists against its limit); threshold notices; products
  and storage added to the downgrade over-limit list and final warning; "unlimited" honoured across all
  of this phase's counters.
- **Requirements completed:** LIM-01, LIM-03.
- **Partial:** LIM-02, LIM-04, DWN-12, DWN-14, TRL-03, PLN-19.
- **Done when:** after hitting each limit, all existing records and files remain; a tenant downgraded to
  100 products with 340 sees them listed on the banner and can still sell all 340.

### Slice 11: dashboard UI (consolidated)
- **Depends on:** every backend slice, 1–10.
- **Delivers:** onboarding shop-type picker; product editor with the free "Add attribute" control,
  category suggestions and the variant matrix; category tree; product search; image and video manager;
  plain-language inventory screens (stock with "waiting to ship" and "coming", one-tap reasons, "Check
  stock", stock history, low-stock and expiry alerts, serial entry); "Add stock" and "Order from
  supplier"/"It arrived"; suppliers; profit, stock value and losses (gated per D3-9); API keys; usage
  page with the bandwidth chart; each product's landing link with copy, Facebook-share and
  WhatsApp-share actions (and per-variant links); the ad-tracking settings screen (pixel ID, Conversions
  API token entered once). All in Bangla and English, in the same everyday commerce wording the
  admin app already uses (transliterated domain nouns such as স্টক, প্রোডাক্ট — never formal or technical
  inventory terms).
- **Requirements completed (E2E halves):** PST-01; ATR-02, ATR-11; PRD-03, PRD-12; INV-06, 07, 09, 22;
  PUR-07, PUR-09; BND-08; LND-06.
- **Done when:** a non-technical walkthrough (clothing, cosmetics and grocery presets) completes product
  creation, add stock, stock check and planned purchase without anyone seeing an inventory term or an
  unwanted field.

### Slice 12: shared storefront and product landing pages
- **Depends on:** Slices 7 and 9 (and branding from Phase 1).
- **Delivers:**
  - **Storefront:** the new storefront design; category navigation, search, pagination; product page
    with the variant picker and stock state; client-side cart without reservation; branding; footer and
    contact; the offline "temporarily unavailable" page; switch-off; the installable storefront PWA,
    distinct from the per-tenant admin PWA; the service-worker cache; Bangla default with a per-device
    toggle; metering parity with an API-only site.
  - **Landing pages:** the automatic single-product page at `/l/<slug>` (images and video, name,
    description, price, attributes, variant picker with `?v=` preselection, quantity selector, stock
    state, branding, no shop navigation); server-rendered Open Graph and Twitter Card tags; the branded
    "no longer available" page (404) and the 301 from an old slug; served whenever the tenant is
    reachable, including with the storefront off; Meta Pixel `PageView`/`ViewContent`, loaded after the
    page's content. The order form's fields are laid out but not submittable until Phase 4.
- **Requirements completed:** SFT-01, 02, 03, 04, 05, 11, 12, 14, 15, 16, 17, 18, 19, 21; I18N-02; TEN-08;
  TEN-17; CCH-10; LND-01, 02, 03, 05, 14, 18.
- **Partial:** SFT-10, SFT-13, I18N-01, LND-13, LND-15.
- **Done when:** the milestone (exit criterion 4) passes; two tenants show different catalogues and
  branding with the same layout from one deployment; lapsing a tenant replaces both its storefront and
  its landing pages within the LIF-03 window; with the storefront switched off, landing pages still load;
  a shared landing link shows a rich preview in Facebook's sharing debugger; with the pixel endpoint
  blocked, the page works normally; a review finds no secret key or Conversions API token reachable from
  storefront code.

---

## 7. Slice dependencies and order

```
            ┌──────────── 3A: catalogue & inventory ────────────┐
Slice 1 ──► Slice 2 ──► Slice 3 ──► Slice 4
   │           │           │
   │           └──────────►┴──► Slice 5  ◄── checkpoint 3A
   │
   ├──────────► Slice 6 ──► Slice 7 ──┐
   │                                   │
Slice 8 (parallel from day one) ───────┤
   │                                   │
   └──► Slice 9 ◄── (1, 2, 6, 8) ──────┤
                                       ▼
                         Slice 10 ◄── (1, 6, 7, 8)
                                       │
          all backend slices 1–10 ─────┴──► Slice 11 (dashboard UI)
                       Slices 7, 9 ───────► Slice 12 (storefront + landing pages)
```

| Slice | Depends on | Can run in parallel with |
|---|---|---|
| 1 Catalogue core | — | 8 |
| 2 Inventory ledger | 1 | 6, 8 |
| 3 Batches & serials | 2 | 6, 7, 8 |
| 4 Purchasing | 2, 3 | 5, 6, 7, 8 |
| 5 Reservations | 2, 3 | 4, 6, 7, 8 |
| 6 Media upload & storage | 1 | 2–5, 8 |
| 7 Media Worker & bandwidth | 6 | 2–5, 8 |
| 8 API keys & rate limits | — | 1–7 |
| 9 Public catalogue & caching | 1, 2, 6, 8 | 3, 4, 5, 7, 10 |
| 10 Limits & usage | 1, 6, 7, 8 | 3, 4, 5, 9 |
| 11 Dashboard UI | 1–10 | 12 |
| 12 Storefront & landing pages | 7, 9 | 11 |

**Suggested order for one developer:** 1 → 2 → 3 → 4 → 5 (checkpoint 3A) → 8 → 6 → 7 → 9 → 10 → 11 → 12.
Slice 8 goes first among the second half because Slice 9 needs it, and it is small.

---

## 8. Non-functional requirements for this phase

- **Concurrency:**
  - stock (INV-01/PRD-07) — 100 concurrent attempts against 50 units
  - purchase numbers (PUR-03) — no gap or duplicate
  - cache stampede (CCH-06) — 200 requests, one query
- **Performance:** a 50,000-product tenant's list pages and search within the response target
  (CCH-11/12); stock writes add no more than one row lock per variant touched.
- **Integrity:** two re-derivability tests (INV-05) — `on_hand` vs the ledger sum and `reserved` vs active
  reservations — run in CI, the same discipline as Phase 2's exit criterion 3.
- **Security:**
  - RLS on every new tenant table, with the attribute table's scope-aware policy tested explicitly for
    both reading platform rows and refusing writes to them
  - cost never appears in a public response (INV-10)
  - the isolation registry gains a case for every new shop-owned route (SEC-02)
- **Language:** every new tenant-facing string in Bangla and English, using commerce vernacular, never
  inventory jargon (INV-22).

## 9. Risks

| Risk | Mitigation |
|---|---|
| Phase size (12 slices) | checkpoint 3A (D3-10); the second half can split into 3B without re-planning |
| The variant matrix save is the most complex write in the system so far | one transaction, a diff-based algorithm, property-style tests over random attribute and option edits |
| A second stock write path appears by accident | `InventoryLedger.apply()` is the only writer; a test asserts `stock_levels` has no other writer (static check plus the invariant test) |
| R2/Worker behaviour differs from the local stand-ins | Worker contract tests under Miniflare; a staging smoke test against real R2 before Slice 12 ships |
| The public-key pull-forward (D3-1) collides with Phase 8's fuller design | build the subset on the final `api_keys` table shape; Phase 8 only adds columns and secret-key paths |
| Cache bugs serve stale prices | CCH-07 makes order-time prices DB-only (Phase 4); the version-in-key design avoids purge dependence; explicit fragmentation tests |
| Decimal stock (UOM-03) rounding | `numeric(14,3)` end to end; discrete-unit triggers; never float in TypeScript (string decimals, as Phase 2's money handling) |
| Untrained tenants misuse inventory | INV-22 language rule, optional fields, one-tap reasons, and stock history as the explanation of every number |

## 10. Definition of done (per slice)

Same as Phase 2:
- its own branch and PR
- every listed requirement proven by a test written against its pass criteria
- a sabotage-confirm-restore pass on the slice's central rule
- `typecheck`, `lint`, `build` clean in every touched package
- the isolation registry updated for any new shop-owned route
- `KNOWN-GAPS.md` updated if anything listed here turns out not to hold
- this plan's slice entry marked shipped with its PR number
