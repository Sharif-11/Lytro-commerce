# Known gaps — found during Phase 2 UI (slice 8) and its doc audit, 2026-10-16

Tracked here per this project's own convention ("anything else noticed along the way goes on a list,"
`PHASE-2-PLAN.md` §9) rather than fixed opportunistically mid-slice. Not yet actioned — fix together as one
pass.

## 1. `BillingController`/`BalanceController` missing `lapsed: true` — breaks LIF-11/LIF-12/BIL-13 for a lapsed owner

Neither controller sets `@Dashboard({ lapsed: true })` anywhere (confirmed by reading both files directly —
only `readOnlyWrite: true` appears, on `purchase`/`upgrade/confirm`). `DashboardGuard` throws
`tenant_offline` for a `locked`/`archived`/`deleted` tenant on every route unless that route explicitly opts
in with `lapsed: true` *and* the caller is the owner. `/me` itself does opt in (`@Dashboard({ lapsed: true,
withoutShop: true })`), which is why `/me` still works for a lapsed owner — but every route an owner would
actually need once lapsed does not:

- `billing/quote`, `billing/purchase` — LIF-12 ("the dashboard shall be off for everyone except a purchase
  screen" while `archived`) is not actually honored; the purchase screen itself 403s.
- `billing/upgrade/quote`, `billing/upgrade/confirm`, `billing/downgrade/*`, `billing/cancel(/undo)` — same
  gap, lower stakes (upgrade/downgrade/cancel aren't meaningful while lapsed anyway, but cancel/undo
  arguably should still work in `grace`).
- `billing/invoices`, `billing/invoices/:id` — BIL-13 ("available in every lifecycle state, including after
  deletion") is not honored either.
- `balance/top-up/quote`, `balance/top-up/confirm` — LIF-11 ("locked... only to renew or export") implies an
  owner can top up to afford that renewal; currently can't.

**Fix shape:** add `@Dashboard({ lapsed: true })` (combined with `readOnlyWrite: true` where already present)
to the routes above that genuinely need to work for a lapsed owner — probably not blanket class-level, since
upgrade/downgrade genuinely shouldn't work while lapsed (`UpgradeService`/`DowngradeService` already refuse
unless `active`, so the guard change is purely about *reaching* the service, not bypassing its own check).

**Fixed 2026-10-16 (PR #87).** Added `lapsed: true` to exactly `billing/quote`, `billing/purchase`,
`billing/invoices`, `billing/invoices/:id`, and `balance` (current balance, for `BAL-18`'s "frozen balance
shown to the subscriber" in every state). Scoped narrower than this write-up's own suggestion in one place,
deliberately: `balance/top-up/quote`/`balance/top-up/confirm` were left untouched, since no named requirement
(`BIL-13`/`LIF-11`/`LIF-12`/`BAL-18`) actually requires topping up while lapsed, only renewing from the
balance that already exists — if a lapsed owner needs to top up before renewing, that's a new requirement to
raise explicitly, not something to fold into this bug fix. Upgrade/downgrade/cancel routes were left
untouched for the reason already given above. Covered by four new e2e tests in `dashboard.e2e.spec.ts`
(locked/archived/deleted owner reading invoices and balance; suspended owner still fully refused).

## 2. No read endpoint for "is a cancellation currently scheduled" (LIF-01) — found and fixed 2026-10-16

`billing/cancel` and `billing/cancel/undo` were write-only — nothing exposed `control.tenants.cancelled_at`
(or an equivalent) to the client. The UI (`apps/admin/src/views/billing/index.tsx`) showed both actions as
fire-and-forget with a one-line success message instead of a persisted toggle, because there was nothing to
read back after a page refresh.

**Fixed:** a small dedicated read, `GET /billing/cancellation` → `{ cancelledAt: Date | null }`
(`LifecycleService.getCancellation`, reading the same `BillingInfoRow.cancelledAt` `BIL-17` already added),
`Permission.PaymentsRead`. Not added to `/me`'s tenant summary -- kept as its own small route, the same shape
as `GET /billing/downgrade`'s own banner-data read, rather than growing the summary's scope. Proven by a new
case in `apps/server/test/lifecycle.e2e.spec.ts`. The admin UI wiring (replacing the fire-and-forget banner
with a real persisted read) is separate frontend work, not done in this pass.

## 3. Mobile bottom nav built assuming 4 items, now has 6

`apps/admin/src/components/layout/bottom-nav.tsx`'s own comment says "Lytro has only four, all fit; the
reference dashboard's own bar only overflows into a sheet past its own, much larger item count." Slice 8
added Billing and Invoices, bringing it to 6 real destinations + the Account tab = 7 rendered items in a
fixed-height bar with no overflow handling.

**Fix shape:** needs its own small design pass — likely fold Balance/Billing/Invoices under one "Account" or
"Billing" group entry that opens a sheet, mirroring how `AccountSheet` already handles account actions, or
adopt the reference dashboard's own overflow-sheet pattern the comment already describes but never needed
until now.

## 4. Operator console: no tenant detail screen, no "view as"

`GET /operator/tenants` (list/search) and suspend/restore exist (built for LIF-24). `GET
/operator/tenants/:id` (full detail, ADM-03) and `operator/tenants/:id/view-as` (ADM-05) do not — still
genuinely Phase 8 work, not a regression, just noting the boundary stayed where D2-9 drew it.

## 5. Lifecycle banner can't show an exact day-count for read-only/locked/archived

`LifecycleBanner` shows an exact "N days left" countdown for `trial`/`grace` (computable from `/me`'s own
`periodEnd`), but `read_only`/`locked`/`archived` stay qualitative — the grace/read-only/locked *stage
lengths* (`LifecycleService.stageLengths()`) are operator-configurable `platform_settings` with no route
exposing them to the tenant client.

**Fix shape:** either a tiny public read of the stage-length settings (mirroring `/plans`'/`/billing-terms`'
own no-auth reasoning, since these are platform-wide, not tenant data) or compute the boundary server-side
and add it to `/me`.

## 6. Near-limit upsell prompt only covers staff seats

D2-12(b) itself names products/orders/storage as the example metrics; none of those exist yet (Phase 3/4
haven't shipped `tenant.products`/`tenant.orders`, and storage usage isn't tracked anywhere). Staff seats
(`GET /staff`'s own `SeatUsage`) is the only metric checkable today. Not a bug — just incomplete until that
data exists; `apps/admin/src/views/billing/upsell-banner.tsx` already has a comment noting this.

## 7. No real browser verification anywhere in slice 8 or its D2-12 follow-up

No browser-automation tool is available in this environment. Every screen built in PRs #82/#83 was verified
via real HTTP round trips (curl) and Vite module-transform checks (confirms the code compiles and the
module graph loads), never an actual browser click-through. Flagged on both PR descriptions; re-flagging
here since it covers the whole slice, not one PR.

## 8. Docs audit — complete as of 2026-10-16

All 15 docs checked and fixed inline (dated 2026-10-16 throughout): `API-CONTRACT.md`, `PHASE-2-PLAN.md`,
`DATABASE-SCHEMA.md`, `PHASE-2-TEST-PLAN.md`, `PHASE-1-2-HTTP-PATH-TEST-PLAN.md`, `SRS-detailed.md`,
`SRS.md`, `TEST-PLAN.md`, `PHASE-1-PLAN.md`, `PHASE-1-TEST-PLAN.md` (no drift found), `ENGINEERING-STANDARDS.md`,
`CODING-CONVENTIONS.md`, `DEPLOYMENT.md`/`MARKETING-PLAN.md`/`IMPLEMENTATION-PLAN.md` (no drift found in
any of these three). New findings beyond the 8 items above are #16-20 below.

## 9. LIF-24: suspension severity — decided and fixed 2026-10-16

`DashboardGuard` checked `suspendedAt` unconditionally, *before* the lapsed-owner carve-out that even
`archived`/`locked` get — so a suspended tenant was fully offline for everyone including the owner, stricter
than `archived` (LIF-12's own purchase-screen exception) and not the `read_only` the requirement claimed.

**Decided:** neither "fully offline" nor plain `read_only` — a third, narrower tier. The public side and
staff stay exactly as strict as before (fully offline, refused entirely); the owner gets *less* than
`read_only`'s full view/export set, limited to the routes that resolve the suspension: view balance, top up,
quote/confirm a renewal or purchase. Reading/exporting data and invoices stay refused.

**Fixed:** added a `suspendedOwner` option to `DashboardOptions`/`DashboardGuard`, independent of `lapsed`
(suspension is a separate axis from lifecycle state — a tenant can be suspended in any state). Applied to
`billing/quote`, `billing/purchase`, `balance` (current), `balance/top-up/quote`, `balance/top-up/confirm`,
and `/me` (so the owner can even see they're suspended). `/me` now also returns `tenant.suspended: boolean`.
`DashboardShell` renders a dedicated narrow `Suspended` view (`apps/admin/src/views/suspended/index.tsx`,
reusing the existing `TopUpForm`) instead of the old dead-end card. **Not built in this pass:** a renewal UI
for the suspended owner — `billing/quote`/`billing/purchase` are reachable, but there's no plan/term picker
wired up for this specific screen yet (the existing one lives in the full billing view, itself not
suspended-owner-safe since it also calls invoices/downgrade/etc.). Top-up is the one complete, self-contained
action shipped today. Covered by e2e tests in `dashboard.e2e.spec.ts` (owner reaches `/me`/balance/quote
while suspended, not ledger/current-rates) and `staff.e2e.spec.ts` (staff still fully refused).

## 10. TRL-01/TRL-07/DWN-06: three services built correctly, none ever scheduled — fixed 2026-10-16

`TrialLifecycleService.convertExpiredTrials()` and `DowngradeService.apply()` (an already-due scheduled
downgrade) were each logically correct but had no production caller at all — only their own direct e2e
tests invoked them. `DowngradeService.apply()`'s gap was undiscovered until traced while explaining this
exact scheduling architecture in conversation; it's the same bug as `TRL-01/07`'s, not a separate one.
There was also no repository query yet for "which scheduled downgrades are due"
(`ScheduledPlanChangesRepository` had `upsert`/`findByTenant`/`delete`, no `findDue`).

**Fixed:** no new worker needed — `LifecycleTickWorker` already runs every 5 minutes (`D2-6`) for exactly
this purpose. Added `ScheduledPlanChangesRepository.findDue`/the matching port method (`WHERE effective_at
<= now`, the same shape `findLapsingCandidates`/`findExpiredTrialIds` already use), a new
`DowngradeService.applyDueChanges(now)` that calls it and applies each due `Downgrade`-kind row (skipping
`PayAsYouGoSwitch`, which nothing schedules yet — `PYG-10` isn't built), and wired both
`trials.convertExpiredTrials()` and `downgrade.applyDueChanges(now)` into the tick alongside the existing
`lifecycle.runTick(now)` call. Covered by a new `test/lifecycle-tick-worker.spec.ts` (proves the worker
itself calls all three on every fire, with a fake pg-boss client — the exact layer whose absence let this
bug exist) and a new e2e case in `plan-downgrade.e2e.spec.ts` (two tenants, one past due one not, only the
due one changes plan).

## 11. PYG order-fee/product-fee charging (PYG-02/03/04/14/16/17/18) is correct but entirely unreachable

`PayAsYouGoBillingService.chargeOrderFee`/`chargeProductCreationFee` are logically right, but there is no
`orders` or `products` module anywhere in the codebase to call them — expected, since `PHASE-2-PLAN.md`
itself defers the real wiring to Phase 3/4; noted inline on the SRS rows since they're otherwise tagged as
independently `API`-testable today, which they aren't yet.

## 12. Add-on catalogue (PLN-13/14/15, UPG-14) has zero implementation

No store, service, controller, DTO or test references an add-on concept anywhere. Already deferred past
Phase 2's exit criteria by `PHASE-2-PLAN.md` D2-4 — this is just making that explicit on the SRS requirement
rows themselves, which are tagged with concrete `API`/`E2E` verification types as if checkable now.

## 13. Data export (LIF-16/LIF-17) — built 2026-10-16

Was zero implementation; closed the same day it was planned. `POST /exports` inserts a `pending` row
(`tenant.data_exports`, migration `0033_data_exports`) and enqueues a job (`QueueName.DataExport`) in the
same transaction; `DataExportWorker` (registered alongside `LifecycleTickWorker`'s other siblings) builds a
zip of payments (invoices) and the activity log — CSV and JSON per category — and stores it directly in
Postgres (no object storage exists in this codebase yet, that's `MED-*`'s Phase 3 scope, so building one
early for this alone was rejected). `GET /exports`/`GET /exports/:id/download` are owner-only throughout
(`LIF-16`'s own wording names the owner, not a staff permission); the download route writes raw bytes
directly via Express's response object (`@Res()`), the first route in this codebase to bypass the JSON
envelope, since a zip isn't JSON. Orders/customers/products are not exported — no module exists yet to read
them from; a third category is a data-fetcher addition to the existing worker once one exists, not an
architecture change. Available in every non-offline state including `archived` (an explicit widening beyond
`LIF-16`'s own literal `read_only`/`locked` wording — see that row), never while suspended. Proven by
`apps/server/test/data-export.e2e.spec.ts` (4 tests: generation producing a real zip, 24-hour expiry,
owner-only gating, cross-tenant isolation) plus the isolation registry entries CI checks.

## 14. Per-category monthly spend caps (BAL-15) not implemented

The only `quota_exceeded` in the codebase is a single whole-balance overdraft-floor check, not a per-category
(SMS, chat AI) monthly cap with its own 80% warning. Depends on SMS/chat-AI modules that aren't built either.

## 15. P2-E42 (`PHASE-2-TEST-PLAN.md`) claimed 403 where the real code gives 401 — already fixed inline

A tenant credential against `OperatorRatesController` actually gets 401 `unauthenticated` (rejected by
`OperatorSessionGuard` before any permission check runs), not 403 `forbidden` as the test plan said. Fixed
directly in `PHASE-2-TEST-PLAN.md`; noted here only so it isn't re-discovered as "new."

## 16. No HTTP-request-id header, no idempotency on Phase 1 endpoints

`PHASE-1-PLAN.md` claimed both as standing Phase 1 shared rules. Neither is real: `X-Request-Id` has no
middleware/interceptor anywhere; `IdempotencyInterceptor` exists but is only wired on Phase 2 routes
(`balance.controller.ts`, `billing.controller.ts`) — `POST /shops`, `POST /staff`, `POST /roles` have none.

## 17. `ADM-6` (notice board) and `ADM-8` (operator manual payment entry) have zero implementation

Both described in `SRS.md` as current, decided behavior. No controller/service/store/DTO for either concept
exists anywhere. `ADM-5`'s approve/reject payment-queue is the only thing that actually exists in that area.

## 18. SMS event system, templates, and essential-SMS allowance metering don't exist beyond transactional OTP/reset

`SRS.md` §10 describes a built, enforced system (per-event toggles, Bangla/English templates, a free
monthly essential-SMS allowance per plan, spend caps). Only transactional OTP/password-reset SMS exists.
Order-triggered events need the still-missing orders module; the essential-allowance counter isn't wired up
even independent of that.

## 19. `SRS.md` has an internal self-contradiction on payment-session monthly limits (PAY-3 vs. §6's table)

Not code drift (no session-limit enforcement exists yet to check either way) — PAY-3 says "2× the plan's
order limit," §6's own table says a flat number "independent of the order-handling limit." Needs
reconciling to one source of truth before this is ever implemented.

## 20. New requirements added 2026-10-16 — not yet planned into any phase

User-requested, specified as formal SRS rows the same day, not yet scoped into a phase plan:

- **`STA-01` to `STA-04`** (new §15.3): tenant-facing order/revenue stats, hot-selling products, and
  per-product selling trends, bucketed weekly/monthly/quarterly/yearly. Blocked on the same missing
  orders/products modules as gap #11 — genuinely unbuildable until Phase 3/4 ships, not just unplanned.
- **`ADM-03` amended**: the operator's tenant-detail view now also specifies a business summary (the same
  figures `STA-01` gives the tenant) and summarized order stats. Same orders-module dependency.
- **`ADM-09` amended**: operator SaaS-level reporting now explicitly means weekly/monthly/quarterly/yearly
  buckets and per-plan tenant counts including pay-as-you-go as its own designation. The subscription/top-up
  revenue half of this is buildable today (the ledger already has it); the automated-gateway-commission half
  waits on `WAL-20`.
- **`WAL-20`/`WAL-21`** (new): a configurable percentage commission on automated-gateway (level 3,
  bKash/Nagad API) verified orders, charged to the tenant's balance, applying to every tenant regardless of
  plan; insufficient balance falls back to listener/manual verification rather than blocking the order.
  Confirmed via `AskUserQuestion` 2026-10-16: pure percentage (no flat floor, unlike `PYG-02`'s order fee),
  applies broadly, fallback not refusal. Blocked on `WAL-19`'s own gateway plugins, which aren't built
  either — this is new scope on top of unbuilt scope.
- **`RAT-15`** (new): the commission rate itself, following the existing `RAT-*` rate-settings pattern.
  **Decided 2026-10-16 (`D2-13`, `PHASE-2-PLAN.md`):** deferred to Phase 5, alongside `WAL-20`/`WAL-21`, its
  only real consumer — no longer unplanned.
- **`PLN-19`** (new): the operator shall be able to set any individual plan limit to **unlimited** instead
  of a number, independently per limit (a plan can be unlimited on storage while still capped on seats).
  Generalizes two special cases already hard-coded unconditionally today (order *creation*, `QTA-07`, and
  courier connections) into an operator-configurable property of any limit on any plan. **Shipped 2026-10-16
  (`PHASE-2-PLAN.md` Slice 9, branch `feat/plan-unlimited-limits`):** `.nullable()` added to every usage-cap
  field in `packages/validators/src/db/plans/plan-limits.ts` (not `activity_retention_days`, a retention
  period rather than a usage cap) — `null` = unlimited, `undefined` = not set (existing fallback-to-default
  behavior), a number = capped. Every consumption site that read a limit with a `?? DEFAULT` fallback got an
  explicit `null`-means-no-cap branch (`StaffService.seatsOf`/`requireSeat`/`enforceSeatLimit`,
  `DowngradeService.preview`/`apply`, the seat upsell banner, the plan comparison grid's rendering, and the
  per-tenant limit-override schema for `PLN-11`). Proven by a real e2e test in `staff.e2e.spec.ts` that adds
  staff past a Starter-sized cap on an unlimited-seats plan. Consumers that don't exist yet (order/product/
  storage/bandwidth enforcement) still get their own `null` branch only when Phase 3/4 actually builds them.

Confirmed already-specified, not new: automated verification via the SMS listener (level 2) staying free
regardless of plan or trial state was already `LSN-07`/`PYG-15` — nothing changed there.

## 21. Dev-seed gap: no "Pro" plan in the local dev database

`MARKETING-PLAN.md`/`SRS.md`/`SRS-detailed.md` all describe three plans (Starter/Growth/Pro). The live local
dev DB's `GET /plans` only returns Starter and Growth — looks like incomplete local seed data, not a
deliberate drop of the tier (no seed script was found under `packages/db` to check directly). Worth a look
before relying on "Pro" being purchasable in any further live testing against this same dev DB.

## 22. `TEN-30`/`SFT-21` (added 2026-10-16) — tenant contact details and storefront footer/contact-us

New requirement, not a drift: a tenant had no way to set a support phone, support email or shop address
(no field for any of the three existed on `control.tenants` or in the dashboard settings screens built so
far — only shop name and logo, `TEN-16`), and the storefront has no footer or contact-us section at all
(`SFT-13` covers branding only). `TEN-30` adds the three settings fields; `SFT-21` adds the storefront
section that reads them.

**`TEN-30` shipped 2026-10-16** (`PHASE-1-PLAN.md` Slice 12, `D35`, branch `feat/ten-30-shop-contact-details`):
three new nullable columns on `control.tenants` (migration `0032_shop_contact_details`), `GET`/`PATCH
/shop-settings` behind the previously-unused `settings:manage` permission, and a dashboard settings screen.
It fell in Phase 1's own requirement range even though Phase 1 had already shipped — built immediately
rather than left as a standing exit-criteria gap, since (unlike `PLN-19`) nothing else needed to exist first.
Proven by `apps/server/test/shop-settings.e2e.spec.ts` (7 tests).

**`SFT-21` still not built** — lands normally in Phase 3 alongside the rest of `SFT-*`, which hasn't shipped
yet; no change here.

**Naming collision to watch when this is built:** `POST /shops` already takes a field called `address`
(`createShopSchema`, AUTH-11) — that one is a desired subdomain-slug candidate, capped to slug length,
consumed once at onboarding and never shown to a shopper. `TEN-30`'s "shop/business address" is a different,
free-text street address set later from dashboard settings and shown on the storefront. Don't name the new
column/field `address` on whatever settings DTO this becomes — `businessAddress` or `shopAddress` avoids the
collision; `control.tenants` likewise has no existing `address`-named column this would clash with today, so
there's no migration conflict, only a naming one to avoid going forward.

## 23. `AUD-02`: activity log had no source-IP column — found and fixed 2026-10-16

Found during a full Phase 1/Phase 2 SRS-vs-code audit, not previously tracked. `tenant.activity_log` had no
`ip` column, and `AuditEntry` had no `ip` field, despite every sign-in call site (`signin.service.ts`,
`password-signin.service.ts`, `email-signin.service.ts`, `oauth.service.ts`, `forgot-password.service.ts`,
`password.service.ts`, `session.service.ts`) already having the client IP in hand — used right next to the
audit call for rate-limiting/lockout, just never passed to `SignInAudit.log`.

**Fixed:** added a nullable `ip` text column (migration `0034_activity_log_ip`), added `ip` to `AuditEntry`
and threaded it through every `SignInAudit.log` call site (sign-in, sign-in-failed, sign-out, password
change, password reset) via `SessionContext.ip`/`SessionRecord.ip`, both of which already existed and were
already being read for other purposes. Exposed on `GET /activity`'s response (`ActivityEntryView`,
`activityPageSchema`). Proven by a new assertion in `apps/server/test/activity.e2e.spec.ts` ("logs exactly
one entry for a sign-in...") checking the sign-in entry's own `ip` is populated.

**Not done in this pass:** staff/role CRUD, billing/balance and every other audit writer still don't thread
a request-scoped IP through — each of those controllers would need its own `ClientIp`-to-service-call wiring
added. That's separate, larger work affecting many more files; this pass only closed the specific,
already-discovered "the IP was sitting right there, unused" gap at the sign-in layer.

**Follow-up, 2026-10-17 — the deferred retrofit, done:** a fresh SRS re-audit re-checked this row against
the current code rather than trusting the "fixed" note above, and correctly downgraded it back to PARTIAL
(staff/role writes had no `ip` field at all, not even `null`). Fixed properly this time, across every
HTTP-triggered writer in the codebase: `staff.service.ts` (create/update/resetPassword/changePassword),
`role.service.ts` (create/update/remove), `shop-settings.service.ts` (TEN-30), `downgrade.service.ts`
(schedule/cancel), `lifecycle.service.ts` (cancelSubscription/undoCancellation/setAutoRenew, and
suspend/restore which already had an explicit `ip: null` — now the operator's real one),
`payment-queue.service.ts` (approve/reject, same `ip: null` → real fix), `plan-assignment.service.ts`
(assign, same fix), `purchase.service.ts`/`upgrade.service.ts` (`activate`, called from either the owner's
own `confirmFromBalance` or an operator's payment-queue approval — threaded from whichever actually called
it), `data-export.service.ts` (request/download), and `staff-signin.service.ts` (sign-in/sign-in-failed,
which already had `context.ip` sitting unused in hand — the exact "IP was sitting right there" pattern this
gap is named for, just at a second call site nobody had re-checked). Every controller in `TeamModule`
already had `ClientIp` available (team.module.ts's own provider list), so no module wiring was needed, only
constructor injection and threading through each method's own call chain. Jobs/ticks with no real request
(lifecycle's own scheduled transitions, trial conversion, a downgrade's own due-date `apply`) correctly keep
`ip: null` — there is no caller to attribute. A genuine, unrelated bug surfaced while editing
`staff.service.ts`'s own `changePassword`: dead code after an early `return` meant a staff member's own
password change was never audited at all; fixed in the same pass (now reachable, now also carries `ip`).
Proven by: `activity.e2e.spec.ts`'s existing "writes exactly one entry for every auditable action" test,
extended to assert `ip` is populated on every one of the 8 HTTP-triggered actions it already exercises;
`staff.e2e.spec.ts`'s existing self-password-change test, extended to query the activity log directly and
confirm the entry now exists at all (not just that the password itself changed) and carries a real `ip`;
`lifecycle.e2e.spec.ts`'s existing cancel/undo and suspend/restore tests, each extended to pass a literal IP
through the service call and assert it round-trips into the audit row.

## 24. `AUD-07`: no money-entry retention floor on the purge job — found and fixed 2026-10-16

Also found during the same audit. `ActivityLogPurger`'s delete query had one unconditional
`WHERE created_at < plan_retention`, with no exception whatsoever for money-related entries (payment,
wallet, credential, plan, balance) that should survive 24 months regardless of plan. No category tagging of
entries existed to even support the exception.

**Fixed:** added `MONEY_RELATED_AUDIT_ACTIONS` (`packages/validators/src/db/enums.ts`) — a deliberately
named list (`PasswordChanged`, `PasswordReset`, `PlanAssigned`, `PlanPurchased`, `PlanRenewed`,
`PlanUpgraded`, `BalanceToppedUp`, `DowngradeScheduled`, `DowngradeCancelled`, `DowngradeApplied`,
`SubscriptionCancelled`, `SubscriptionCancellationUndone`) covering AUD-07's named categories —
and widened the purge SQL to keep any entry in that list until it's itself past 24 months, independent of
the plan's own shorter retention. Proven by a new test in `apps/server/test/activity.e2e.spec.ts`: a
money-related entry past plan retention but under 24 months survives a purge run; an ordinary entry the
same age is purged as before; a money-related entry past 24 months is purged too (the floor isn't infinite).

**Scope correction, 2026-10-17:** a fresh re-audit flagged the line above as overclaiming — it says "four
named categories" (payment, wallet, credential, plan, balance) but `MONEY_RELATED_AUDIT_ACTIONS` only has
entries for two of them. Re-checked directly: every `AuditAction` value that represents an actual money
movement today (plan purchase/renewal/upgrade/assignment, balance top-up, downgrade schedule/cancel/apply,
subscription cancel/undo) is already in the list — nothing is missing from what exists. `wallet` and
`credential` simply have no corresponding `AuditAction` values at all, because that module (`WAL-*`,
gateway/wallet integration) is Phase 5 scope and isn't built yet — there is nothing to tag, not an
oversight. Not a gap to fix now; revisit when `WAL-*` lands and gains its own audit actions.

## 25. `BIL-17`: "renew automatically from balance" had zero implementation — found and fixed 2026-10-16

Found during the same full Phase 1/Phase 2 SRS-vs-code audit. No column, no toggle route, and no renewal
attempt anywhere in `LifecycleService.runTick` — a lapsing tenant always went straight down the Grace ladder,
even one that had a working balance and would have wanted this option.

**Fixed:** `control.tenants` gained `auto_renew_enabled` (boolean, default `false`) and `billing_term_id`
(nullable uuid, not a Drizzle `.references()` to avoid a circular import with `billing-terms.ts`) — the
latter written by `PurchaseService.activate`/`UpgradeService.activate` whenever a plan assignment carries a
real term, and deliberately left untouched by `DowngradeService.apply` (a downgrade doesn't change the term).
`POST /billing/auto-renew` (owner-only, `PaymentsManage`) toggles the flag via
`LifecycleService.setAutoRenew`, audited as `AutoRenewToggled`. `LifecycleService.runTick` now calls a new
private `tryAutoRenew` for any lapsing candidate still in the `active` state (the one tick where the period
just ended but no lapse transition has happened yet) — it reuses `PurchaseService.quote`/
`confirmFromBalance` rather than duplicating the pricing/extend logic, so a successful renewal is
indistinguishable from a manual one (same `PlanRenewed` audit entry, same invoice). Falls through to the
normal lapse ladder on insufficient balance, a plan pulled from sale, a removed price (any `ApiError`), or
when LIF-01's own `cancelled_at` is set — the owner's explicit non-renewal intent always wins over the
toggle. Proven by five new cases in `apps/server/test/lifecycle.e2e.spec.ts` (`BIL-17: renew automatically
from balance`): toggle + audit entries, successful renewal with sufficient balance, insufficient-balance
fallthrough, toggle-off no-charge, and the LIF-01 cancellation override.

## 26. `DWN-11`: a downgrade's shorter retention applied immediately, with no notice — found and fixed 2026-10-16

Found during the same audit, then investigated and settled as a real, total gap (not `LIF-21`/`LIF-22`'s
kind of ambiguity). `ActivityLogPurger` computed a tenant's retention straight from its *current* plan, live,
on every run — the first purge after a downgrade applied its new, shorter window immediately, with no 14-day
delay and no notice of what would be trimmed.

**Fixed:** `control.tenants` gained `retention_floor_days`/`retention_floor_until` (both nullable) —
written by `DowngradeService.apply` whenever the new plan's `activity_retention_days` is shorter than what
the tenant is currently owed (the live plan's own, or an already-active floor's, whichever is longer), set to
that longer value for 14 days (`RETENTION_NOTICE_DAYS`). The purge job's SQL now takes
`GREATEST(floor_days, plan_days)` while the floor hasn't expired, `plan_days` after. The notice (SMS + email,
audited as `AuditAction.RetentionShortenedNoticeSent`) names a real count of what will be trimmed, via a new
`ActivityLogRepository.countInRange`/`AuditService.countInRange` (entries strictly between the old and new
retention windows, excluding money-related actions — `AUD-07`'s own floor already protects those
independently, so counting them would overstate what this notice is actually about). A second downgrade
during an already-active floor extends it to the longer of the two, resetting the 14-day clock, rather than
ever shortening a promise already made. Proven by three new cases in `apps/server/test/plan-downgrade.e2e.spec.ts`
(`DWN-11: shorter retention is delayed 14 days, with a notice`) and one in `apps/server/test/activity.e2e.spec.ts`
(the floor actually protecting, then releasing, an entry through a real purge run).

**Not done in this pass:** the notice is a one-time count snapshot at downgrade time, not live-updating
(matches `LIF-18`'s deletion-warning precedent); scope is `activity_retention_days`/`tenant.activity_log`
only, the one retention-governed data category that exists today (orders/products have no module yet, same
boundary `LIF-16` hit).

## 27. `BAL-14`: the statement's CSV-export half had zero implementation — found and fixed 2026-10-16

Found during the same full Phase 1/Phase 2 SRS-vs-code audit. `GET /balance/ledger` was JSON-only,
keyset-paginated; no export route or CSV-generation code existed anywhere in the codebase for the ledger
(`LIF-16`'s data-export module has its own, separate CSV generation for payments/activity, not reusable
as-is for the balance statement).

**Fixed:** `GET /balance/ledger/export` (same `type`/`dateFrom`/`dateTo` filters as `ledger`, minus
`cursor`/`limit` -- a CSV covers the whole filtered range, not one page), returning `text/csv` via a raw
`@Res()` response, the same shape `data-export.controller.ts`'s own download route already uses.
`BalanceService.statementAll` reuses the existing `BalanceLedgerStore.list` read with no cursor and a
10,000-row cap, rather than adding a new unpaginated repository method. `toCsv`/`csvEscape` (previously
private to `data-export.service.ts`) extracted into a shared `apps/server/src/common/csv.ts`, one
definition now used by both exports instead of two copies. Proven by a new case in
`apps/server/test/balance-ledger.e2e.spec.ts`: the CSV's header and rows match a credited entry, and a
different shop's export is empty (same RLS scoping every other route already gets).

## 28. `LIF-21`: the old subdomain was reserved permanently, not for 30 days — found and fixed 2026-10-16

Found during the same full Phase 1/Phase 2 SRS-vs-code audit, then confirmed a real (if safe-direction) gap
during the `DWN-11`/`LIF-21`/`LIF-22` investigation. `LIF-19`'s day-60 job deletes a tenant's business data
but deliberately keeps the `control.tenants` row (`LIF-20` requires it, for plan/payment history/balance to
keep surviving) — including its `slug`, which is unique-constrained and, discovered only while building this
fix, protected by a hard database trigger (`tenants_slug_immutable`, migration `0002`, `TEN-19`'s own
guarantee) that unconditionally rejects any update to it, for every role. Nothing ever released it, so the
subdomain was blocked forever, not for 30 days as the row's own pass criterion implies.

**Fixed, after confirming the approach first (the trigger is a previously-absolute guarantee, not something
to loosen unilaterally):** migration `0037` narrows the trigger's `WHEN` clause to still block 100% of slug
changes for any live tenant (`deleted_at IS NULL` — `TEN-19` stays exactly as absolute as it is today for
every existing shop) and only permits a change once `deleted_at` is 30+ days old. `LifecycleService` gained a
new independent pass, `releaseExpiredSlugs` (called from `runTick`, alongside the day-60 `deleteIfDue` scan),
which finds those candidates (`TenantRepository.findRevocationCandidates`) and calls the broader
`revokeExpiredTenant`: the slug is mangled (deterministic from the tenant's own id, truncated to fit
`SLUG_MAX_LENGTH`, carrying a `-revoked-` marker that is itself the idempotency check — the repository's own
candidate query excludes it), and, per an explicit decision on scope, `shop_name`, `contact_phone`,
`contact_email`, `business_address`, `suspended_reason` and `kyc_status` are cleared too — the old shop's
identity is no longer meaningful this long after deletion, and none of it is in `LIF-20`'s own survivor list
(`plan_id`, `plan_snapshot`, `balance_amount`, period dates, `subscriber_id`), which stays untouched. Proven
by two new cases in `apps/server/test/lifecycle.e2e.spec.ts` (`LIF-21: the old shop identity is revoked 30
days after deletion`): the full revocation plus a genuine re-insert of a new tenant with the freed slug
string (which would fail at the database if the fix didn't actually work), and idempotency across two ticks.

## 29. `TRM-09`: `addMonths` neither clamped end-of-month nor accounted for Asia/Dhaka — found and fixed 2026-10-17

Found during the full Phase 1/Phase 2 SRS-vs-code re-audit. `addMonths` (`apps/server/src/common/time.ts`,
the shared helper every billing-term period calculation uses — `PurchaseService.activate`,
`UpgradeService.activate`) called `Date.setUTCMonth` with no clamp at all: 31 Jan + 1 month landed on 3 Mar
(JS's own date-overflow rollover), not 28 Feb as the requirement's own example demands. Separately, the
requirement says "in Asia/Dhaka," which the implementation ignored entirely — UTC and Dhaka (a fixed UTC+6,
no DST) disagree on which calendar day an instant falls on for the last 6 hours of every UTC day, so a
purely UTC-based calculation is wrong for any purchase/renewal/upgrade confirmed in that window, not just
an end-of-month edge case. Zero test coverage existed for either half.

**Fixed:** rewrote `addMonths` to shift the instant forward by a fixed 6 hours to read the Dhaka wall-clock
day (the same trick a real fixed-offset zone lookup would do, without needing one — Bangladesh has run no
DST since a one-off 2009-2010 experiment, so hardcoding the offset is safe), add the month delta on that
day, clamp to the last day of the target month, then shift back. Proven by seven new cases in
`apps/server/test/time.spec.ts`: both of the SRS's own literal examples, a leap-year Feb-29 case, the exact
previously-broken overflow-into-March case, a case specifically chosen where the UTC day and the Dhaka day
disagree (showing the old UTC-only-clamped answer would still have been three days wrong), and two
sanity checks that a non-clamped, non-boundary addition is unaffected.

## 30. `PLN-03`: a plan's price schema accepted fractional taka — found and fixed 2026-10-17

Found during the full Phase 1/Phase 2 SRS-vs-code re-audit. The limits half of this requirement was already
correct (`unlimitedInt()` in `packages/validators/src/db/plans/plan-limits.ts` already required `.int()`),
but `setPlanPriceSchema` (`packages/validators/src/api/billing/plan-price-set.ts`) was only
`z.coerce.number().positive()` — a price of `449.50` passed validation, violating "prices are positive
whole taka." Zero test coverage existed for either the fractional case or the already-working zero/negative
rejection.

**Fixed:** added `.int()` to `setPlanPriceSchema`. Proven by a new case in
`apps/server/test/plan-catalogue.e2e.spec.ts` (`PLN-03: a plan price must be a positive whole number of
taka`): a fractional price, a zero price and a negative price are each refused with `validation_error`, a
whole-number price is accepted.

## 31. `TEN-27`: the host-to-tenant cache was never invalidated — found and fixed 2026-10-17

Found during the full Phase 1/Phase 2 SRS-vs-code re-audit. `TenantCache.invalidateTenant()`
(`apps/server/src/modules/tenancy/services/tenant-cache.ts`) was real, correct code — but dead code: grepping
the whole server tree turned up zero call sites. `TenantResolver`'s 60-second in-process cache means a
tenant's host kept resolving against whatever `state`/`suspendedAt` it had cached at the moment of suspend,
restore or entering `archived`, for up to that full 60s, not the required 5s.

**Fixed:** exported `TenantCache` from `TenancyModule` (previously internal, used only by `TenantResolver`
itself) and injected it into `LifecycleService`, calling `invalidateTenant(tenantId)` at exactly the three
events the requirement names: `suspend()`, `restore()`, and a tenant reaching `archived` — both the normal
lapse ladder's own `transition()` and PYG-21's separate inactivity-archival pass, which doesn't go through
`transition()` and needed its own call. The requirement's fourth named trigger, custom-domain
add/verify/remove, is correctly left unwired — no custom-domain module exists yet (`TEN-09–14`, deferred to
a later phase) — there is nothing to invalidate for.

Proven by three new cases in `apps/server/test/lifecycle.e2e.spec.ts` (`TEN-27: the host-to-tenant cache is
invalidated, not left to its own 60s TTL`): each resolves a host once to warm the cache, makes the state
change, then resolves the same host again immediately (well inside the 60s TTL) and asserts the outcome
already reflects the new state. Verified these would actually fail without the fix — temporarily disabled
all four `invalidateTenant` call sites, confirmed all three tests failed with the exact stale-cache symptom
(`expected 'tenant' to be 'closed'`), then restored the fix and confirmed green again before committing.

(Code: PR #103.)

## 32. `TRM-04`/`TRM-16`: a billing term's retirement was unreachable and unenforced, and no term change was audited — found and fixed 2026-10-17

Found while scoping a fix for these two requirements directly (not from the full re-audit). Two independent
gaps in the same area:

**`TRM-04`** ("retiring stops new purchases and renewals, changes nothing for subscriptions already on
it") was effectively 0% built, even though the pieces looked present. `BillingTermsService.retire()`
existed, set `retiredAt` correctly, and even carried a doc comment claiming TRM-04 compliance — but no
controller route called it (`OperatorBillingTermsController` had only `GET`/`POST`/`PATCH`/`DELETE`), so it
was dead code. Worse, even if it had been reachable, nothing read `retiredAt` back: `listVisibleFor` (the
list `GET /billing-terms` actually serves, the one a tenant picks a term from) filtered only on `visible`,
and `PurchaseService.quote`/`UpgradeService.quote` called `BillingTermsService.findById` only to confirm
the term existed, never inspecting whether it was retired. A retired term, had it ever been reachable,
would have stayed fully purchasable and renewable forever. The "changes nothing for subscriptions already
on it" half was already correct, not by any retiredAt-aware guard, but because a subscription's
`planSnapshot`/`periodStart`/`periodEnd` are written once at purchase/activation time
(`PurchaseService.activate`) and never re-read from the term row afterward; the price paid is likewise
captured once in `invoices.amount`, with no live re-read either.

**`TRM-16`** ("every term change is audited... shows old and new values") had zero implementation across
all three writes (create, update, retire) — `PlatformAuditAction.BillingTermCreated`/`BillingTermUpdated`/
`BillingTermRetired` were declared, explicitly commented `// TRM-16: every billing-term change`, and never
referenced anywhere. The "within [1] minute" clause was never at risk — billing terms have no cache in
front of them (unlike `RateCache`/`PlatformSettingsCache`), so a write is visible on the very next read
today, with nothing to invalidate.

**Fixed:**
- `POST /operator/billing-terms/:id/retire` — a new, dedicated route (mirroring the operator
  suspend/restore shape, not folded into the general `PATCH`, since `retiredAt` is a timestamp set once,
  not a toggle), returning the updated term.
- `billing_terms.repository.ts`'s `listVisibleFor` now excludes `retiredAt IS NOT NULL` — the stale comment
  claiming it "includes retired for the operator view" was simply wrong; the operator's own view is
  `listAll`, a different method entirely.
- `PurchaseService.quote` and `UpgradeService.quote` both now refuse a retired term with `not_found`,
  covering a new purchase, a manual renewal, and an upgrade's own term choice alike. `activate()` (the
  confirm-time path, for both the balance and wallet flows) deliberately keeps no such check, the same way
  it already doesn't re-check a plan's `forSale` — an already-quoted or already-queued payment must still
  activate even if the term is retired in the interim.
- `tryAutoRenew` needed no change at all: it already treats any `ApiError` from `quote()` as an expected
  renewal failure and falls through to the normal lapse ladder, so a tenant whose own term gets retired
  simply stops auto-renewing (the same outcome as insufficient balance) instead of erroring.
- `BillingTermsService.create`/`update`/`retire` each now call `PlatformAuditService.record`, with the
  operator id and real client IP threaded from the controller (`ClientIp`, the same AUD-02 retrofit
  pattern); `update`'s summary holds `oldValue`/`newValue` for only the fields actually changed (Zod fills
  every untouched optional field in as an explicit `undefined`, which would otherwise read as "changed").

Proven by new/extended cases across four files: `plan-catalogue.e2e.spec.ts` (retiring removes a term from
the public list but not the operator's own list; create/update/retire each write an audit row with the
right old/new values), `plan-purchase.e2e.spec.ts` (a retired term refuses a new quote; an existing
subscriber's snapshot/dates/invoice amount survive a later retirement untouched),
`plan-upgrade.e2e.spec.ts` (a retired term is refused as an upgrade target too), and
`lifecycle.e2e.spec.ts` (auto-renew falls through to the normal lapse when the tenant's own term is
retired, same as insufficient balance). Verified these would actually fail without the fix — temporarily
disabled all three guard/filter points plus all three audit calls, confirmed exactly five tests failed with
the expected symptom (`promise resolved instead of rejecting`, the retired term still listed, zero audit
rows) and nothing else broke, then restored and confirmed all 60 relevant tests green again before
committing.

## 33. `ADM-01`: regenerating backup codes had no implementation at all — found and fixed 2026-10-17

The requirement's own last clause ("regenerating codes invalidates the old set") had nothing behind it.
`OperatorBackupCodeRepository.deleteAllForOperator` and `OperatorAccountRepository.findById` already
existed at the repository layer — `deleteAllForOperator`'s own doc comment even anticipated this
("Regenerating or break-glass recovery invalidates the whole old set at once") — but nothing above that
layer used them for regeneration. The only place backup codes were ever created was `enroll()`, which runs
once at first confirmation and explicitly refuses to run again (`TwoFactorAlreadyEnrolled`). No service
method, no controller route, no DTO.

**Fixed:** `POST /auth/operator/backup-codes/regenerate` (session-guarded, mirroring `signout`'s guard
shape) re-asserts the password and a second factor — TOTP or a still-valid backup code — as a step-up
check before destroying anything, since the signed-in session cookie alone must not be enough to wipe the
account's own recovery codes. On success it deletes the whole old set and inserts ten fresh ones in the
same transaction, returns them once (same as enrollment), and writes one `control.platform_audit_log` row
(`backup_codes_regenerated`). Two small additions needed at the gateway layer to reach the already-existing
repository methods: `OperatorGateway.findById` and `OperatorGateway.invalidateBackupCodes`.

Proven by new cases in both `apps/server/test/operator-auth.spec.ts` (unit, fake gateway: regenerating
invalidates an old code while a fresh one works, accepts either a TOTP or a backup code as the second
factor, refuses a wrong password or wrong second factor leaving the old set intact, and asserts exactly one
audit row) and `apps/server/test/operator-auth.e2e.spec.ts` (HTTP + real database: the full round trip, plus
a wrong-password case and a missing-CSRF-token case).

## 34. `ADM-18`: the break-glass script was correct, but the documented procedure it names didn't exist — found and fixed 2026-10-17

The pass criteria names "the documented break-glass procedure" explicitly. The script itself
(`packages/db/src/reset-operator-2fa.ts`) was real, correct, and already logged to
`control.platform_audit_log` — but no document anywhere under `docs/` told anyone how to actually run it,
who's allowed to, or what happens afterward. An operator genuinely locked out had a working script and no
way to discover it.

**Fixed:** `docs/RUNBOOKS.md` (new file) §1 — the trigger condition, who can run it (schema-owner DB access,
never the app's own restricted role), the exact command, what it does in one transaction, how to verify it
worked, the full re-enrollment flow the locked-out operator goes through afterward, and the standing
limitation that the second half of `ADM-18` (a second operator's approval) isn't built yet since `OD-32`
keeps the platform solo-operator for now. Also cross-references `ADM-01`'s new self-service **regenerate**
as the lighter-weight path when the operator still holds one working factor — break-glass is only for both
factors being gone at once.

Docs-only; no code change.

## 35. `DWN-05`: the renewal screen quoted the current plan's price even once a downgrade was scheduled — found and fixed 2026-10-17

`PlanGrid`'s current-plan card always offered "renew" at the tenant's own current (higher) plan's price,
even after a downgrade had been scheduled for that exact period boundary — the screen never checked for a
pending `scheduled_plan_changes` row at all. Worse, `PurchaseService.quote`/`activate` only ever recognized
a renewal as "the tenant's own plan" (`info.planId === payment.planId`); paying for a *different* plan while
still `active` fell into the restart branch (`periodStart = now`), which would have cut the tenant's
already-paid-for remaining days short had anyone worked around the UI gap by quoting the lower plan
directly.

**Fixed:**
- `PurchaseService.quote`/`activate` now also treat the tenant's currently-scheduled downgrade target
  (`DowngradeService.getScheduled`) as "the tenant's own plan" for renewal/period-extension purposes —
  paying for it extends the current period from its real `periodEnd`, not from today, and
  `cancelIfScheduled` (already called at the end of `activate`) then clears the now-redundant scheduled row.
  An unrelated plan with no downgrade scheduled is untouched: still a plain restart, exactly as before.
- `apps/admin`'s `PlanGrid`: once a downgrade is scheduled, "renew" moves to the scheduled target plan's own
  card (its own price, and the backend now treats it as a renewal) instead of staying on the soon-to-be-
  former current plan; that plan's card shows nothing actionable rather than a now-redundant "downgrade"
  offer onto the plan already scheduled.

Proven by two new cases in `apps/server/test/plan-downgrade.e2e.spec.ts`: quoting and paying the scheduled
target extends the period from the real `periodEnd` (not today) and clears the scheduled row; a control
case confirms an unrelated plan with no downgrade scheduled still restarts as a plain purchase, guarding
against the fix accidentally widening past its own scope. Verified the extension behavior would actually
fail without the fix — temporarily disabled the scheduled-target recognition in both `quote` and `activate`,
confirmed the period-extension test failed with the exact symptom (period restarted from today instead of
extending), nothing else broke, then restored and confirmed all 60 relevant tests green again.

The admin-UI change has no automated test — no browser-automation tool exists in this environment
(`KNOWN-GAPS.md` #7) — verified by reading the diff only, consistent with how other frontend-only pieces
of work this session have been handled.

## 36. `BIL-14`/`BIL-15`: no renewal reminders, and a stale wallet quote never expired — found and fixed 2026-10-17

Neither half had any implementation. `BIL-14` (a renewal reminder 7/3/1 days before period end, then daily
during grace) had no candidate query at all — `LifecycleService`'s own lapse-ladder loop only ever iterates
tenants whose period has *already* ended (`findLapsingCandidates`), so a still-`active` tenant approaching
its period end was never looked at. `BIL-15` (an unsubmitted wallet-payment quote expires 24h after it was
quoted) had the `PlanPaymentStatus.Expired` enum value sitting unused in the schema with nothing ever
setting it — a tenant could leave a quoted-but-never-submitted `plan_payments` row `pending` forever.

**Fixed:**
- New `TenantRepository.findUpcomingRenewalCandidates` (still-`active`, `periodEnd` within the next 7 days)
  feeds a new `LifecycleService.runRenewalReminderPass`, called once per tick alongside the existing
  lapse-ladder loop. It sends at most one reminder per threshold (7, then 3, then 1 day out), the same
  audit-log existence check (`summary.day`, a `Set` of already-sent values) `sendDeletionWarningIfDue`
  already uses just counting down instead of up. The "daily during grace" half reuses the lapse-ladder
  loop's own candidates (already iterating `Grace`) via `sendDailyGraceReminderIfDue`, which only checks
  whether the single latest `RenewalReminderSent` entry falls on today's Asia/Dhaka calendar day.
- Email only, never SMS — `sendRenewalReminderNotice` is a new helper, deliberately not the existing
  `sendNotice` every other lifecycle notice uses (which sends both), since `BIL-14` is explicit that this
  reminder is never billed to the tenant as SMS. Push and the in-app banner have no backend state to add
  (banner is computed client-side from `/me`'s own `periodEnd`, same as the existing lapse-state banner) —
  push has no provider anywhere in this codebase yet, the same already-acknowledged gap as `PYG-21`'s own
  day-23 warning; deferred, not silently dropped. The banner's own frontend logic is deferred to a later,
  UI-focused pass, consistent with how this session treats backend/frontend as separate slices.
- `PlanPaymentsRepository.expireStalePending`/`PlanPaymentsService.expireStalePending` flip a `pending` row
  to `expired` once `PENDING_PURCHASE_EXPIRY_MS` (24h) has passed since `quotedAt` — but only when
  `transactionId IS NULL`. A row the tenant already submitted on time is never touched, no matter how long
  the operator takes to review it afterward: the clock is about the tenant's own window to act on a quote,
  not the operator's review speed. Wired into `LifecycleTickWorker`'s existing 5-minute cron as a 4th call,
  after trial conversion, due downgrades and the lifecycle tick.
- `PlanPaymentsService.recordSubmission` now accepts a submission arriving after the sweep already expired
  the row (a late submission), but always routes it to `needs_review`, regardless of amount match — never
  the normal `pending` bucket a timely submission would land in.

Proven by new cases in `apps/server/test/lifecycle.e2e.spec.ts` (BIL-14: each of the 7/3/1 thresholds fires
exactly once with a matching `control.mail_outbox` row and zero `control.sms_outbox` rows, idempotent
against a repeated tick; a `Grace`-state tenant gets exactly one reminder per calendar day, not per tick)
and `apps/server/test/plan-purchase.e2e.spec.ts` (BIL-15: an unsubmitted quote past 24h expires while a
timely submission on the same age is left alone; a late submission after expiry lands in `needs_review`
even with a matching amount; a quote still inside its window is untouched). Verified both would actually
fail without the fix — temporarily disabled `sendPreRenewalReminderIfDue`/`sendDailyGraceReminderIfDue` and
separately the `transactionId IS NULL` guard in `expireStalePending`'s query, confirmed each sabotage
produced the exact expected failing assertion, then restored and confirmed all tests green again.

## 37. `AUTH-21`: no essential-SMS allowance metering existed at all — found and fixed 2026-10-17

Scoped and fixed directly, not from the full audit. `PlanLimits.essential_sms_total`/`essential_sms_monthly`
already existed — schema, admin plan editor, operator overrides — but nothing read or incremented them;
there was no metering mechanism anywhere, confirming `KNOWN-GAPS.md` #18's own note. The requirement itself
was also revised during this fix (see `SRS-detailed.md` `AUTH-21`, amended 2026-10-17): a sign-up code and
the shop-ready SMS (SMS-18) are now both platform cost (excluded); a sign-in code to an *already-existing*
shop counts toward that shop's essential allowance, since the owner could have used their password instead.

**Fixed:**
- New `control.essential_sms_usage` table (migration `0039`), one row per counted SMS, read live via
  `SUM(parts)` rather than a denormalised running counter — no monthly-reset job needed, and SMS volume per
  tenant is small at this platform's declared scale.
- New `countSmsParts` utility (`apps/server/src/modules/shared/messaging/sms-parts.ts`): a reasonable-effort
  GSM-7/UCS-2 segment counter (160/153 chars per part for plain text, 70/67 for Bangla), since the
  requirement names "parts," not a flat per-message count.
- `SigninService.requestCode` now looks up whether the phone already owns a tenant and threads that through
  `OneTimeCodeService.issue`, which records the usage (keyed to that tenant) only for an SMS-channel,
  already-existing-shop sign-in — never for sign-up, a reset code (no password alternative exists), an
  identity-add code, or the email channel (no SMS cost to meter there).
- **Caught and fixed a real regression before it shipped**: the first version put a `suggestPassword` flag
  on the *request*-code response (`POST /auth/phone/code`), which would have broken `AUTH-13`/P1-E10's
  existing guarantee that this response is identical for a known and an unknown phone (a phone-number
  enumeration leak). Moved the flag to the *verify* response instead (`POST /auth/phone/verify`) — safe,
  since by then the caller has already proved they hold the phone, the same reasoning
  `SignedInSession.open()`'s own `next` step already uses to reveal account state.
- New `GET /balance/essential-sms` (on `BalanceController`), returning monthly/lifetime usage against the
  plan's own limits (`null` = unlimited, PLN-19's convention).
- Enforcement (refusing/charging once the allowance is exceeded) is explicitly out of scope — the
  requirement's own pass criteria only tests that the counter moves correctly, and that remains
  `KNOWN-GAPS.md` #14/#18's separate, still-unbuilt territory. The admin-dashboard UI nudge ("use your
  password instead") is also deferred — the backend contract (`suggestPassword`) is ready, no UI consumes
  it yet.

Proven by `apps/server/test/sms-parts.spec.ts` (the segment-counting math in isolation), a new
`AUTH-21: essential-SMS allowance usage for a sign-in code` block in `apps/server/test/one-time-code.spec.ts`
(white-box: counts only with a tenant id, never for Reset or the email channel, and — critically — asserts
the request-code response is byte-identical whether or not a tenant id is passed), and
`apps/server/test/essential-sms-usage.e2e.spec.ts` (full HTTP: sign-up and shop-ready don't count, a
sign-in code to an existing shop does and the verify response carries the suggestion, usage never leaks
across tenants). Verified the core recording logic would actually fail without the fix — temporarily
disabled the existing-tenant lookup and the `suggestPassword` computation, confirmed exactly the two tests
depending on them failed with the expected symptom, nothing else broke, restored, confirmed all 83 relevant
tests green.

## 38. `STF-11`: the Staff and Roles screens showed Add/Edit/Delete to a `staff:read`-only viewer — found and fixed 2026-10-17

`STF-11`'s own pass criteria has two halves: "a user without a permission receives 403 by API" (already true
— every write route on both screens is `@RequirePermission(Permission.StaffManage)`) "and does not see the
control in the UI" (not true until this fix). Both screens' nav entries are gated on `Permission.StaffRead`
alone (`nav-items.ts`'s own comment: "Staff and Roles both gate on StaffRead"), but nothing on the frontend
checked `StaffManage` — a `staff:read`-only staff member could open either screen and see fully clickable
Add/Edit/Delete controls that would 403 the instant they were used.

**Fixed:**
- New `apps/admin/src/permissions/has-permission.ts` — the one place "does this viewer hold permission X" is
  decided (owner implicitly holds everything, per D32; a staff member needs it in their own `permissions`
  list; defaults to `false` while `/me` hasn't resolved yet). `nav-items.ts`'s `visibleNavItems` refactored to
  call through it instead of duplicating the same owner-or-permission-list check a third time (one definition
  per concept) — behavior-preserving, confirmed against every existing case in `nav-items.test.ts`.
- `views/staff/index.tsx`/`staff-list.tsx` and `views/roles/index.tsx`/`role-list.tsx`: each container computes
  `canManage = hasPermission(useMe().data, Permission.StaffManage)`, hides its own "Add" button when false,
  and passes `canManage` down to the list component, which now hides Edit (Staff) and Edit+Delete (Roles) per
  row — both the mobile-card and desktop-table JSX blocks in each list file had the same unconditional button,
  so both needed the fix, not just one. Hidden by default while `/me` is still loading (same safer-default
  `visibleNavItems` already uses), which is a real, reachable case here too — `dashboard-shell.tsx` renders
  the route view unconditionally even before `/me` resolves, so a hard refresh landing directly on
  `/dashboard/staff` or `/dashboard/roles` genuinely hits this path.
- Audited every other screen for the same `*Read`-gates-nav/`*Manage`-gates-writes split. Found two more with
  the identical gap — **not fixed here, deliberately out of scope**: Balance (`TopUpForm` in
  `balance/index.tsx` is 100% mutation UI behind `BalanceManage`) and Billing (`PaymentsManage` guards every
  purchase/upgrade/downgrade/cancel action across several files: `index.tsx`, `PaymentPanel`, `DowngradePanel`,
  `PlanGrid`, `ScheduledDowngradeBanner`). Both would reuse the same `hasPermission` helper; flagged as their
  own follow-up rather than tripling this fix's diff. Shop-settings (one permission gates both read and
  write) and Activity (`AuditRead` has no `Manage` counterpart at all) have no instance of this bug.

Proven by a new `apps/admin/src/permissions/has-permission.test.ts` (the one genuinely pure-function piece of
this fix: owner bypass, grants when held, denies when absent, denies by default before `/me` resolves) and
the existing `nav-items.test.ts` staying green after the refactor. The JSX conditionals themselves have no
automated coverage — no React-component-test infrastructure exists anywhere in `apps/admin` (zero `.test.tsx`
files, no browser-automation tool in this environment) — verified by reading the diff only, consistent with
how every other admin-UI-only change this session has been handled.

## 39. `AUTH-18`: the reset-code screen's resend button used the entry form's 2-minute cooldown, not AUTH-07's 60-second one — found and fixed 2026-10-17

`AUTH-18` sets two different cooldowns on purpose: the forgot-password entry form itself is limited to one
request per 2 minutes per account (a silent no-op on a repeat, to blunt blind SMS-bombing of a form reachable
by anyone who knows a phone number), but the *resend button* on the already-displayed reset-code screen is
supposed to follow AUTH-07's faster, standard 60-second/5-per-hour limits instead — the same limits the
sign-in flow's own resend already uses. Only one backend route (`POST /auth/forgot-password`) and one
frontend hook (`useRequestPasswordReset`) existed, used for both actions, so the resend button was bound to
the entry form's own 2-minute cooldown the whole time: clicking it between 60 and 120 seconds after the last
code returned 200 but silently sent nothing, with the UI's own countdown reset as if it had.

**Fixed:**
- `ForgotPasswordService` gained `resend(phone)`, calling the same `requestFor` helper `request(phone)` uses
  but with `RESEND_COOLDOWN_MS` (60s) instead of the default `RESET_COOLDOWN_MS` (120s) — `requestFor` itself
  now takes the cooldown as a parameter rather than hardcoding it, and its own reply's `resendAfterSeconds`
  reflects whichever cooldown was actually applied. Still enumeration-safe (AUTH-17): the same silent-swallow
  and the same generic reply regardless of account existence, for either route.
- New `POST /auth/forgot-password/resend` route, and a new `useResendPasswordReset` hook in `apps/admin`,
  wired to the reset-code screen's own "Resend" button in place of the old, reused `useRequestPasswordReset`.
  The entry screen (`views/forgot-password/index.tsx`) is untouched — it still calls the original route with
  the original 2-minute cooldown.

Proven by two new cases in `apps/server/test/password.e2e.spec.ts`: a resend 70 seconds after the last code
(inside the entry form's own 2-minute window, but past AUTH-07's 60-second one) sends a real second SMS and
reports `resendAfterSeconds: 60`; the resend route still enforces its own 60-second cooldown when called too
soon, with the same AUTH-17-identical silent reply for a known and an unknown phone. Verified the fix would
actually fail without it — temporarily pointed `resend()` back at `RESET_COOLDOWN_MS`, confirmed the
70-second case failed with the exact expected symptom (no second SMS sent), then restored and confirmed all
15 relevant tests green again.

## 40. `UPG-13`: an upgrade cancelling a scheduled downgrade left no audit trail, and left a pending cancellation untouched — found and fixed 2026-10-17

`UPG-13` requires "a scheduled downgrade or cancellation shall be cancelled by an upgrade," with the pass
criteria "the banner disappears; audit shows the cancellation." The downgrade half was half-built:
`DowngradeService.cancelIfScheduled` (called from both `UpgradeService.activate` and `PurchaseService`'s own
DWN-05 renewal-onto-the-scheduled-target path) deleted the row but wrote no audit entry at all — unlike the
owner's own manual `cancel()` button, which does. The "or cancellation" half had no implementation
whatsoever: a pending `cancelledAt` (the owner's own "don't renew" intent, `LIF-01`) was never cleared by an
upgrade, which is a real functional bug beyond the missing audit trail — `LifecycleService`'s own
auto-renewal check (`BIL-17`) refuses to renew a tenant with `cancelledAt` set regardless of the auto-renew
toggle, so an upgraded tenant would silently fail to auto-renew at the *new* period's end over a stale flag
from before they paid to continue.

**Fixed:**
- `cancelIfScheduled` now looks up the existing row before deleting it (so it's a true no-op, no spurious
  entry, when nothing was scheduled) and records `AuditAction.DowngradeCancelled` in the caller's own
  transaction — the same action the manual button uses, since it's the same event from the log's
  perspective.
- `UpgradeService.activate` now also clears `cancelledAt` when one is pending, recording
  `AuditAction.SubscriptionCancellationUndone` in the same transaction as the plan assignment.
- Frontend cache invalidation: `useConfirmUpgrade` only invalidated `/me`'s own cache, never the scheduled-
  downgrade banner's (`SCHEDULED_DOWNGRADE_QUERY_KEY`) — so the banner kept showing the now-cancelled
  schedule until something else happened to refetch it. Fixed there, and in `useConfirmPurchase` too, since
  a plain renewal onto the scheduled target (`DWN-05`) clears the same row through the same shared method
  and had the identical stale-banner gap.
- The "or cancellation" half has no frontend banner to invalidate — no cancellation-status UI exists in
  `apps/admin` at all (`useCancelSubscription`/`useUndoCancellation` are fire-and-forget success-toasts,
  per that file's own note that no read route existed; `GET /billing/cancellation` does exist server-side,
  just unconsumed). Out of scope here: building that UI is a separate, standalone piece of work, not an
  upgrade-specific gap.

Proven by new cases in `apps/server/test/plan-downgrade.e2e.spec.ts`'s existing `UPG-13` block: the
downgrade-cancel case now also asserts the audit entry; a new case asserts an upgrade clears a pending
`cancelledAt` and audits it; a new no-op case asserts neither audit action appears when nothing was
scheduled or cancelled. Verified both fixes would actually fail without them — temporarily disabled the
audit write in `cancelIfScheduled` and the cancellation-clearing block in `activate`, confirmed each
sabotage produced the exact expected failing assertion, then restored and confirmed all 45 relevant tests
green again. The frontend cache-invalidation fix has no automated coverage (no browser-automation tool in
this environment); verified by reading the diff only.

## 41. `PYG-21`: the day-23 inactivity warning's dedup wasn't scoped to the current idle period — found and fixed 2026-10-17

`PYG-21` requires the day-23 warning to be sent "exactly once per idle period," and its own pass criteria is
explicit that a qualifying activity "restarts the clock." The dedup check in `runPaygInactivityPass`
(`lifecycle.service.ts`) asked only "has a `payg_inactivity` warning ever been sent for this tenant" — with
no lower bound on *when*. Unlike the subscription lapse ladder (where renewing moves the tenant out of
`active`/`grace`/etc. entirely, so a stale warning check never resurfaces), a pay-as-you-go tenant stays in
`pay_as_you_go` the whole time; a qualifying activity only moves `last_activity_at` forward. So a tenant
warned once, then reset by a top-up, then idle again long enough to cross day 23 a *second* time, would
never get the second warning — the first one, from the previous idle period, permanently suppressed every
later one.

**Fixed:** the dedup now also requires the matching audit entry's own `createdAt` to be no older than the
current idle streak's start (`lastActivityAt`, the same field the idle-day count itself is measured from) —
a warning from before the last reset no longer counts.

Proven by a new case in `apps/server/test/lifecycle.e2e.spec.ts`'s `PYG-21` block: a tenant warned once,
then reset by a (simulated) qualifying activity, then idle again past day 23 a second time, gets a second,
independent warning rather than being silently suppressed by the first. Verified the fix would actually
fail without it — temporarily dropped the new `createdAt` bound, confirmed the new case failed with the
exact expected symptom (the second warning never sent), then restored and confirmed all 23 relevant tests
green again.

## 42. `PLN-11`: a per-tenant limit override existed only in the operator's own CRUD screen, never read by anything that enforces or displays a limit — found and fixed 2026-10-17

`PLN-11` requires "the override applies over the snapshot" — but `control.plan_limit_overrides` (schema,
`PlanLimitOverridesService.set`/`listForTenant`/`remove`, the operator's own `/operator/tenants/:id/limit-
overrides` CRUD route) had exactly one consumer anywhere in the codebase: that same CRUD controller. An
operator could set, list and remove an override, each step correctly audited — but no enforcement path
(seats) or display path (the essential-SMS allowance, `PLN-11`'s own named example) ever read it. Setting
"free essential SMS" for a tenant did nothing beyond the operator's own screen; a seat-limit override had no
effect on whether `POST /staff` actually refused the next hire.

**Fixed:** new `PlanLimitOverridesService.effectiveLimits(tenantId, snapshot)` merges a tenant's overrides
over a given plan-limits snapshot (override wins per key; everything else passes through unchanged). Wired
into the two real consumers that exist today:
- `StaffController`'s own `shopOf()` helper (used by every route on that controller, so `POST /staff`'s seat
  check and `GET /staff`'s own seats-used/total display both pick it up for free).
- `BalanceController.essentialSms()` (`GET /balance/essential-sms`), so the displayed `totalLimit`/
  `monthlyLimit` reflect an override instead of the raw plan snapshot.

Not wired into `DowngradeService`'s own seat-overage preview/apply (which reads a *different* plan's raw
`limits`, not the tenant's current snapshot, for a hypothetical "what if" check) or into
`activity_retention_days` (a retention period, not read through any per-request guard the way seats/SMS
are) — left as-is, deliberately out of scope rather than guessed at. Every other limit key
(`products`, `orders_*`, `storage_mb`, `bandwidth_gb`, `paired_devices`) has no enforcement consumer at all
yet (Phase 3/4 territory), so there is nothing today for an override on those keys to actually affect either.

Proven by two new cases: `apps/server/test/staff.e2e.spec.ts` (an override raises the Trial plan's own
1-seat cap to 3, and the override's own ceiling is still enforced past that) and
`apps/server/test/essential-sms-usage.e2e.spec.ts` (an override sets `essential_sms_total` to a number and
`essential_sms_monthly` to unlimited, both reflected exactly in the `GET /balance/essential-sms` response).
Verified both would actually fail without the fix — temporarily made `effectiveLimits` a no-op passthrough,
confirmed each new case failed with the exact expected symptom (the plan's own default value, not the
override, winning), then restored and confirmed all 56 relevant tests green again.

## Not a bug, just noting it so it isn't mistaken for one later

The local dev DB's one real billing term has `labelBn` showing as `"? ???"` (mojibake) — bad seed/test data
from an earlier session, not a code encoding bug. Shows up in the live-verified pricing page's output too
(`/ ? ???`); re-seed or fix that one row directly rather than chasing a non-existent bug.
