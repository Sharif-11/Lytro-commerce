# Implementation plan

Status: draft v1, 2026-10-02. How to actually build the system `SRS.md`/`SRS-detailed.md` specify, `DATABASE-SCHEMA.md` and `API-CONTRACT.md` shape, and `ENGINEERING-STANDARDS.md` governs — in dependency order, not alphabetical or by document section. Each phase lists what it delivers, which requirement IDs it closes, why it sits where it does, and what would break if built out of order. Durations are rough, solo-operator-paced estimates, not commitments — re-estimate once Phase 0 is real and you know your own velocity.

This is the build order for the **new** NestJS/Next.js/Vite multi-tenant platform, not a continuation of the existing single-tenant Express/MongoDB app at `Lytronix/lytronix` — that app is the data source for the one-time migration in Phase 10, and nothing else.

---

## Phase 0 — Tooling and skeleton (no product code yet)

**Delivers:** a repo that can run CI green on an empty app, before a single feature exists.

- Monorepo scaffold: pnpm workspaces + Turborepo (as decided — see the monorepo conversation), `apps/server` (NestJS), `apps/storefront` (Next.js), `apps/admin` (Vite/React), `packages/shared-types`, `packages/config`.
- ESLint + Prettier + Husky + lint-staged + commitlint (`ENGINEERING-STANDARDS.md` §7/§10).
- CI pipeline skeleton: install, `tsc --noEmit`, lint, a placeholder test, build all three apps — green before any real code, so every later PR is gated from day one.
- Local Postgres (Docker Compose), the two base schemas (`control`, `tenant`) with nothing in them yet, row-level security *enabled* as a baseline pattern even before real tables exist (`DAT-02`/`DAT-03`).
- `control.platform_settings` and `control.platform_audit_log` created first, before anything else — almost every later module reads settings or writes audit entries.

**Why first:** every later phase assumes CI gates merges and the tenant/RLS pattern already exists; retrofitting either after real tables exist is far more expensive than starting with them.

---

## Phase 1 — Identity and tenancy core

**Delivers:** a person can sign up, a tenant exists, staff can sign in, every request is tenant-scoped.

- `AUTH-01` to `AUTH-27` — sign-up (phone/email/Google/Facebook), OTP, sessions, password reset, the multi-identity policy (`OD-53`).
- `TEN-01` to `TEN-29` — subdomain resolution, tenant isolation (tested per `SEC-02`'s cross-tenant-ID suite from day one, not bolted on later), session cookie scoping.
- `STF-*` — staff accounts, roles, permissions.
- `AUD-*` — the activity log (every later module writes to this, so it needs to exist first).
- `I18N-01`/`I18N-02` — Bangla-default/English-toggle, at the dashboard-shell level, before there's much UI to translate (far cheaper than retrofitting i18n into finished screens).
- `ADM-01`, `ADM-18` — the operator console's own account system and mandatory TOTP, built now because you'll *use* the operator console to inspect everything else as you build it.

**Why here:** nothing else can be tenant-scoped, permission-checked, or audited until this exists; building catalogue/orders/payments first would mean retrofitting tenant isolation into code that didn't have it, which is exactly the kind of security bug class `SEC-02` exists to catch.

---

## Phase 2 — Plans, billing, lifecycle, balance

**Delivers:** a tenant can trial, buy a plan, upgrade/downgrade, lapse, renew, delete — the entire subscription skeleton, with real money logic, before any product/order code exists.

- `PLN-*`, `TRL-*`, `TRM-*`, `PYG-*` — plans as data, the one-month trial, billing terms, pay-as-you-go.
- `BIL-*` — purchase flow, invoices, the no-refund policy.
- `UPG-*`, `DWN-*` — upgrade proration (the worked examples we recalculated), downgrade grace handling.
- `LIF-*` — the full lifecycle state machine (grace → read-only → locked → archived → deleted) as scheduled jobs.
- `BAL-*`, `RAT-*` — the balance ledger and per-use rates, since almost every later paid feature (SMS, AI, fraud checks, couriers) charges against this.
- `control.used_transaction_ids` — build this alongside `BAL-03`'s top-up verification, not as an afterthought.

**Why here, before products/orders:** `STO-*`'s storage limits, `PRD-04`'s product-count limit, and `QTA-*`'s order-handling limits all read from the plan/tenant-snapshot machinery this phase builds. Building catalogue first means either hard-coding limits temporarily (technical debt) or blocking on this phase anyway.

**Milestone to test against:** the full `BIL-11` → `UPG-09` → `LIF-02` → `LIF-19` cycle, end to end, with the test clock (`§26.3`) — a tenant that trials, pays, upgrades, lapses, and gets deleted, all before any shopper-facing feature exists.

---

## Phase 3 — Catalogue, storefront, caching, media

**Delivers:** the public storefront is live and fast, even with zero orders flowing through it yet.

- `STO-*`, `BND-*`, `RTE-*`, `QTA-*` — the metered-limit enforcement machinery (now has real plan data from Phase 2 to read against).
- `PRD-*`, `ATR-*` — products, variants, flexible attributes.
- `MED-*` — R2 presigned uploads, the validation/resize/variant-generation job, the `control.used_transaction_ids`-style permanence pattern applied to media where relevant.
- `SFT-*` — the shared storefront, served at subdomain root.
- `CCH-*` — the layered cache (device → edge → process memory → Postgres), built in from the start since retrofitting caching into a storefront already in production is a much riskier change than building it in.
- `I18N-01`/`I18N-02` extended to the storefront specifically (device-persisted toggle).

**Why here, before orders:** `CCH-07` explicitly requires checkout/order paths to *never* be cached while catalogue reads *are* — you need the catalogue-caching discipline solid before adding the one thing (orders) that must bypass it, or the bypass rule gets built as an exception to something that doesn't exist yet instead of a deliberate boundary.

**Milestone:** a tenant can add products with images, and an anonymous visitor can browse the storefront with no login, fully cached, in both languages.

---

## Phase 4 — Orders and customers

**Delivers:** the core commerce loop — a shopper (or staff) can create an order, and it moves through the two-axis status model.

- `ORD-01` to `ORD-47` — order creation, the `payment_status`/`fulfillment_status` two-axis model, extraction from text (`AI`-adjacent, see Phase 7 for the AI provider itself).
- `CUS-*` — customer records, addresses, the canonical zilla/thana list.
- `API-11`'s mandatory `Idempotency-Key` for order creation, built in from this phase's first endpoint, not added after a double-order incident.

**Why here:** orders need products (Phase 3) and the plan/limit machinery (Phase 2) to exist first; couriers and payments (next two phases) both *attach to* an existing order, so the order model needs to be stable before either.

---

## Phase 5 — Payments

**Delivers:** real money moves through the system — the highest-risk phase, deserves isolated, extra-careful testing before touching production data.

- `WAL-*` — wallet/bank accounts, the plugin registry pattern (`WAL-6`).
- `PAY-*` — hosted payment sessions, the `created → awaiting_payment → checking → verified` state machine.
- `VER-*` — the three verification tiers (manual, listener, gateway), including the SIM-swap-aware cooldown added earlier (`SEC-14`'s sibling consideration) if you chose to build it.
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

- `ADM-02` to `ADM-17` — full tenant management, the payment-review queue, manual entry tooling, platform settings UI (now has `control.platform_settings` from Phase 0 to manage).
- `SUP-*` — the onboarding checklist, self-service support.
- `API-01` to `API-23` — versioning, the generated OpenAPI spec (`API-15`, from NestJS decorators per the earlier decision), webhooks out, scopes.
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
