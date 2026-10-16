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

## 2. No read endpoint for "is a cancellation currently scheduled" (LIF-01)

`billing/cancel` and `billing/cancel/undo` are write-only — nothing exposes `control.tenants.cancelled_at`
(or an equivalent) to the client. The UI (`apps/admin/src/views/billing/index.tsx`) currently shows both
actions as fire-and-forget with a one-line success message instead of a persisted toggle, because there's
nothing to read back after a page refresh.

**Fix shape:** either add `cancelledAt` to `/me`'s tenant summary (cheapest, matches how `periodEnd`/`state`
are already exposed) or a small dedicated read on `BillingController`.

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

## 9. LIF-24: suspension is a full outage, not `read_only` as the requirement says

`DashboardGuard` checks `suspendedAt` unconditionally, *before* the lapsed-owner carve-out that even
`archived`/`locked` get — so a suspended tenant is fully offline for everyone including the owner, stricter
than `archived` (LIF-12's own purchase-screen exception). `apps/server/test/dashboard.e2e.spec.ts`'s
suspension test asserts exactly this stricter behavior. **This needs a product decision, not just a doc
edit**: either the requirement's wording should describe the real "fully offline" behavior (plausible —
suspension is operator-initiated, for cause), or `DashboardGuard` should move the check if `read_only`-style
access was actually intended. Noted inline at `SRS-detailed.md`'s LIF-24 row; not resolved either way yet.

## 10. TRL-01/TRL-07: trial→pay-as-you-go conversion is built but never scheduled

`TrialLifecycleService.convertExpiredTrials()` implements the day-30 conversion correctly, but — unlike
`LifecycleService.runTick` (a real 5-minute pg-boss schedule via `LifecycleTickWorker`) — nothing calls it.
A real trial reaching day 30 today stays `trial` forever. **Fix shape:** add a `TrialConversionWorker`
analogous to `LifecycleTickWorker`.

## 11. PYG order-fee/product-fee charging (PYG-02/03/04/14/16/17/18) is correct but entirely unreachable

`PayAsYouGoBillingService.chargeOrderFee`/`chargeProductCreationFee` are logically right, but there is no
`orders` or `products` module anywhere in the codebase to call them — expected, since `PHASE-2-PLAN.md`
itself defers the real wiring to Phase 3/4; noted inline on the SRS rows since they're otherwise tagged as
independently `API`-testable today, which they aren't yet.

## 12. Add-on catalogue (PLN-13/14/15, UPG-14) has zero implementation

No store, service, controller, DTO or test references an add-on concept anywhere. Already deferred past
Phase 2's exit criteria by `PHASE-2-PLAN.md` D2-4 — this is just making that explicit on the SRS requirement
rows themselves, which are tagged with concrete `API`/`E2E` verification types as if checkable now.

## 13. Data export (LIF-16/LIF-17) has zero implementation

No export endpoint exists anywhere — consistent with there being no orders/customers/products modules yet
to export from, but the SRS rows give no signal that it's unbuilt. Noted inline.

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

## 20. Dev-seed gap: no "Pro" plan in the local dev database

`MARKETING-PLAN.md`/`SRS.md`/`SRS-detailed.md` all describe three plans (Starter/Growth/Pro). The live local
dev DB's `GET /plans` only returns Starter and Growth — looks like incomplete local seed data, not a
deliberate drop of the tier (no seed script was found under `packages/db` to check directly). Worth a look
before relying on "Pro" being purchasable in any further live testing against this same dev DB.

## Not a bug, just noting it so it isn't mistaken for one later

The local dev DB's one real billing term has `labelBn` showing as `"? ???"` (mojibake) — bad seed/test data
from an earlier session, not a code encoding bug. Shows up in the live-verified pricing page's output too
(`/ ? ???`); re-seed or fix that one row directly rather than chasing a non-existent bug.
