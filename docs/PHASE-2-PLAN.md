# Phase 2 plan: plans, billing, lifecycle, balance

Status: draft for discussion, 2026-10-13. Builds on `IMPLEMENTATION-PLAN.md` Phase 2. Requirement IDs refer to `SRS-detailed.md` §7–§12; schema to `DATABASE-SCHEMA.md` §2.3, §2.4, §3.4, §4 (already sketched there — this plan migrates what's designed, not inventing new shapes). No test plan doc yet; one is written once slice 1 is underway, the same way `PHASE-1-TEST-PLAN.md` followed `PHASE-1-PLAN.md`.

Items marked **Decision** need your answer before the slice they affect starts. Items marked **Proposed** are my recommendation and take effect unless you change them.

---

## 1. Goal and exit criteria

**Goal.** A tenant can trial, buy a subscription plan or choose pay-as-you-go, upgrade, be scheduled for downgrade, lapse through the full grace → read-only → locked → archived → deleted lifecycle, and be restored at any point before deletion — with a correct, append-only balance ledger and a gap-free invoice trail throughout. All of this works and is fully tested **without** a real payment gateway existing yet (see Decision D2-1) — Phase 5 wires a real wallet/gateway into the confirmation step this phase builds, without changing this phase's state machine.

**Phase 2 is complete when all of these hold:**

1. Every `M` requirement in PLN, TRL, TRM, PYG, BIL, UPG, DWN, LIF, BAL and RAT has a passing automated test.
2. The lifecycle scheduled job transitions a tenant through every state boundary (grace, read-only, locked, archived, deleted) within its 15-minute SLA (LIF-03), derived purely from stored dates (LIF-04) so a test clock can simulate any date, and is idempotent under a doubled or missed run (LIF-23).
3. The balance ledger is append-only (a database trigger refuses UPDATE/DELETE, the same pattern as `tenant.activity_log`), and `control.tenants.balance_amount` is always re-derivable as the sum of its own tenant's ledger rows.
4. An operator can create, edit, retire and version plans and billing terms, assign a not-for-sale plan directly, and the purchase/comparison screens render entirely from that data — changing a price in the editor changes what a tenant sees with no deploy (PLN-12).
5. The full cycle the implementation plan itself names as this phase's milestone passes end to end against a test clock: `BIL-11` (purchase after lapse) → `UPG-09` (upgrade) → `LIF-02` (non-renewal → grace) → `LIF-19` (day-60 deletion) — one tenant, one test, no manual steps.
6. Staging-equivalent CI is green on `main`, and the pull request flow has been used for every slice.

**Out of scope for Phase 2** (explicitly deferred, not forgotten):
- A real wallet/gateway integration and the hosted payment page's actual provider UI — Phase 5 (`WAL-*`, `PAY-*`, `VER-*`). This phase builds the state machine BIL/UPG/DWN depend on, against a stand-in confirmation step (D2-1).
- Add-ons (`PLN-13/14/15`) — `S`-priority, not needed for the exit criteria above. A follow-up slice after Phase 2 ships, or folded into Phase 5 if the add-on catalogue ends up needing the same hosted-page work anyway.
- Products, orders, couriers (Phase 3/4/6) — pay-as-you-go's order/product fees (`PYG-02`, `PYG-16`) are built as balance-ledger mechanics now, wired to real `tenant.orders`/`tenant.products` rows once those tables exist.
- Everything else Phase 1 already deferred past itself that this phase doesn't touch (KYC depth, custom-domain provisioning beyond the stub, the operator console's full feature set beyond what this phase specifically needs — see D2-9).

---

## 2. Decisions needed

| # | Decision | Proposed | Affects |
|---|---|---|---|
| D2-1 | **The chicken-and-egg: BIL-03 says plan purchase reuses "the same three verification levels as shopper payments," but that machinery (`WAL-*`/`PAY-*`/`VER-*`) is explicitly Phase 5's scope, built after orders exist "so there's something to verify payment against."** | Build BIL's full state machine (`pending` → `needs_review`/`verified`, BIL-04 to BIL-11) now, against a **stand-in confirmation step** — mirrors Phase 1's own stub-provider pattern (D6: SMS/mail against a console stub before a real provider was chosen). Concretely: a `control.plan_payments` table (new, not the tenant-schema `payment_sessions`/`payments` Phase 5 builds for shopper orders — those are a different bounded concern) holding `pending`/`needs_review`/`verified`/`expired` rows per purchase quote, confirmed today by an operator action (manual, audited) standing in for a real hosted page's auto-verification. Phase 5 swaps the confirmation trigger from "operator marks it" to "the real hosted page's listener/gateway verifies it" — the state machine, invoice, snapshot-activation and audit side effects (BIL-05) don't change. This is the single biggest sequencing risk in this plan; confirm before slice 4 starts. | Slice 4 |
| D2-2 | `BAL-01` says "each **subscriber** shall have one balance," but the schema Phase 1 already built puts `balance_amount`/`balance_frozen` on `control.tenants` (per-**tenant**). | Keep it on `tenants`, as already built — `OD-10` limits one subscriber to at most one owned tenant today, so the two are equivalent in practice; revisit only if a subscriber-owns-multiple-tenants model is ever introduced (not currently planned). Treat `BAL-01`'s wording as describing the common case, not a literal second table. | Slice 1 (balance) |
| D2-3 | `PLN-02`: "each edit creates a new version... the previous version stays retrievable." | Add `control.plan_versions` — a frozen copy of the plan row inserted immediately before every update, not reconstructed from `platform_audit_log`'s free-form summary field. The editor needs to actually *render* a past version, not just diff two JSON blobs. | Slice 2 (plans) |
| D2-4 | Add-ons (`PLN-13/14/15`), `S`-priority. | Defer past this phase's exit criteria entirely (§1 above already reflects this). A follow-up slice once the `M`-priority core ships. | Scope only, no slice |
| D2-5 | Where lifecycle/billing events get audited — `tenant.activity_log` (owner-visible, per-tenant) vs. `control.platform_audit_log` (operator/platform-wide) — several requirements (`LIF-25`, `DWN-17`, `UPG-15`) just say "the audit log" without naming which. | Split by actor, matching Phase 1's `AUD-08` convention: tenant-caused actions (upgrade, schedule/cancel a downgrade, cancel subscription) → `tenant.activity_log` only. Operator-caused actions (plan/term edit, rate change, plan assignment, balance adjustment, suspension) → `control.platform_audit_log`. System-caused lifecycle transitions (the scheduled job moving a tenant to `grace`/`read_only`/etc.) → `tenant.activity_log`, so the owner can see *why* they were locked out, with no platform-wide mirror needed (an operator can already see tenant state directly). | Slice 1 (balance) sets the pattern; every later slice follows it |
| D2-6 | Scheduled-job mechanism for lifecycle transitions (`LIF-03`: within 15 minutes of each boundary), renewal reminders (`BIL-14`), low-balance notices (`BAL-13`), deletion warnings (`LIF-18`) and the day-60 deletion job (`LIF-19`). | A new pg-boss **recurring** job (`boss.schedule()`, cron-style — distinct from the one-shot `send()` jobs Phase 1's SMS/mail retries use), firing every 5 minutes, scanning `tenants` by `period_end`/`suspended_at` against the stage-length settings in `platform_settings` (`LIF-26`). Reuses D25's job-queue infra from Phase 1; no new mechanism. | Slice 7 (lifecycle) |
| D2-7 | Rate/platform-settings read path — `DATABASE-SCHEMA.md` already specifies "cached in-process, refreshed on a short interval" but doesn't pick the interval. | 5-second TTL, mirroring Phase 1's `TenantCache` (`R5`) exactly, for the same reasoning and for consistency of pattern. | Slice 1 (balance/rates) |
| D2-8 | Module boundaries for the new code (`ENGINEERING-STANDARDS.md` §1, one module per bounded concern). | Two new modules: **`billing`** (plans, terms, prices, purchase, upgrade, downgrade, invoices, lifecycle state machine) and **`balance`** (ledger, rates, top-up). Kept separate because `balance` is reused by non-billing charges later (SMS/AI/fraud-check spending in Phase 7) and shouldn't be nested inside a module named for subscriptions. | Slice 1 onward |
| D2-9 | The operator console has only a login screen today (Phase 1 slice 10, `D30`) — no screens at all for plan/term/rate editing, which this phase needs operators to actually use. | Build the minimum operator-console shell this phase needs (a gated layout route, the same shape as the tenant dashboard shell's `D32`) alongside the plan/term/rate editor screens themselves, rather than treating the full `ADM-02`–`ADM-17` feature set as a prerequisite. Scoped narrowly: just enough nav and layout to hold these specific editor screens, not a general-purpose operator console. | Slice 2, 1 |
| D2-10 | `UI waits until phase backend is done`[^note] | One consolidated frontend pass after every backend slice (1–7) is merged — purchase/comparison screens, upgrade/downgrade quote screens, balance statement, invoice list, trial countdown, lifecycle banners, and the operator editor screens from D2-9 — not built incrementally per slice. | Slice 8 |
| D2-11 | **Decided 2026-10-13:** pay-as-you-go tenants auto-archive after inactivity, reversing `PYG-08`'s original "indefinitely, regardless of inactivity" stance. | 30 days with no qualifying activity (an order-fee charge, a product-creation-fee charge, or a balance top-up — never a mere sign-in) moves the tenant directly to `archived`, the same no-grace shape `PYG-09` already uses for voluntary closure, with a day-23 warning (in-app, push, email — never SMS) before it happens. Written up as `PYG-21` in `SRS-detailed.md`. Needs a `last_activity_at` column on `control.tenants` (denormalized, updated whenever a qualifying ledger entry is written — the same cached-derived-value pattern `balance_amount` already uses, D2-2), since re-deriving it from the ledger on every job run would mean scanning every pay-as-you-go tenant's full ledger history each pass. | Slice 1 (column + the ledger-write hook), slice 7 (the job itself) |
| D2-12 | **Decided 2026-10-13:** two pieces of wiring, explicitly deferred until this phase's backend is done — not built now, tracked here so they aren't forgotten when slice 8 starts. **(a) Marketing-site guest purchase flow** (`apps/website`): a guest selects a plan and term on the pricing page and clicks Buy; the button carries the choice as a query param (`/sign-in?planId=X&termId=Y`) into the existing stepped onboarding (`AUTH-28`) unchanged — no new screen, no change to that flow. Right after create-shop, if a plan intent was carried through, the owner is sent to the purchase screen pre-filled with it instead of (or alongside) the set-password offer; skipping it falls through to the trial exactly as today. Needs `apps/website`'s pricing section rebuilt against the real public plans/terms read endpoint (replacing the deliberately-static, no-prices version Phase 1 shipped) and a public, unauthenticated plans/terms read endpoint to exist (slice 2) before the marketing page can show a real price at all. **(b) Dashboard upgrade encouragement**: the plan-comparison screen in the tenant dashboard (already in slice 8's scope) is written with an explicit upsell intent, not just a passive comparison — a clear "Upgrade" call to action on each plan higher than the tenant's current one, and the dashboard surfaces a prompt when the tenant is near a plan limit (e.g. 80%+ products/orders/storage, reusing the existing warning thresholds from `2.5`) suggesting the plan that would raise that specific limit. Both (a) and (b) read plan/term data live (`PLN-12`'s rule), nothing hard-coded. | Slice 2 (the public read endpoint, and the shape it returns), slice 8 (both UI pieces); `apps/website`'s pricing rebuild rides along with slice 8 since it depends on the same endpoint |

[^note]: Matches the standing project convention from Phase 1: finish every slice's backend first, UI is one consolidated pass afterward.

---

## 3. Architecture for this phase

Follows `ENGINEERING-STANDARDS.md` §1 (modular monolith), extending Phase 1's module table.

**New modules in `apps/server/src`:**

| Module | Owns | Responsibility |
|---|---|---|
| `billing` | `control.billing_terms`, `control.plan_prices`, `control.plan_versions`, `control.plan_limit_overrides`, `control.plan_assignments`, `control.invoices`, `control.invoice_counters`, `control.plan_payments`, `control.scheduled_plan_changes` | Plan/term CRUD and versioning, purchase quoting and confirmation, upgrade/downgrade math, invoice issuance, the lifecycle state machine and its scheduled job |
| `balance` | `tenant.balance_ledger`, `control.rates`, `control.rate_history`, `tenant.shop_settings` | The ledger (top-up, spend, reversal, adjustment), rate settings including `RAT-14`'s per-tenant delivery rate, low-balance notices |

`control.plans` (existing, extended with no new columns — prices move to `plan_prices`) stays owned by `billing`, same as Phase 1 left it conceptually, just with its module now built out.

**Why `plan_payments` is control-schema, not reusing `tenant.payment_sessions`/`payments`:** those two tables (already designed in `DATABASE-SCHEMA.md` §3.4) are for *shopper* order payments, built in Phase 5 against `tenant.orders`, RLS-scoped per tenant. A plan purchase is the *tenant itself* paying the *platform* — conceptually closer to `control.invoices`/`control.used_transaction_ids` than to a shopper's checkout. Keeping it in `control` also sidesteps a real ordering problem: this phase cannot depend on tables Phase 5 hasn't built yet.

**Request pipeline:** unchanged from Phase 1 (host → tenant → session → permission → transaction with `app.tenant_id` set → business logic → audit entry), with two additions:
- Every `billing`/`balance` write that changes `tenants.balance_amount`, `.state`, `.plan_id`, `.plan_snapshot` or `.period_start/end` does so **inside the same transaction** as the ledger/invoice/audit row it causes — no two-step "update tenant, then hope the ledger write succeeds separately."
- The lifecycle scheduled job runs as its own privileged pipeline step category (same as `D24`'s activity-log purge and `D25`'s job relay) — a pg-boss recurring job under the ordinary app role is fine here, unlike the activity-log purge, because this job only ever writes to tables the app role already has UPDATE/INSERT on.

---

## 4. Database work

Migrations generated from the Drizzle schema, reviewed before they run (`DAT-04`), one per slice.

**New tables (updated 2026-10-13 — now fully specified in `DATABASE-SCHEMA.md` §2.3, §2.4, §4, including `plan_versions` and `plan_payments`, which the schema doc was missing until this pass closed D2-1/D2-3/D2-11's gaps):**

- `control.billing_terms` (now bilingual `label_bn`/`label_en`, `display_order`, nullable `tenant_id` for `TRM-14`), `control.plan_prices` — slice 2
- `control.plan_versions` (D2-3) — slice 2
- `control.plan_limit_overrides` (`PLN-11`, new) — slice 2
- `control.plan_assignments` — slice 2 (not-for-sale assignment, `PLN-17`)
- `control.rates`, `control.rate_history` (now with a nullable `notice_id`, `RAT-09`) — slice 1
- `tenant.shop_settings` (`RAT-14`'s per-tenant delivery-charge-per-kg rate, new) — slice 1
- `tenant.balance_ledger` — slice 1 (RLS-scoped, append-only — same insert-only trigger pattern as `tenant.activity_log`, per D24's precedent)
- `control.invoices` (now with `kind` and `credit_amount`, `BIL-12`/`UPG-15`), `control.invoice_counters` — slice 4
- `control.plan_payments` (D2-1) — slice 4
- `control.scheduled_plan_changes` — slice 6 (downgrade/pay-as-you-go-switch scheduling, `DWN-01`, `PYG-10`)

**Existing tables extended:** `control.tenants` already carries `plan_id`, `plan_snapshot`, `period_start/end`, `balance_amount`, `balance_frozen`, `state` (the `TenantState` enum already includes every lifecycle value including `pay_as_you_go`) and `suspended_at/reason`, all seeded by Phase 1's forward-looking design. Two new columns: `last_activity_at` (nullable timestamptz, D2-11) — updated whenever a qualifying ledger entry (order fee, product fee, top-up) is written, read by slice 7's inactivity job; `deleted_at` (nullable timestamptz) — set once by the day-60 job, anchoring `LIF-21`'s 30-day subdomain reservation and `LIF-22`'s 30-day backup-retention window. `control.plans` gets a `description` column (`PLN-01`, was missing).

**Row-level security:** `tenant.balance_ledger` gets the same `tenant_id = tenant.current_tenant_id()` policy as every other tenant table, with its own insert-only trigger (D24's pattern). Everything else new is `control`-schema, operator/system-only, no RLS (matches `control.plans`/`tenants` today).

---

## 5. API surface for this phase

From `API-CONTRACT.md` (extended — the file doesn't have these endpoints yet, this phase adds them):

- **Plans and terms (operator):** `operator/plans` (list/create/update/retire), `operator/billing-terms` (list/create/update/retire), `operator/plans/:id/assign` (not-for-sale assignment), `operator/rates` (list/update).
- **Plans and terms (public, read-only, no session or key required):** `plans` (comparison data, for-sale only), `billing-terms` — reachable by a signed-in tenant's dashboard *and* by an anonymous guest on the marketing site (D2-12), the same way the sign-up endpoints already skip tenant resolution (`@SkipTenant()`, Phase 1's pattern).
- **Purchase and lifecycle:** `billing/quote`, `billing/purchase`, `billing/upgrade/quote`, `billing/upgrade`, `billing/downgrade/schedule`, `billing/downgrade/cancel`, `billing/cancel-subscription`, `billing/switch-to-pay-as-you-go`, `billing/invoices` (list/download).
- **Balance:** `balance` (statement, filterable), `balance/top-up` (quote + confirm, same D2-1 stand-in confirmation), `balance/current-rates` (tenant-facing "current rates" page, `RAT-06`).
- **Shared rules:** unchanged from Phase 1 — standard error body, `Idempotency-Key` on every write that creates something, `X-Request-Id` on every response.

---

## 6. Slices

Each slice is one branch and one pull request. CI must pass before merge. Slices are sequential where marked.

### Slice 1: balance ledger and rates
- **Branch:** `feat/balance-ledger`
- **Depends on:** nothing new — extends Phase 1's `control.tenants.balance_amount`/`balance_frozen`. Decisions D2-2, D2-5, D2-7.
- **Scope note (decided 2026-10-13):** this is the ledger/rate engine only — no `balance/top-up` endpoint. A top-up's whole point is creating a `control.plan_payments` row (D2-1), which doesn't exist until slice 4; `BAL-03/04/05/06` (the top-up flow itself) move to slice 4, which is the first real caller of the ledger this slice builds. Everything else in BAL/RAT that doesn't depend on `plan_payments` stays here.
- **Delivers:** `tenant.balance_ledger` (append-only, RLS); `control.rates`/`rate_history` (`RAT-09`'s `notice_id`, shipped as a plain `uuid` column with no FK constraint — `control.notices` doesn't exist in code yet, so this is deliberately unconstrained until it does); `tenant.shop_settings` (`RAT-14`'s per-tenant delivery rate); the `balance` module — atomic charge/credit with the balance-after invariant (`BAL-11`), freeze/unfreeze on lifecycle events, statement query (`BAL-14`), low-balance notice job (`BAL-13`), the rate-read cache (5s TTL); `control.tenants.last_activity_at`, written alongside any order-fee or product-fee ledger entry (D2-11 — top-up's contribution to this column moves to slice 4 along with the rest of the top-up flow).
- **Requirements:** BAL-01, BAL-02, BAL-07 to BAL-18 (BAL-03 to BAL-06 move to slice 4); RAT-01 to RAT-14; PYG-21 (the column and write-hook half, for order-fee/product-fee only here).
- **Done when:** 100 simultaneous 1-TK charges against a 50 TK balance succeed exactly 50 times with 50 ledger rows; an UPDATE/DELETE attempt on the ledger is refused by the database; a rate change takes effect on the very next charge and never alters a past entry.

### Slice 2: plans and billing terms
- **Branch:** `feat/plan-catalogue`
- **Depends on:** slice 1 (rates pattern, for consistency — not a hard dependency). Decisions D2-3, D2-9.
- **Delivers:** `control.billing_terms`, `control.plan_prices`, `control.plan_versions`, `control.plan_limit_overrides` (`PLN-11`), `control.plan_assignments`; the `billing` module's plan/term CRUD, versioning-on-write, not-for-sale filtering enforced server-side (`PLN-10`), not-for-sale direct assignment (`PLN-17`/`PLN-18`); the minimal operator-console shell (D2-9) gating these new screens.
- **Requirements:** PLN-01 to PLN-12, PLN-16 to PLN-18, TRM-01 to TRM-16.
- **Done when:** editing a plan increments its version and the previous version is still retrievable; a tenant-facing plans call never returns a not-for-sale row, even with a crafted request; a not-for-sale plan assigned with no expiry never prompts that tenant to renew.

### Slice 3: trial lifecycle and pay-as-you-go
- **Branch:** `feat/trial-and-payg`
- **Depends on:** slices 1 and 2 (plans and ledger both exist).
- **Delivers:** the trial-end job that converts an unpaid trial to pay-as-you-go with no data loss (`TRL-07`); pay-as-you-go's order-fee and product-fee ledger mechanics (wired to real `tenant.orders`/`tenant.products` once those exist in Phase 3/4 — built here against the ledger interface, with the trigger points stubbed until then); the pay-as-you-go lifecycle rules — no billing period, no forced lapse from order volume (`PYG-08`). The 30-day-inactivity auto-archive itself (`PYG-21`, D2-11) is rules-complete here (reads `last_activity_at`) but only actually *runs* once slice 7's scheduled job exists — see that slice's done-when for the behavioral test.
- **Requirements:** TRL-01 to TRL-08, PYG-01 to PYG-20.
- **Done when:** a trial at day 30 with no purchase becomes pay-as-you-go with every product/order/customer intact and its tighter limits widened immediately; a pay-as-you-go tenant with recent activity is never force-transitioned regardless of volume.

### Slice 4: plan purchase, top-up and invoices
- **Branch:** `feat/plan-purchase`
- **Depends on:** slices 1 and 2. **Decision D2-1 must be confirmed before this slice starts** — it decides this slice's entire payment-confirmation shape.
- **Delivers:** `control.invoices`/`invoice_counters` (gap-free numbering from a locked row, `DAT-07`); `control.plan_payments` (D2-1's stand-in); the purchase quote/confirm flow, snapshot activation, invoice issuance, renewal (on-time and after-lapse), renewal reminders (`BIL-14`, D2-6's scheduled job); the `balance/top-up` endpoint and flow (`BAL-03` to `BAL-06`, moved from slice 1 since both ride on `plan_payments`), including `last_activity_at`'s top-up-triggered write (D2-11).
- **Requirements:** BIL-01 to BIL-18, BAL-03 to BAL-06.
- **Done when:** a 1-taka price mismatch produces `needs_review` and never activates the plan; a transaction ID is usable for exactly one payment platform-wide; renewing 10 days early extends from the old end date, not from today; a top-up below [100] TK or above [50,000] TK is rejected and a verified one credits the balance exactly once.

### Slice 5: upgrade
- **Branch:** `feat/plan-upgrade`
- **Depends on:** slice 4.
- **Delivers:** the credit/amount-due proration math (`UPG-03`/`UPG-04`, the worked examples in the SRS as literal test cases), the quote screen's data, cycle-restart-on-confirmation, per-period counter reset vs. untouched counters (`UPG-10`/`UPG-11`).
- **Requirements:** UPG-01 to UPG-17.
- **Done when:** Examples A and B from the SRS (299/400 and 3,442/3,939) are literal passing test assertions; a scheduled downgrade is cancelled by an upgrade; the balance is byte-for-byte unchanged by an upgrade.

### Slice 6: downgrade
- **Branch:** `feat/plan-downgrade`
- **Depends on:** slice 5 (shares the scheduled-change/cancel pattern).
- **Delivers:** `control.scheduled_plan_changes`; the over-limit preview (`DWN-03`); the 30-day grace checklist after a downgrade takes effect, with seats/storage/products handled per their own rule (seats: owner + earliest-created active staff stay active; storage/products: blocked for new, existing stays served).
- **Requirements:** DWN-01 to DWN-18.
- **Done when:** scheduling a downgrade changes nothing until the effective date; at that date with 4 users and a 2-seat limit, exactly 2 stay active and the other 2 are deactivated, not deleted; existing over-limit products keep selling while new ones are blocked.

### Slice 7: cancellation, lifecycle and deletion
- **Branch:** `feat/lifecycle-deletion`
- **Depends on:** slices 3, 4, 5, 6 (the job needs real plans/purchases/balance to transition realistically). Decision D2-6.
- **Delivers:** the recurring lifecycle job (grace → read-only → locked → archived → deleted, derived from stored dates, idempotent) — including the pay-as-you-go inactivity scan (`PYG-21`, D2-11: `last_activity_at` older than 23 days → warning, older than 30 → `archived`) as a second pass of the same recurring job, not a separate mechanism; the `tenant_offline` gate at each stage; data export (`LIF-16`); the two deletion warnings and the day-60 deletion job itself (`LIF-19`, keeping balance/invoices/payment history per `LIF-20`); restore-at-any-point (`LIF-15`, which for a pay-as-you-go tenant just means a qualifying action before day 30, or buying/topping-up before day 60); operator suspend/restore (`LIF-24`).
- **Requirements:** LIF-01 to LIF-26, PYG-21.
- **Done when:** a test clock set to day 4 yields `read_only` with no manual change; running the day-60 job twice produces one deletion and one notification, not two; buying a plan on day 20 restores everything — data, public side, balance — within the stated time; a pay-as-you-go tenant idle since day 0 gets its warning at day 23 and is `archived` at day 30, exactly once each; a top-up on day 28 cancels both.

### Slice 8: dashboard and operator-console UI
- **Branch:** `feat/billing-ui` (plus a second for the operator-editor screens if it grows too large for one PR — split the same way Phase 1's slice 9 did)
- **Depends on:** slices 1–7, all merged (D2-10 — one consolidated pass, not per-slice).
- **Delivers:** plan comparison/purchase screens, upgrade/downgrade quote screens, balance statement and top-up, invoice list, trial countdown and buy-a-plan prompt, every lifecycle banner (grace/read-only/locked/archived/suspended), the operator plan/term/rate editor screens from D2-9, and D2-12's two pieces: `apps/website`'s pricing section rebuilt against real plan/term data with a working Buy button carrying the choice through sign-up, and the dashboard's plan comparison screen written with an explicit upgrade call to action plus a near-limit upsell prompt.
- **Requirements:** the `E2E`-tagged acceptance criteria throughout PLN/TRL/BIL/UPG/DWN/LIF/BAL that need a real screen, not just an API; D2-12.
- **Done when:** the full milestone cycle from §1.5 is demonstrable end to end through the UI, not only through the API; a guest can pick a plan on the marketing site, sign up, and land on that plan's purchase screen; a tenant near a plan limit sees a prompt naming the plan that would raise it.

---

## 7. Order and parallel work

Slices 1 and 2 can start in parallel (no shared tables). Slice 3 needs both. Slices 4, 5, 6 are strictly sequential (each depends on the state the previous one left). Slice 7 needs 3–6 all merged, since its job has to transition tenants that got there via every path (trial lapse, subscription lapse, pay-as-you-go closure, downgrade). Slice 8 is last, deliberately, per D2-10.

---

## 8. Non-functional requirements for this phase

- **Idempotency:** every job in slice 7 (`LIF-23`) and every write endpoint that creates something (purchase, top-up, upgrade confirm) accepts `Idempotency-Key`, matching Phase 1's established convention.
- **Atomicity:** every balance change and every tenant state/plan/period change happens in one transaction with its ledger/invoice/audit row — never a balance update followed by a separate commit for the entry that explains it.
- **No secrets in logs:** continues Phase 1's `LOG-02`/`N02` discipline — a payment confirmation's transaction ID is not a secret, but a wallet number or gateway credential (once Phase 5 adds them) would be; this phase's own stand-in (D2-1) has nothing secret to leak yet.
- **Test clock:** every date-driven requirement (`LIF-04`, `TRM-09`, trial/grace/lockout boundaries) needs the same test-clock mechanism Phase 1 used for OTP/session expiry, extended to simulate dates months apart, not just minutes.

---

## 9. Risks

- **D2-1 (payment stand-in) is the biggest risk in this plan.** If the stand-in's shape doesn't match what Phase 5's real hosted page actually needs, slice 4's work gets partially redone. Mitigation: keep the stand-in's *interface* (quote → pending → confirm → activate) identical to BIL-03's literal wording, so only the confirmation *trigger* changes later, not the state machine around it.
- **Proration math (`UPG-03`, `TRM-10`) is exactly the kind of off-by-one/rounding bug class that's expensive to find late.** Mitigation: the SRS's own worked examples become literal test assertions before any other upgrade test is written (slice 5).
- **The lifecycle job (slice 7) touches every tenant on the platform on every run.** A bug here is a platform-wide incident, not a single-tenant one. Mitigation: `LIF-23`'s idempotency requirement is tested explicitly (run twice, assert once), and the job's own test suite runs against a multi-tenant fixture with tenants at every boundary simultaneously, not one tenant per test.
- **Operator-console scope creep (D2-9).** Building "just enough" console shell risks quietly growing into the full `ADM-02`–`ADM-17` feature set mid-slice. Mitigation: slice 2's done-when criteria is scoped to the plan/term editor screens only; anything else noticed along the way goes on a list for Phase 8 (`ADM-*`'s own phase), not built opportunistically.

---

## 10. Definition of done (per slice)

Same bar as Phase 1: migration applies cleanly; typecheck/lint/test/build all green in CI; every `M` requirement listed in the slice has at least one passing automated test; the slice's own done-when criteria is demonstrated, not just asserted; branch stays after merge.
