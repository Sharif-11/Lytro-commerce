# Implementation plan

Status: draft v1, 2026-10-02; **progress updated 2026-10-16** — Phases 0 and 1 complete; Phase 2 nearly
done (backend slices 1–7 and the UI pass, slice 8, both merged; one UI follow-up still open, see that
phase's own note). How to actually build the system `SRS.md`/`SRS-detailed.md` specify, `DATABASE-SCHEMA.md` and `API-CONTRACT.md` shape, and `ENGINEERING-STANDARDS.md` governs — in dependency order, not alphabetical or by document section. Each phase lists what it delivers, which requirement IDs it closes, why it sits where it does, and what would break if built out of order. Durations are rough, solo-operator-paced estimates, not commitments — re-estimate once Phase 0 is real and you know your own velocity.

New Phase 2 requirements added 2026-10-16 (`STA-*`, `PLN-19`, `WAL-20`/`WAL-21`, `RAT-15`, the `ADM-03`/
`ADM-09` amendments — see `SRS-detailed.md` and `KNOWN-GAPS.md` #20 for the full detail) are slotted into
the phases below where their real dependencies put them, not all crammed into Phase 2 just because that's
when they were specified — most of them need Phase 3/4/5's own data and modules to mean anything.

This is the build order for the **new** NestJS/Next.js/Vite multi-tenant platform, not a continuation of the existing single-tenant Express/MongoDB app at `Lytronix/lytronix` — that app is the data source for the one-time migration in Phase 10, and nothing else.

---

## Phase 0 — Tooling and skeleton (no product code yet)

**Status: ✅ Complete.**

**Delivers:** a repo that can run CI green on an empty app, before a single feature exists.

- Monorepo scaffold: pnpm workspaces + Turborepo (as decided — see the monorepo conversation), `apps/server` (NestJS), `apps/storefront` (Next.js), `apps/admin` (Vite/React), `packages/shared-types`, `packages/config`.
- ESLint + Prettier + Husky + lint-staged + commitlint (`ENGINEERING-STANDARDS.md` §7/§10).
- CI pipeline skeleton: install, `tsc --noEmit`, lint, a placeholder test, build all three apps — green before any real code, so every later PR is gated from day one.
- Local Postgres (Docker Compose), the two base schemas (`control`, `tenant`) with nothing in them yet, row-level security *enabled* as a baseline pattern even before real tables exist (`DAT-02`/`DAT-03`).
- `control.platform_settings` and `control.platform_audit_log` created first, before anything else — almost every later module reads settings or writes audit entries.

**Why first:** every later phase assumes CI gates merges and the tenant/RLS pattern already exists; retrofitting either after real tables exist is far more expensive than starting with them.

---

## Phase 1 — Identity and tenancy core

**Status: ✅ Complete.**

**Delivers:** a person can sign up, a tenant exists, staff can sign in, every request is tenant-scoped.

- `AUTH-01` to `AUTH-27` — sign-up (phone/email/Google/Facebook), OTP, sessions, password reset, the multi-identity policy (`OD-53`).
- `TEN-01` to `TEN-29` — subdomain resolution, tenant isolation (tested per `SEC-02`'s cross-tenant-ID suite from day one, not bolted on later), session cookie scoping.
  - `TEN-30` (added 2026-10-16, after this phase shipped) — dashboard-settings contact phone/email/shop address. **Shipped 2026-10-16** (`PHASE-1-PLAN.md` Slice 12, `D35`): a small, dependency-free CRUD addition, built immediately rather than left as a standing gap.
- `STF-*` — staff accounts, roles, permissions.
- `AUD-*` — the activity log (every later module writes to this, so it needs to exist first).
- `I18N-01`/`I18N-02` — Bangla-default/English-toggle, at the dashboard-shell level, before there's much UI to translate (far cheaper than retrofitting i18n into finished screens).
- `ADM-01`, `ADM-18` — the operator console's own account system and mandatory TOTP, built now because you'll *use* the operator console to inspect everything else as you build it.

**Why here:** nothing else can be tenant-scoped, permission-checked, or audited until this exists; building catalogue/orders/payments first would mean retrofitting tenant isolation into code that didn't have it, which is exactly the kind of security bug class `SEC-02` exists to catch.

---

## Phase 2 — Plans, billing, lifecycle, balance

**Status: ✅ Closeable, 2026-10-16.** Backend slices 1–7 (`PHASE-2-PLAN.md` §6) are merged, and so is the
consolidated UI pass (slice 8, D2-10) including D2-12's marketing-site/upsell pair (PR #84). `KNOWN-GAPS.md`
#1 (`BillingController`/`BalanceController` missing `lapsed: true`) is fixed (PR #87) with e2e coverage.
`PLN-19` (added 2026-10-16, after every slice above shipped) is built as Slice 9; `RAT-15` (same addition
date) is deferred to Phase 5 per `D2-13`. One real bug remains, tracked but not blocking: `KNOWN-GAPS.md` #9
(`LIF-24` suspension is a full outage, not `read_only` as written — needs a product decision, not just a
code fix).

**Delivers:** a tenant can trial, buy a plan, upgrade/downgrade, lapse, renew, delete — the entire subscription skeleton, with real money logic, before any product/order code exists.

- `PLN-*`, `TRL-*`, `TRM-*`, `PYG-*` — plans as data, the one-month trial, billing terms, pay-as-you-go.
- `PLN-19` (added 2026-10-16) — per-limit "unlimited" on a plan, independent of any specific limit's
  number. **Shipped 2026-10-16** (`PHASE-2-PLAN.md` Slice 9): schema/plan-editor/every existing consumer
  fixed; limit-enforcement consumers that don't exist yet (storage, bandwidth, order handling) get their
  own `null` branch when Phases 3/4 build them, not invented early.
- `BIL-*` — purchase flow, invoices, the no-refund policy.
- `UPG-*`, `DWN-*` — upgrade proration (the worked examples we recalculated), downgrade grace handling.
- `LIF-*` — the full lifecycle state machine (grace → read-only → locked → archived → deleted) as scheduled jobs.
- `BAL-*`, `RAT-*` — the balance ledger and per-use rates, since almost every later paid feature (SMS, AI, fraud checks, couriers) charges against this.
- `control.used_transaction_ids` — build this alongside `BAL-03`'s top-up verification, not as an afterthought.

**Why here, before products/orders:** `STO-*`'s storage limits, `PRD-04`'s product-count limit, and `QTA-*`'s order-handling limits all read from the plan/tenant-snapshot machinery this phase builds. Building catalogue first means either hard-coding limits temporarily (technical debt) or blocking on this phase anyway.

**Milestone to test against:** the full `BIL-11` → `UPG-09` → `LIF-02` → `LIF-19` cycle, end to end, with the test clock (`§26.3`) — a tenant that trials, pays, upgrades, lapses, and gets deleted, all before any shopper-facing feature exists.

---

## Phase 3 — Catalogue, storefront, caching, media

**Delivers:** the public storefront is live and fast, even with zero orders flowing through it yet, and every tenant has a full inventory system behind deliberately simple screens.

**Detailed plan: `PHASE-3-PLAN.md`** (2026-10-17) — 12 slices, which requirements each completes or only partially completes, and the dependencies between them. Scope changes made there, summarised:
- **Added:** `ATL-*`, `UOM-*` (normalized attributes, units of measure), `INV-*` (stock ledger, levels, batches/expiry, serials, reservations), `PUR-*` (suppliers, purchase orders, receiving), `PST-*` (shop-type presets) — all new §14.4–14.8 of `SRS-detailed.md`.
- **Pulled forward from Phase 8:** a public-API-key subset (`API-01` public half, `API-03/04/05/08/10/23/24`), since the storefront reads the catalogue through public keys (D3-1).
- **Rate limits without Redis yet:** `RTE-*` are built behind a limiter interface with in-process and PostgreSQL stores; Phase 9 swaps in Redis (D3-2).
- **Moved to Phase 4:** `QTA-*` — every quota rule counts at order handling, which needs orders (D3-3).

- `STO-*`, `BND-*`, `RTE-*` — the metered-limit enforcement machinery (now has real plan data from Phase 2 to read against).
- `PRD-*`, `ATR-*`, `ATL-*`, `UOM-*` — products, variants, flexible attributes, units.
- `INV-*`, `PUR-*`, `PST-*` — inventory, purchasing, shop-type presets.
- `LND-*` — product landing pages (added 2026-10-17): the shareable single-product page, link previews, stable links and Meta Pixel views. Its order form lands in Phase 4 and its advance/full payment in Phase 5.
- `BRN-*` (added 2026-10-18) — brand identity: name and logo free on every plan; colours, fonts, shape and spacing behind the "Use my brand" switch, with editor and live preview, built in Phase 3's UI slices. Buying it as an add-on (`BRN-05`) comes with this phase's add-on slice. The public API moves to `https://api.lytro.app/v1` (`API-14`) in Slice 8.
- `PLN-13` to `PLN-15`, `UPG-14`, `BND-04`, `RTE-11` (deferred by Phase 2's D2-4; scheduled 2026-10-18) — add-ons: the catalogue, buying from the balance or directly, renewal with the plan, and opt-in auto-buy packs. Phase 3's Slice 10a.
- Marketing site redesign (`apps/website`, `LANDING-PAGE-DESIGN.md`, scheduled 2026-10-18) — a parallel track: step A (the Lytro brand, the hero claim box, pricing with the billing-term toggle and the rest) now; step B (inventory and statistics spotlights, the storefront showcase) once those features are live.
- D3-11 (decided 2026-10-18) — one dashboard address, `app.lytro.app/<shop>`: shop subdomains and custom domains serve public pages only; `TEN-31` added and `TEN-08`, `TEN-09`, `TEN-17`, `TEN-26`, `TEN-29`, `SFT-02` amended. Built first, as Phase 3's Slice 0, because the storefront takes over every path on a shop's host.
- `SUP-01` (pulled forward from Phase 8, 2026-10-17) — the setup checklist on the dashboard home, with the items whose features exist in this phase: shop created, delivery charges, first product, sharing the link, and an API key under "Later". Later phases add theirs.
- `DLV-*`, `FED-*`, `PRD-17`, `PRD-18`, `ATR-16` — Facebook-seller essentials (added 2026-10-17): delivery zones (Inside/Outside the seller's home area ready by default, Dhaka city until changed, built from the location list's divisions, districts, cities and thanas), size charts, one-tap option sets, "Duplicate product" and the Meta catalog feed. Zone *settings* land here; the zone-based charge is computed by Phase 4's order pricing.
- `MED-*` — R2 presigned uploads, the validation/resize/variant-generation job, the `control.used_transaction_ids`-style permanence pattern applied to media where relevant.
- `SFT-*` — the shared storefront, served at subdomain root, including the footer/contact-us section (`SFT-21`, added 2026-10-16, reads `TEN-30`'s contact fields).
- `CCH-*` — the layered cache (device → edge → process memory → Postgres), built in from the start since retrofitting caching into a storefront already in production is a much riskier change than building it in.
- `I18N-01`/`I18N-02` extended to the storefront specifically (device-persisted toggle).

**Why here, before orders:** `CCH-07` explicitly requires checkout/order paths to *never* be cached while catalogue reads *are* — you need the catalogue-caching discipline solid before adding the one thing (orders) that must bypass it, or the bypass rule gets built as an exception to something that doesn't exist yet instead of a deliberate boundary.

**Milestone:** a tenant can add products with images, and an anonymous visitor can browse the storefront with no login, fully cached, in both languages.

---

## Phase 4 — Orders and customers

**Delivers:** the core commerce loop — a shopper (or staff) can create an order, and it moves through the two-axis status model.

- `ORD-01` to `ORD-47` — order creation, the `payment_status`/`fulfillment_status` two-axis model, extraction from text (`AI`-adjacent, see Phase 7 for the AI provider itself). Order lines hold stock through Phase 3's reservation primitive (`INV-15`/`INV-16`) and returns call its restock-or-damaged service (`INV-17`); the order-line halves of `PRD-06/07/08/13`, `ATR-07/08/09/13/15`, `ATL-06` and `UOM-04` finish here (`PHASE-3-PLAN.md` §3.2).
- `QTA-01` to `QTA-07` (moved here from Phase 3, D3-3) — counted at order handling; this phase's manual mark-shipped trigger first, Phase 6's courier booking second.
- `TAX-*`, `MNU-*` (adopted 2026-10-17) — need order lines; land with or right after this phase.
- `ORD-06a` (amended 2026-10-17) and `DLV-03`/`DLV-04` — delivery charge by the order's zone, once per order, with product overrides and Adjustable-mode weight extras on top; `PRD-08`'s "delivery charge only" advance and the shop-wide default policy; `SFT-20`/`LND-08` estimates use the same function.
- `DLV-06`, `DLV-07`, `INV-24` and `UOM-04` (added or amended 2026-10-17) — public order creation refuses an address in a "no delivery" zone or outside a product's zone limit (staff orders get a warning); order lines take decimal quantities for measured units and record the pack amount of a shared-stock variant, so returns restore the same amount.
- `CMB-01` to `CMB-10` — combo packs (added 2026-10-17): a product sold at its own price whose parts are other products' variants, fixed or chosen by the shopper per unit; ordering reserves and ships each part, returns restore each part, and the combo has its own landing page and feed row. Scheduled here because it needs order lines; its availability recompute extends Phase 3's `InventoryLedger.apply()`.
- `LND-07` to `LND-12`, `LND-16` — the product landing page's order form (name, phone, district, thana, address, comments; variant and quantity), live totals, submission through `ORD-02` with `source = landing_page`, the per-IP limit, the confirmation screen, the Meta `InitiateCheckout`/`Purchase` events and the server-side Conversions API event. Cash-on-delivery products complete here; advance and full prepayment complete in Phase 5 (`LND-10`).
- `CUS-*` — customer records and addresses. The canonical zilla/thana list itself (`CUS-08`) arrives earlier, in Phase 3, because delivery zones are built from it; this phase uses it for every address form.
- `API-11`'s mandatory `Idempotency-Key` for order creation, built in from this phase's first endpoint, not added after a double-order incident.
- `STA-01` to `STA-04` (added 2026-10-16) — the tenant's own business statistics: order/revenue stats
  bucketed weekly/monthly/quarterly/yearly, hot-selling products, per-product selling trends. Belongs here,
  not Phase 2 where it was first specified, because every figure reads real `tenant.orders` rows (and
  `STA-02`/`STA-03` also need Phase 3's products) — it's a reporting layer *over* this phase's own data,
  not buildable before it. Natural last slice of this phase, once orders themselves are stable.

**Why here:** orders need products (Phase 3) and the plan/limit machinery (Phase 2) to exist first; couriers and payments (next two phases) both *attach to* an existing order, so the order model needs to be stable before either.

---

## Phase 5 — Payments

**Delivers:** real money moves through the system — the highest-risk phase, deserves isolated, extra-careful testing before touching production data.

- `WAL-*` — wallet/bank accounts, the plugin registry pattern (`WAL-6`).
- `PAY-01`, `PAY-05`, `PAY-06`, `PAY-23` (amended or added 2026-10-18) — manual payments on our hosted page at `pay.lytro.app/<session>`: the shop's name and logo, each wallet's official logo and colours in its own panel, steps for the account type, and no third-party code. A wallet whose gateway the seller has connected sends the shopper straight to that wallet's own checkout, never through our page.
- `PAY-*` — hosted payment sessions, the `created → awaiting_payment → checking → verified` state machine.
- `LND-10` (second half) — a product landing page whose product requires a partial advance or full prepayment (`PRD-08`) sends the customer to the hosted payment page; the stock reservation's expiry (`INV-16`) is set from the real payment-session lifetime here.
- `VER-*` — the three verification tiers (manual, listener, gateway), including the SIM-swap-aware cooldown added earlier (`SEC-14`'s sibling consideration) if you chose to build it.
- `WAL-20`/`WAL-21`, `RAT-15` (added 2026-10-16) — the per-order commission on level-3 (automated gateway)
  verification, charged to the tenant's balance regardless of plan, falling back to listener/manual
  verification rather than blocking the order when the balance can't cover it. Build this alongside
  `WAL-19`'s gateway plugins themselves, not after — the commission is part of what "level 3" means, not a
  bolt-on; confirming the listener (level 2) stays commission-free either way (`LSN-07`/`PYG-15`, unchanged).
- `LSN-*` — the SMS listener app's pairing/upload/matching pipeline, `tenant.listener_messages` with its 90-day redaction job.
- `TVR-*` — tenant verification before the hosted page goes live, abuse controls.
- `SEC-16` (stack traces never in production) should already be true everywhere by now, but re-verify specifically on payment error paths — this is the surface most likely to leak a provider's raw error text if someone's in a hurry.

**Why isolated:** this is the one phase where a bug has a direct, immediate financial consequence (double-charging, failing to credit a real payment). Build it after orders exist (so there's something to verify payment *against*), and test it harder than anything else in the plan.

**Milestone:** the scripted order-and-payment check from `OBS-08` passes against a real staging tenant with sandbox credentials for at least one wallet and one gateway.

---

## Phase 6 — Couriers

**Delivers:** booking and tracking, adapter by adapter, starting with the one the SRS names as launch-required.

1. **Steadfast first** (`CRR-01` names it explicitly) — book, track, webhook (HMAC verification per the real vendor docs), contract test (`CRR-21`) passing before it touches a real tenant.
2. **Pathao second** — exercises the registration-handshake requirement (`CRR-27`) the Steadfast adapter didn't need, proving the adapter interface actually generalizes rather than being accidentally Steadfast-shaped.
3. **RedX third** — exercises the bilingual-message storage and payout-event-routing logic (`CRR-12`) neither of the first two adapters needed.
4. `PRF-05`/`CRR-26` — the circuit breaker, built once, used by all three adapters and every later third-party integration (SMS, AI, fraud).
5. `CRR-17` — payout reconciliation, once at least one adapter's payout data shape is understood (RedX conveniently folds this into its webhook stream, which is itself a useful edge case to build against).

**Why three adapters in this order, not just Steadfast:** building a second and third adapter *during* initial development, not months later, is what actually proves the adapter boundary holds — if Pathao's handshake or RedX's payout-event quirk had forced a change to shared booking/order code, you'd want to know now, not after Steadfast-only code has calcified into assumptions.

---

## Phase 7 — SMS, notifications, fraud, chat/AI

**Delivers:** every remaining third-party-dependent feature, all behind the circuit breaker built in Phase 6.

- `SMS-01` to `SMS-19` — the ten events, tenant-editable templates (Bangla default), the balance-charging rules.
- `NTF-*`, `NTC-*` — push/in-app notifications (fixed platform copy, per the `I18N-03` decision), the notice board.
- `I18N-03` fully wired — this is the natural point to confirm the whole localization system (dashboard, storefront, SMS, notices, error messages from `SEC-16`) is consistent, since every piece now exists.
- `FRD-*` — fraud checking, the shared cross-tenant hash table (`control.fraud_hashes`), the adapter-pattern placeholder for whichever aggregator gets chosen later (`OD-47`).
- `CHT-*`, `AI-*` — chat, AI auto-reply (language-matching per `AI-09`, not a toggle), order extraction from text.

**Why last among the "features" phases:** every one of these is a third-party integration that benefits from the circuit breaker, balance-charging, and adapter patterns already proven in Phases 2 and 6 — building AI/fraud/SMS *before* those patterns exist risks three more one-off, inconsistent integrations instead of three more adapters following an established shape.

---

## Phase 8 — Admin console, support, public API polish

**Delivers:** the operator can actually run the business, and external integrators have a real API surface.

- `ADM-02` to `ADM-17` — full tenant management, the payment-review queue, manual entry tooling, platform settings UI (now has `control.platform_settings` from Phase 0 to manage). `ADM-03`'s tenant-detail business-summary/order-stats drill-down and `ADM-09`'s period-bucketed SaaS revenue/tenant-count reports (both amended 2026-10-16) read `STA-01`'s own aggregates (Phase 4) and `WAL-20`'s commission revenue (Phase 5) — sequence this after those two land, not before, or the figures would have nothing real to show. Note the tenant-list/search and suspend/restore slice of `ADM-02`/`ADM-04` already shipped early, in Phase 2's own UI pass (slice 8) — built ahead of this phase because `LIF-24` needed it and nothing else in `ADM-*` was ready to ride along yet; the rest of this range is still genuinely Phase 8 work.
- `SUP-*` — self-service support: help centre, tickets, response targets, status page. The setup checklist (`SUP-01`) starts earlier, in Phase 3's dashboard pass, and each phase adds its own item as the feature ships: wallet number and listener phone (Phase 5), courier (Phase 6), SMS events (Phase 7).
- `API-01` to `API-23` — versioning, the generated OpenAPI spec (`API-15`, from NestJS decorators per the earlier decision), webhooks out, scopes. The public-key subset already shipped in Phase 3 (D3-1); this phase adds secret keys, scopes, IP allow-lists and webhooks on the same `api_keys` table.
- `SMS-18` (shop-ready SMS) technically could land in Phase 1 alongside sign-up, but is listed here as a reminder to verify it still fires correctly once the full SMS/balance machinery from Phase 7 exists around it.

**Why this late:** the operator console's real value is managing tenants and data that only exist once Phases 1–7 are live; building a full admin UI against empty tables is low-value work done early.

---

## Phase 9 — Non-functional hardening

**Delivers:** the system survives real failure, not just the happy path.

- `DAT-19` to `DAT-57` — the standby, replication, backup/restore drills, the shared Redis VPS (`RED-01` to `RED-05`).
- `AVL-*` — active-active app servers, Cloudflare Load Balancing (per the earlier decision), zero-downtime deploys.
- `BKP-*` — backup policy verified with an actual restore drill, not just configured.
- `SEC-01` to `SEC-16` — a full pass, not a checklist glance: CSRF tokens, SSRF guards, credential handling, the stack-trace rule, re-verified end to end now that every surface they apply to actually exists.
- `PRF-01` to `PRF-05` — load testing at twice expected peak, circuit breakers re-verified under real failure injection.
- `LOG-*`, `MON-*`, `OBS-*` — the monitoring stack, timed to the 50-paying-tenant trigger already decided.
- `LEG-*` — terms of service, privacy policy, the legal review checklist (VAT, payment handling) — should start *before* this phase ends, since legal review has its own lead time independent of engineering.

**Why last, not spread throughout:** many individual `SEC-*`/`DAT-*` items were actually built incrementally in earlier phases (RLS in Phase 0, idempotency in Phase 4, etc.) — this phase is the *integrated* pass, verifying the whole system's failure modes together, which can only be done once the whole system exists.

---

## Phase 10 — Migration and launch

**Delivers:** the single-tenant MongoDB app becomes tenant #1 of the new platform, and the new platform goes live.

1. `DAT-16` — migrate the existing `Lytronix/lytronix` MongoDB data into PostgreSQL as the first real tenant; reconciliation report (row counts, checksums) before cutover; old system read-only during the move; a rehearsed rollback plan.
2. Run the full `S01`–`S12` E2E suite (`§26.1`) against staging with real sandbox integrations.
3. Close the remaining **"Accepted placeholder"** items from `SRS-detailed.md` §25 with real numbers: exact per-use rates, the fraud aggregator choice, the legal retention minimum, final add-on pricing — these were deliberately deferred to *now*, not skipped.
4. First production deploy follows `ENGINEERING-STANDARDS.md` §7's CD sequence exactly: migration first against a fresh backup, standby-first health-checked rollout, smoke test, manual promotion.

---

## What this plan deliberately does not do

- It doesn't say how many people to assign to each phase — that's the staffing conversation from earlier in this project, and a solo operator will simply take longer per phase, not skip phases.
- It doesn't re-litigate any decision already made in the other docs — where this plan references a requirement ID, that ID's text in `SRS-detailed.md` is the authoritative definition; this document is sequencing, not specification.
- It doesn't assume the phase durations are real estimates — they're placeholders to replace once Phase 0 gives you an actual velocity baseline.
