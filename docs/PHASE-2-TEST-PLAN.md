# Phase 2 test plan: plans, billing, lifecycle, balance

Status: draft for discussion, 2026-10-13. Companion to `PHASE-2-PLAN.md`. The scenario-level suite S03 in `TEST-PLAN.md` is the wider plan (this document's scenarios map onto it 1:1 where noted); this document is the detailed plan for Phase 2, using the same ID style (`P2-…`) `PHASE-1-TEST-PLAN.md` established.

Trial-related requirements already exercised in Phase 1 (`TRL-01`, `TRL-03`, `TRL-05`, `TRL-08` — trial *limits*, which exist as seeded data since Phase 1's D3, independent of billing existing) are not repeated here; this document covers what Phase 2 actually adds: conversion *out of* the trial, and everything billing/lifecycle/balance.

---

## 1. Test layers

Same table as `PHASE-1-TEST-PLAN.md` §1 — Unit, Integration, API, Isolation, E2E, Manual — with one addition specific to this phase:

| Layer | What it proves | Tool (proposed) | Runs |
|---|---|---|---|
| **Job** | A scheduled/recurring job (the lifecycle sweep, PYG inactivity scan, reminders) behaves correctly across a simulated date range, including run-twice idempotency | Vitest, driving the job function directly against a test clock, not waiting on a real scheduler | Every CI run |

**Blocking rule:** unchanged — the isolation suite and the API suite must pass for a pull request to merge; E2E failures block merge once the scenario exists (per Phase 1's audit, this still means API-level tests stand in for `[E2E]` tags in practice; see that document's own note on the Playwright gap, since closing it for this phase's screens is its own later decision, not assumed here).

---

## 2. Environment

- **Database and clock:** the same Docker Postgres and controllable test clock Phase 1 established, extended to simulate date ranges of months, not just minutes — every lifecycle/billing boundary in this phase is day-scale (grace at day 3, deletion at day 60, PYG archival at day 30), so the clock must be cheaply advanceable in large jumps, not just ticked forward.
- **Payment stand-in (D2-1):** every scenario below that confirms a purchase does so through the stand-in confirmation step `PHASE-2-PLAN.md` describes (an operator-equivalent "mark as paid" action), not a real wallet. Scenarios are written so the confirmation *trigger* is swappable later without rewriting the scenario itself — "payment is confirmed" is the step, not "the hosted page's listener reports verified."
- **Fixtures:** at least two tenants with overlapping data (mirrors Phase 1's alpha/beta pattern) for the isolation sweep, plus a third held at each lifecycle boundary simultaneously for the job's own multi-tenant test (§3, section F).
- **Rates and settings:** seeded with known values (`RAT-*`, `platform_settings`) so pass criteria can assert exact TK amounts, not just "a charge happened."

---

## 3. Scenarios

Each scenario lists its preconditions, numbered steps, expected result, and the requirement IDs it covers. Layer tags: **[API]**, **[E2E]**, **[INT]**, **[ISO]**, **[JOB]**.

### A. Plans and billing terms

**P2-E01 Plan CRUD, snapshot permanence, and versioning. [API]**
- Steps: create a plan with every `PLN-01` field; a tenant purchases it; read the stored snapshot; edit the plan's limits; re-read the already-purchased tenant's snapshot and a freshly-purchasing tenant's.
- Expected: a negative limit or a zero price for a paid plan is rejected; the purchase snapshot equals the plan values at that moment; editing creates a new version, retrievable afterward (D2-3); the already-active tenant's snapshot is untouched; a new purchaser gets the new version; a plan referenced by any snapshot cannot be deleted, only retired, and a tenant on a retired plan keeps it until renewal, when only for-sale plans are offered.
- Covers: PLN-01, PLN-02, PLN-03, PLN-05, PLN-06, PLN-07, PLN-08, PLN-09.

**P2-E02 Not-for-sale plans never leak, and the comparison page renders from data. [API]**
- Steps: mark a plan not-for-sale; call the tenant-facing plans list and the comparison page directly, including a crafted request that tries to name the plan's ID; separately, change a live price in the editor and reload the comparison page with no deploy.
- Expected: the not-for-sale plan never appears in any tenant-facing response, enforced server-side, not just hidden client-side; the comparison page reflects the price change immediately.
- Covers: PLN-04, PLN-10, PLN-12.

**P2-E03 Not-for-sale direct assignment, with and without expiry. [E2E]**
- Steps: an operator assigns a not-for-sale plan to a specific tenant with a reason, choosing (a) a period length and (b) no expiry; leave the no-expiry tenant untouched for a year.
- Expected: assignment activates immediately with no payment prompt, storing a normal snapshot; an empty reason is refused; both the platform audit log and the tenant's own activity log show it; the no-expiry tenant is never prompted to renew and never lapses through the normal lifecycle, even after a year.
- Covers: PLN-17, PLN-18.

**P2-E04 Per-tenant limit overrides. [API]**
- Steps: an operator sets an override on one limit (e.g. free essential SMS) with a reason; remove it later.
- Expected: the override applies over the snapshot and appears in the audit log; removing it restores the snapshot's original value.
- Covers: PLN-11.

**P2-E05 Billing term CRUD, validation, and retirement. [API]**
- Steps: create a term with 0 months, then 61; create a valid term and set a plan's price for it; retire the term; edit the retired term's length and check an already-subscribed tenant's dates; attempt to delete a used vs. an unused term.
- Expected: 0 and 61 months are rejected; the term appears for purchase within 1 minute of being priced and visible; retiring stops new purchases/renewals on it while existing subscribers keep their original schedule, unaffected even by a later edit to the term's own definition; deleting a used term returns `conflict`, an unused one succeeds.
- Covers: TRM-01, TRM-02, TRM-04, TRM-05, TRM-07, TRM-08, TRM-11.

**P2-E06 Price prefill, period-end math, and quote-honored-through-retirement. [API]**
- Steps: set a 5% default discount on a term and observe the prefilled price on a plan; hand-edit that price; separately, compute period end for a 31 Jan + 1 month start and a 15 Mar + 3 month start; get a price quote just before a term is retired and pay within the quote window after retirement.
- Expected: the discount prefills 1,280 for a 449 TK plan at 3 months; a hand-edit sticks and is not later overridden by the discount; 31 Jan + 1 month ends 28 Feb (29 in a leap year); 15 Mar + 3 months ends 15 Jun; the late payment within the quote window still activates the plan.
- Covers: TRM-03, TRM-09, TRM-06.

**P2-E07 Purchase/comparison screens render terms from data; rank determines upgrade/downgrade; invoices freeze the term label. [E2E]**
- Steps: add a new term and observe the purchase/comparison screens with no deploy; compute effective monthly price and saving for a 12-month, 4,741 TK term on a 449 TK plan; create a term visible to one tenant only; rename a term after a tenant has already purchased under it and inspect their invoice; swap two plans' ranks in the editor.
- Expected: the screens update live; the 12-month example shows about 395/month and 12% saving; the single-tenant term is invisible to others; the invoice still shows the original term label after the rename; swapping ranks swaps which direction counts as upgrade vs. downgrade.
- Covers: TRM-12, TRM-13, TRM-14, TRM-15, TRM-16, PLN-16.

### B. Trial and pay-as-you-go

**P2-E08 Trial-to-paid and trial-to-pay-as-you-go conversions. [E2E]**
- Preconditions: trial limits/counters are already covered by Phase 1 (`P1-E01`); this scenario covers only the two ways a trial ends.
- Steps: (a) a trial tenant buys Starter mid-trial; (b) a separate trial tenant reaches day 30 with no purchase; (c) a third trial tenant actively chooses pay-as-you-go from the plan screen before day 30, instead of waiting for (b)'s automatic conversion or buying a subscription.
- Expected: (a) snapshot stored, state → `active`, counters reset, all trial-era data (products, orders, media) carried over; (b) state → `pay-as-you-go` directly, never `grace` (that lifecycle applies only to a lapsed *paid* commitment, not an unpaid trial), all data intact, limits widen immediately to pay-as-you-go's own (looser) figures; (c) choosing it skips the billing-term selector entirely and converts at once, with no payment step — the same destination as (b), just reached by the owner's own choice instead of the clock.
- Covers: TRL-06, TRL-07, PYG-01.

**P2-E09 Trial restrictions: no payment method at sign-up; top-up, SMS and extraction allowed; chat AI and fraud checks still refused. [API]**
- Steps: complete sign-up and use the trial without ever being asked for a payment method; attempt a balance top-up, an optional SMS send, an order-extraction call, a chat-AI reply, and a paid fraud check during the trial, both with and without enough balance.
- Expected: no payment method is requested anywhere in the trial flow; a top-up quote/submission succeeds the same way it would on an active tenant (amended 2026-10-15, TRL-04/BAL-06); a funded optional SMS send and order-extraction call both succeed and charge the balance at the normal rate (amended 2026-10-15, SMS-15/ORD-34), refused only for frozen/insufficient balance, never `plan_feature_unavailable`; chat AI and paid fraud checks are still refused with `plan_feature_unavailable` and a message to buy a plan, independent of the balance (AI-11 unchanged — chat AI is a Growth/Pro plan feature, not available on trial, pay-as-you-go or Starter either).
- Covers: TRL-02, TRL-04, SMS-15, ORD-34.

**P2-E10 Pay-as-you-go order-fee charging: only at fulfillment, never refunded after the fact. [API]**
- Steps: create an order with zero balance (confirm creation succeeds regardless); book a courier for a ৳200 order and a ৳5,000 order; attempt to book with insufficient balance; force a booking failure; cancel an order that was never booked; cancel one already successfully booked.
- Expected: order creation never checks or touches the balance; booking the ৳200 order charges 20 TK (the 1.5%-of-200 is below the minimum), the ৳5,000 order charges 75 TK (1.5% exceeds the minimum); insufficient balance refuses the booking and leaves the order `pending`; a failed booking attempt charges nothing; cancelling a never-booked order charges nothing ever; cancelling an already-booked order does not refund the fee already charged.
- Covers: PYG-02, PYG-03, PYG-04, PYG-05.

**P2-E11 Pay-as-you-go product-creation fee: once per product, never refunded on delete. [API]**
- Steps: create a product with 6 variants (observe one charge); add a 7th variant and edit the product afterward; create a product with insufficient balance; force a creation failure after the fee was charged; soft-delete a normal product afterward.
- Expected: the fee charges exactly once, at creation, regardless of variant count; adding variants or editing afterward charges nothing further; insufficient balance refuses creation before any row exists; a forced failure reverses the fee; a later soft- or hard-delete never refunds it.
- Covers: PYG-16, PYG-17, PYG-18.

**P2-E12 Pay-as-you-go has no volume-triggered lapse, and its rolling-cycle limits reset on its own anniversary. [JOB]**
- Steps: drive a pay-as-you-go tenant through heavy order/product activity for a year, with regular qualifying charges throughout; separately, create one on the 10th of a month and check its bandwidth/request counters on the following 10th.
- Expected: no forced state change regardless of volume, as long as qualifying activity continues (contrast with P2-E13, where activity *stops*); the rolling-cycle counters reset on the tenant's own creation-date anniversary, not the calendar month's 1st.
- Covers: PYG-08, PYG-19.

**P2-E13 Pay-as-you-go auto-archive after inactivity. [JOB]**
- Preconditions: a pay-as-you-go tenant with no order-fee, product-fee or top-up activity since creation.
- Steps: advance the clock to day 23 with no qualifying activity; advance to day 30, still with none; separately, repeat with a top-up on day 25.
- Expected: a day-23 warning is sent exactly once, by in-app notice, push and email, never SMS; at day 30 with still no qualifying activity the tenant moves directly to `archived` — no grace or read-only stage, since no paid period exists to protect (the same shape as P2-E14's voluntary-closure case); the day-25 top-up resets the inactivity clock and cancels both the pending warning and the archival.
- Covers: PYG-21.

**P2-E14 Pay-as-you-go voluntary closure and operator suspension. [E2E]**
- Steps: the owner voluntarily closes a pay-as-you-go tenant; separately, an operator suspends one for cause.
- Expected: both move the tenant directly to `archived` with no grace or read-only period; business-data deletion follows at day 60 counted from that point, exactly as any other archived tenant.
- Covers: PYG-09.

**P2-E15 Switching between pay-as-you-go and a subscription. [E2E]**
- Steps: an active subscription tenant schedules a switch to pay-as-you-go mid-period; separately, a pay-as-you-go tenant chooses Starter.
- Expected: the subscription→PYG switch changes nothing until the current paid period ends (the same rule as a downgrade); nothing already paid is refunded; the PYG→subscription switch is a fresh, full-price purchase for the chosen term with no prorated credit, since no paid period existed to credit.
- Covers: PYG-10, PYG-11.

**P2-E16 Pay-as-you-go defaults and ledger transparency. [API]**
- Steps: create a new pay-as-you-go tenant and check its payment-volume cap and custom-domain access; compare its resource-limit figures against Starter's; read the ledger entries from an order-fee and a product-fee charge.
- Expected: the new-tenant payment cap is on by default with no owner action; a custom domain returns `plan_feature_unavailable`; every pay-as-you-go resource figure (seats, products, storage, bandwidth, requests) is strictly below Starter's corresponding figure; each ledger entry names the order or product it belongs to and the rate components used.
- Covers: PYG-06, PYG-07, PYG-14, PYG-20.

### C. Plan purchase and invoices

**P2-E17 Purchase screen and payment methods. [E2E]**
- Steps: load the purchase screen for a plan and term; observe price and saving shown; pay through each enabled method (wallet stand-in per D2-1, and balance).
- Expected: the correct price and saving display per term; only operator-enabled methods are offered; a disabled method never appears; the stand-in confirmation step produces the same downstream effects (P2-E18) regardless of which method was chosen.
- Covers: BIL-01, BIL-02, BIL-03.

**P2-E18 Purchase confirmation and its side effects. [E2E]**
- Steps: start a purchase and check the tenant's state before confirmation; confirm it; separately, submit a payment for an amount that doesn't match the quoted price.
- Expected: before confirmation nothing about the tenant has changed; on confirmation the plan activates — snapshot stored, state → `active`, period set, invoice created, audit entry written, owner notified — all six in one transaction; a mismatched amount routes to a `needs_review` queue and does not activate the plan.
- Covers: BIL-04, BIL-05, BIL-06.

**P2-E19 Transaction ID uniqueness and balance-payment atomicity. [API]**
- Steps: reuse a transaction ID across two different payments, platform-wide; pay from a balance of exactly the price, then from one taka short, then fire two simultaneous balance payments against a balance that can cover only one.
- Expected: the reused ID returns `conflict`; the exact-match balance payment succeeds and leaves zero; the short balance is refused; of the two simultaneous attempts, exactly one succeeds.
- Covers: BIL-07, BIL-08.

**P2-E20 Quote price held for its window. [API]**
- Steps: generate a quote; pay within the hold window after the plan's price changed in between; pay after the window has passed.
- Expected: a payment within the window is charged at the quoted price regardless of the intervening edit; one after the window is refused with a fresh quote offered.
- Covers: BIL-09.

**P2-E21 Renewal timing: early extension vs. purchase after lapse. [E2E]**
- Steps: renew 10 days before the current period ends; separately, purchase on day 5 of a lapse (any lapsed stage).
- Expected: the early renewal's new period starts when the current one ends, not immediately; the lapsed purchase starts a full new period at confirmation time, restores `active` state, and leaves data intact.
- Covers: BIL-10, BIL-11.

**P2-E22 Invoices: fields, gap-free numbering, and lifetime access. [API]**
- Steps: fire several concurrent purchases and inspect the resulting invoice numbers; inspect one invoice's full field set; access an owner's invoices after their tenant's business data has been deleted.
- Expected: invoice numbers run with no gaps even across concurrent purchases; every field the real `invoiceSchema` actually defines is present — `id, tenantId, number, kind, planSnapshot, amount, creditAmount, billingTermLabel, issuedAt` (**corrected 2026-10-16**: the field list previously here — subscriber/shop name, plan+version, period dates, discount, tax lines, payment reference — doesn't match the real schema; no subscriber/shop-name field exists at all (only `tenantId`), `planSnapshot` is the plan's limits object rather than a plan-name-plus-version pair, there's no separate discount or tax-line field, and `creditAmount` is specifically the upgrade-credit line, not a general discount); invoices remain listable after deletion — **flagged in `docs/KNOWN-GAPS.md` #1: this currently fails**, since `BillingController` has no `lapsed: true` guard anywhere, so a deleted tenant's owner actually gets `403 tenant_offline` on `GET /billing/invoices` today, not the 200 this scenario expects; no download/export endpoint exists at all (only `GET /billing/invoices` and `/:id`), so "downloadable" isn't a real claim to test.
- Covers: BIL-12, BIL-13.

**P2-E23 Reminders, expiry, explicit confirmation only, and no refunds. [JOB]**
- Steps: let a pending purchase sit unconfirmed past its expiry window; let a subscription approach its renewal date and observe reminders at each configured interval and daily during grace; attempt any plan charge without an explicit confirmation action; attempt a refund on a fresh first purchase and on a long-standing renewal.
- Expected: the pending purchase expires and a late payment after that goes to review, not auto-activation; reminders fire on schedule by in-app/push/email, never SMS, with no balance change; no code path charges the balance or a wallet without an explicit owner confirmation; no refund action exists anywhere for a tenant — only an audited operator adjustment moves money back.
- Covers: BIL-14, BIL-15, BIL-16, BIL-18.

### D. Upgrade

**P2-E24 Upgrade eligibility and the proration math, literally. [API]**
- Steps: reproduce the SRS's own worked examples exactly: (A) Starter 1-month (449 TK, 30 days) with 20 days remaining upgrading to Growth 1-month (699 TK); (B) Starter 12-month (4,741 TK, 365 days) with 265 days remaining upgrading to Growth 12-month (7,381 TK). Separately, attempt an upgrade to an equal or lower rank, and an upgrade whose credit would exceed the new price.
- Expected: (A) credit 299, amount due 400; (B) credit 3,442, amount due 3,939 — both half-up rounded to the whole taka; both examples' credit is computed from the actual days between each snapshot's own stored start and end dates (TRM-10), not an assumed 30-day month, which is exactly why a 1-month and a 12-month example are both needed; an equal/lower-rank target is never offered as an upgrade; when credit (3,442) exceeds a shorter term's price (699), that term option is hidden with a message to choose a longer one.
- Covers: UPG-01, UPG-02, UPG-03, UPG-04, UPG-05, TRM-10.

**P2-E25 Upgrade quote: content, expiry, and one-at-a-time. [E2E]**
- Steps: open the quote screen and check every listed field; let a quote sit past its validity window before paying; attempt to start a second upgrade while one is already pending.
- Expected: the quote shows credit, new price, amount due, new period dates and the limits that change, matching P2-E24's math; a stale quote is refused with a fresh one offered; the second concurrent attempt returns `conflict`.
- Covers: UPG-06, UPG-07, UPG-08.

**P2-E26 Confirmation applies immediately; counters reset vs. stay untouched. [E2E]**
- Steps: confirm an upgrade and immediately check the new limits, the renewal date, and both kinds of counter (per-period: orders handled, essential SMS used, bandwidth, requests, sessions; not-per-period: products stored, storage used, seats in use).
- Expected: new limits are usable at once (a 3rd user can be created right after Starter→Growth); the renewal date is confirmation time plus the new period's length; every per-period counter reads zero immediately after; every non-period counter is exactly what it was before.
- Covers: UPG-09, UPG-10, UPG-11, UPG-12.

**P2-E27 Upgrade's side effects: cancels a scheduled downgrade, credits the invoice, both payment methods behave correctly, a failed attempt is unaffected. [E2E]**
- Steps: with a downgrade already scheduled, upgrade instead; inspect the resulting invoice; pay one upgrade from balance and check the balance immediately before and after; pay a separate upgrade by wallet and check the balance immediately before and after (unchanged until confirmed); start an upgrade payment and let it fail or time out.
- Expected: the scheduled downgrade is cancelled, audited; the invoice shows the credit line; paying from balance deducts the amount due exactly once, refused if the balance can't cover it; paying by wallet leaves the balance byte-for-byte unchanged until an operator confirms it; an unconfirmed/failed payment leaves the tenant on the old plan with nothing changed.
- Covers: UPG-01, UPG-13, UPG-15, UPG-16, UPG-17.

### E. Downgrade

**P2-E28 Scheduling, preview, and cancellation — nothing changes before the effective date. [E2E]**
- Steps: an `active` owner schedules a downgrade to a lower-rank plan while at 340 products against a 100 limit; preview before confirming; check limits/price/dates immediately after scheduling; cancel the schedule before it takes effect; check the renewal screen's price with a downgrade scheduled.
- Expected: the preview lists every over-limit item with counts ("products 340 of 100"); nothing is charged, refunded or changed before the effective date; a banner shows the scheduled change with a working Cancel, audited when used; the renewal screen shows the lower plan's price once scheduled.
- Covers: DWN-01, DWN-02, DWN-03, DWN-04, DWN-05.

**P2-E29 Effective date: snapshot switches, and each over-limit resource is handled on its own terms. [E2E]**
- Steps: let the effective date pass with the renewal paid; separately hold a tenant over-limit on products, seats (4 active users against a 2-seat limit), storage, and a custom domain (on a plan that drops it).
- Expected: the snapshot and counters switch to the lower plan; existing over-limit products stay visible and sellable while new creation is blocked until under the limit; exactly 2 of the 4 users stay active (the owner plus the earliest-created active staff member), the rest deactivated, not deleted, with their history intact and swappable within the limit; storage over the limit keeps existing media serving while blocking new uploads; the custom domain goes not-found while the subdomain keeps working and the domain record is kept (re-enabled by a later upgrade).
- Covers: DWN-06, DWN-07, DWN-08, DWN-09, DWN-10.

**P2-E30 The 30-day checklist, its permanent aftermath, and the audit trail. [JOB]**
- Steps: hold a downgraded tenant over-limit for the full 30-day grace window, fixing one item partway through; let the window elapse with items still over; separately downgrade a tenant with 5 paired devices against a 2-device limit and revoke 3; review the audit log across the whole sequence.
- Expected: the banner counts down and ticks off fixed items live; every function except adding above-limit items works throughout; after 30 days the same blocks remain with nothing deleted or hidden, plus a final warning with an export offer; per-period limits (orders, bandwidth, requests, sessions) read the new plan's values from the effective date; all 5 devices keep working until revoked, a 6th pairing is refused, revoking 3 clears the checklist item; every step (schedule, cancel, apply, each block/deactivation) appears in the audit log in order.
- Covers: DWN-11, DWN-12, DWN-13, DWN-14, DWN-15, DWN-16, DWN-17, DWN-18.

### F. Cancellation, lifecycle and deletion

**P2-E31 Cancellation and non-renewal both lead to grace. [E2E]**
- Steps: the owner cancels a subscription; check behavior until period end; undo the cancellation before it takes effect; separately, let a different tenant's period simply end unpaid with no cancellation action at all.
- Expected: after cancelling, everything works normally until period end, when the tenant enters `grace`; "Undo" removes the cancellation and is audited; the tenant that just didn't renew ends up in `grace` at period end too — non-renewal behaves exactly like cancellation.
- Covers: LIF-01, LIF-02.

**P2-E32 The full lapse-to-deletion cycle against a test clock. [JOB]**
- Preconditions: an `active` tenant with an unpaid period.
- Steps: advance the clock through grace (day 0–3) → read-only (day 3–7) → locked (day 7–15) → archived (day 15–60) → deleted (day 60), checking dashboard, API and public-side behavior at each stage; at each stage before deletion, pay and confirm the tenant returns to `active` with everything intact.
- Expected: state at each point matches `SRS-detailed.md` §2.3 exactly, derived purely from stored dates (a test clock set to day 4 gives `read_only` with no manual change); paying at any point restores `active` within 1 minute with all data, the balance, and the public side intact, and any scheduled cancellation removed.
- Covers: LIF-03, LIF-04, LIF-15.

**P2-E33 Each lapsed stage's actual gate. [API]**
- Steps: in `grace`, use every function normally; in `read_only`, attempt to view/export, change password, sign out, buy a plan, then attempt to create/update/delete anything; call the public API, hosted payment page, storefront and a listener upload from `read_only`, `locked` and `archived`; attempt a secret-key call from `read_only`; attempt SMS/chat-AI/extraction/fraud-check spend from any lapsed state.
- Expected: `grace` works exactly as `active`, with a renewal banner; `read_only` allows view/export/password-change/sign-out/buy-plan and refuses every create/update/delete with `tenant_offline`; every public-facing surface is fully offline across all three later stages, including secret-key calls; every paid service refuses with `tenant_offline` since the balance is frozen.
- Covers: LIF-05, LIF-06, LIF-07, LIF-08, LIF-09.

**P2-E34 Owner-only in `locked`; the essential-SMS and shopper-messaging carve-outs. [API]**
- Steps: attempt a staff sign-in while `locked`; the owner signs in while `locked` and receives a sign-in code; check for any outbound message to a shopper from a tenant in any lapsed stage from day 3 onward; send a courier webhook for an already-booked parcel at day 10 (`locked`) and again at day 20 (`archived`).
- Expected: staff sign-in is refused with `tenant_offline`; the owner's own sign-in code is still sent and neither charges the balance nor the essential-SMS allowance; no push/SMS/email to a shopper is ever sent from day 3 onward; the day-10 webhook still updates the order, the day-20 one is logged and ignored.
- Covers: LIF-10, LIF-11, LIF-12, LIF-13, LIF-14.

**P2-E35 Export in read-only and locked. [E2E]**
- Steps: the owner exports orders, customers, products, payments and the activity log as CSV and JSON while `read_only`; attempt the same as staff, and as a different tenant's owner, using the first owner's download link.
- Expected: the export is ready within the stated time and contains every record; the action is audited; staff and another tenant's owner cannot fetch the link; the link expires after 24 hours.
- Covers: LIF-16, LIF-17.

**P2-E36 Deletion warnings, the day-60 job, and what survives it. [JOB]**
- Steps: let a tenant approach day 60 and check for warnings at day 45 and day 57; let the day-60 job run, then run it again immediately; inspect what remains for the owner afterward; attempt to re-sign-up and claim the old subdomain within 30 days.
- Expected: both warnings exist with the deletion date and an export offer, by in-app/email/platform-sent-SMS uncharged to the tenant; the job removes every listed business-data category and media file and KYC record; running it twice produces one deletion and one notification, not two; the subscriber account, plan/payment history, invoices, balance (frozen, visible) and a deletion record all survive and are reachable by the owner; the old subdomain cannot be claimed by a different subscriber for 30 days.
- Covers: LIF-18, LIF-19, LIF-20, LIF-21, LIF-22, LIF-23.

**P2-E37 Operator suspend/restore, and every transition's audit trail. [E2E]**
- Steps: an operator suspends a tenant with a reason, then restores it; separately, change a lifecycle stage-length setting (e.g. grace from 3 to 5 days) and check both a tenant that lapsed before the change and one that lapses after.
- Expected: suspension blocks the public side at once, behaving as `read_only`; restoring reverses it; both steps are audited; the tenant that lapsed before the setting change keeps its original 3-day schedule, one lapsing after gets 5 days; every state transition anywhere in this phase has exactly one audit entry with old and new state.
- Covers: LIF-24, LIF-25, LIF-26.

### G. Balance ledger and rates

**P2-E38 Balance precision, the ledger invariant, and the top-up flow. [API]**
- Steps: inspect a brand-new subscriber's balance; top up through the stand-in hosted-page confirmation (D2-1); check the balance before and after verification; reuse the same transaction ID for a second top-up; attempt top-ups of 99 TK and 50,001 TK, then lower the platform minimum to 50 and retry with 60 TK immediately, and check a top-up already in progress keeps its original limit.
- Expected: a new balance is exactly 0.00, stored to 0.01 TK precision; the balance is unchanged before verification and rises by exactly the amount after; the reused transaction ID credits nothing and returns `conflict`; 99 and 50,001 are rejected; after lowering the minimum, a fresh 60 TK attempt succeeds with no restart; the in-progress session keeps the limit it started with.
- Covers: BAL-01, BAL-02, BAL-03, BAL-04, BAL-05.

**P2-E39 Usable vs. frozen by state, and atomic, never-negative deductions. [JOB]**
- Steps: attempt top-up in `trial` and in a lapsed state; spend at 2 days into grace and again one second past it; check the frozen balance's display and that nothing can touch it while frozen; buy a plan to reactivate; fire 100 simultaneous 1-TK charges against a 50 TK balance; attempt a single charge larger than the current balance.
- Expected: `trial` top-up succeeds the same way an active tenant's does (amended 2026-10-15, TRL-04/BAL-06), a lapsed one still returns `tenant_offline`; the day-2 spend succeeds, the one-second-past-grace spend fails with `tenant_offline`; the frozen balance shows its amount with a "frozen" label and produces no ledger entry for any attempted change; reactivation makes it spendable again with no expiry; exactly 50 of the 100 simultaneous charges succeed, balance ends at 0, and 50 ledger rows exist; the oversized charge is refused outright.
- Covers: BAL-06, BAL-07, BAL-08, BAL-09, BAL-10, BAL-11.

**P2-E40 Charge only on success, low-balance notices, and the statement. [JOB]**
- Steps: force a service call (SMS or AI) to fail after a balance reservation; cross 50 TK and then 0 from above; cross back above 50 TK and down through it again; pull a statement filtered by type and date, export it, and attempt a top-up without `balance:manage`.
- Expected: the failed service leaves the balance unchanged, confirming the reservation was released; a notice fires once per crossing of 50 and 0, never by SMS; crossing the same threshold a second time fires a second notice; the filtered statement's sum matches the underlying entries and exports correctly; the permission-less top-up attempt is 403.
- Covers: BAL-12, BAL-13, BAL-14.

**P2-E41 Rate-at-time-of-charge, audited adjustments, and survival past deletion. [API]**
- Steps: change the SMS-per-part rate; charge a 2-part SMS before and after the change; attempt an operator balance adjustment with an empty reason, then with one; delete a tenant's business data (`LIF-19`) and check its balance afterward.
- Expected: the pre-change SMS charges at the old rate with the old rate stored on its ledger entry; the post-change one charges the new rate; past entries never change; an empty-reason adjustment is rejected, a reasoned one succeeds as an audited adjustment entry; the balance is unchanged and still visible, frozen, after business-data deletion.
- Covers: BAL-16, BAL-17, BAL-18.

**P2-E42 Rate changes: immediate, never retroactive, fully audited, and visible to tenants. [API]**
- Steps: change a rate as operator; check the very next charge platform-wide and a charge already in flight; attempt a rate change with a tenant credential, and a plan-edit attempt to change one; submit a negative rate and a three-decimal rate; view the rate-change history; view the tenant-facing current-rates page.
- Expected: the next charge by any tenant uses the new rate immediately, with no notice period required; a tenant credential gets **401 (`unauthenticated`), not 403** — `OperatorRatesController` is gated by `OperatorSessionGuard` alone, which rejects a missing/non-operator session before any permission check runs, so there's no `forbidden` (403) path to reach here; a tenant credential has no operator-session cookie at all. Editing a plan can never change a rate value — the two are stored and edited entirely separately; a negative or three-decimal rate is rejected; the history lists old value, new value, effective time and operator for every change in order; the current-rates page shows the latest values and their effective-from times.
- Covers: RAT-01, RAT-02, RAT-03, RAT-04, RAT-05, RAT-06, RAT-08.

**P2-E43 The pay-as-you-go rates specifically are editable, immediate, and never retroactive. [API]**
- Steps: raise the pay-as-you-go order-fee minimum and its percentage, and the product-creation fee, each as its own platform rate; book a courier and create a product both just before and just after each change.
- Expected: each change applies only to the next qualifying action, never recomputing one already charged — this is the same `RAT-02`/`RAT-03` mechanism `P2-E42` already proves generically, checked here specifically against the three rates `P2-E10`/`P2-E11` depend on, so a regression in the generic mechanism that happens to spare these three specific keys wouldn't slip through unnoticed.
- Covers: RAT-10, RAT-11, RAT-12.

### H. Isolation sweep

**P2-I01 Every billing/balance endpoint refuses another tenant's IDs. [ISO]**
- Steps: for every new endpoint this phase adds that takes a resource ID (an invoice, a ledger entry, a scheduled plan change), call it with tenant beta's IDs using tenant alpha's session.
- Expected: every call returns `not_found`, extending Phase 1's isolation registry (`apps/server/test/isolation/registry.ts`) rather than starting a second mechanism — a route added without a registered case fails the suite the same way it would have in Phase 1.
- Covers: TEN-03, SEC-02 (carried forward from Phase 1, applied to this phase's new routes).

**P2-I02 Lists and totals are scoped. [ISO]**
- Steps: two tenants each with their own invoices and ledger entries; call the invoice list and balance statement as each.
- Expected: each tenant sees only its own rows and totals, including when both have overlapping amounts or dates.
- Covers: TEN-04.

**P2-I03 Background jobs process tenants independently. [INT]**
- Steps: run the lifecycle sweep and the pay-as-you-go inactivity scan over several tenants simultaneously, each at a different boundary (one at grace, one at the day-23 PYG warning, one at day-60 deletion, one with no boundary crossed at all); run the sweep twice in succession.
- Expected: each tenant transitions only according to its own dates; no tenant's transition affects another's; a doubled run produces one transition and one notification per tenant that actually crossed a boundary, none for the one that didn't.
- Covers: TEN-07, LIF-23 (the isolation angle specifically — the idempotency angle itself is P2-E36).

### I. Non-functional checks for this phase

**P2-N01 Monetary rounding is consistent everywhere it's specified. [API]**
- Steps: reproduce every rounding-sensitive calculation in this phase (upgrade credit, effective monthly price, discount-prefilled price) with inputs chosen to land exactly on a `.5` boundary.
- Expected: every one rounds half-up to the whole taka, matching `UPG-03`'s explicit rule, with no calculation silently using half-even or truncation instead.
- Covers: UPG-03, TRM-12.

**P2-N02 Concurrency and atomicity under load. [INT]**
- Steps: fire 50 parallel order creations for one tenant and inspect order numbers; force a failure partway through a plan purchase (after the invoice row, before the audit entry) and partway through an upgrade (after the credit calculation, before the counter reset).
- Expected: 50 distinct, gap-free, consecutive numbers even where some attempts roll back; a forced mid-sequence failure in either composite operation leaves no partial data — fully committed or fully rolled back, nothing in between.
- Covers: DAT-07, DAT-08.

**P2-N03 No secrets or internal detail in billing error paths. [API]**
- Steps: force a payment-confirmation error, an invoice-generation error, and a ledger-write error each through a test-only route; inspect every response body.
- Expected: each answers the generic error shape with no stack trace, file path, or raw database/provider error text — extending Phase 1's `P1-N03` coverage to this phase's own new error paths specifically, not assuming the existing global filter is automatically sufficient without a direct check.
- Covers: SEC-16.

**P2-N04 Daily ledger reconciliation flags, never silently corrects. [JOB]**
- Steps: let the daily reconciliation job compare the balance ledger against the (stand-in, per D2-1) payment-confirmation records; introduce a deliberate mismatch beforehand.
- Expected: the job flags the mismatch for operator review; it never silently accepts or silently "corrects" a discrepancy on its own.
- Covers: DAT-52.

---

## 4. Coverage matrix

Every `M` requirement in Phase 2 must appear in at least one scenario. `S`-priority add-on requirements (`PLN-13/14/15`) and the `S`-priority pay-as-you-go dashboard estimate/reporting items (`PYG-12`, `PYG-13`) are listed as deliberately deferred, matching `PHASE-2-PLAN.md`'s own scope.

| Requirement group | Scenarios |
|---|---|
| PLN-01 to 09 | P2-E01 |
| PLN-04, 10, 12 | P2-E02 |
| PLN-11 | P2-E04 |
| PLN-16 | P2-E07 |
| PLN-17, 18 | P2-E03 |
| TRM-01, 02, 04, 05, 07, 08, 11 | P2-E05 |
| TRM-03, 06, 09, 10 | P2-E06 |
| TRM-12 to 16 | P2-E07 |
| TRL-02, 04 | P2-E09 |
| TRL-06, 07 | P2-E08 |
| PYG-01 | P2-E08 (choosing it at trial end, or letting it convert automatically) |
| PYG-02 to 05 | P2-E10 |
| PYG-06, 07, 14, 20 | P2-E16 |
| PYG-08, 19 | P2-E12 |
| PYG-09 | P2-E14 |
| PYG-10, 11 | P2-E15 |
| PYG-16 to 18 | P2-E11 |
| PYG-21 | P2-E13 |
| BIL-01 to 03 | P2-E17 |
| BIL-04 to 06 | P2-E18 |
| BIL-07, 08 | P2-E19 |
| BIL-09 | P2-E20 |
| BIL-10, 11 | P2-E21 |
| BIL-12, 13 | P2-E22 |
| BIL-14 to 16, 18 | P2-E23 |
| UPG-01 to 05 | P2-E24 |
| TRM-10 | P2-E24 |
| UPG-06 to 08 | P2-E25 |
| UPG-09 to 12 | P2-E26 |
| UPG-13, 15 to 17 | P2-E27 |
| DWN-01 to 05 | P2-E28 |
| DWN-06 to 10 | P2-E29 |
| DWN-11 to 18 | P2-E30 |
| LIF-01, 02 | P2-E31 |
| LIF-03, 04, 15 | P2-E32 |
| LIF-05 to 09 | P2-E33 |
| LIF-10 to 14 | P2-E34 |
| LIF-16, 17 | P2-E35 |
| LIF-18 to 23 | P2-E36 |
| LIF-24 to 26 | P2-E37 |
| BAL-01 to 05 | P2-E38 |
| BAL-06 to 11 | P2-E39 |
| BAL-12 to 14 | P2-E40 |
| BAL-16 to 18 | P2-E41 |
| RAT-01, 02 to 06, 08 | P2-E42 |
| RAT-10, 11, 12 | P2-E43 |
| TEN-03, SEC-02 (this phase's new routes) | P2-I01 |
| TEN-04 | P2-I02 |
| TEN-07 | P2-I03 |
| DAT-07, 08 | P2-N02 |
| SEC-16 | P2-N03 |
| DAT-52 | P2-N04 |

**Requirements deliberately not tested in Phase 2:**
- `PLN-13/14/15` (add-ons) — `S`-priority, explicitly deferred past this phase's exit criteria (`PHASE-2-PLAN.md` D2-4). `UPG-14` ("add-ons bought earlier remain until their own end") is `S`-priority and depends on add-ons existing at all — deferred alongside them, not separately.
- `PYG-12` (dashboard cost-estimate), `PYG-13` (separate operator reporting), `PYG-15` (gateway payments on the same terms — depends on Phase 5's real gateway existing at all) — all `S`-priority or Phase-5-dependent; follow-up once the core ships.
- `BAL-15` (monthly spend caps per category) — `S`-priority.
- `BIL-17` ("renew automatically from balance") — lowest priority (`C`, "could"), explicitly an assumption in the SRS itself, off by default; not built this phase.
- `RAT-07` (cost-estimate/spend-cap displays using current rates) — `S`-priority, and depends on `BAL-15`/`PYG-12` above already being deferred; nothing to display yet.
- `RAT-09` (the rate-change notice-board prompt) — depends on the notice board (`NTC-*`), which belongs to the admin-console phase (Phase 8) and doesn't exist yet; the rate change itself is still fully tested (`P2-E42`), just not its notice-publish prompt.
- `RAT-13` (SMS billing-unit size) and `RAT-14` (per-kg delivery rate) — both real platform rates, but their only consumers (SMS billing, Phase 7; per-order delivery charges, Phase 3/4) don't exist yet. The generic rate mechanism they'd use is already proven by `P2-E42`/`P2-E43`; wiring an actual consumer to one of these two specific keys is that later phase's own work, not this one's.
- Anything depending on Phase 5's real wallet/gateway (`WAL-*`, `PAY-*`, `VER-*`) or on products/orders existing for real (Phase 3/4) — this phase's scenarios exercise the ledger/billing mechanics those will plug into, not the real integrations themselves.

---

## 5. Manual checks (before phase exit)

| Check | Procedure | Recorded result |
|---|---|---|
| Bangla visual review of every new screen (purchase, upgrade/downgrade quotes, balance statement, invoices, lifecycle banners, operator editors) | Review at 360px width | No broken glyphs; layout holds |
| Tax-line configuration (`BIL-12`'s "tax lines when configured") | Legal review of what tax fields an invoice needs, once that's decided | Recorded once legal input exists — `LEG-03`'s own open item, not new to this phase |
| Operator console UX for the new plan/term/rate editor screens (D2-9) | A real operator walks through creating a plan, a term, and changing a rate | No confusing states; every action's effect is visible without a page reload |
| The stand-in payment confirmation's handoff to Phase 5 | Once Phase 5 builds the real hosted page, confirm its "verified" trigger slots into this phase's purchase/upgrade/top-up flows with no state-machine change | Recorded when Phase 5 starts, not before — flagged here so it isn't forgotten |

---

## 6. Exit criteria for the phase

1. Every scenario tagged for the phase passes in CI.
2. The coverage matrix has no gaps for `M` requirements, except those listed as deliberately deferred.
3. The isolation suite covers every resource-ID-taking endpoint this phase adds, via the same registry Phase 1 built — not a parallel, newly-invented mechanism.
4. The manual checks in §5 are recorded, with any genuinely pending item (the Phase 5 handoff) marked pending, not skipped silently.
5. No known cross-tenant leak, secret in logs, or unhandled error path remains open — and specifically, no monetary calculation anywhere in this phase is found to round inconsistently (`P2-N01`) or allow a non-atomic balance/invoice/snapshot write (`P2-N02`).
6. The milestone named in `PHASE-2-PLAN.md` §1 — the full `BIL-11` → `UPG-09` → `LIF-02` → `LIF-19` cycle — passes end to end against the test clock, in one test, with no manual steps.
