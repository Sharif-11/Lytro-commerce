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
  - **1c, delivery (#154, migration 0053):** the canonical location list (CUS-08), delivery zones with the home
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
- **Status (2026-10-20):** built as two PRs, agreed with the user before any code.
  - **2a, ledger core (this PR, migration 0054):** stock levels and the append-only movement ledger (the database
    keeps the levels from the movements); `InventoryLedger.apply()`; opening stock; stock edits with one-tap
    reasons; stock history; the made-to-order switch; once-per-crossing low-stock notices through a console notifier
    (D3-5); the public stock state with its catalogue version bump; hand-entered average cost and cost on outgoing
    movements; UOM-03's whole-unit rule; `inventory:read` and `inventory:manage`; the activity log. A new `inventory`
    module depends on `catalogue`; catalogue reaches it through stock hooks its callers pass in, inside the
    product's own transaction.
  - **2b:** stock checks (INV-07), stock value, cost of goods sold and losses by period (INV-18), and shared stock
    with pack amounts (INV-24). Built as two PRs: stock checks and the figures first (migration 0056), then shared
    stock, which reaches into product create and update, the variant matrix, duplication and the variant limit.
    - **Stock checks:** a check stores every line it counted, matching or not, with the average cost at that moment,
      so its value gained or lost never moves with a later cost. A difference is read under the level's lock. Lines
      are valued to the paisa, rounded half up, and a changed line with no cost is counted, never valued at zero.
    - **Figures:** stock value now; cost of goods sold and losses for a period of whole Asia/Dhaka days (this month
      to today when left out). Every outgoing movement that is not a sale counts as a loss, by reason, including a
      manual adjustment and the made-to-order write-off. Returns (Slice 5, Phase 4) do not yet offset cost of goods
      sold.
    - **Shared stock (migration 0057), five decisions agreed before code:** a hidden stock-holder variant per product
      holds the stock, filtered out in the variant repository; every live variant has an explicit pack amount while
      the product shares (no default), whole unless the unit is measured, set with the switch in the variants save;
      the ledger alone turns a change on a variant into pack x quantity on the holder, a variant's available count is
      the shared stock divided by its pack, rounded down, and the threshold and notice apply to the shared stock; the
      shared stock is set, costed, counted and read through the existing routes by its holder's id, with one new
      addition route that takes packs of a variant, and opening stock as packs per variant plus loose stock; sharing
      switches only while the product holds nothing, and turning the product made to order writes the stock off and
      stops sharing.
  - **Decisions:** opening stock rides the create-product request per variant, as `initial` movements; a product's
    public state is its best variant's (in if any variant is in, else low if any is low, else out); retiring a
    variant keeps its stock in view ("retired, N in stock") and never sells it; turning a tracked product made to
    order writes its stock off to zero with a recorded movement, and tracking it again starts at 0; until
    purchasing (Slice 4), "new stock arrived" records a manual adjustment and never touches the average cost, while
    "counted again" is a recount, "damaged or lost" is damaged, and "other" is a manual adjustment.
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
- **Status (2026-10-20):** seven decisions agreed with the user before any code; built as two PRs, 3a (batches and
  expiry, migration 0058) and 3b (serial numbers).
  - **3a decisions:** one movement per batch, the database keeping batch quantities with the level; the ledger picks
    (earliest expiry first, none last, oldest received among equals), a sale never takes an expired batch, and, found
    while building, any other unnamed loss takes expired stock last so a recount or damage can always be recorded;
    arriving stock opens a described batch, joins an open one of the same code (a different expiry is refused, a
    missing one joins), or goes into the variant's "no expiry" batch, never with a past expiry; turning batch tracking
    on puts held stock into the "no expiry" batch with no movement, off is refused while expired stock waits; the
    daily pass at 00:05 Asia/Dhaka warns once per batch within 30 days and keeps `unsellable`; expired stock is written
    off only when the shop confirms. For Slice 5: a reservation sitting in a batch that expires cannot ship from it.
  - **3b decisions (migration 0059):** serials per unit or added later, unique within the shop among the units it
    holds, so a sold or written-off serial may return as a new unit (an INV-14 amendment); `serialFormat` (IMEI with
    its check digit, spaces and dashes dropped, or any code, compared in capitals), defaulting from the shop type; a bad
    or repeated line refusing the whole save; decreases naming serials, unnamed ones taking units with no serial
    first; a stock check naming its missing serials; `left_movement_id` on each unit that leaves; in-stock serials
    correctable or removable; serial tracking on at any time, off only with no serial in stock, never on a measured
    unit.
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
- **Status (2026-10-20):** ten decisions agreed with the user before any code; built as two PRs, 4a (suppliers and
  purchase orders, migration 0060) and 4b (receiving).
  - **Decisions:** a new `purchasing` module depending on `inventory`. A draft has no number and may be deleted;
    placing it with the supplier gives it the shop's next number, from a locked counter row, gap-free (PUR-03). A
    draft changes freely; a placed purchase's items and supplier change until the first delivery, then only its
    expected date and notes. Rejected units do not count as received, so the line stays outstanding; a rejection needs
    a reason; accepted plus rejected never exceeds what is outstanding (bonus units go through Add stock); an
    all-rejected delivery is recorded and leaves the status. Average cost = (held x old + accepted x cost) / (held +
    accepted), to four decimals, half up; with no cost known or nothing held, the receipt's cost; a receipt with no
    cost leaves it; rejected units never touch it. A shared product is bought by its shared stock, in its unit. A
    receipt line takes the batch and serials as stock additions do, one batch per line per receipt. Stock additions
    and "new stock arrived" become one-step receipts, with an optional supplier (a typed name finds a live one,
    ignoring case, or makes it) and unit cost. Suppliers: a name unique among the live ones, ignoring case; archived,
    never deleted. Cancel only a placed purchase with nothing received (a draft is deleted); close short with a reason;
    incoming is ordered minus received on placed, open purchases; costs only with `inventory:manage` (D3-9).
  - **4a (migration 0060):** suppliers; purchase orders with drafts, placing, editing, cancelling and deleting a draft;
    incoming stock on the stock view; purchase lines holding the variant by value (a purchase outlives a product
    deleted for good), checked by a trigger for the product's own variant, never a shared stock's size, in whole units
    unless measured; a product moves to a whole-number unit only while no unfinished purchase buys a fraction of it; a
    retired variant is not bought; the activity log; the day-60 deletion.
  - **4b (migration 0061), five follow-up decisions agreed before code:** only a receipt carrying a unit cost takes the
    average over, so the cost stays typed by hand until one arrives (an INV-10 amendment); a delivery's unit cost left
    out is the one on the item, null is unknown, and the receipt movement carries it; Add stock on a size of a shared
    stock takes a cost per pack, kept per unit of the shared stock; "new stock arrived" on a stock edit is a one-step
    receipt with no supplier or cost; only a placed purchase is received, and an item whose product changed since is
    refused for that item and closed short. Built: receipts with rejects that stay outstanding, the database keeping
    each item's received quantity and the average cost, batches and serials on receipt, closing short, Add stock and
    new stock arriving as numbered received purchases (inventory hands them to purchasing through a port its callers
    pass, so it never depends on purchasing), purchase history per variant, receipts that never change.
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
- **Checkpoint 3A (2026-10-20):** catalogue and inventory complete (Slices 0–5, decided 2026-10-17, merged by
  2026-10-20). Decided with the user: the phase stays one phase, with no Phase 3B, and continues in the suggested
  order with Slice 8 next. KNOWN-GAPS §66 (an operator's edit to the platform library moves no shop's catalogue
  version) is fixed inside Slice 9, where caching first depends on it.
- **Status (2026-10-20):** eight decisions agreed with the user before any code; built as two PRs, 5a (reservations,
  migration 0062) and 5b (returns, INV-17).
  - **Decisions:** a reservation is a service Phase 4's orders call, with no route of its own. It names its order and
    order line (no foreign key until Phase 4), one per line and variant at a time, and holds a quantity; a size of a
    shared stock records the size, its pack amount and the packs ordered, and holds pack x quantity on the shared
    stock. The database keeps `reserved` equal to the active reservations, and nothing else changes it. Expired stock
    under a reservation records the shortfall: it stays unsellable, available floors at 0, the stock view shows the
    units held for orders that expired, and the shop is told once; only expiry can create a shortfall, and shipping
    those units fails clearly for Phase 4 to decide the order's fate. Shipping (consume) is one sale through the
    ledger, earliest expiry first and never expired, the whole reservation at once; a serial-numbered product names
    one serial per unit, and those are sold to the order. Release frees the whole reservation, with no movement. An
    order awaiting online payment holds stock for `reservation_expiry_minutes` (default 30); a job every minute lets
    expired ones go; cash-on-delivery and staff orders never expire. Made to order holds nothing and is never
    refused. While units are held, a product is not switched to made to order, nor a variant retired, nor a product
    deleted for good. Returns (5b): per unit, sellable back into the batch it left or damaged and written off, at the
    sale's unit cost.
  - **5a (migration 0062):** built as decided, with two refinements found while building it, both in the PR:
    - **Shipping takes the units held for it.** A sale naming its reservation takes those units even while expiry has
      left the level short, so the first order to ship is filled from the sellable stock and only the order left
      uncovered fails. Without this, one expired batch would block every order of the product.
    - **One lock order for every stock writer:** products first, then levels, reservations, batches and serials.
      The concurrency test found that two writers on one product could deadlock (KNOWN-GAPS §75).
    - **Also built:** the minute pass (KNOWN-GAPS §74 notes how it scales); the daily pass's one notice per shortfall;
      the guards on held stock, in the database too; the day-60 deletion; INV-05 checked after every step; the golden
      path as one test.
  - **5b (migration 0063), seven follow-up decisions agreed before code:**
    - A return names the shipped reservation. It may come back in parts, never more than shipped less what came
      back, and every unit is marked sellable or damaged.
    - Units go back into a batch the shipment took: the soonest-expiring one with units still out, unless the shop
      names one. A batch closed since opens again by code and expiry, never as "no expiry"; an expired one comes back
      expired.
    - The damaged write-off carries the sale's cost, not the average of the moment.
    - A serial must be one sold on that shipment. Its sold record becomes `returned`, and the unit comes back as a new
      in-stock record, written off at once if damaged.
    - A size of a shared stock restores the pack amount it was ordered at.
    - A retired variant takes its units back; a product made to order or deleted for good is refused clearly.
    - Cost of goods sold is sales less returns, and damaged returns are losses.
    - Built as decided, a service with no route of its own, like reservations.
- **Depends on:** Slice 2 (and Slice 3, for consuming against batches and serials).
- **Delivers:** reserve / consume / release services; the expiry job and its platform setting (D3-6); the
  restock-or-damaged return service; **the inventory golden-path test** (exit criterion 3).
- **Requirements completed:** none outright. Everything here needs orders to be fully done.
- **Partial:** INV-15, INV-16, INV-17, PRD-07.
- **Done when:** two simultaneous reservations for the last unit give one `conflict`; an expiring
  reservation is released within a minute with no movement; the golden-path test passes.

### Slice 6: media upload, processing and storage accounting
- **Status (2026-10-21):** thirteen decisions agreed with the user before any code; built as two PRs, 6a (storage,
  uploads, images, usage and its limit, attaching, deleting; migration 0065) and 6b (video, the nightly reconciliation,
  the key inventory).
  - **The store:** the S3 API, which R2 speaks, behind a storage port (D3-4), with one key per job -- signing a
    browser's upload, processing it, deleting files (MED-07). MinIO's images are no longer published, so development
    and CI use real R2 dev buckets, and the end-to-end tests an in-memory stand-in that takes only the file it signed
    for, as R2 does. Two buckets: a temporary one browsers upload into, cleared after a day, and one for each shop's
    media under `tenants/<shop>/`.
  - **An upload starts with the file's details only** -- kind, type, size, purpose and the place it is for -- checked
    against the per-file limit, the shop's storage, the place and the permission. It is answered with a link, valid 15
    minutes, that takes exactly that size and type. The browser sends the file, then finishes, and a job processes it.
    The storage limit is weighed again with the stored sizes, under a per-shop lock. A store that is away answers 503
    with `Retry-After`.
  - **Images** are judged by content (JPEG, PNG, WebP), turned upright and stripped of metadata, stored as a WebP of at
    most 1600 px at q80 and a 300 px thumbnail; the uploaded file is not kept. Public names carry the content's
    fingerprint, under the item's own id (`tenants/<shop>/<media id>/<hash>.webp`), so two identical uploads never
    share a name. The per-file limits (5 MB; 150 MB for videos since 6b) are platform settings.
  - **Attaching:** a product's photos, up to 10 in order (50 since 2026-10-22) (`PUT /products/:id/images`); a
    category's banner (the slice's text names categories; the design points had left them out); an image swatch on
    a shop's own value, a colour or an image, never both; an image size chart in place of a table; the shop's logo
    (`PUT /shop-settings/logo`). The database keeps each a ready image of the shop's own. Catalogue managers handle
    the catalogue's media, and settings managers handle the logo.
  - **Deleting** removes the item from everywhere at once and drops usage; its files go in the deletion job, the only
    one holding the deleting key. The past-orders warning shows 0 until orders arrive (Phase 4). Day 60 wipes the
    rows and every file under the shop's prefix.
  - **Built as decided in 6a** (#177), with videos turned away until 6b.
  - **6b's seven points, agreed before code** (migration 0066):
    - **Video size:** STO-05 said 100 MB, while STO-09's own test is a 1-minute 1080p phone clip of about 130 MB, so
      the cap is 150 MB (STO-05 amended; still an editable setting).
    - **Probing:** the pinned `ffmpeg-static` (ffmpeg 6.1.1, GPL, run on our servers only) both reads a file and
      compresses it; `ffprobe-static` is years stale.
    - **Compressing:** libx264 `medium` on 2 threads, one video at a time, on a queue of its own. A 1-minute 1080p
      clip took about 70 s on a laptop core, well inside STO-09's 5 minutes.
    - **Keeping an original:** an H.264 MP4 within 1280 px that every browser plays, with AAC or no sound, smaller than
      the compressed copy, is kept with its own streams, re-wrapped to start fast. Metadata is stripped either way.
    - **The nightly run:** at 03:00 Dhaka, shop by shop. It deletes uploads never finished after a day and refuses
      items stuck processing after an hour. It records shops whose rows and R2 differ in
      `control.media_reconciliations`, deletes stray files over a day old, reports missing ones only, and logs an
      operator alert above 0.5%.
    - **Telling the shop:** a refused video, and anything the run finds stuck, goes through a console stand-in until
      Phase 7's notices (D3-5).
    - **Keys:** the inventory and rotation steps are in RUNBOOKS §2, with `scripts/media-key-check.ts` to show what
      each key may really do; R2 likely cannot split writing from deleting (KNOWN-GAPS §78).
  - **Built as decided in 6b.** A product's one video is `PUT /products/:id/video`; storage being away is logged as an
    operator alert (MED-11) until alerting exists (OD-43). The query for every live shop moved to `TenantRepository`
    so the inventory passes and the nightly media run share it.
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
- **Status (2026-10-21):** ten decisions agreed with the user before any code; built as two PRs, 7a (the Worker) and
  7b (the server's side: totals, warnings, the shared store, the bandwidth API).
  - **The address:** `media.lytro.app`, whose paths are the objects' keys (`/tenants/<shop>/<media id>/<file>`),
    the links the server already makes. A path outside one shop's prefix is no media (MED-01).
  - **Reading R2:** through its S3 API with an Object Read only token, not a binding, which R2 cannot make read-only:
    a write fails at R2 itself (MED-07). KNOWN-GAPS §78 (the processing key can likely delete) is accepted as a risk.
  - **Counting:** one Analytics Engine data point per response -- the shop, the bytes its body actually sent, counted
    as they stream, so a range counts only its bytes and an aborted download only what went (BND-01). The server
    totals them each minute (7b).
  - **Blocking:** the server writes one blocked list to a KV store each minute (7b); the Worker reads it at most every
    15 seconds. A shop over its bandwidth gets 429 with `X-Quota: bandwidth` and no body; an offline shop
    (`read_only`, `locked`, `archived`, `suspended`, deleted) gets 403 -- both before the cache or R2 are read --
    except to the dashboard and the operator console. Auto-buy (BND-04) arrives with add-ons (Slice 10a).
  - **Private links:** files under `tenants/<shop>/private/` only through a link signed with a secret the server and
    the Worker share, for 15 minutes, never cached (BND-07); the server's signer arrives with its first private file.
  - **CORS:** a script may read a shop's media only from its registered website addresses and the dashboard, which
    the server keeps in the KV store (MED-13).
  - **Caching:** after metering, the Worker's cache, then R2 on a miss; a public file is kept a year; a range that
    missed is read alone and not kept.
  - **Code and tests:** `apps/media-worker`, built with wrangler, tested inside the Workers runtime with
    `@cloudflare/vitest-plugin` (the renamed `vitest-pool-workers`), which needs Vitest 4, so that package alone uses
    it. CI moved from Node 20 (end of life) to Node 24.
  - **7a built as decided.** The media Worker's one-time Cloudflare setup is in DEPLOYMENT.md §8.
  - **7b built as decided** (migration 0067), with four choices made while building it. Each minute is totalled a
    minute after it ends, since Cloudflare names no delay for its usage data (KNOWN-GAPS §79). The KV store is written
    with its bulk call, so a restart that writes every shop's website addresses is a few calls, not one a shop. A shop
    over its bandwidth and also offline is blocked for bandwidth, so the dashboard is refused too (BND-03). A deleted
    shop stays blocked for 30 days, while the deletion job removes its files. The dashboard reads
    `GET /media/bandwidth`; its chart is the UI slice's.
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
- **Status (2026-10-20):** ten decisions agreed with the user before any code; built as one PR (migration 0064).
  - **Decisions:** keys live in the control schema, as a SHA-256 hash with a visible prefix, the value shown once,
    `lytro_pk_` and 32 random characters. The dashboard (`keys:manage`) makes, lists, edits and revokes keys, at most
    20 live; making and revoking are audited by name, never value; rotation is two live keys. Website addresses are
    exact origins, at most 10 per key, HTTPS except `http://localhost` and `http://127.0.0.1`.
  - **The API host:** `api.lytro.app/v1/...` takes keys only; this slice serves `GET /v1/shop`, and the catalogue
    joins it in Slice 9. Every public route runs one gate before anything else (RTE-04): the key (401), the website
    (403, an absent `Origin` too), the shop open, the visitor's 120 a minute (RTE-06), the key's per-minute limit
    (429 with `Retry-After`), then the cycle's requests (429 `quota_exceeded`).
  - **Lookups and limits:** lookups are kept for at most 5 seconds, and revoking clears this server's copy at once. A
    preflight is answered by whether a live key registers its website. The per-minute window is an exact sliding one,
    in memory (D3-2). The monthly counts are flushed to PostgreSQL every minute, with warnings at 50, 80 and 95
    percent, once each.
  - **Plan limits:** `requests_per_minute_public` and `requests_monthly` are seeded on every plan from 2.1, filled
    into every snapshot, and overridable.
  - **Built as decided.** When a flush crosses more than one warning, only the highest is sent.
  - **Changed after Slice 9 (KNOWN-GAPS §82):** the key's per-minute limit held back a busy shop's shoppers
    together, so it was removed, with `requests_per_minute_public` (migration 0070). The visitor's 120 became an
    operator setting, the rate headers describe the visitor's minute, and its refusals are counted per cycle.
  - **Found while building it:** an operator's override to unlimited (`null`) failed with a server error (KNOWN-GAPS
    §76).
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
- **Status (2026-10-21):** ten decisions agreed with the user before any code; built as two PRs, 9a (the catalogue
  and its caching) and 9b (ad tracking and the Meta feed).
  - **Counting over edge caching:** Cloudflare stores no API answer (`Cache-Control: private`), so every request
    passes the public key's gate and is counted, as RTE-04 says (CCH-01, CCH-03 and CCH-13 amended). Cloudflare's
    plain cache is free, but a cached answer would skip the gate; counting is what makes the request limit a plan
    feature, and the limit's size is where a plan is generous. Edge caching returns with the storefront's own pages
    (Slice 12).
  - **Routes** (on `api.lytro.app/v1`): `catalogue/version`, `catalogue/products` (category with its subcategories,
    search, sort, cursor, 24 a page, 60 at most), `catalogue/products/:slug` (an old slug answers with the current
    one), `catalogue/categories`; the pixel ID joins `shop` in 9b.
  - **Sold-out variants** are listed, marked unavailable, and can't be ordered (ATR-07 amended). Each variant keeps
    its own stock state, and any change moves the version (CCH-08).
  - **Memory cache:** `lru-cache`, 100 MB by answer size, at most 60 s, misses merged; keys name the shop's and the
    platform library's versions (read at most every 2 s) and the request with unknown parameters dropped; an ETag
    from the key, 304 still counted; browser lifetimes as operator settings; the hit ratio logged each minute.
  - **Platform library version:** one row the operator's edits bump (KNOWN-GAPS §66).
  - **Search:** PostgreSQL full-text (`simple`, so Bangla words stay whole) and trigrams, behind one interface; a
    50,000-product timing test.
  - **Ad tracking** (an AES-256-GCM helper for the Conversions API token) and the **Meta feed** (a 256-bit token
    stored as is, so the dashboard can show the link) are 9b.
  - **9a built as decided** (migration 0068), with four things settled while building it:
    - The routes follow API-CONTRACT.md's `catalogue/...` names, and the search parameter is `search`.
    - The public routes live under `/api/v1/public/...` inside the server, which the API host's `/v1/...` maps to,
      so `/v1/catalogue/products` can never collide with the dashboard's `/products`.
    - A search matches whole words and word starts first, and uses trigram similarity only when nothing matches
      (a typo, a piece of a word); scoring every broad match by similarity cost 200 ms. On 50,000 products, pages
      took 41 ms and searches 226 ms at the 95th percentile.
    - A product's stock state is now its best variant on sale; an inactive variant no longer counts toward it. A
      new variant starts as its product does: in when its stock is not counted, else out until stock arrives.
  - **9b built** (migration 0069), with one decision revisited at its read (2026-10-21): the feed token is not kept
    as is, as point 9 first said, but as DATABASE-SCHEMA designed it -- its SHA-256 hash for lookup and a sealed copy
    for the dashboard -- in `control.catalog_feeds`, since a feed request is matched before the shop is known.
    - **Secret box:** AES-256-GCM, a fresh nonce per value, the key's fingerprint and the shop and purpose bound in;
      `DATA_ENCRYPTION_KEY` (required in production) and `DATA_ENCRYPTION_PREVIOUS_KEY` for a rotation. The pattern
      courier and gateway credentials reuse (Phases 5-6).
    - **Ad tracking:** `GET`, `PUT` and `DELETE /ad-tracking` (`settings:manage`); the token goes in and never
      out; every change in the activity log, kept 24 months as a credential's (AUD-07); the Pixel ID on
      `GET /v1/shop`. Sending Purchase events server-side (LND-16) arrives with orders.
    - **Feed:** `GET /catalog-feed` (the link, made on first asking), `POST /catalog-feed/regenerate`;
      `/v1/feeds/meta/<token>.csv`, served from the catalogue cache by version (an answer over 10 MB is built per
      fetch), counted toward the month, 404 for a wrong token or an offline shop; products gained `condition`.
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
- **Status (2026-10-21):** seven decisions agreed with the user before any code, the third extended:
  - **Usage endpoint:** `GET /usage`, for `payments:read`: products, seats, storage, bandwidth with its days, this
    cycle's API requests and the free essential SMS (a total on a trial, a month's on a plan), each used against its
    limit (null is unlimited), with whether it starts again each cycle and the cycle's start and end.
  - **One definition of every limit:** a shop's limits are its snapshot with its overrides, read with the shop
    itself, never the live plan's (KNOWN-GAPS §83). One table says what an unset limit means: unlimited for
    products, orders, storage, bandwidth and SMS; one seat (the owner's); one listener device; Trial's 20,000 API
    requests. The activity-log purge reads the override, then the snapshot, then 30 days.
  - **Warnings:** 50, 80 and 95 percent for products, storage, seats and SMS too, once a cycle each, checked right
    after the write, through one usage notifier. Every limit that is enforced suggests a suitable add-on (from
    Slice 10a) or plan -- in its warnings, on the usage page, and when an action is refused. The bandwidth and
    request warnings also give a run-out estimate from the daily figures, offer auto-buy and a one-tap pack, go by
    email and a dashboard banner, and add a free SMS at 100%. A [110] percent grace keeps media and the API serving
    while the 100 percent notice goes out, never charged (BND-03 and RTE-03 amended with the code). With them, the
    fast-spend alert of KNOWN-GAPS §82.
  - **Downgrade preview:** products and storage join it, judged by the target plan's limits with the shop's
    overrides.
  - **The 30 days after a downgrade:** a live checklist on `GET /billing/downgrade` (DWN-12) and one final warning
    from the lifecycle job (DWN-14), with `downgraded_at` and `downgrade_final_warning_at` on the shop.
  - **Done-when test:** 340 products downgraded to 100 stay listed and public; a new one is refused; storage alike.
  - **Built first:** the usage endpoint and the one definition of every limit, with §83's fix. Found while building
    it: test set-ups moved a shop to another plan by its plan id alone, which worked only because limits came from
    the live plan; they now write the plan's snapshot too, as a purchase does. TRL-05's refusal of a trial's ninth
    essential SMS waits for the first essential SMS that is not a sign-in code (Phase 4's order messages): the
    sign-in code is the only one today, and TRL-05 says it is never refused.
  - **Built second:** the warnings, to point 3 as extended (LIM-01, BND-03, BND-05, RTE-03 amended; RTE-12 added;
    migration 0071).
    - **Deciding:** one small module below every counter decides 50, 80 and 95 percent in the transaction of the
      write that crossed it -- a product, a seat, a processed file, a counted SMS -- and records it in
      `control.usage_warnings`. Bandwidth and API requests decide their own, adding their limit and their stop.
    - **Sending:** the notice is queued with the write and composed afterwards by a worker, with the shop's usage as
      it is then: how much is used, the pace through the cycle, what happens to shoppers, and the suggestions.
    - **Suggestions:** the cheapest plan a month that leaves every metric under 80 percent, and the next; never one
      below the shop's own; the operator for the largest. They also come with each refusal at a limit (an
      interceptor reads the usage), and on `GET /usage` with each metric's level for the banner.
    - **The grace** is the platform setting `usage_grace_percent` (10), and the fast-spend share `fast_spend_percent`
      (5), counted per clock hour on each server and told of at most once a day.
    - **Waits for Slice 10a:** add-ons and packs among the suggestions, the one-tap pack and the auto-buy offer, and
      the next plan after packs two cycles running.
  - **Built third:** the downgrade points (4 to 6), migration 0072.
    - **Preview:** seats, products and storage (in whole MB), judged by the target plan with the shop's overrides
      (DWN-03 amended).
    - **Checklist:** a downgrade, or a switch to pay-as-you-go, records when it took effect and the limits it left the
      shop over; `GET /billing/downgrade/checklist` lists them for 30 days, ticked off live as each is fixed. It is a
      route of its own, not part of `GET /billing/downgrade`, which the dashboard already reads as the scheduled change
      or null. Any later plan assignment clears it.
    - **Final warning:** the lifecycle tick sends it once, by email, after the 30 days, only to a shop still over a
      limit, naming what is over, that nothing is deleted or hidden, and the data export.
    - **Done when, as a test:** 340 products moved to a plan of 100 stay listed and on the public catalogue, and the
      341st is refused; the shop's photo stays and a new upload is refused.
- **Depends on:** Slices 1, 6, 7, 8.
- **Delivers:** the usage API (every metric that exists against its limit); threshold notices; products
  and storage added to the downgrade over-limit list and final warning; "unlimited" honoured across all
  of this phase's counters; the fast-spend alert decided in KNOWN-GAPS §82 (more than [5]% of a cycle's
  requests in an hour tells the owner and the operator, refusing nothing), with its requirement.
- **Requirements completed:** LIM-01, LIM-03, DWN-03, DWN-12.
- **Partial:** LIM-02, LIM-04, DWN-14 (push, with Phase 7's notifications), TRL-03, PLN-19.
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
  - **Agreed 2026-10-21 and 2026-10-22:** three pull requests -- 10a.1 the catalogue, the limits, buying from the
    balance, invoice lines and the upgrade credit; 10a.2 paying by wallet, renewal, the lapse and its warnings,
    pay-as-you-go and no-expiry periods, and the upgrade extension; 10a.3 packs and auto-buy.
  - **Built first (10a.1),** migration 0073:
    - **Catalogue:** `control.addons`, seeded with OD-04's placeholders -- 500 products at 149 TK a month, a seat at
      49, 1 GB of storage at 29, brand identity at 149; packs of 10 GB at 30 and 100,000 requests at 20, sold from
      10a.3. The operator lists, adds, edits and retires items (`/operator/addons`), each change in the platform
      audit log.
    - **Buying:** an active paid plan with a running period buys a limit or feature add-on to that period's end.
      It is quoted like a plan (a `plan_payments` row of kind `addon`, held 30 minutes) and paid from the balance at
      once (ledger type `addon`). A period costs the monthly price times its term's months, and part of one its
      share of the days left, rounded half up. Up to [10] of one add-on a purchase, a feature only once, and none
      for a limit already unlimited. A wallet payment is refused until 10a.2, since the operator queue would
      otherwise take it for a plan purchase.
    - **Limits:** every reader holds the shop to its snapshot, its overrides and its active limit add-ons through
      one function (`shopLimitsOf`): the dashboard summary, media storage and the downgrade. An add-on counts until
      its own end, whatever any job has done.
    - **Invoices:** `control.invoice_lines` -- the plan at its full price and an upgrade's credit, or the add-on --
      and an add-on's own invoice, naming no plan. Older invoices keep no lines.
    - **Brand identity:** `GET /addons/mine` says whether the shop may switch it on: the add-on, or a plan that
      includes the feature (BRN-05 amended).
    - **Suggestions:** limit add-ons on the shop's own plan join the plans, judged by the plan's price a month with
      theirs added.
    - **Found and fixed:** the upgrade credit's price paid (KNOWN-GAPS §84) and the downgrade's seat cut (§85).
    - **Left for 10a.2:** the downgrade preview counts no add-on, since each ends with the period the downgrade
      waits for; once add-ons renew with the plan, it counts the ones that will. Done in 10a.2's first part.
  - **10a.2 agreed 2026-10-22,** all twelve points as proposed, in two parts: first wallet, renewal, auto-renew, the
    renewal switch and the upgrade extension; then grace, the lapse step, the warnings and the 30-day periods.
  - **Built second (10a.2, first part),** migration 0074:
    - **Wallet:** `POST /addons/purchase` takes a plan purchase's wallet shape, and the operator's queue approves an
      add-on, each queued payment listing the add-ons it pays for. Approval activates the add-on into the period
      running then, never shorter than quoted and never re-priced; when the shop can no longer take it, the amount
      goes to its balance as a top-up, the purchase is `cancelled` (a new status), and the owner is told why.
    - **Renewal:** a renewal quote carries every add-on of the period it renews that is set to renew, at the
      catalogue's price now times its quantity and the term's months, as pending purchases on the same payment that
      start with the new period -- during grace too. Retired items, and add-ons the plan leaves nothing to raise or
      switch on, are left out. From the balance, the payment is two ledger entries, `plan_payment` and `addon`, and
      the invoice has a line for each add-on.
    - **Auto-renew:** the plan first, then add-ons oldest first for as long as the balance reaches; the owner is
      emailed which were left and the shortfall, and the shop's log keeps it (`addon_not_renewed`).
    - **The switch:** `PATCH /addons/mine/:id` sets an add-on's renewal, audited; `GET /addons/mine` says how each
      will renew -- with the plan, from the balance, off, retired or unlimited.
    - **Upgrade:** the quote extends each add-on set to renew from its own end to the new period's end at the new
      term's rate, paid in the same payment; the others keep their end.
    - **Downgrade preview:** counts the add-ons set to renew onto the smaller plan.
    - **Found while building:** add-ons attached to one payment share a purchase time, so their order fell back to
      random ids; a renewal or extension now keeps the purchase time of the add-on it continues, so oldest first holds
      from one period to the next.
  - **10a.2's second part, read 2026-10-22,** found the plan reminders' gap (KNOWN-GAPS §86), that a quote expired by
    BIL-15 can still be paid late, that PLN-18 forbade prompting a no-expiry shop to pay, and that ending an add-on
    needs to know what continues it. All agreed as proposed, with five details.
  - **Built third (10a.2, second part),** migration 0075:
    - **Grace:** an add-on that ends with the shop's period keeps counting while the shop is active or in grace,
      through the one counting rule every limit reader shares.
    - **The add-ons' tick,** after the plans' own: quotes no one is waiting on are cancelled (a late approval still
      starts them, and a rejection cancels at once); an add-on with its own period is renewed from the balance at
      its end, or left to lapse when the balance is short, with the shortfall emailed; an add-on that ended with
      nothing continuing it lapses (a new `continues_id` links each renewal to what it continues), logged, the
      shop's cached limits dropped.
    - **Warnings:** 7 and 1 days before an add-on ends that will not renew -- off, retired, nothing to raise, or the
      balance short (with auto-renew, as far as the balance reaches after the plan) -- by email, once per add-on
      period; `GET /addons/mine` gains `endsSoon` and the `balance_short` renewal state.
    - **Own periods:** pay-as-you-go and no-expiry shops buy add-ons for their own 30 days at the full monthly price,
      renewed from the balance. Switching to pay-as-you-go carries a plan's renewing add-ons into them; a plan bought
      later joins them to its period at their next renewal, prorated (PLN-14 and PLN-18 amended).
    - **Downgrade:** the seat cut and the over-limit record count only the add-ons that will renew, as the preview
      does.
    - **Found and fixed:** the plan reminders after a shop's first period (KNOWN-GAPS §86).
  - **10a.3 read 2026-10-22,** found that bandwidth and API requests were enforced without the shop's limit add-ons,
    which the usage page counts (KNOWN-GAPS §87), and proposed eight points; agreed as proposed.
  - **Built fourth (10a.3),** migration 0076:
    - **Buying:** `POST /addons/packs` buys up to [10] packs from the balance at once, with no quote, by the shop that
      may buy add-ons; an invoice with one line and no period, and the shop's log entry. Packs never expire.
    - **The allowance:** a cycle's allowance is the shop's own limit and what is left of its packs. What a cycle uses
      past its own limit is recorded on its row as taken from packs, so what is left carries over with no job to
      settle it. The stop is past the allowance and the grace of the shop's own limit, and a pack bought in the grace
      adds its full amount on top of what is used; the warnings start again against the new allowance.
    - **Auto-buy:** `PATCH /addons/auto-buy` sets a switch for each metric, off by default and audited. At the
      allowance the minute bandwidth pass or the request flush asks for one pack, in the same transaction as the
      count; the `pack_auto_buy` job buys it, up to [3] a cycle, and emails the owner. A short balance buys none,
      logs it and emails the owner; auto-buy asks again once a pack is bought.
    - **The usage page and its notices:** each metric with packs shows its allowance, what is left and where it
      stops, and the page lists the pack for sale and how auto-buy stands; the notices at the limit and the stop offer
      the pack in one tap and auto-buy. Packs join the suggestions, and after packs two cycles running the next plan
      leads.
    - **Found and fixed:** bandwidth and request enforcement read the shop's limit add-ons (KNOWN-GAPS §87).
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
- **Decided 2026-10-22** (`TENANT-DASHBOARD-DESIGN.md` v2.3, §2, §10 and §11):
  - **Scope:** the dashboard is rebuilt from scratch, Phase 0 to Phase 3, to the prototype
    `docs/brand/lytro-dashboard.html`.
  - **Held for later:** the bell and its notifications wait for Phase 7; storefront settings and its banner
    slides for Slice 12; stock shortfall, returns and profit for Phase 4. Paying Lytro keeps the in-dashboard
    wallet step until Phase 5's hosted page.
  - **Desktop:** the side column shows from 1280 px.
  - **Backend first,** in two pull requests:
    - the smaller reads of §10: auto-renew's state, the top-up bounds, the upgrade quote's period, staff
      without a password, one Home read with the checklist, the address check, the per-shop manifest (KNOWN-GAPS
      §88), and the stock value, purchase and supplier figures;
    - the brand identity.
  - **How it is built:**
    - the operator console's look stays as it is;
    - the dictionaries come from the prototype, with Western digits;
    - charts are plain SVG, and IMEI scanning uses the browser's barcode reader with a fallback;
    - the role editor lists the permissions of the built sections;
    - search finds products until Phase 4;
    - Playwright tests the screens against a mocked API, and the walkthrough runs against a real server in CI.
  - **Order of the pull requests,** after this document:
    1. the backend reads;
    2. the brand backend;
    3. the foundation and shell;
    4. onboarding and Home;
    5. Money;
    6. Menu;
    7. products and media;
    8. categories and attributes;
    9. stock;
    10. purchasing;
    11. delivery;
    12. the brand editor and the themed dashboard;
    13. the policy (KNOWN-GAPS §65) and the walkthrough.
- **The backend reads, agreed 2026-10-22** (13 points), in two parts:
  - **11.1a, built:** `/me`'s `autoRenewEnabled`; the top-up bounds on `/balance`; the upgrade quote's period;
    `mustSetPassword` on `/staff` and, fixing AUTH-31 (KNOWN-GAPS §89), a new member's first sign-in asking for their
    own password; `GET /home` with each part held to the caller's permissions and the owner's checklist as SUP-01
    lists it, and `POST /home/link-shared`; `GET /shops/address-check`; stock value by unit and top-level category
    and each loss's units; each purchase's units and what is still coming; a supplier's last purchase; the batch
    list's total leaving out archived products; and the API contract brought up to the code.
  - **11.1b, built:** the per-shop app manifest and icons (KNOWN-GAPS §88), and the edge config sending `/api` to
    the server before the dashboard's fallback (KNOWN-GAPS §90). Agreed 2026-10-22: the manifest and icons are
    public; the icon is the logo on its own edge colour, or the monogram drawn from the server's own fonts; there is
    no separate app-icon upload. Left to the screens: Shop details says a square logo of 512 px or more makes the
    best icon; the brand identity's square icon replaces the logo when switched on (11.2); an installed iPhone icon
    keeps the one it was installed with.
- **11.2, the brand backend, agreed 2026-10-22** (10 points) **and built:**
  1. One saved identity per shop: three colours, a heading and a body font, corners, spacing, the logo on dark and the
     square icon. The logo on light is the shop's own logo, so a shop never keeps two.
  2. No draft on the server: the preview is the browser's (BRN-06). Saving while on applies at once; Apply is a save
     that switches on.
  3. One contrast check, in `@lytronix/validators`, for the server and the editor. Text colours are derived (ink or
     white). The pairs: text on main, on accent and on background at 4.5:1; the main colour on the background at
     3:1, which is what refuses a pale yellow main (BRN-03's own test); the fixed status colours on the background at
     4.5:1 (BRN-04). A failing colour comes with its nearest passing shade. Failing colours may be saved while off,
     never switched on or saved while on.
  4. Fonts: a heading and a body pick, each from seven curated Bangla and Latin pairs on Google Fonts (the user chose
     this over one Bangla and one Latin face); Galada with Playfair Display sets headings only. No font uploads.
  5. Corners and spacing are stored as preset names; `packages/ui` holds their sizes (11.12).
  6. Switching on needs the add-on or a plan with the feature (one `featureOn`, shared with billing). A trial shop
     saves but does not switch on. The switch survives a lapse; whether the identity shows is read on every request,
     so a lapse reverts at once and holding the add-on again restores it without a tap.
  7. `GET`/`PUT /brand` and `PUT /brand/switch` for settings managers; the live identity as tokens on `/me` and on the
     public `GET /v1/shop`, with a version for caching (BRN-07).
  8. The square icon is square and at least 512 px. While the identity shows, the installed app's icons come from
     it (edge to edge; 80% of a maskable one) and the manifest takes its main and background colours. The
     link-preview image and its replacement belong to the storefront (Slice 12).
  9. The manifest is cached for a minute, BRN-02's [1].
  10. The activity log records a save, switching on and switching off.
- **11.3, the foundation and the shell, agreed 2026-10-23** (8 points; "follow the sketch pixel perfect if there is
  no fix for the UI or UX") **and built:**
  1. Five tabs on a phone, with **+** in the app bar (the design doc's first open question).
  2. The new shell replaces the first build's now. Its working screens (Home, Balance, Plan, Invoices, Team, Roles,
     Activity, Settings, Account and the onboarding) stay reachable inside it, as they were, until their own pull
     request; the shell adds the banner and the section chips above them. Shop's sections and Usage say they are
     being rebuilt; `/more` and `/customers` lead to Menu and Orders.
  3. Lytro's fonts are served with the app; Google Fonts only for a shop's brand fonts (11.12).
  4. No app-wide manifest: each shop's pages link the shop's own (KNOWN-GAPS §88, closed); nothing to install
     outside a shop; the service worker stays and never keeps API answers.
  5. Playwright (Chromium) against a mocked API, on a phone and a desktop, with an accessibility check, in CI;
     each screen beside the prototype's, saved as pictures, no committed pixel baselines.
  6. The shell and the generic pieces now (sheet, dialog, list row, chips, switch, stat tile, banner, toast, empty
     state, skeleton, field, status tag); the screen-specific ones with their screens. The dashboard's roles in
     `light.css` take the prototype's values; the operator console's build is unchanged (its CSS byte-identical,
     its pages pixel-identical).
  7. Search (products) and the + menu (Top up; New order shown for Phase 4; Add product and Add stock with
     11.7 and 11.9).
  8. Counts from `GET /home`; what a person may not open is hidden; a deep link to it lands on Home with a word.
  The shell needed two reads `/me` lacked: the shop's logo (TEN-16, for the bars) and the person's own name (the
  header's initial).
- **11.4a, onboarding, agreed 2026-10-23** (13 points for 11.4, split in two; "yes") **and built:**
  1. One onboarding frame from the sketch (one 480 px column, the wordmark and the language, the owner's four-step
     progress from create-shop on, one card, "Powered by Lytro"); the shell's own exits take it too. The sketch's
     Unavailable and Renew pages come with 11.5.
  2. Set-up saves to the server (KNOWN-GAPS §91): the shop types from `GET /presets`, the home area as the sketch's
     eight chips or any city or district by search, named as the server names them; only what differs is sent.
  3. Checkout keeps the wallet step (decided 2026-10-22), drawn as the sketch's first checkout: one row per enabled
     platform number with its mark and Copy, and the amount sent, filled in and changeable, since a different amount
     waits for the operator's check (BIL-06). The same wallet step now ends the first build's Top up and Renew.
  4. Create-shop asks the server as the owner pauses, and offers its next free address; the link fills from the
     name's Latin letters until the owner edits it (AUTH-11 as written: a Bangla-only name leaves it empty, asked
     2026-10-23). `/me` tells create-shop when an earlier shop was deleted, for its carry-over note (LIF-21).
  5. The sign-in chip names the address it was given and promises nothing; providers show only when the server has
     them; "use a password" keeps the number.
  6. The three password rules are checked on the screen, which holds Save until they pass; the server keeps AUTH-03's
     length rule (asked 2026-10-23: screen only).
  7. The shop picker (KNOWN-GAPS §92): one shop opens at once, several show the picker, none goes to create-shop.
  8. The fonts are declared at the weights the sketch loads (Inter 400 to 600, Noto Sans Bengali 400, 600 and 700),
     so every screen sets its type as the drawing does.
- **11.4b, Home, agreed 2026-10-23** (7 points; "yes i agree") **and built:**
  1. `GET /home`'s checklist names the home area its two delivery zones are named after ("Inside Dhaka city
     ৳70 · outside ৳130").
  2. The checklist's items stay ticked by the server where their screen is not rebuilt yet: the first product
     opens Products (rebuilt in 11.7); the logo and the API key show but open nothing until 11.6.
  3. All seven of §7.1's queue rows, in its order; the five the sketch does not draw use its job row, the icon's tone
     by kind and the count pill only on rows that count. The rows open the list they are about (Stock's filters come
     with its rebuild).
  4. Right now's tiles by permission; Low stock hidden while there are no products; "Trial days left" on a trial;
     no days tile on pay-as-you-go.
  5. The checklist folds into the sketch's one row once its first group (shop, delivery, first product, logo, link
     shared) is done; tapping the row opens the list for that visit.
  6. The link card (Copy, Facebook, WhatsApp) for every member; each records the link as shared on the server, so
     the share-link tick no longer lives in one browser.
  7. A key spending fast is a banner above it all, without the key's name, with See keys.
  Also: the side column's shop address is cut with an ellipsis and shown whole on hover; below 1024 px Home's two
  columns stack 16 px apart where the sketch leaves none (a named fix); the figures row takes the keyboard's focus,
  so a phone's hidden tiles can be scrolled to without a pointer. The first build's Home, its local share-link store
  and checkout's payment-being-checked note went with it.
- **11.5, Money, agreed 2026-10-23** (the read's points with Billing from #211; "i agree with you"), in three parts:
  11.5a the backend, 11.5b Balance, Plan, Billing, Renew and Unavailable (and Home's rejected-payment row), 11.5c Usage
  and Add-ons. Agreed with it:
  1. A payment request is made only when the seller commits -- from the balance on that tap, by a wallet when the
     wallet step opens; every price shown before then is read without making one (`GET /billing/prices`).
  2. Each request carries the amount the seller saw and is refused with the new amount when it differs, for every kind
     (UPG-07's rule).
  3. A new request closes the open one of its kind nothing was sent for; the shop may cancel one itself (#211's
     question 6: yes); a transaction ID goes only on an open request; a rejected payment lets go of its ID.
  4. The invoice keeps its payment's id as a plain copy, not a foreign key, one invoice per payment.
  5. A wallet upgrade's credit stays fixed at the quote (it only ever favours the seller).
  6. The section keeps the name Billing (#211's question 5).
  The screens follow the sketch's final drawings with the wallet step in place of Phase 5's page; the pay-as-you-go
  estimate (PYG-12) and "orders shipped" wait; Renew is a page of its own at `/$shop/renew`.
  - **11.5b's sketch, 2026-10-26** (prototype Part 9, design doc v2.5), the states the screens need that were not
    drawn: Billing's Cancelled state and the Cancel on an awaiting request; the upgrade sheet when the amount changed
    since it was shown; the Renew page of an archived shop with its deletion date; Sign out on the two shell-less
    pages; the pay-as-you-go page without the PYG-12 estimate and the Phase 4 "orders shipped" tile.
  - **11.5a.1, the payment requests, built:** `GET /billing/prices`; the amount-seen check on the plan, upgrade and
    add-on requests; the `cancelled` status, `POST /billing/payments/:id/cancel` and `POST /balance/top-up/:id/cancel`;
    one open request per kind and one open upgrade per shop in the database; transaction IDs only on open requests,
    and freed by a rejection; the invoice's `plan_payment_id` as a plain id, filled for older invoices by their
    transaction ID (KNOWN-GAPS §94, §95).
  - **11.5a.2, the other Money reads, built:** each day's API requests (`control.api_usage_daily`, added in the same
    minute's flush as the cycle's total) on `GET /usage`; the term a paid plan runs on and a lapsed shop's deletion date
    on `/me`, the date worked out by the lifecycle's own rules; the pay-as-you-go fees charged this month on
    `GET /balance`.
  - **11.5a.3, the last three reads, built:** `type` on `GET /balance/ledger` and its export takes one ledger type or
    several, comma-separated, so a chip such as Fees covers order, product, extraction and fraud-check fees in one read;
    the public `GET /plans/pay-as-you-go`, whose limits the pay-as-you-go card and switch sheet show; and `lapseStages`
    on `/me`, the days of each stage a lapse would take the plan through, for the stop sheet's dated steps (agreed
    2026-10-26).
  - **11.5b, the screens, agreed 2026-10-26** (the read's 11 points, "yes, as proposed"; one pull request in three
    commits, the reads of 11.5a.3 first): how to pay offers the balance (greyed with why when short) or the platform's
    wallets, whose step opens in the sheet, the request made only on that tap with the amount shown; a changed amount is
    said and asked again; the statement's chips read several ledger types at once; a suspended owner's Balance opens
    without the shell with the balance and Top up, never the statement (the server keeps it from them, LIF-24); Renew's
    export is one button in three states, read again every 30 seconds while it is made, "we'll email you" only when the
    owner has an email; Billing opened cold pages its list; the banners read the payments list; the section is
    `billing`, `/invoices` leading there; the add-ons card on Plan waits for 11.5c.
  - **11.5b's Plan side, built:** Plan for a trial and a paid plan with its sheets (how to pay, upgrade, move down,
    stop, switch to pay-as-you-go), its banners (stopping, a scheduled move, the 30 days after a move down), the
    pay-as-you-go page with closing the shop, Renew and Unavailable without the shell, and checkout's request made on
    Continue. Named fixes: how to pay names the platform's own wallets with their marks ("By bKash or Nagad"); the
    requirement ids the sketch writes into a few lines are left out; the stop sheet's Bangla second step says day 3, as
    its English and the lifecycle do; the auto-renew switch hides while the subscription is stopping, since nothing
    renews; the upgrade's balance button greys when the new amount is more than the balance; the dialog takes the
    sketch's left-aligned buttons and phone position. Orders handled waits for Phase 4.
  - **11.5b's money side, built:** Balance with its statement (chips read several types at once, each row named from
    its payment when Billing has it, units at the rate, the balance after), Current rates, and the top-up sheet whose
    request is made on Continue; the low-balance, being-checked and rejected banners; a suspended owner's Balance
    without the shell; Billing, `/billing` with `/billing/:id` (a payment opened cold found in the list's first five
    pages), every state with its action -- Pay again, Finish paying, Cancel -- "What happened" and the invoice; Home's
    row for a rejected or lapsed payment and the Billing chip's count; Plan's being-checked and rejected banners;
    `/invoices` leading to Billing. Named fixes: which wallet a payment went by is not recorded until Phase 5's page,
    so a payment says its TrxID ("TrxID 9F2KQ7", not "bKash · TrxID 9F2KQ7"); an awaiting request says nothing was
    submitted rather than that a payment page was opened; Plan's being-checked banner leaves out the new end date, which
    the payment does not carry; amounts below zero read "−৳85.85"; dates write September "Sep", as the sketch does,
    not en-GB's "Sept" (Home's figures too).
  - **11.5c, Usage and Add-ons, agreed 2026-10-26** (the read's ten points, "yes, as proposed"): the states the
    screens need that were not drawn are sketched first; then one pull request in three commits -- the server's
    additions, Usage, then Add-ons with the add-ons cards on Plan and the pay-as-you-go page. Agreed with it:
    1. `GET /addons` says why an item cannot be bought now (trial, grace, a limit the plan no longer has, a feature
       already on), its amount due for each quantity up to 10 (the price is rounded once on the total, so two are not
       always twice one), its days left and its renewal price; the add-on request takes the renewal switch; a pack
       purchase carries the amount shown and is refused when it differs, as every other request is (BIL-09).
    2. `GET /usage` gives the run-out date of bandwidth and requests, worked out by the same rule as the email's, and
       each suggested add-on names its metric, so "To raise it" is per metric.
    3. An add-on is paid from the balance or by bKash or Nagad, whose wallet step opens in the sheet, until Phase 5's
       page, as plans are.
    4. Usage shows both auto-buy switches, with what auto-buy did; one banner, for the metric nearest its stop, says
       an email went only when the owner has an email address, and an SMS only where one goes.
    5. `/addons?buy=<key>` and `/addons?pack=bandwidth|requests` open the sheets; brand identity can be bought now
       and its Set up comes with the brand editor (11.12); an active add-on's row keeps its switch, as drawn.
  - **11.5c's sketch, 2026-10-26** (prototype Part 10, design doc v2.6), the states the screens need that were not
    drawn: Usage's banner for each metric and level (requests at 95%, bandwidth at 100% while it still serves, seats
    and storage full, the free SMS used up), the run-out date only when the allowance runs out inside the cycle, "To
    raise it" with the suggested plan beside each add-on, the two auto-buy switches, auto-buy that could not pay and
    auto-buy at its cap; an add-on renewing from the balance, a balance too short to renew it, one no longer sold or
    not needed after a move to Pro, buying in grace, paying by bKash or Nagad with the wallet step, a changed amount
    and a changed pack price, a pack with a short balance, the ending banner and the renewal-off dialog for storage,
    a seat and brand identity, an add-on payment being checked or rejected, and the pay-as-you-go page's add-ons
    renewing from the balance. The copy leaves out the requirement ids and the stale "Slice 10a.2" chip; the default
    usage sample now has the products banner as its worst metric, which the one-banner rule needs.
  - **11.5c's reads, built:** each offer on `GET /addons` says why it cannot be bought now (`blockedBy`, the key its
    quote would refuse with), what each quantity up to 10 costs as its request would work it out (`amounts`), its days
    left and what one costs for a whole next period (`renewalPrice`); the add-on request takes `renews`; a pack purchase
    takes the amount shown and is refused when the price has changed; `GET /usage` gives bandwidth and requests a
    `runsOutAt`, from the same pace rule as the usage email (now one function, `runOutDate`), and each suggested add-on
    its `metric`. The renewal price of an add-on is one function too (`renewalPrice`), where three places worked it out.
  - **11.5c's Usage, built:** the cycle's dates; the one banner for the metric nearest its stop, worded by metric and
    level, its way out a pack, an add-on, auto-buy or a top-up (none for read-only staff), "an email went too" only for
    an owner with an email address and the free SMS only for bandwidth and requests at 100% and at the stop; each metric
    against its limit, bytes in the unit of the limit as the email writes them, the run-out date from the server, and
    from 80% "To raise it" naming that metric's add-on or pack from the server's suggestion and the suggested plan; the
    two auto-buy switches with what auto-buy did, shown while the shop can buy packs; bandwidth and requests a day.
    "To raise it" opens the add-on's or the pack's sheet (`/addons?buy=`, `?pack=`) or the plan's own sheet on Plan
    (`/plan?plan=<id>`, its upgrade or how to take it). Named fixes: below 1024 px the two charts stack 16 px apart (the
    sketch's `.two` leaves none, as it did on Home); the auto-buy switches' words wrap rather than being cut short, which
    on a phone hid the pack and the metric; dates and figures are written as the other Money screens write them ("6 Oct",
    "100,000"), where Part 10's Bangla sample used month names and "1,00,000"; "To raise it" names the catalogue's own
    add-ons ("Extra 500 products").
  - **The Money screens' Bangla, revised by the owner (2026-10-26):** the 68 lines the dashboard writes itself on Plan,
    Balance, Billing and Renew (the prototype's own lines are unchanged) take the owner's fuller wording, written with
    Western digits as everywhere else; the English is unchanged. Each Bangla line now names the same values as its
    English one, checked when the words are made.
  - **11.5c's Add-ons, built:** the first line says which add-ons renew with the plan, on which day and for how much
    (the server's own list of what the renewal carries), or on pay-as-you-go that each renews from the balance at its
    own end; a banner that needs the seller takes its place -- the trial, grace with Renew, an add-on payment being
    checked or rejected, an add-on ending within 7 days with renewal off (by kind, with the limit it returns to, and
    Turn renewal on) -- and on pay-as-you-go a balance too short for the next renewal says so under it, with Top up.
    Raise a limit, Packs and Features list each item with its price and one action: Buy, the renewal switch (turning
    it off first says when it ends and what happens to what is over the limit then), Needs a plan, Renew first, or
    none; an add-on no longer sold stays listed until it ends. The Buy sheet: how many, up to 10; the limit before and
    after; due now as the server works it out for that many and the days left, then what it renews for; from the
    balance, greyed with Top up when short, or by the platform's wallets, whose step opens in the sheet; the renewal
    switch goes with the request. The pack sheet: the two packs, from the balance only, with both auto-buy switches. A
    changed amount is said and asked again, nothing charged (BIL-09). Plan and the pay-as-you-go page carry an add-ons
    card with what the shop has and the way to all of them. The Bangla follows the owner's style (familiar terms
    transliterated, explanations as plain sentences). Named fixes: the trial banner leaves out designing the brand now,
    and an active brand identity's row has its renewal switch, both until the brand editor (11.12) brings Set up; the
    wallet choice names the platform's own wallets; the shell's trial and grace banners show above the page's own, as
    on every screen; in grace a row names no end of its own, the banner giving the grace's; the products ending banner
    names its limit as the storage one is drawn to; the quantity's minus greys at one; the wallet step's amount note
    says the add-on, not the plan, turns on once a different amount is checked. Two shared fixes the screens showed: a
    page below its section (Add-ons, below Usage) draws no section chips, and on a phone a dialog now sits where the
    sketch puts it whatever its height (centred above the 40% margin), where since 11.5b it sat 40% above the bottom.
  - **The Money screens' Bangla, the owner's second revision (2026-10-27):** 44 of the lines the dashboard writes
    itself on Plan, Balance, Billing and Renew take the owner's style -- familiar terms transliterated (শপ, রিকোয়েস্ট,
    ভেরিফাই, অ্যাক্টিভ, টপ-আপ, গ্রেস পিরিয়ড), explanations kept as plain sentences; Western digits, the English and
    every line's values unchanged.
  - **A sheet's buttons keep their words on one line (named fix, 2026-10-27):** a sheet's foot shares its row equally
    between its buttons, as drawn, but a button whose words need more takes room from the other instead of wrapping;
    the stop sheet's "16 Nov-এ বন্ধ করুন" wrapped on a phone, and so did the pay-as-you-go switch's, which the sketch
    draws wrapped too.
  - **11.6, Menu, agreed 2026-10-27** (the read, "yes, as proposed"): a security fix first, its own pull request (#221,
    KNOWN-GAPS §96: a staff sign-in never changes the person's own account); then the undrawn states sketched (#223,
    prototype Part 11, design doc v2.7); then one pull request in four commits -- the server's additions, Menu with
    Activity, Team with its roles, Settings with Account. Agreed with it:
    1. `/me` says how the person signed in (`own`, or `staff` on the staff page) and names a staff member's roles; the
       Menu's card shows them, and Account for a staff sign-in shows the phone and its password only.
    2. A staff member can be renamed; the shop's name can change (TEN-19), its address never.
    3. Activity's chips filter on the server -- a group of actions and failures only -- so Failed never shows an empty
       page while older failures exist; the page says how many days the plan keeps (AUD-06).
    4. One sentence per action in Bangla and English; the role editor lists the permissions of the sections that exist,
       in words, with "Spends the balance" under paying; adding staff with every seat in use opens the way out at once;
       first passwords are random; Brand identity opens a short page until 11.12; Help's WhatsApp number comes from the
       deployment; Install on an iPhone says how; the dashboard's Bangla follows the owner's second revision line by line.
  - **11.6's reads, built:** `/me` gains `signIn` (`own`, `staff`) and `roles`; `PATCH /staff/:id` takes `name` (null
    clears it); `/shop-settings` reads and takes `shopName`, which the dashboard, the tab title and new installs follow
    at once, the shop's address unchanged; `GET /activity` takes one action or several, comma-separated, and `result`,
    and gives `retentionDays`. The chips' groups (`ACTIVITY_GROUPS`) and the retention rule (`activityRetentionDays`)
    are each defined once, in the shared validators.
  - **11.6's Menu and Activity, built:** the Menu hub's own page replaces the first build's: the shop card with the
    person's role and name, the sections their permissions open, Account, Language, Help and Sign out, and the install
    card (the browser's offer, or the iPhone's steps). Activity is rebuilt: the chips ask the server, one sentence per
    action in both languages, the failure tagged, Show earlier, and the plan's days. Where it differs from the
    drawing, on purpose: an entry names the person, never "You", since the page cannot tell which person is the one
    viewing it; the line under an entry says only what the entry records (a name, or a stock change's figures), so
    the drawn TrxID and "seat freed" lines wait for entries that carry them; the Failed tag's red is darker
    (`danger-text`), as the drawn red on its pink is 4.45:1, under AA; a staff member's tab bar and search follow
    their permissions, as the shell already does; and Help shows only where the deployment names a WhatsApp number.
  - **11.6's Team and Roles, built** (with prototype Part 12, design v2.8, for making and renaming a role): People with
    the seats and their bar, the owner first, "Password not set" from the server's flag; Add staff with a random first
    password (two groups of four, no look-alikes), each role saying what it lets someone do, and New role as a step of
    the sheet that comes back with the role ticked (agreed 2026-10-27); Edit staff renames, changes roles, sets a new
    first password shown once, and deactivates after asking over the Team page, or reactivates. With every seat in use,
    Add staff and Reactivate open the ways out at once from the shop's usage (a seat, the next plan), and someone who
    may not pay is told what they can do; the server's refusal opens the same dialog. Roles: the editor with the role's
    name and the thirteen permissions in words, Create a role and Cancel, Delete once nobody holds the role and after
    asking, the refusal for a role taken up meanwhile in words. Where it differs from the drawing, on purpose: an
    inactive person is marked by the Off tag and a grey initial, not faded, as a 60% fade puts their phone and role
    under AA; stacked cards keep the page's 16 px on a phone, as the other rebuilt pages do; and a staff member's status
    follows the style guide (ইনঅ্যাক্টিভ, অ্যাক্টিভ) where the drawing still says বন্ধ and ডিঅ্যাকটিভ.
  - **11.6's toasts and Settings, built** (agreed 2026-10-27: every toast takes the drawn check; the logo is uploaded
    from 11.6; the extra delivery charge per kg waits for Delivery in 11.11, kept and applied meanwhile): Settings lists
    Shop details, Delivery, Brand identity and Data export as their permissions allow (the export the owner's), then
    what comes later with its phase. Shop details saves the name (the dashboard follows at once; the link never
    changes), what the shop mainly sells (sent only when changed), and the contact details, with one Save held at the
    foot on a phone; the logo is uploaded through the media pipeline -- asked for, sent, prepared, then set -- by a
    small helper the media manager (11.7) reuses. Brand identity opens a short page with the add-on until its editor.
    Data export lists each request, made, ready for 24 hours, or failed with a way to ask again. Where it differs from
    the drawing, on purpose: the card with the shop's web address is "Shop link", since the contact card's street
    address already says "Shop address".
  - **11.6's API keys, built:** the keys with their first characters, websites, last use and expiry, a revoked one kept
    and greyed; New key with its websites one a line (the server's check under the field) and an optional last day,
    the value shown once with Copy and Download; a live key's name and websites edited; Revoke after saying what it
    does. The requests counted this cycle show to whoever may read the shop's usage. Settings and Home's "Create an API
    key" lead here. Where it differs from the drawing, on purpose: a key shows its first characters only, as the server
    keeps no more of it to show; and the expiry is picked with the browser's own date field.
  - **11.6's Facebook and Meta, built:** the Meta Pixel ID with whether it is connected; the Conversions API token
    entered once and never shown again, Replace opening the same field a shop without one sees, Remove at once with
    the pixel kept; the catalog feed link with Copy, when it was made and the four steps in Commerce Manager, and a new
    link after saying the old one stops working. One Save for the pixel and a new token. Where it differs from the
    drawing, on purpose: the requirement ids leave the copy (Part 11's rule), and "the old link answers 404" says the
    old link stops working.
  - **11.6's Account, built:** for the person's own sign-in, the ways to sign in with each one's action (the phone with
    Change password; Google and Facebook connected or offered where the server has them; an email added by its code or
    removed), never the last way in, then language and Sign out; for a sign-in made on the staff page, the phone and its
    password only, its change on the staff route and "ask the owner" when forgotten (TEN-31). `/me` gains `phone`, the
    phone a staff sign-in was made with (null otherwise), since such a sign-in may not read the identities. A provider
    connected from Account now comes back to that shop's Account with "connected", where the callback took it for a
    sign-in before. Where it differs from the drawing, on purpose: Google and Facebook rows carry the providers' names and
    marks, not the sign-in button's "Continue with Google"; the password's rules tick as typed and Save waits for them,
    as on the password step; and the email code's Resend line sits under Verify, as its centring intends.


### Slice 12: shared storefront and product landing pages
- **Depends on:** Slices 0, 0b, 7 and 9 (and branding from Phase 1).
- **Decided first:** KNOWN-GAPS §82 -- no shop-wide per-minute limit for public keys, and the storefront's server
  passes each shopper's IP, so the per-visitor limit sees shoppers, not the server.
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
