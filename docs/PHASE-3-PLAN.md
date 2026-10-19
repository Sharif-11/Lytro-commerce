# Phase 3 plan: catalogue, inventory, purchasing, media, storefront

Status: agreed 2026-10-17 — every decision in §2 accepted as proposed. Builds on `IMPLEMENTATION-PLAN.md` Phase 3, with three changes
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
- **Custom domains** (TEN-09 to TEN-14, added 2026-10-18 as Slice 13, D3-13): a Growth or Pro shop's own
  domain serves its storefront and landing pages, after Slice 12 builds them.

Requirement IDs refer to `SRS-detailed.md` §13–§14 (new §14.4–§14.12 added 2026-10-17). Schema refers to
`DATABASE-SCHEMA.md` §3.2, rewritten the same day.

All decisions in §2 were accepted as proposed on 2026-10-17; reopening one needs an explicit change to
that row, not a silent deviation during a slice.

---

## 1. Goal and exit criteria

**Goal.** A tenant can build its catalogue — products, variants, attributes, images — keep honest stock
through a full inventory system (stock in through purchasing, stock out through reservations, every change
in a ledger) without needing to know inventory terminology, and an anonymous visitor can browse the
tenant's storefront, or open any product's shareable landing page, fast and cached, in both languages.
No orders flow yet. Phase 4 plugs orders into the reservation and catalogue machinery this phase
builds, and changes neither.

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
7. A Growth shop's own domain, once its DNS record exists, is activated within 10 minutes and serves its
   storefront and landing pages over HTTPS, with no step on the platform's side; a downgrade to a plan
   without custom domains turns it off, keeping the subdomain working, and an upgrade turns it back on.

---

## 2. Decisions

**D3-1 to D3-10 decided 2026-10-17, accepted as proposed; D3-11 and D3-12 decided 2026-10-18.**

| # | Decision | Decided | Affects |
|---|---|---|---|
| D3-1 | **The storefront and the public catalogue are read through public API keys** (API-07, SFT-11, RTE-01/07), but `IMPLEMENTATION-PLAN.md` puts `API-01`–`API-23` in Phase 8. Without keys, Phase 3's public endpoints have nothing to authenticate or rate-limit against. | **Pull a public-key subset forward into this phase:** creating public keys with registered origins, bearer auth, revocation and expiry, origin checks/CORS, and two-key rotation (API-01 public half, API-03/04/05/08/10/23/24, API-07 catalogue half). Secret keys, scopes, webhooks and OpenAPI stay in Phase 8. | Slice 8 |
| D3-2 | **Rate limits (RTE-*) are specified on a shared Redis instance (RED-02/03)**, which `IMPLEMENTATION-PLAN.md` builds in Phase 9. There is one application server until then. | Build the limiter behind one interface: per-minute and per-IP windows in process memory for now (RED-05's own fallback behaviour, exact while there's one server), and monthly quota counters flushed to PostgreSQL every 60 s (RED-04's pattern). Phase 9 swaps in the Redis adapter with no caller change. | Slice 8 |
| D3-3 | **The order-handling quota (QTA-01–07)** is listed in Phase 3 by `IMPLEMENTATION-PLAN.md`, but every QTA rule counts on order *handling* (courier booking or marking shipped), and orders don't exist until Phase 4. | Move QTA-01–07 to Phase 4 (the manual mark-shipped trigger, ORD-09); Phase 6 adds the courier-booking trigger. Nothing in this phase builds or tests QTA. | Scope |
| D3-4 | **Media infrastructure**: R2 and a Cloudflare Worker (MED-01/02, BND-01) are real cloud services, and developers and CI need to run without them. | A `MediaStorage` port with an R2 adapter (staging/production) and an S3-compatible local adapter (MinIO in docker-compose) for dev/CI. The Worker's code lives in-repo (`apps/media-worker`), unit-tested with Miniflare, plus a thin in-process stand-in of the same metering contract for server e2e tests. Same stub-provider precedent as D6. | Slices 6, 7 |
| D3-5 | **Notices to the tenant** — low stock (INV-08), expiry (INV-13), limit thresholds (LIM-01, BND-05, RTE-03) — need in-app and push delivery, which is Phase 7's notification module (NTF). | Deliver through a `TenantNotifier` port with a console stub, exactly as `BAL-13` did in Phase 2 (D6 precedent). These requirements count as complete when the once-per-crossing logic is proven; Phase 7 swaps the adapter. | Slices 2, 3, 7, 10 |
| D3-6 | Reservation expiry for unpaid online orders (INV-16) — `[30]` minutes, meant to match the payment session lifetime, which Phase 5 fixes. | Store it as a platform setting (`reservation_expiry_minutes`, default 30). Phase 5 sets it from the real session lifetime. | Slice 5 |
| D3-7 | Module boundaries (`ENGINEERING-STANDARDS.md` §1). | New modules: **`catalogue`** (categories, products, variants, attributes, presets), **`delivery`** (the canonical location list and delivery zones, added in Slice 1c; depends only on `catalogue`), **`inventory`** (levels, ledger, batches, serials, reservations, stock checks), **`purchasing`** (suppliers, purchase orders, receipts), **`media`** (uploads, processing, storage accounting), **`public-api`** (public keys, rate limiting, public catalogue). `inventory` depends only on `catalogue`; `purchasing` depends on `inventory`. Nothing depends on `purchasing`. | All |
| D3-8 | Shop-type preset list and defaults (PST-01/02). | See §6, Slice 1. The operator can edit presets later without a deploy (PST-04). | Slice 1 |
| D3-9 | Who may see cost and profit (INV-10/18). Profit is sensitive, and not every staff member should see it. | Cost, stock value and profit figures require `inventory:manage`; `inventory:read` sees quantities only. The owner always sees everything. | Slices 2, 11 |
| D3-10 | **Phase size.** At 12 slices, this is larger than Phase 2. | Keep it one phase, with an internal checkpoint after Slice 5 ("3A: catalogue and inventory complete, internally usable") before media and the storefront begin. If velocity suggests otherwise at the checkpoint, the remainder can become Phase 3B without reshuffling anything. | Planning |
| D3-11 | **One dashboard address (decided 2026-10-18).** The dashboard was served on three kinds of host (D13 in `PHASE-1-PLAN.md`): the platform host, every shop's subdomain and custom domains. On a shop's host it shares an origin with storefront and landing pages that run third-party scripts (Meta Pixel, chat widget), so any of them could call the dashboard API as the signed-in seller. It also gave sellers two sign-ins and clashed with the shopper sign-in path. | The dashboard moves to `app.lytro.app/<shop>` for owners and staff alike (TEN-31). Shop subdomains and custom domains serve public pages only (TEN-08, TEN-09, SFT-02); `lytro.app` is marketing only; `admin.lytro.app` stays the operator console. Sessions become `__Host-` cookies with an `Origin` check on state-changing requests (TEN-29), and the dashboard host's top-level paths become reserved slugs (TEN-26). Built first, as Slice 0, because the storefront (Slice 12) takes over every path on a shop's host. | Slice 0; Slices 11, 12 |
| D3-12 | **Separate operator app (decided 2026-10-18).** The operator console lives inside the tenant dashboard's build (`apps/admin`), and the app picks operator or seller screens from the hostname. Every seller's browser downloads operator code and the map of operator API calls, one deploy carries both, and the full console Phase 8 builds would grow inside the sellers' app. | A separate `apps/operator` served at `admin.lytro.app`; shared code moves to `packages/ui` (design tokens, basic components) and `packages/api-client`; `apps/admin` is renamed `apps/dashboard`. View-as-tenant (ADM-05, Phase 8) opens the real seller dashboard, read-only, after the seller approves a support request. Built as Slice 0b. | Slice 0b; Phase 8 |
| D3-13 | **Custom domains (decided 2026-10-18).** TEN-09 to TEN-14 are Must, but Phase 1 built only the `tenant_domains` table and the host lookup, deferring the behaviour "to a later phase", and no phase picked it up; DWN-10 and PYG-07 depend on it. A custom domain serves only the storefront and landing pages (D3-11), which Slice 12 builds. | Build it in this phase as **Slice 13, after Slice 12**: the domain routes with the plan and one-shop-per-domain checks, the DNS check that activates a domain, the endpoint Caddy asks before issuing a certificate (`DEPLOYMENT.md` §7), and DWN-10's turning off and back on. The domain screen belongs to the redesigned dashboard. | Slice 13 |

---

## 3. Requirement coverage

Rules used below:
- **Completed** means every pass criterion is provable by the end of this phase.
- **Partial** means this phase builds a working part, and a named later phase finishes the rest.
- Notices delivered through the D3-5 stub count as complete, the same rule Phase 2 applied to `BAL-13`.

### 3.1 Completed by this phase (193)

| Family | Requirements | Count |
|---|---|---|
| PRD | PRD-01, 02, 03, 04, 05, 09, 10, 11, 12, 14, 15, 16, 17 (size charts), 18 (duplicate product) | 14 |
| ATR | ATR-01, 02, 03, 04, 05, 06, 10, 11, 12, 14, 16 (quick option sets), 17 (variant grid fill-all), 18 (option swatches) | 13 |
| ATL | ATL-01, 02, 03, 04, 05 | 5 |
| UOM | UOM-01, 02, 03 | 3 |
| INV | INV-01 – INV-13, INV-18, 19, 20, 21, 22 | 18 |
| PUR | PUR-01 – PUR-10 | 10 |
| PST | PST-01 – PST-06 (PST-05: per-shop-type form layout; PST-06: categories that behave like another shop type) | 6 |
| MED | MED-01 – 08, MED-10 – 13 | 12 |
| STO | STO-02 – 07, STO-09 (video compression, added 2026-10-17) | 7 |
| BND | BND-01 – 09 (04: auto-buy packs, with add-ons) | 9 |
| RTE | RTE-01, 02, 03, 04, 05, 07, 10, 11 (11: request packs, with add-ons) | 8 |
| LIM | LIM-01, 03 | 2 |
| SFT | SFT-01, 02, 03, 04, 05, 11, 12, 14, 15, 16, 17, 18, 19, 21 | 14 |
| CCH | CCH-01 – 06, CCH-08 – 12 | 11 |
| I18N | I18N-02 (storefront half; dashboard half done in Phase 1) | 1 |
| TEN | TEN-06, 08, 16, 17, 18, 26 and 29 (amended 2026-10-18), 31 (one dashboard address, added 2026-10-18); 09 – 14 (custom domains, scheduled 2026-10-18, D3-13) | 14 |
| AUTH | AUTH-28 (amended 2026-10-18: claimed address, set-up step, terms line), AUTH-30 (new shops limited per account and connection, sign-in never) and AUTH-31 (staff sign-in page), both added 2026-10-18 | 3 |
| ADM | ADM-01 (amended 2026-10-18: separate application) | 1 |
| BRN | BRN-01 – 07 (brand identity, added 2026-10-18) | 7 |
| PLN | PLN-13, 14, 15 (add-ons, deferred by Phase 2's D2-4, scheduled 2026-10-18) | 3 |
| UPG | UPG-14 (add-ons kept across plan changes) | 1 |
| DWN | DWN-07, 09 (deferred here from Phase 2), 10 (custom domain off and on again, D3-13) | 3 |
| PYG | PYG-16 (deferred here from Phase 2), 07 (no custom domain, D3-13) | 2 |
| API | API-03, 04, 05, 08, 10, 14 (the `api.lytro.app` host, amended 2026-10-18), 23, 24 (public keys, D3-1) | 8 |
| LND | LND-01, 02, 03, 04, 05, 06, 14, 17, 18 | 9 |
| DLV | DLV-01, 02, 05 (delivery zones around the tenant's home area, added 2026-10-17) | 3 |
| FED | FED-01 – 06 (Meta catalog feed, added 2026-10-17) | 6 |
| | **Total** | **193** |

### 3.2 Partially completed by this phase (42)

| Req | Done in this phase | Remaining | Finished in |
|---|---|---|---|
| PRD-06 | inactive products hidden from the public catalogue | a public order containing one is refused; staff orders allowed | Phase 4 |
| PRD-07 | atomic reservation primitive, proven under concurrency (INV-15) | wired into order creation; failed creation restores | Phase 4 |
| PRD-08 | payment policy (including "delivery charge only") and advance amount stored per product, plus the shop-wide default policy | per-line advance, the delivery-charge advance and COD remainder computed at order creation | Phase 4 |
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
| LND-15 | Meta Pixel `PageView` and `ViewContent` fire on the landing page, with `content_ids` matching the catalog feed's item IDs | `InitiateCheckout` and `Purchase`, which need the order form | Phase 4 |
| INV-14 | serials recorded at receiving or added later, with a missing-serials count | serial required before a line ships | Phase 4 |
| INV-23 | scan, paste and typed serial entry with duplicate and IMEI check-digit validation, at receiving and "add missing" | the same entry when shipping a line | Phase 4 |
| SUP-01 | the setup checklist on the home screen, pulled forward from Phase 8: shop created, delivery charges, first product, logo, sharing the link, and an API key under "Later" | the items whose features arrive later: wallet number and listener phone (Phase 5), courier (Phase 6), SMS events (Phase 7) | Phases 5–7 |
| CUS-08 | the canonical location list with its city groups, and its read endpoint — pulled forward from Phase 4 because delivery zones are built from it | proof that connecting couriers never changes it (couriers arrive in Phase 6) | Phase 6 |
| DLV-06 | "no delivery" zones stored and shown in the delivery settings and on product and landing pages | refusal at public order creation; warning on staff orders | Phase 4 |
| DLV-07 | product zone limits stored and shown on product and landing pages; zone delete refused while a limit uses it | refusal at order creation, including for combos | Phase 4 |
| INV-24 | shared stock with pack amounts: availability per variant, adding stock as packs, reservations through the shared stock | the order line's pack-amount snapshot and returns through it | Phase 4 |
| DLV-03 | product and variant delivery charge stored as an optional override, unset by default | the zone charge used for lines without one (ORD-06a) | Phase 4 |
| DLV-04 | zone changes recorded in the activity log | proof that an existing order keeps its stored delivery charge | Phase 4 |
| AUTH-29 | the checkout after create-shop for a plan picked on the pricing page, then the password and set-up steps; continuing without paying; the SMS and email when the plan is activated | payment through the platform's payment page and a wallet's checkout, in place of Phase 2's operator-confirmed stand-in | Phase 5 |
| LEG-01 | the terms line on the entry screen, with both versions and the time recorded on each new account | the reviewed terms and privacy text | Phase 9 |

### 3.3 Listed for Phase 3 but not built here

| Req | Why | Goes to |
|---|---|---|
| QTA-01 – 07 | counted at order handling, which needs orders (D3-3) | Phase 4 (manual trigger), Phase 6 (courier trigger) |
| RTE-08, RTE-09 | order creations and payment sessions per minute or period | Phases 4, 5 |
| SFT-06, 08, 09, 20 | checkout, tracking, shopper accounts, delivery estimate (by delivery zone) | Phase 4 |
| ORD-06a (amended 2026-10-17) | the zone charge once per order, with product overrides and weight extras; computed at order creation | Phase 4 |
| SFT-07 | hosted payment redirect | Phase 5 |
| ATL-06, UOM-04, ATR-09 | snapshotting and validation on order lines | Phase 4 |
| TAX-01 – 03, MNU-01 – 04 | adopted 2026-10-17, need order lines | with or after Phase 4 |
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
| DLV-01, 02, 05 | CUS-08 | zones are built from the canonical areas: districts, cities and thanas |
| DLV-03 | PRD-01, ATR-13 | the product and variant delivery charge becomes an override |
| ORD-06a, SFT-20, LND-08 (Phase 4) | DLV-02, DLV-03, RAT-14 | the order's thana picks the zone; overrides and weight extras apply on top |
| PRD-08 "delivery charge only" (Phase 4) | ORD-06a | the advance equals the computed delivery charge |
| PRD-17 | PRD-03, PRD-15, MED-03 | a chart is inherited from the primary category; an image chart is an uploaded file |
| PRD-18 | PRD-01, ATR-04, PRD-04, MED-04 | copies the variant matrix, counts toward the limit, reuses stored images |
| ATR-16 | ATL-01, PST-02 | option sets are library options seeded by presets |
| FED-01–05 | PRD-09, ATR-07, INV-01, CCH-01–04, LND-01, LND-06 | the feed is another public catalogue view whose links are landing pages |
| LND-15 `content_ids` | FED-02 | pixel item IDs must equal the feed's item IDs |
| PLN-13–15, UPG-14, BND-04, RTE-11, BRN-05 | LIM-01–04, PLN-05, PLN-11, BAL-02, BIL-02/03/08/10 | add-ons sit on top of the plan snapshot and overrides and are paid like a plan, from the balance or directly |
| TEN-31 | TEN-24, TEN-26, TEN-29 | the dashboard's shop comes from the path, so the slug list and the same-site cookie rules both matter |
| SUP-01 (this phase's items) | PRD-01, DLV-01, TEN-16, LND-06, API-03 | each item ticks itself by detecting its feature: a product, the zone defaults, a logo, a copied link, a key |
| PST-06 | PST-02, PST-05, PRD-03 | a category points at an existing shop type's defaults instead of copying them |
| DLV-06, DLV-07 | DLV-01, DLV-02 | limits are expressed in zones |
| INV-24 | INV-03, INV-15, UOM-03 | a pack amount is a multiplier on one ledger stock |
| TEN-09 – 14, PYG-07, DWN-10 | SFT-01, SFT-02, LND-01, TEN-24, TEN-31, PLN-01, DWN-06 | a custom domain serves the storefront and landing pages; the host lookup, plan features and the downgrade's apply step already exist |

---

### 3.4a Rework of code built in Phases 0–2

Phases 0–2 are complete against the SRS as it stood when they were built. Amendments made on 2026-10-17 and
2026-10-18 change some of that behaviour, so this phase reworks it rather than reopening those phases.

| Requirement | Built in | Today | After the rework | Slice |
|---|---|---|---|---|
| D13 → D3-11, TEN-31 | Phase 1 (slices 5, 9) | Dashboard on three kinds of host; the shop comes from the host or the session | Dashboard only at `app.lytro.app/<shop>`; the shop comes from the path, with a membership check | 0 |
| TEN-29 | Phase 1 | Cookies tied to the exact host, plus a CSRF token (SEC-14) | Also `__Host-` cookies and an `Origin` check | 0 |
| TEN-26 | Phase 1 (slice 4) | Reserved slug list | Also the dashboard host's page names | 0 |
| TEN-17 | Phase 1 (slice 9) | Installed from each shop's subdomain | Installed from `app.lytro.app/<shop>/` | 0 |
| TEN-16 | Phase 1 (slice 9) | A generic placeholder until a logo is uploaded | A monogram | 0 |
| TEN-18 | Phase 1 (slice 9) | "Powered by Lytronix" | "Powered by Lytro" | 0 |
| Phase 1–2 tests and test plans | Phases 1–2 | Test the old host model | Test the new one | 0 |
| API-14 | 2026-10-14 | `/api/v1` on every host | The public API at `api.lytro.app/v1`, keys only | 8 |
| `BRAND-IDENTITY.md` §11 follow-ups | Phase 1 UI | Palette, fonts, logo and theme colour taken from Lytronix's battery business | Lytro's palette and assets; the operator console's inverted look | 11 |
| AUTH-28 | Phase 1 | Identity, create shop, set password; a claimed address is lost | The claimed address is carried through to create-shop with an availability check; a "set up your shop" step asks the shop type and home area | 0, 11 |
| AUTH-29 | Phase 2 (D2-12) | A plan picked on the website opens the purchase screen after create-shop, in place of the set-password offer | The checkout with a "continue without paying" choice, then the password and set-up steps; an SMS and email when the plan is activated | 0, 11 |
| AUTH-09, AUTH-30 | Phase 1 | A refused new shop gets a generic "too many free trials" error | A plain message that a shop was recently opened from this account or connection, keeping what was typed; sign-in never limited | 11 |
| Staff sign-in | Phase 1 | On the shop's own address | At `app.lytro.app/staff-sign-in`, linked from the owners' entry screen (AUTH-31) | 0 |
| ADM-01 | Phase 1 (slice 10) | The operator console inside `apps/admin`, chosen by hostname | Its own app, `apps/operator`; `apps/admin` renamed `apps/dashboard`; shared `packages/ui` and `packages/api-client` | 0b |
| PLN-13, PLN-14, PLN-15, UPG-14 | Deferred by Phase 2 (D2-4) | Not built | Built, with PLN-13/14 raised to Must | 10a |

The domain itself (`lytro.com` to `lytro.app`) was already changed in the dashboard app and `deploy/Caddyfile`
on 2026-10-18.

## 3.5 Architecture for this phase

- **Six new server modules** (D3-7), each with ports and adapters, white-box service tests over the real
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
| Add-ons | `control.addons`, `control.addon_purchases` (already designed; `kind`, payment and renewal columns added 2026-10-18) | 10a |
| Delivery zones | `delivery_zones` (home and fallback zones always present), `delivery_zone_areas` at three levels: district, city, thana (DLV-01, 02), with Inside/Outside Dhaka city for every tenant | 1 |
| Locations | `control.zillas`, `control.locations` and the `control.cities` groups (CUS-08, pulled forward from Phase 4) | 1 |
| Size charts, option sets | `size_charts` (product or category, image or table, PRD-17), `option_sets` (platform and tenant, ATR-16) | 1 |
| Catalog feed | `catalog_feeds` (hashed feed token, FED-01, FED-05) | 9 |
| Mixed shops | `categories.behaves_like` (PST-06) | 1 |
| Delivery limits | `delivery_zones.no_delivery` (DLV-06), `product_delivery_zones` (DLV-07) | 1 |
| Custom domains | `control.tenant_domains` (exists since Phase 1): an `inactive` status for a domain the plan no longer includes (DWN-10), `last_checked_at` for the DNS check, the domain unique among live rows only (so a removed one can be added again), one live domain per shop (TEN-09) | 13 |
| Shared stock | `products.shared_stock`, `product_variants.pack_amount` and `is_stock_holder` (INV-24) | 2 |

New permissions in the validators' `Permission` enum: `inventory:read`, `inventory:manage`, `keys:manage`.
New platform settings: `reservation_expiry_minutes`, `expiry_warning_days`, and the cache lifetimes
(CCH-03).

## 5. API surface for this phase

- **Dashboard** (session + `DashboardGuard`): categories, products, variants, attributes, presets;
  stock levels, history, adjustments, stock checks, expiring batches, serials; suppliers, purchase orders,
  receipts, quick add-stock; media uploads; API keys; usage; ad-tracking settings; the custom domain
  (add, view with its DNS instructions and status, remove).
- **Internal** (from Caddy only): whether a hostname is an active custom domain, asked before a certificate
  is issued (TEN-13).
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

### Slice 0: one dashboard address (D3-11)
- **Status (2026-10-19):** the dashboard app with its `/$shop` routes, the staff sign-in page, checkout and set-up, the
  rewritten `deploy/Caddyfile` and the marketing links landed in #144–#146. The server half is this slice's own PR:
  - the platform hosts never resolve to a shop
  - the shop comes from the page (`x-lytro-shop`) with a membership check, staff included
  - staff sign in from their phone alone
  - `/me` lists the person's shops
  - `__Host-` cookies and the `Origin` check
  - the dashboard's page names are reserved
- **Depends on:** none (runs in parallel with Slices 1–8).
- **Delivers:**
  - `app.lytro.app` as the only dashboard host: the host classifier treats `app.` and `admin.` as platform
    hosts; the dashboard's tenant comes from the `/<shop>` path segment, with a membership check that answers
    not-found for a shop the person doesn't belong to; one sign-in across a person's shops, with a shop picker.
  - `__Host-` session cookies and an `Origin` check on every state-changing dashboard and operator request.
  - A monogram instead of the placeholder logo (TEN-16), and "Powered by Lytro" instead of "Powered by
    Lytronix" (TEN-18).
  - The claim box's address (`?shop=`) carried through sign-in and verification, Google and Facebook
    included, to create-shop, pre-filled, with a live availability check limited per IP (AUTH-28).
  - The plan picked on the pricing page carried the same way, with the checkout straight after create-shop and a
    "continue without paying" choice (AUTH-29); a plain refusal when a new shop is over the per-account or per-connection limit (AUTH-30).
  - The terms line on the entry screen, recording both versions and the time on each new account (LEG-01).
  - Staff sign-in at `app.lytro.app/staff-sign-in`, linked from the owners' entry screen (AUTH-31).
  - The dashboard app's routes under `/$shop`, with sign-up, sign-in, create-shop and staff sign-in on the same
    host; a per-shop installable dashboard app scoped to `/<shop>/`.
  - Shop subdomains and custom domains stop serving the dashboard; the reserved-slug list gains the dashboard
    host's top-level paths.
  - `deploy/Caddyfile` rewritten to one rule per host (`DEPLOYMENT.md` §4–5), `OAUTH_CALLBACK_BASE` on
    `app.lytro.app`, the marketing site's sign-up links pointing there, and the Phase 1–2 test plans' host
    cases updated to match.
- **Requirements completed:** TEN-17, TEN-18, TEN-26, TEN-29, TEN-31 (and the dashboard half of TEN-08 and TEN-09;
  TEN-16's monogram; AUTH-28's claimed address).
- **Done when:** a person who owns one shop and is staff in another switches between them by path with one sign-in; a staff member of shop A
  gets not-found at shop B's path; `/dashboard` on a shop's subdomain is the storefront's not-found; a request
  with a valid session but a shop subdomain's `Origin` is refused; a cookie a shop's subdomain sets for
  `.lytro.app` never reaches the dashboard; two shops install as two distinct apps.

### Slice 0b: separate operator app (D3-12)
- **Status, 2026-10-19:** `apps/operator` and `apps/dashboard` exist and replace `apps/admin` (PR #145).
  `packages/ui` (tokens, the light and console themes, the basic components, formats, language setup) and
  `packages/api-client` (the request wrapper and error fallback) are extracted, and both apps take them from
  there, with every screen pixel-identical before and after. `admin.lytro.app` carries the console's own strict
  Content Security Policy (`operator_csp` in `deploy/Caddyfile`). The slice is done: the room for support view
  moved to Phase 8 (below).
- **Depends on:** Slice 0 (the hosts and sessions it reworks).
- **Delivers:**
  - `packages/ui` (the brand doc's design tokens and basic components) and `packages/api-client` (the request
    wrapper, CSRF handling and error mapping), extracted from `apps/admin` so both apps share one definition.
  - `apps/operator`: the existing operator screens moved out of `apps/admin` (sign-in with two-factor
    enrolment, plans, billing terms, rates, tenants), served at `admin.lytro.app` with its own strict Content
    Security Policy and the operator console's inverted look (`BRAND-IDENTITY.md` §8.4).
  - `apps/admin` renamed `apps/dashboard` (folder, package name, CI, `deploy/Caddyfile`, and the docs that
    describe current code), with the hostname switch (`host.ts`, `VITE_OPERATOR_HOST`) removed.
  - ~~Room for support view (ADM-05, Phase 8): a separate session type reserved on the server and a banner slot
    in the dashboard shell.~~ Moved to Phase 8 (decided 2026-10-19). Slice 0 made `DashboardGuard` the one place
    a dashboard request becomes a shop and a person, so the support session plugs in there when Phase 8 builds
    it whole; reserving a session nothing issues and a banner nothing fills would only add dead code.
  - The operator tests moved with their screens.
- **Requirements completed:** ADM-01 (amended: separate application).
- **Done when:** the dashboard's built files contain no operator screens or operator API calls;
  `admin.lytro.app` serves only `apps/operator`; both apps take their tokens and basic components from
  `packages/ui`; building or deploying one app does not rebuild the other; every moved operator test passes.

### Slice 1: catalogue core — products, variants, attributes, units, presets
- **Status (2026-10-19):** built as three PRs, since one would be too large to review.
  - **1a, catalogue core (#150):** the catalogue and attribute tables with their data-layer limits and scope
    checks; the shop-type presets and the shop's business type; the attribute library; the category tree; products
    with their variant matrix, describing attributes, slugs and redirects; the product limit; the pay-as-you-go
    product fee.
  - **1b, product extras (#152, migration 0052):** size charts (PRD-17), duplicate product (PRD-18), option sets and
    swatches (ATR-16, ATR-18), categories that behave like another shop type (PST-06), the up-front fields each
    preset names (PST-05), and the operator's editing of presets and the platform library (PST-04, ATL-01). A chart
    is a table for now; the image chart, image swatches and copying a product's images arrive with media (Slice 6).
    A product without its own chart shows the one on its primary category or the nearest category above it. The
    operator writes the platform's rows through the application role under a `platform_curation` policy rather
    than a separate connection.
  - **1c, delivery (this PR, migration 0053):** the canonical location list (CUS-08), delivery zones with the home
    area (DLV-01 to DLV-03, DLV-06, DLV-07) and the shop's default payment policy (PRD-08), in a new `delivery`
    module that depends on `catalogue`. Decided with the user before building: no divisions (zones name districts,
    cities and thanas, CUS-08, DLV-01, DLV-02 amended); the shopper picks the district, then the thana, then writes
    the address, with no area-name search; the list is bdapi's 64 districts and 494 upazilas plus the city police
    thanas of Dhaka (49, Uttara as one), Chattogram (15), Khulna (8) and Rajshahi (6), the other seven cities being
    their Sadar upazilas (`packages/db/data/locations.json`). Zone names that follow the home area are built in
    both languages when read rather than stored, and a shop's two default zones are made the first time its zones
    are read or written.
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
  Also added 2026-10-17 for Facebook sellers: delivery zones built around the tenant's home area
  ("Inside/Outside Dhaka city" until the tenant picks another city, district or set of thanas), from the
  canonical location list and its city groups (CUS-08, pulled forward from Phase 4), with the
  product delivery charge made an optional override; the shop-wide
  default payment policy and the "delivery charge only" option; size charts on categories and products;
  quick option sets (S–XXL, 38–44, common colors) seeded per preset, plus tenant-saved sets; and
  "Duplicate product". Also: categories that behave like another shop type, for shops selling several kinds
  of product (PST-06); "no delivery" zones and per-product zone limits (DLV-06, DLV-07).
- **Requirements completed:** PRD-01, 02, 03, 04, 05, 14, 15, 16, 18; ATR-01, 03, 04, 05, 06, 10, 12, 14;
  ATL-01–05; UOM-01, 02; PST-02, 03, 04, 06; DWN-07; PYG-16; LND-04; DLV-01, 02. *(E2E halves: PRD-03, ATR-02,
  ATR-11, ATR-16, PRD-12, PST-01, DLV-05 finish in Slice 11; PRD-17 in Slices 11 and 12.)*
- **Partial:** PRD-06, PRD-08, PRD-13, ATR-07, ATR-08, ATR-13, ATR-15, DLV-03, DLV-04, DLV-06, DLV-07, CUS-08, TRL-03 (products),
  PLN-19 (products).
- **Done when:** a T-shirt with Size × Color saves as one transaction with 6 variants and counts once
  against the limit; a duplicate Red/L and a 4th variant-defining attribute are refused by the database,
  not just the API; a pay-as-you-go tenant is charged once per product; a new shop has the two default
  zones and every thana resolves to exactly one, and picking Chattogram city as the home area renames and
  refills them at the same charges; duplicating that T-shirt gives an inactive copy with 6
  variants at zero stock and no new storage usage.

### Slice 2: inventory ledger core
- **Depends on:** Slice 1.
- **Delivers:** stock levels; the append-only movement ledger; `InventoryLedger.apply()`; manual edits
  with one-tap reasons; stock checks; stock history; low-stock threshold and once-per-crossing notices;
  stock-state recompute with catalogue-version bump; the made-to-order mode; average cost (manual entry
  before any receipt); cost-at-movement; stock value, cost of goods sold and loss figures; inventory
  permissions and audit.
- **Requirements completed:** INV-01, 02, 03, 04, 05, 06 (backend), 07 (backend), 08, 09 (backend), 10
  (manual half; receipt half in Slice 4), 11, 18, 19, 20, 21; UOM-03.
- **Partial:** INV-24 — shared stock with pack amounts (one hidden stock-holding variant; availability per
  variant; adding stock as packs); reservations through it in Slice 5; the order-line snapshot in Phase 4.
- **Done when:** a concurrency test of 100 simultaneous −1 changes against 50 on hand gives exactly 50
  successes; the ledger-sum invariant holds after every step of a mixed sequence; an UPDATE on a movement
  fails for every role.

### Slice 3: batches, expiry and serial numbers
- **Depends on:** Slice 2.
- **Delivers:** batches with optional code and expiry; first-expiry-first-out picking inside
  `InventoryLedger.apply()`; the daily expiry job (warnings, and moving expired quantity to unsellable);
  the expiry write-off; serial numbers with status lifecycle and uniqueness.
- **Requirements completed:** INV-12, INV-13.
- **Partial:** INV-14 (serials may be added later; enforced at shipping in Phase 4).
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
  (content validation, resize to 1600 px, WebP q80, 300 px thumbnail, video validation, and FFmpeg video
  compression to 720p H.264/AAC MP4 at CRF 23 with fast-start and a poster image, STO-09); content-hashed
  keys under the tenant prefix; one row per object; storage usage within a minute; limit enforcement;
  delete; daily R2 reconciliation; tenant-prefix wipe at LIF-19; failure handling; key scoping and
  rotation record.
- **Requirements completed:** MED-01, 03, 04, 05 (MAN), 06 (MAN), 07 (MAN), 08, 11, 12; STO-02–07, 09;
  PRD-11 (backend); TEN-06; TEN-16 (storage half).
- **Partial:** STO-01, MED-09, DWN-09 (storage half), TRL-03 (storage), PLN-19 (storage).
- **Done when:** a 4 MB JPEG is stored smaller as WebP with a thumbnail within 30 seconds; a renamed
  `.exe` and a 6 MB image are refused and usage is unchanged; uploading past the limit gives
  `plan_limit_reached` while existing images still load; a 1-minute 1080p phone video of about 130 MB is
  stored as a 720p MP4 of about 11–19 MB with a poster within 5 minutes, and usage rises only by the
  compressed size.

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
  headers; snapshot-and-override driven limits; the public API host `https://api.lytro.app/v1`, which accepts keys only
  (API-14, amended 2026-10-18).
- **Requirements completed:** API-03, 04, 05, 08, 10, 23, 24; RTE-01, 02, 03, 04, 05, 07, 10.
- **Partial:** API-01, API-07, API-21, RTE-06, PLN-19 (requests).
- **Done when:** request 61 within a minute on a Starter public key returns 429 with `Retry-After`; an
  unregistered origin gets 403; a revoked key fails within 5 s; a cache hit still decrements the count.

### Slice 9: public catalogue and layered caching
- **Depends on:** Slices 1, 2 (stock state), 6 (thumbnails) and 8 (public keys, rate-limit ordering).
- **Delivers:** public list, detail, category tree and search endpoints returning public fields only;
  keyset pagination; slim list payload from denormalised columns; the catalogue-version endpoint;
  cache-key normalisation, with a platform library version beside the shop's own so an operator's edit to the
  shared attributes reaches every shop (KNOWN-GAPS §66); ETag/304; the process-memory LRU (100 MB cap, coalesced misses); edge headers
  with stale-while-revalidate; full-text and trigram search; immutable image URLs; product lookup by
  slug with old-slug redirect resolution; the tenant's ad-tracking settings (pixel ID in public responses,
  Conversions API token encrypted, never returned, changes audited); the Meta catalog feed (a CSV at a
  secret per-shop URL, one row per variant grouped by product, landing-page links with `?v=`, served from
  the catalogue cache by version, regenerable).
- **Requirements completed:** PRD-09, PRD-10; CCH-01–06, CCH-08, 09, 11, 12 (CCH-10 is the storefront's
  service worker, Slice 12); LND-17; FED-01–05.
- **Partial:** CCH-07, CCH-13, DAT-13, ATR-07 (catalogue half).
- **Done when:** 200 simultaneous requests for one uncached list cause one database query; a price edit
  is visible within 60 s with purging disabled; a 50,000-product tenant's page and search meet the
  response target; a tracking parameter or a cookie never creates a new cache entry; Meta Commerce
  Manager accepts the feed URL, and after regeneration the old URL returns 404.

### Slice 10: limits, usage and downgrade integration
- **Depends on:** Slices 1, 6, 7, 8.
- **Delivers:** the usage API (every metric that exists against its limit); threshold notices; products
  and storage added to the downgrade over-limit list and final warning; "unlimited" honoured across all
  of this phase's counters.
- **Requirements completed:** LIM-01, LIM-03.
- **Partial:** LIM-02, LIM-04, DWN-12, DWN-14, TRL-03, PLN-19.
- **Done when:** after hitting each limit, all existing records and files remain; a tenant downgraded to
  100 products with 340 sees them listed on the banner and can still sell all 340.

### Slice 10a: add-ons
- **Depends on:** Slice 10 (usage and limits), and Phase 2's billing (balance, plan payments, proration).
- **Delivers (backend; the screens are in Slice 11):**
  - The add-on catalogue as operator-editable data (`control.addons`): limit add-ons, packs and feature
    add-ons, priced from OD-04's placeholders. The allowance kind (PLN-20) is added in Phase 7, with the
    fake-order checks and order reads it covers.
  - Buying: from the balance, taking effect at once, or directly through the platform's payment flow, taking
    effect when the payment is confirmed (Phase 2's operator-confirmed stand-in until Phase 5's hosted page,
    D2-1); prorated to the period's end; an invoice and an audit entry.
  - Limits calculated as plan snapshot + operator overrides + active add-ons.
  - Renewal with the plan in one payment, a renewal switch per add-on, [30]-day periods renewed from the
    balance for pay-as-you-go tenants, warnings 7 days and 1 day before a lapse, and the lapse job.
  - Packs: bought by hand, or by opt-in auto-buy at 100% (bandwidth, API requests).
  - Feature add-ons: the brand identity entitlement, reverting to the default with settings kept on a lapse.
  - Add-ons kept across plan changes.
- **Requirements completed:** PLN-13. *(PLN-14, PLN-15, UPG-14, BND-04, RTE-11 and BRN-05 finish in Slice 11,
  with their screens.)*
- **Done when:** extra products bought on day 10 of 30 raise the limit at once for two thirds of a period's
  price; a direct payment activates the add-on only on confirmation; renewing the plan renews the add-ons set
  to renew in one payment; an add-on with renewal off lapses at period end after both warnings, and branding
  reverts to the default with its settings kept; with auto-buy on and enough balance, reaching 100% of
  bandwidth buys a pack and service continues, and without enough balance it stops.

### Slice 11: dashboard UI (consolidated)
- **Depends on:** every backend slice: 0, 0b and 1–10a.
- **Delivers:** the onboarding "Set up your shop" step after create-shop, asking the shop type (PST-01) and the
  home area (DLV-01), both skippable; product editor with the free "Add attribute" control,
  category suggestions and the variant matrix; category tree; product search; image and video manager;
  plain-language inventory screens (stock with "waiting to ship" and "coming", one-tap reasons, "Check
  stock", stock history, low-stock and expiry alerts, serial entry); "Add stock" and "Order from
  supplier"/"It arrived"; suppliers; profit, stock value and losses (gated per D3-9); API keys; usage
  page with the bandwidth chart; each product's landing link with copy, Facebook-share and
  WhatsApp-share actions (and per-variant links); the ad-tracking settings screen (pixel ID, Conversions
  API token entered once); delivery settings with the home-area picker and its two charges up front, and an "Add zone"
  editor that adds a whole district or city in one step; size-chart editor; one-tap option sets in the variant editor; "Duplicate product"; the catalog
  feed link with copy and setup steps; the setup checklist on the home screen (SUP-01); the brand identity editor with live preview, and the
  dashboard themed by the shop's identity when switched on (BRN); the dashboard's own Content Security Policy on
  `app.lytro.app`, once Slices 6 and 7 fix where images and uploads go (KNOWN-GAPS §65); the add-ons screen, with buying from the
  usage page and the brand editor and a renewal switch per add-on; Lytro's palette, fonts, logo and theme colour
  (`BRAND-IDENTITY.md` §11; the operator console's look is Slice 0b); a category's "behaves like" setting; "no delivery" zones and a
  product's "Delivers to" limit; "Sizes share one stock" with each size's amount; per-shop-type form layout with "More settings"; price and stock
  columns with "Fill all" in the variant grid; IMEI/serial entry by camera scan, pasted list or typing.
  All in Bangla and English, in the same everyday commerce wording the
  admin app already uses (transliterated domain nouns such as স্টক, প্রোডাক্ট — never formal or technical
  inventory terms).
- **Requirements completed (E2E halves):** PST-01; ATR-02, ATR-11; PRD-03, PRD-12; INV-06, 07, 09, 22;
  PUR-07, PUR-09; BND-08; LND-06; ATR-16; ATR-17; PST-05; DLV-05; FED-06; ATR-18 (dashboard half; the shopper-facing picker in Slice 12); BRN-03, 06, 07 (identity rules, editor preview, token engine); PLN-14, PLN-15, UPG-14, BND-04, RTE-11, BRN-05
  (add-on screens); AUTH-28 (the set-up step and the terms line); AUTH-30; AUTH-31. *(INV-23's scan and paste
  entry is built here; its shipping half is Phase 4.)*
- **Partial:** SUP-01 — the checklist with the items that exist by the end of this phase; later phases add
  theirs.
- **Done when:** a non-technical walkthrough (clothing, cosmetics and grocery presets) completes product
  creation, add stock, stock check and planned purchase without anyone seeing an inventory term or an
  unwanted field.

### Slice 12: shared storefront and product landing pages
- **Depends on:** Slices 0, 0b, 7 and 9 (and branding from Phase 1).
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
    page's content, with `content_ids` set to the feed's variant IDs; a "Delivers to" note when a zone or
    product limit applies (DLV-06, DLV-07); the "Size chart" link on the
    product page and the landing page. The order form's fields are laid out but not submittable until Phase 4.
- **Requirements completed:** SFT-01, 02, 03, 04, 05, 11, 12, 14, 15, 16, 17, 18, 19, 21; I18N-02; TEN-08 (public pages; Slice 0 removes the dashboard);
  BRN-01, 02, 04 (storefront and landing pages themed by the shop's identity); CCH-10; LND-01, 02, 03, 05, 14, 18; PRD-17; ATR-18.
- **Partial:** SFT-10, SFT-13, I18N-01, LND-13, LND-15.
- **Done when:** the milestone (exit criterion 4) passes; two tenants show different catalogues and
  branding with the same layout from one deployment; lapsing a tenant replaces both its storefront and
  its landing pages within the LIF-03 window; with the storefront switched off, landing pages still load;
  a shared landing link shows a rich preview in Facebook's sharing debugger; with the pixel endpoint
  blocked, the page works normally; a review finds no secret key or Conversions API token reachable from
  storefront code.

### Slice 13: custom domains (D3-13)
- **Depends on:** Slice 12 (the storefront and landing pages a domain serves), Slice 0 (custom domains never
  serve the dashboard) and Phase 2's plan features and downgrade.
- **Delivers:**
  - Routes to add, view and remove the shop's one custom domain: refused with `plan_feature_unavailable` on
    trial, Starter and pay-as-you-go (TEN-10, PYG-07), and with `conflict` when another shop has it live
    (TEN-12). Viewing returns the DNS record to add, with the root-domain case (an A record to the platform's
    address) and the `www.` case (a CNAME) both explained.
  - A recurring DNS check that activates a pending domain within 10 minutes (TEN-11), marks one that never
    verifies as `failed` after a set time, and invalidates the host cache on any change (TEN-27).
  - The endpoint Caddy asks before issuing a certificate, answering yes only for an active custom domain,
    and the `deploy/Caddyfile` on-demand TLS block that uses it (TEN-13, `DEPLOYMENT.md` §7).
  - Removing a domain stops serving it at once; the subdomain keeps working (TEN-14).
  - DWN-10: a downgrade's apply step turns the domain `inactive` (record kept, domain answers not-found), and
    an upgrade or purchase of a plan with custom domains turns it back on. A lapsed shop's domain goes
    offline with its subdomain (LIF-07), not through this.
  - The domain screen lands in the redesigned dashboard, not in this slice.
- **Requirements completed:** TEN-09, 10, 11, 12, 13 (MAN), 14; PYG-07; DWN-10.
- **Done when:** a Growth shop adds a domain, sees the DNS instructions, and the domain becomes `active` on its own
  once the record exists; the storefront and a landing page load on it over HTTPS with a valid certificate,
  while `/dashboard` there is the storefront's not-found; a Starter shop is refused; a second shop adding a
  live domain gets `conflict`; removing it answers not-found within the cache window while the subdomain
  works; downgrading to Starter turns it off at the effective date and upgrading turns it back on; Caddy's
  ask endpoint says no for an unknown or pending hostname.

### Parallel track: marketing site redesign (`apps/website`)
- **Depends on:** nothing in this phase for step A. `LANDING-PAGE-DESIGN.md` and `BRAND-IDENTITY.md` are its
  spec. It touches only `apps/website` and shares no code with the slices, so it runs alongside them.
- **Step A (now):** the Lytro brand (tokens, fonts, logo); the hero with the claim box posting to
  `app.lytro.app/sign-in?shop=`; the integration strip with the official logos in `docs/brand/third-party/`
  (bKash, Nagad, Steadfast, Pathao at launch); problems, why Lytro, how it works, pricing with the monthly/yearly toggle, zero risk, FAQ,
  contact and footer; every button pointing at `app.lytro.app` (together with Slice 0).
- **Step B (when the features are live):** the inventory and statistics spotlight cards (after this phase's
  inventory and Phase 4's statistics) and the storefront and tracking showcase (after Slice 12 and Phase 4),
  following the landing page's rule never to claim what is not live.
- **Done when (step A):** every section renders at phone width with no horizontal scroll; the claim box reaches
  create-shop with the address pre-filled; pricing shows live plan data with both billing terms.

---

## 7. Slice dependencies and order

```
Slice 0 (one dashboard address, parallel from day one) ──► needed by Slices 11 and 12
Slice 0b (operator app, shared packages) after Slice 0 ──► needed by Slices 11 and 12
Slice 10a (add-ons) after Slice 10 ──► needed by Slice 11
Marketing site (parallel track): step A any time, step B once the features it shows are live

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
                       Slices 7, 9 ───────► Slice 12 (storefront + landing pages) ──► Slice 13 (custom domains)
```

| Slice | Depends on | Can run in parallel with |
|---|---|---|
| 0 One dashboard address | — | 1–10 |
| 0b Operator app | 0 | 1–10 |
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
| 10a Add-ons | 10 | 12 |
| 11 Dashboard UI | 0, 0b, 1–10a | 12 |
| 12 Storefront & landing pages | 0, 0b, 7, 9 | 11 |
| 13 Custom domains | 0, 12 | 11 |

**Suggested order for one developer:** 0 → 0b → 1 → 2 → 3 → 4 → 5 (checkpoint 3A) → 8 → 6 → 7 → 9 → 10 → 10a → 11 → 12 → 13.
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
| Video encoding (STO-09) is CPU-heavy on the shared VPS and could slow API requests | run it only in the background job queue with a concurrency of 1 at low process priority; the 5-minute bound gives headroom; if load grows, move encoding to a separate worker process or a managed service without changing the contract |
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
