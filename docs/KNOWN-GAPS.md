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

## 24. `AUD-07`: no money-entry retention floor on the purge job — found and fixed 2026-10-16

Also found during the same audit. `ActivityLogPurger`'s delete query had one unconditional
`WHERE created_at < plan_retention`, with no exception whatsoever for money-related entries (payment,
wallet, credential, plan, balance) that should survive 24 months regardless of plan. No category tagging of
entries existed to even support the exception.

**Fixed:** added `MONEY_RELATED_AUDIT_ACTIONS` (`packages/validators/src/db/enums.ts`) — a deliberately
named list (`PasswordChanged`, `PasswordReset`, `PlanAssigned`, `PlanPurchased`, `PlanRenewed`,
`PlanUpgraded`, `BalanceToppedUp`, `DowngradeScheduled`, `DowngradeCancelled`, `DowngradeApplied`,
`SubscriptionCancelled`, `SubscriptionCancellationUndone`) covering AUD-07's four named categories —
and widened the purge SQL to keep any entry in that list until it's itself past 24 months, independent of
the plan's own shorter retention. Proven by a new test in `apps/server/test/activity.e2e.spec.ts`: a
money-related entry past plan retention but under 24 months survives a purge run; an ordinary entry the
same age is purged as before; a money-related entry past 24 months is purged too (the floor isn't infinite).

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

## Not a bug, just noting it so it isn't mistaken for one later

The local dev DB's one real billing term has `labelBn` showing as `"? ???"` (mojibake) — bad seed/test data
from an earlier session, not a code encoding bug. Shows up in the live-verified pricing page's output too
(`/ ? ???`); re-seed or fix that one row directly rather than chasing a non-existent bug.
