# End-to-end test plan

Status: draft v1, 2026-10-02. Builds on `SRS-detailed.md` §26's suite skeleton (S01–S12) and traceability rules — this document is the actual scenario-level plan those suites point to. Every requirement already carries a one-line pass criteria in `SRS-detailed.md`; this document does not repeat those. Instead, each scenario below is a realistic end-to-end user journey that exercises a *cluster* of related requirements together, the way a real test actually runs, with the requirement IDs it closes listed at the end of each scenario. Per §26.4's traceability rule, every `M` (Must) requirement needs at least one passing test before release — the goal of this plan is full `M`-requirement coverage through as few, as realistic, scenarios as possible, not one test per requirement.

**Format per scenario:** ID, title, preconditions, numbered steps, expected result, requirements closed.

**Test environment**: per `SRS-detailed.md` §26.3 — test clock, stubbed SMS/courier/AI/gateway providers, the listener-phone simulator, two tenants with overlapping data for isolation checks, concurrency helpers. Not repeated per scenario below; assumed available throughout.

---

## S01 — Onboarding and access (AUTH, TEN)

**S01-01 Sign-up by phone, full trial provisioning.**
Preconditions: none (fresh phone number).
Steps: 1) Continue with a new Bangladeshi phone number. 2) Receive and enter the 6-digit OTP within 5 minutes. 3) In the create-shop step enter the shop name, owner name and address. 4) Skip the set-password offer. 5) Land on the dashboard.
Expected: the account exists after step 2 with no tenant; after step 3 the owner user, tenant in `trial` and unique subdomain exist; dashboard shows 30-day trial limits (40 orders, 20 products, 200 MB storage, 5 GB bandwidth, 8 essential SMS) and a setup checklist; the "shop ready" SMS arrives at the phone containing the shop's live URL; essential-SMS counter reads 1 of 8 (shop-ready only; the code is platform cost, AUTH-21).
Covers: `AUTH-04`, `AUTH-05`, `AUTH-10`, `AUTH-21`, `AUTH-28`, `TRL-01`, `TRL-03`, `SMS-18`, `SMS-01`.

**S01-02 Sign-up abuse limits.**
Steps: 1) Complete sign-up and let the trial run. 2) Attempt a third trial sign-up from the same verified phone, same device, and same IP (three sub-cases) within 30 days.
Expected: all three are refused with a clear message; a legitimate first or second trial from a different identity/device/IP still succeeds.
Covers: `AUTH-09`.

**S01-03 OTP brute-force and resend limits.**
Steps: 1) Start phone verification. 2) Submit 5 wrong codes. 3) Attempt a 6th, even with the correct code. 4) Separately, request a resend twice within 60 seconds, then 6 times within an hour.
Expected: 6th attempt returns `rate_limited` for 15 minutes even with the right code; second resend within 60s is `rate_limited` with `Retry-After`; the 6th hourly resend is refused.
Covers: `AUTH-05`, `AUTH-06`, `AUTH-07`.

**S01-04 Sign-in, lockout, sign-out.**
Steps: 1) Sign in by phone and code — session issued; set a password and sign in with it; sign in by code again. 2) Attempt password sign-in with an unknown phone, an account with no password and a wrong password — compare response body and timing. 3) Fail 5 times in 15 minutes on one real account from one IP, mixing wrong codes and wrong passwords; attempt a 6th, even correct. 4) Sign out; replay the old session credential.
Expected: code sign-in works before and after a password is set; the three failure responses are identical; 6th attempt is `rate_limited` even with the right password or code; a signed-out session returns `unauthenticated` on reuse.
Covers: `AUTH-12`, `AUTH-13`, `AUTH-14`, `AUTH-15`, `AUTH-16`.

**S01-05 Password recovery and forced reset.**
Steps: 1) An owner who forgot the password signs in by code and sets a new one without the current password. 2) After 10 minutes, try to change it without the current password, then with a wrong one, then with the right one. 3) The owner resets a staff member's password; the staff member signs in with it and tries any route besides change-password.
Expected: the new password is set straight after the code sign-in and the old one stops working; after 10 minutes the current password is required; every successful change ends other sessions; the staff member gets `forbidden` on every route except change-password until changed. (AUTH-18 is withdrawn: there is no forgot-password endpoint.)
Covers: `AUTH-17`, `AUTH-19`, `AUTH-20`, `STF-13`.

**S01-06 OAuth sign-up and repeat sign-in (Google/Facebook).**
Steps: 1) Sign up via Google OAuth — no password prompted. 2) Sign out, sign in again via the same Google account. 3) Separately, sign up via Facebook where Facebook reports an email already used by an existing email-verified tenant.
Expected: Google account reaches the same subscriber on repeat sign-in; the Facebook-verified tenant is created as a separate, valid tenant despite the shared email (deliberate policy, `OD-53`).
Covers: `AUTH-24`, `AUTH-08` (identity choice), `OD-53`.

**S01-07 Tenant isolation sweep.**
Preconditions: two tenants (A, B) with overlapping data — same product names, same order numbers.
Steps: for every endpoint that takes a resource ID, request tenant B's resource ID using tenant A's session/key, for GET, PUT, DELETE.
Expected: every attempt returns `not_found`, never `forbidden` (so existence isn't leaked); automated isolation suite passes across the full endpoint list.
Covers: `TEN-03`, `SEC-02`.

**S01-08 Cookie scoping and payment-callback tenant identification.**
Steps: 1) Sign in on tenant A's subdomain; inspect the cookie's scope. 2) Attempt to send that cookie to tenant B's subdomain. 3) Deliver a payment callback to a different host than the one the session started on.
Expected: cookie never transmitted to tenant B's host; the callback still credits the correct tenant via its signed session/callback identifier, not the request host.
Covers: `TEN-29`.

**S01-09 Lifecycle-gated sign-in.**
Preconditions: tenants in `active`, `grace`, `read_only`, `locked`, `archived`, `deleted` (via test clock).
Steps: attempt staff sign-in and owner sign-in in each state.
Expected: staff can sign in during `active`/`grace`/`read_only` only; only the owner can sign in during `locked`; no dashboard content in `archived`; a `deleted` tenant's subscriber can still sign in to see plan history/invoices and buy a plan.
Covers: `AUTH-22`, `AUTH-23`.

**S01-10 Sign-up field validation and identity uniqueness.**
Steps: 1) Sign up with a malformed phone, a too-short password, and a duplicate phone already in use. 2) Sign up successfully; inspect the auto-derived subdomain for collisions and reserved-word handling. 3) Attempt to register a second tenant with the same verified phone as an existing email-verified tenant (different channel).
Expected: malformed/short/duplicate inputs rejected with field-level errors; subdomain is unique and never a reserved word; a genuinely different verification channel is allowed to create a separate tenant per `OD-53`'s deliberate policy, but the same channel/identity reused is rejected.
Covers: `AUTH-01`, `AUTH-02`, `AUTH-03`, `AUTH-11`, `AUTH-26`, `AUTH-27`.

**S01-11 Essential system messages use the right channel.**
Steps: trigger a sign-in OTP, a password-reset code, and the shop-ready SMS; inspect which channel each uses and whether any is skippable by tenant setting.
Expected: each essential message goes out by its defined channel (SMS for OTP/reset/shop-ready) regardless of the tenant's own notification preferences, since these are account-security messages, not tenant-configurable notifications.
Covers: `AUTH-21`.

**S01-12 Custom domain attach, verification, and certificate.**
Preconditions: a Growth/Pro tenant (custom domains included).
Steps: 1) Attempt to add a custom domain on Starter/trial/PAYG. 2) On Growth, add a custom domain; complete DNS verification. 3) Observe certificate issuance. 4) Remove the domain.
Expected: Starter/trial/PAYG refused with `plan_feature_unavailable`; Growth succeeds, a certificate issues automatically with no warnings and renews before expiry; removal stops serving on that domain while the subdomain keeps working.
Covers: `TEN-10`, `TEN-13`, `TEN-14`.

**S01-13 Per-tenant PWA branding.**
Steps: install the dashboard PWA from two different tenants' own subdomains/custom domains.
Expected: two distinctly named, distinctly iconed home-screen apps, each reflecting its own tenant's shop name/logo at install time, both still carrying the non-removable "Powered by" mark.
Covers: `TEN-08`, `TEN-17`.

**S01-14 Hostname resolution happens before auth, and reserved-slug collisions are blocked.**
Steps: 1) Request an unknown subdomain. 2) Attempt to claim a subdomain matching a reserved word or an existing tenant's. 3) Request a known tenant's subdomain with no session at all.
Expected: unknown subdomain returns a generic not-found page before any auth logic runs; reserved/colliding slugs rejected at sign-up; a known subdomain resolves to that tenant's public storefront with no session required.
Covers: `TEN-01`, `TEN-04` to `TEN-09`, `TEN-11`, `TEN-12`.

**S01-15 Deleted-tenant subdomain reservation window.**
Steps: delete a tenant's business data (day 60); attempt to claim its old subdomain as a different subscriber within 30 days, then after.
Expected: refused within 30 days; claimable after.
Covers: `TEN-15` to `TEN-18`, `TEN-20` to `TEN-22`, `TEN-24` to `TEN-28`.

---

## S02 — Staff, roles, audit (STF, AUD)

**S02-01 Staff CRUD, seat limits, and deactivation.**
Steps: 1) On Starter (2 seats), add a second staff member — succeeds. 2) Attempt a third. 3) Deactivate a staff member; attempt their sign-in; reactivate.
Expected: 3rd staff creation refused with `plan_limit_reached`; a deactivated user's existing session is force-ended and sign-in refused; reactivation restores access.
Covers: `STF-01`, `STF-02`, `STF-03`.

**S02-02 Role CRUD and permission enforcement across endpoints.**
Steps: 1) Create a custom role with a specific permission subset; assign it. 2) Attempt an action outside that role's granted permissions, across several different endpoints (not just one). 3) Edit the role to revoke a permission the user is actively relying on. 4) Attempt to delete a role currently assigned to a staff member.
Expected: every permission-less action returns 403 regardless of which endpoint; a permission revoked mid-session takes effect on the user's *next* request, not retroactively invalidating their current one; deleting an in-use role is refused or requires reassignment first.
Covers: `STF-04`, `STF-05`, `STF-07`, `STF-09`, `STF-10`.

**S02-03 Owner-role protections and staff password reset.**
Steps: 1) Attempt to change or remove the owner's own role. 2) Owner resets a staff member's password.
Expected: the owner role is immutable/non-removable (there's always exactly one owner); the owner can force-reset any staff member's password, ending their other sessions.
Covers: `STF-11`, `STF-12`.

**S02-05 Downgrade seat-choice flow (distinct from the forced default in S02-06).**
Steps: with 4 active staff on Growth (5 seats) and a scheduled downgrade to Starter (2 seats), let the owner actively choose which 2 stay active before the effective date, rather than accepting the automatic earliest-created default.
Expected: the owner's explicit choice is honored at the effective date instead of the default rule, as long as it's made before then.
Covers: `STF-13`, `STF-14`.

**S02-06 Downgrade seat resolution (forced default).**
Preconditions: 4 active staff on Growth (5 seats), scheduled downgrade to Starter (2 seats).
Steps: let the downgrade take effect with no owner choice made; observe which staff remain active.
Expected: exactly 2 active — the owner plus the earliest-created active staff; the other 2 deactivated (not deleted), history intact; owner can still swap who's active afterward within the limit.
Covers: `DWN-08`.

**S02-07 Activity log coverage and retention.**
Steps: 1) Perform a representative action in each logged category (sign-in, order/status change, payment verification, wallet-number change, API key use, staff change, plan change). 2) Confirm no password/secret ever appears. 3) Advance the test clock past the plan's retention (Starter 30 days) and run the purge job.
Expected: every action appears exactly once; no secret in any entry; entries older than retention are purged, newer ones remain.
Covers: `AUD-01` to `AUD-06`.

---

## S03 — Plan lifecycle (PLN, TRM, TRL, PYG, BIL, UPG, DWN, LIF, BAL)

Uses the test clock throughout; follow the state table in `SRS-detailed.md` §26.2.

**S03-01 Trial-to-paid conversion.**
Steps: 1) Trial tenant buys Starter, 1-month term. 2) Confirm payment.
Expected: snapshot stored, state → `active`, period set, invoice created (gap-free number), audit entry written, owner notified, trial data and counters carry over, limits widen immediately.
Covers: `BIL-04`, `BIL-05`, `BIL-12`, `TRL-06`.

**S03-02 Trial expiry with no purchase.**
Steps: let 30 days pass on an unconverted trial.
Expected: state → `pay-as-you-go` directly (not `grace`), its own permanent free tier, all trial data intact, limits widen to PAYG's.
Covers: `TRL-07`, `PYG-01`.

**S03-03 Upgrade proration — Example A shape.**
Steps: Starter 1-month (449 TK, 30 days) tenant upgrades to Growth 1-month (699 TK) on day 11, 20 days remaining.
Expected: credit = 299 TK (449 × 20/30, half-up rounded), amount due = 400 TK, cycle restarts at confirmation, all per-period counters reset, counters not tied to a period (products, storage, seats) unchanged.
Covers: `UPG-01` to `UPG-12`.

**S03-04 Upgrade proration — Example B shape, and the credit-exceeds-price guard.**
Steps: Starter 12-month (4,741 TK, 365 days) tenant upgrades to Growth 12-month (7,381 TK) with 265 days remaining; separately, attempt to upgrade to Growth 1-month (699 TK) from the same position.
Expected: credit = 3,442 TK, amount due = 3,939 TK; the 1-month option is hidden since its price (699) is less than the credit (3,442), with a message to choose a longer term.
Covers: `UPG-03`, `UPG-04`, `UPG-05`.

**S03-05 Quote expiry and reconfirmation.**
Steps: generate an upgrade quote; wait 16 minutes; attempt to pay it; edit the plan price in between a fresh quote and payment.
Expected: stale quote refused with a message and a fresh quote; a price change between quote and payment triggers reconfirmation at the new amount.
Covers: `UPG-07`.

**S03-06 Downgrade scheduling and the 30-day grace checklist.**
Steps: 1) Schedule a downgrade from Growth to Starter while at 340 products (limit 100). 2) Preview before confirming. 3) Let it take effect. 4) Attempt to create a new product. 5) Delete products down to 99, confirm creation succeeds. 6) Let 30 days pass with items still over limit.
Expected: preview lists "products 340 of 100"; existing products stay visible/sellable; new creation blocked until under limit; after 30 days, blocks remain but nothing is deleted/hidden, final warning with export offer sent.
Covers: `DWN-01` to `DWN-14`.

**S03-07 Full lapse-to-deletion lifecycle.**
Steps: let an `active` tenant's period end unpaid; advance the clock through grace (day 3) → read-only (day 7) → locked (day 15) → archived (day 60) → deleted, checking dashboard/API/storefront behavior at each stage; pay at each stage to confirm return to `active`.
Expected: matches the full state table in §26.2 exactly — e.g. at `read_only` all functions still work with a banner; from `locked` only the owner can sign in; from `archived` the public API/storefront/payment page are fully offline; `deleted` removes business data only, subscriber/invoices/plan history remain.
Covers: `LIF-01` to `LIF-26`, `LIF-07`.

**S03-08 Pay-as-you-go specifics.**
Steps: 1) Create a product on PAYG — balance charged per-creation (10 TK), ceiling still 25 (below Starter's 100). 2) Attempt the 26th product with ample balance. 3) Fulfill an order — order fee (20 TK min or 1.5%, whichever greater) charged only at fulfillment. 4) Leave the tenant untouched for a year.
Expected: 26th product refused regardless of balance; order creation itself never charged; tenant remains fully active indefinitely with no forced state change.
Covers: `PYG-01`, `PYG-02`, `PYG-08`, `PYG-16`, `PYG-17`, `PYG-20`.

**S03-09 Balance concurrency and atomicity.**
Steps: with a 50 TK balance, fire 100 simultaneous 1-TK charge requests.
Expected: exactly 50 succeed, balance ends at 0, ledger has exactly 50 entries.
Covers: `BAL-11`, `DAT-06`.

**S03-10 Billing-term-only switch is renewal-only.**
Steps: attempt to switch an active Growth 1-month tenant to Growth 6-month mid-period.
Expected: unavailable mid-period; the renewal screen offers the term choice at the plan's then-current price with no proration.
Covers: `OD-14`.

**S03-11 No refund, ever.**
Steps: attempt a refund on a tenant's first purchase within minutes of paying, and separately on a long-standing renewal.
Expected: no refund action exists for either; only an operator adjustment with a mandatory, audited reason can move money back.
Covers: `BIL-18`, `OD-02`.

**S03-12 Minimum top-up, platform setting.**
Steps: 1) Attempt a 99 TK top-up. 2) Attempt 50,001 TK. 3) As operator, lower the minimum to 50 via platform settings. 4) Attempt a 60 TK top-up immediately after.
Expected: 99 and 50,001 rejected; after the setting change, 60 TK succeeds for a new attempt with no restart/redeploy; a top-up session already in progress keeps its original limit.
Covers: `BAL-04`, `ADM-11`.

**S03-13 Plan editor, versioning, and snapshot permanence.**
Steps: 1) Operator creates a plan with full fields. 2) A tenant purchases it — inspect the stored snapshot. 3) Operator edits the plan's limits. 4) Re-inspect the already-purchased tenant's snapshot and a freshly-purchasing tenant's snapshot.
Expected: purchase stores plan ID, version, all limits/features, price, and dates as a point-in-time snapshot; editing the live plan creates a new version and never mutates an existing snapshot; the already-active tenant is unaffected, a new purchaser gets the new version.
Covers: `PLN-01` to `PLN-07`, `PLN-09`, `PLN-11`, `PLN-12`.

**S03-14 Retiring a plan vs. deleting it, and not-for-sale/enterprise assignment.**
Steps: 1) Mark a plan not-for-sale — attempt a new purchase. 2) Operator assigns a not-for-sale plan to a specific tenant directly. 3) Leave that tenant untouched for a year.
Expected: not-for-sale plan disappears from the purchase screen but existing subscribers keep working; a directly-assigned tenant is never prompted to renew/pay and never lapses through the normal lifecycle.
Covers: `PLN-08`, `PLN-10`, `PLN-16` to `PLN-18`.

**S03-15 Billing term CRUD, pricing prefill, and period math.**
Steps: 1) Operator creates a term with 0 months, then 61 months. 2) Create a valid 4-month term with a default discount — observe price prefill on a plan. 3) Edit the prefilled price by hand. 4) Retire the term. 5) Edit the retired term's length; check an already-subscribed tenant's dates.
Expected: 0/61-month terms rejected; valid term prefills correctly but a hand-edit sticks and isn't overridden by the discount later; retiring stops new purchases/renewals on it while existing subscribers keep their original schedule unchanged, even after the term's own definition is later edited.
Covers: `TRM-01` to `TRM-05`, `TRM-07` to `TRM-13`, `TRM-15`, `TRM-16`.

**S03-16 Purchase screen, payment-method listing, and amount-mismatch review.**
Steps: 1) Load the purchase screen — observe price and savings shown per term. 2) Pay via bKash, Nagad, and balance separately. 3) Submit a payment for an amount that doesn't match the expected price.
Expected: correct price/savings shown per term; all three payment methods work; a mismatched amount routes to the manual review queue rather than silently activating or silently failing.
Covers: `BIL-01` to `BIL-03`, `BIL-06`, `BIL-07`, `BIL-08`, `BIL-10`, `BIL-11`, `BIL-13`.

**S03-17 Pay-as-you-go billing behavior beyond the ceiling.**
Steps: 1) Create an order on PAYG with zero balance — confirm order creation itself is never balance-gated. 2) Force a product-creation failure after the fee was charged; confirm reversal. 3) Soft-delete a normal product afterward; confirm no refund. 4) Switch a PAYG tenant to a subscription plan; confirm full price, no proration. 5) Let a PAYG tenant's rolling-cycle counters (bandwidth, requests) reset on their own calendar-month anniversary, not the 1st of the month.
Expected: order creation unaffected by balance; a genuinely failed creation reverses its fee; a later soft-delete does not; switching to a subscription is a fresh full-price purchase; rolling-cycle resets land on the tenant's own creation-date anniversary.
Covers: `PYG-03` to `PYG-07`, `PYG-09` to `PYG-11`, `PYG-14`, `PYG-18`, `PYG-19`.

**S03-18 Rate history, current-rates page, and derived per-use rates.**
Steps: 1) Change the SMS-per-part rate twice; view the current-rates page and the change history. 2) Check the PAYG order-fee minimum/percentage and product-creation fee as live-editable platform rates. 3) Check the SMS counting-unit size and any delivery-per-kg rate similarly.
Expected: current-rates page always shows the latest value; history shows prior values and when each changed; all derived rates are genuine platform settings, editable the same way, immediate-effect/never-retroactive.
Covers: `RAT-04` to `RAT-06`, `RAT-08` to `RAT-14`.

**S03-19 Upgrade side-effects: cancel-via-upgrade, invoice credit line, failed-payment rollback.**
Steps: 1) With a downgrade already scheduled, upgrade instead. 2) Inspect the resulting invoice. 3) Check the balance before/after an upgrade. 4) Start an upgrade payment and let it fail/time out.
Expected: the scheduled downgrade is cancelled by the upgrade; the invoice shows the credit line; the balance itself is unaffected by the upgrade transaction; a failed/unconfirmed payment leaves the tenant on the old plan with nothing changed.
Covers: `UPG-13`, `UPG-15` to `UPG-17`.

**S03-20 Downgrade's remaining details: period-limit reset, audit trail, device overage.**
Steps: 1) Let a scheduled downgrade's effective date pass — check per-period counters. 2) Review the audit log for every step (schedule, cancel, apply, each block/deactivation). 3) Downgrade a tenant with more paired listener devices than the new plan allows.
Expected: per-period limits (orders, bandwidth, requests, sessions) use the new plan's values from the effective date; every step is individually audited; excess devices keep working but new pairing is blocked and the excess appears on the 30-day checklist.
Covers: `DWN-15` to `DWN-18`.

**S03-21 Trial specifics: no payment method, no balance spend, visible countdown.**
Steps: 1) Complete sign-up and trial usage without ever being asked for a payment method. 2) Attempt a balance top-up or spend during trial. 3) View the dashboard partway through the 30 days.
Expected: no payment method requested anywhere in trial flow; top-up/spend refused with `plan_feature_unavailable`; dashboard shows an accurate days-remaining countdown and a buy-a-plan prompt.
Covers: `TRL-02`, `TRL-04`, `TRL-08`.

**S03-22 Gap-free numbering and multi-step atomicity under concurrency.**
Steps: 1) Fire 50 parallel order creations for one tenant; inspect the resulting order numbers. 2) Force a failure partway through a plan purchase (after the invoice row but before the audit entry); force one partway through an upgrade (after the credit calculation but before the counter reset).
Expected: 50 parallel creations yield 50 distinct, consecutive numbers with no gaps even where some attempts roll back; a forced mid-sequence failure in any of the three composite operations (order+stock+payment, plan-purchase+snapshot+invoice+audit, upgrade+credit+counters) leaves no partial data — all-or-nothing.
Covers: `DAT-07`, `DAT-08`.

**S03-23 Daily ledger reconciliation.**
Steps: let the daily reconciliation job run comparing the balance ledger against wallet/gateway/SMS-provider records; introduce a deliberate mismatch beforehand.
Expected: the job flags the mismatch for operator review rather than silently accepting or silently correcting it.
Covers: `DAT-52`.

**S03-24 Balance ledger core behavior.**
Steps: 1) Inspect a new subscriber's balance (0.00) and its precision. 2) Perform a top-up via the hosted page; confirm credit only after verification. 3) Replay the same transaction ID. 4) Let the tenant lapse past grace — confirm the balance freezes, shown with a "frozen" label, no spend/add/expiry/delete possible. 5) Buy a plan to reactivate; confirm no expiry dates exist. 6) Pull a statement filtered by type/date, export CSV; attempt top-up without `balance:manage`.
Expected: precise 0.01 TK balance; credit only post-verification; replayed transaction ID credits nothing (`conflict`); frozen balance behaves exactly as specified and is clearly labeled; reactivation restores normal spend with no expiry; statement/export match ledger entries; permission-less top-up attempt is 403.
Covers: `BAL-01`, `BAL-02`, `BAL-03`, `BAL-05` to `BAL-10`, `BAL-12`, `BAL-14`, `BAL-16` to `BAL-18`.

---

## S04 — Limits and metering (STO, BND, RTE, QTA, LIM)

**S04-01 Storage limit enforcement and recovery.**
Steps: upload to 1.99 GB of a 2 GB (Starter) limit, then attempt a 20 MB upload; delete a file; retry.
Expected: refused at the boundary; existing files stay live; succeeds after freeing space.
Covers: `STO-03`.

**S04-02 Upload content validation.**
Steps: upload a valid 4 MB JPEG; a 6 MB JPEG; a `.exe` renamed `.jpg`; a valid 100 MB video; a 101 MB video; a non-video file named `.mp4`; an HTML file; a scripted SVG.
Expected: valid image resized/converted to WebP with thumbnail; oversized image and disguised executable rejected; oversized video and disguised non-video rejected; HTML and scripted SVG rejected outright.
Covers: `STO-04`, `STO-05`, `STO-06`, `SEC-06`.

**S04-03 Rate limits, headers, and the public-key-IP overlap.**
Steps: 1) Send 61 requests/minute on a Starter public key. 2) Inspect `X-RateLimit-*` headers on every response. 3) From one IP, send 11 order creations in a minute using a key still under its own limit; 6 OTP requests; 121 total requests.
Expected: 61st key request is 429; headers present and consistent; 11th IP-level order creation, 6th OTP, 121st total request are each 429 independently of the key's own remaining quota.
Covers: `RTE-01`, `RTE-02`, `RTE-06`.

**S04-04 Monthly quota and warnings.**
Steps: drive a Starter key to 50%, 80%, 95%, then 100% (200,001st request) of its monthly quota.
Expected: three warnings sent at the thresholds; the 200,001st request returns 429 `quota_exceeded`.
Covers: `RTE-03`.

**S04-05 Order handling limit vs. unlimited creation.**
Steps: on a trial tenant, create 50 orders, then attempt to book/mark-shipped the 41st handled order.
Expected: all 50 orders create successfully; the 41st handling action (booking or marking shipped) is refused with `plan_limit_reached`; order creation itself is never blocked by this cap.
Covers: `QTA-01`, `QTA-04`, `QTA-07`.

**S04-06 Daily handling limit independent of per-period.**
Steps: on Starter (60/day), reach the daily cap with the monthly cap not yet reached; attempt one more; wait for local midnight; retry.
Expected: refused at the daily boundary regardless of `order_limit_mode`; succeeds again after midnight; creating new orders is unaffected throughout.
Covers: `QTA-05`, `QTA-06`.

**S04-07 Warning thresholds and behavior-above-limit setting.**
Steps: 1) Drive the per-period handling count to 80%. 2) Toggle `order_limit_mode` between `block` and `allow_with_prompt` and cross the limit in each mode.
Expected: one warning sent at 80%, once per period; `block` refuses the handling action outright past the limit; `allow_with_prompt` lets it through with an upgrade/pack prompt.
Covers: `QTA-02`, `QTA-03`.

**S04-08 Metered-limit warning cadence, generically.**
Steps: drive storage, bandwidth, and monthly requests each to 50%, 80%, 95%, then 100%.
Expected: warnings fire at each threshold exactly once; 100% refuses the relevant action (`429` for API/media) without taking the shop down entirely; a tenant may opt into an overage pack from balance, otherwise it's a hard stop.
Covers: `LIM-01`, `LIM-02`, `LIM-03`.

**S04-09 Upload compression and per-file limits.**
Steps: upload an oversized image/video within the per-file limit (5 MB image / 100 MB video, editable); confirm compression/resize on upload.
Expected: files within the editable per-file limit are accepted and compressed/resized; the per-file limits are confirmed editable platform settings.
Covers: `STO-01`, `STO-02`, `STO-07`.

**S04-10 Rate-limit ordering, bucket separation, origin allow-list, and live snapshot values.**
Steps: 1) Confirm the rate-limit check runs *before* a cache hit is served (a cached response still decrements the remaining count — this is the dedicated test for that ordering, not just an incidental observation elsewhere). 2) Exhaust an API key's limit; confirm dashboard session actions for the same tenant are unaffected (separate bucket). 3) Call a public key from an origin not on the tenant's registered list. 4) Change a tenant's limit override as operator; confirm the new value applies to the very next request with no deploy.
Expected: rate check precedes cache lookup every time; dashboard and API-key buckets are fully independent; an unregistered origin is refused (403); overrides take effect immediately, proving limits are read live from the snapshot, never hard-coded.
Covers: `RTE-04`, `RTE-05`, `RTE-07`, `RTE-10`.

**S04-11 Order-creation and payment-session per-minute caps.**
Steps: on Starter, fire 11 order creations in one minute, and separately 601 payment sessions in one billing period.
Expected: the 11th order creation in that minute returns 429; the 601st session in the period returns `quota_exceeded`, independent of the order-handling limit since sessions are created near order creation (unlimited), not near handling.
Covers: `RTE-08`, `RTE-09`.

**S04-12 Media bandwidth metering and reset.**
Steps: 1) Serve media through the Worker path, including a partial (range) request. 2) Drive a tenant's monthly bandwidth to 100%. 3) Let the billing period roll over.
Expected: the Worker counts every request and the actual bytes sent (partial requests counted by bytes actually sent, not the full file); at 100% further media requests are refused; the counter resets at the new period.
Covers: `BND-01` to `BND-03`, `BND-05` to `BND-07`, `BND-09`.

---

## S05 — Catalogue, storefront, orders, customers (PRD, ATR, SFT, CCH, ORD, CUS, I18N)

**S05-01 Product and variant creation at the limit.**
Steps: on Starter (100 products), create the 100th, then attempt the 101st; soft-delete one; retry.
Expected: 101st refused; succeeds after the soft-delete frees a slot (soft-deleted products don't count).
Covers: `PRD-04`.

**S05-02 Variant picker and stock-aware storefront.**
Steps: view a product with Size/Color variants; select an out-of-stock combination; select an in-stock one.
Expected: out-of-stock combination can't be added to cart; in-stock shows its own price/stock/image.
Covers: `ATR-04`, `SFT-04`.

**S05-03 Public catalogue requires a public key, always.**
Steps: call the catalogue endpoint with no key at all; with a public key; with a secret key.
Expected: no-key request refused (no anonymous path exists); public key succeeds and is edge-cacheable; a request carrying any session/cookie/authorization header bypasses the shared cache.
Covers: `PRD-09`, `SFT-11`, `CCH-01`.

**S05-04 Checkout double-submit protection.**
Steps: 1) Render the checkout form, capturing its generated `Idempotency-Key`. 2) Submit the order twice in quick succession with the same key. 3) Reload the page (new key) and submit again.
Expected: exactly one order from the double-submit; a genuinely new order from the reloaded page; a request to `ORD-02`/`PAY-01` missing the header entirely is refused with 400.
Covers: `API-11`, `ORD-02`, `SFT-06`.

**S05-05 Stale-cache-never-charges-wrong-price.**
Steps: cache a stale price for a product at every layer; create an order for it.
Expected: order is created at the current database price, read fresh at order time, never from any cache.
Covers: `CCH-07`.

**S05-06 Two-axis order status computation.**
Steps: create a 3-line order; verify an advance payment; have a courier report 1 of 3 lines delivered; then all 3.
Expected: `payment_status` → `paid` once the advance is met even with COD remaining; `fulfillment_status` → `partially_delivered` with 1/3, `delivered` with 3/3; computed visible `status` matches the fixed lookup.
Covers: `ORD-40` to `ORD-43`.

**S05-07 Manual status overrides suspend computation.**
Steps: set an order to `hold` regardless of its computed axes; clear it.
Expected: shows `hold` while set, regardless of payment/fulfillment state; clearing restores the computed value.
Covers: `ORD-41`.

**S05-08 Refund axis.**
Steps: on an order with two payments, refund one.
Expected: shows `partially_paid`, not `refunded`, until both are refunded.
Covers: `ORD-44`.

**S05-09 Customer record aggregation and privacy deletion.**
Steps: place two orders from the same phone; request deletion of that customer record.
Expected: one customer record, order count 2; after deletion, past orders keep totals but show "Deleted customer" with no personal data.
Covers: `CUS-01`, `CUS-09`.

**S05-10 Storefront language toggle, both directions.**
Steps: 1) Load the storefront fresh — observe default. 2) Toggle to English. 3) Reload — persisted? 4) Open on a different device/clear browser data.
Expected: Bangla by default; toggle changes every visible label, not a partial translation; choice persists on reload via device storage; a different/cleared device starts back in Bangla.
Covers: `I18N-01`, `I18N-02`.

**S05-11 Product CRUD, categories, and active/inactive visibility.**
Steps: 1) Create a product with name, price, stock, images, category, delivery charge. 2) Edit it. 3) Mark it inactive. 4) View category navigation with mixed active/inactive products. 5) Hard- and soft-delete separately.
Expected: full create/edit works and validates required fields; inactive products never appear on the storefront or public catalogue while still visible/editable in the dashboard; category tree reflects only active products to shoppers; soft-delete keeps the row (doesn't count toward limits, per `PRD-04`) while hard-delete removes it entirely.
Covers: `PRD-01`, `PRD-02`, `PRD-03`, `PRD-05`, `PRD-06`, `PRD-10`, `PRD-11`, `PRD-12`, `PRD-13`, `PRD-14`, `PRD-16`.

**S05-12 Stock reservation and advance-payment policy.**
Steps: 1) With stock 1, fire two simultaneous orders for 1 unit. 2) Set a product to require an advance; create an order for it.
Expected: one order succeeds, one gets `conflict`, stock ends at 0 (same atomicity guarantee as `PRD-07`); the advance-required order needs the configured advance paid before `payment_status` can reach `paid`, independent of COD remainder.
Covers: `PRD-07`, `PRD-08`.

**S05-13 Attribute library and variant combinations.**
Steps: 1) Define a reusable attribute (e.g. Size) in the attribute library. 2) Mark it variant-defining on one product, order-time-captured on another. 3) Add every Size×Color combination for a product with both marked variant-defining. 4) Check a product with zero variant-defining attributes. 5) Place an order capturing an order-time attribute value; later edit the product's attribute definition.
Expected: the library attribute is reusable across products; variant-defining attributes generate one variant per combination; order-time attributes are captured per order line without creating variants; a product with none gets exactly one default variant automatically; an existing order's captured value is a permanent snapshot, unaffected by a later attribute-definition edit.
Covers: `ATR-01`, `ATR-02`, `ATR-03`, `ATR-05` to `ATR-07`, `ATR-09` to `ATR-14`.

**S05-14 The storefront itself: load, cart, checkout redirect, tracking, shopper account.**
Steps: 1) Load a tenant's storefront root — browse categories, search, paginate. 2) Add items to a cart; confirm no stock is reserved yet. 3) Check out with an online payment method — confirm redirect to the hosted page with no payment UI built into the storefront itself. 4) Open the tracking page by tracking ID, and separately by phone for a signed-in shopper. 5) Install the storefront's own PWA. 6) Disable the shared storefront for a tenant that has its own external website.
Expected: catalogue browses/searches/paginates correctly; cart never touches stock until checkout submits; checkout creates a payment session and redirects, with zero payment-collection UI in the storefront's own code; tracking works both ways; PWA installs with tenant branding; a tenant that opts out still has API + hosted payment page working.
Covers: `SFT-01`, `SFT-02`, `SFT-03`, `SFT-05`, `SFT-07`, `SFT-08`, `SFT-09`, `SFT-10`, `SFT-12` to `SFT-19`.

**S05-15 Order CRUD, cancellation stock restore, and line-snapshot permanence.**
Steps: 1) Staff create an order directly from the dashboard with all required fields. 2) Edit it; list/filter/paginate orders. 3) Cancel/reject/return an order — check stock. 4) Delete a product that has past order lines referencing it.
Expected: dashboard order creation validates the same fields as the public endpoint; listing/filtering work; cancelled/rejected/returned orders restore their reserved stock exactly once; a deleted product's past order lines keep their price/name/image snapshot (or a graceful placeholder for the image) rather than breaking.
Covers: `ORD-01`, `ORD-03` to `ORD-22`, `ORD-46`, `ORD-47`.

**S05-16 Order extraction from pasted text (AI-assisted draft).**
Steps: paste a free-text message resembling a Facebook/WhatsApp order into the extraction tool; review and confirm the draft; try an ambiguous or incomplete message.
Expected: a structured draft order is produced for review, never auto-submitted without staff confirmation; an ambiguous message is flagged for manual completion rather than guessed.
Covers: `ORD-30` to `ORD-34`, `AI` (extraction-specific rows).

**S05-17 Snapshot-vs-live-data permanence beyond products.**
Steps: change a customer's name/address after an order referencing the old values exists; change a courier's delivery-charge rate after an order was priced under the old rate.
Expected: the historical order keeps the values as they were at order time in both cases — reports and the order detail never silently reflect a later edit.
Covers: `ORD-48`, `ORD-49`, `ORD-50`.

**S05-18 Shopper OTP sign-in and canonical location mapping.**
Steps: 1) A returning shopper signs in by phone OTP on the storefront. 2) View the canonical zilla/thana list — confirm it's identical across tenants. 3) Connect two different couriers and compare their own zone lists against the canonical one.
Expected: shopper OTP sign-in works the same way as staff OTP, scoped to that tenant only; the canonical list never varies by tenant; each courier's zone mapping is its own table layered on top of the canonical list, never modifying it.
Covers: `CUS-02` to `CUS-05`, `CUS-08`, `CUS-10`, `CUS-11`.

**S05-19 Cache invalidation and versioning mechanics.**
Steps: 1) Change a product's price/stock; measure how quickly the edge cache reflects it via the version primitive, not a purge. 2) Hit the catalogue version endpoint repeatedly within its 5-second cache window. 3) Force a cache-miss storm (200 simultaneous requests for one uncached list).
Expected: the catalogue version bumps on the change and is what invalidates client/edge caches, never an explicit purge call; the version endpoint itself is cheaply cacheable; the miss storm produces exactly one database query, others wait on it.
Covers: `CCH-02` to `CCH-06`, `CCH-09`, `CCH-11`, `CCH-12`.

**S05-20 Media pipeline: tenant-prefix isolation, signed uploads, usage reconciliation.**
Steps: 1) Attempt to request another tenant's media prefix directly. 2) Upload via a presigned URL to the temporary area; let the processing job validate/resize/move it. 3) Upload a file that fails validation. 4) Delete an object directly in R2, bypassing the app; run the daily reconciliation. 5) Attempt an R2 write using the public-serving Worker's own read-only key.
Expected: cross-tenant prefix request returns 404; a valid upload lands under the tenant's real prefix within 30 seconds; a failed-validation file is deleted from the temporary area and never counts toward storage; the daily reconciliation catches the out-of-band R2 deletion and alerts above a 0.5% mismatch; the read-only Worker key cannot write.
Covers: `MED-01` to `MED-04`, `MED-06` to `MED-11`.

---

## S06 — Couriers and fraud (CRR, FRD)

**S06-01 Connect a courier, credential validation, and the webhook handshake.**
Steps: 1) Connect Steadfast with wrong credentials. 2) Connect with correct credentials. 3) Separately, connect Pathao and observe the registration handshake complete automatically.
Expected: wrong credentials show the courier's own error, not saved; correct credentials save and the webhook is already verified with no manual step for either courier.
Covers: `CRR-02`, `CRR-27`.

**S06-02 Booking, idempotency, and failure handling.**
Steps: 1) Book a parcel — order moves `pending` → `processing`, consignment/tracking/charge stored. 2) Fire two simultaneous booking requests for the same order. 3) Force a booking failure.
Expected: one consignment from the double request; a failed booking leaves the order unchanged and shows the courier's message; no balance charge for the booking itself.
Covers: `CRR-06` to `CRR-09`, `CRR-22`.

**S06-03 Webhook authenticity — three real schemes.**
Steps: 1) Send a Steadfast-style webhook with a correct HMAC-SHA256 `X-Signature`; then with a forged one. 2) Send a Pathao-style webhook with the correct shared-secret header; then an incorrect one. 3) Send a RedX-style webhook with the correct URL query token; then a wrong one. 4) For each, also hit an unregistered/revoked webhook path.
Expected: correct signature/secret/token updates only the matching tenant's order; forged/incorrect ones are refused and logged; unregistered/revoked paths are refused before any adapter logic runs.
Covers: `CRR-11`, `CRR-12`.

**S06-04 Webhook idempotency, native and computed.**
Steps: 1) Resend an identical Steadfast payload with the same `Idempotency-Key`. 2) Resend an identical Pathao/RedX payload with no native key, same consignment ID/event/timestamp.
Expected: one timeline event added either way, not two.
Covers: `CRR-13`.

**S06-05 Bilingual message storage and payout-event routing.**
Steps: 1) Send a RedX-style delivery event carrying both `message_en` and `message_bn`. 2) View the order timeline as a Bangla-set viewer, then an English-set one. 3) Send a RedX-style `status: "paid"` event.
Expected: both messages stored; each viewer sees the matching language; the "paid" event updates payout records, not the order's delivery status or timeline.
Covers: `CRR-12`, `CRR-17`.

**S06-06 Response-code/timing conventions per adapter.**
Steps: handle a Pathao-style event within and beyond 10 seconds; handle a Steadfast-style event with any 2xx.
Expected: Pathao path returns 202 within the window; Steadfast path accepts any 2xx; a slow/failed Pathao response triggers whatever retry Pathao's own docs specify.
Covers: `CRR-27`.

**S06-07 Circuit breaker isolation.**
Steps: force 5 consecutive failures on tenant A's Steadfast connection; immediately attempt a 6th; attempt tenant B's Steadfast booking and tenant A's Pathao booking in the same window; wait 60 seconds and retry tenant A's Steadfast.
Expected: tenant A's Steadfast circuit opens, 6th call fails fast with no outbound attempt; tenant B's Steadfast and tenant A's Pathao both work normally; after 60s, one trial call on tenant A's Steadfast decides whether to close it.
Covers: `PRF-05`, `CRR-26`.

**S06-08 Retiring a courier adapter.**
Steps: 1) Mark an adapter `retiring`. 2) Attempt to connect it as a new tenant. 3) Book/track/webhook on an existing connection. 4) Attempt full removal while one order is still `shipped` on it. 5) Resolve that order, retry removal.
Expected: disappears from "connect new"; existing connections keep working unchanged; removal blocked and names the blocking order; succeeds once resolved; affected tenants notified with an alternative suggested.
Covers: `CRR-23`, `CRR-24`, `CRR-25`.

**S06-09 Fraud check charging and caching.**
Steps: run a paid fraud check on a phone number; run it again within the cache window; force a provider failure.
Expected: first check charges the configured rate; cached repeat still charges (per `OD-22`); a failed-to-return check is not charged.
Covers: `FRD-03`, `OD-22`.

**S06-10 Courier adapter listing, credential masking, and default choice.**
Steps: 1) List available courier adapters and their required credential fields; confirm Steadfast is present at launch. 2) Save credentials, then fetch the connection — confirm only a `hasCredentials` flag returns, never the value. 3) Owner sets a default courier; staff override it per booking.
Expected: adapter list shows required fields accurately; no API response or log ever contains a credential value; booking dialog defaults to the owner's choice but lets staff pick another.
Covers: `CRR-01`, `CRR-03`, `CRR-05`.

**S06-11 Unlimited couriers, manual sync, and the no-API tracking-link courier.**
Steps: 1) Connect 3+ couriers on a Starter tenant. 2) Use "Sync status" to pull current status on demand. 3) Add a courier with no API at all, using only a tracking-link field.
Expected: no plan limits connected-courier count; manual sync updates the order from the courier's current state; the tracking-link-only courier satisfies the `shipped` status requirement with just a link, no API integration.
Covers: `CRR-04`, `CRR-10`, `CRR-14`, `CRR-16`, `CRR-18`.

**S06-12 Adapter contract test and disconnect-revocation.**
Steps: 1) Run the shared contract suite (book, track, webhook parse, status map, location map) against a new adapter before enabling it for any tenant. 2) Disconnect a courier from a tenant; replay its old webhook token.
Expected: the suite must pass before the adapter reaches a real tenant; a disconnected courier's old webhook token returns 401 afterward, while that tenant's already-shipped orders keep their tracking history intact.
Covers: `CRR-20`, `CRR-21`.

**S06-13 Unmapped courier zone at booking time.**
Steps: book a courier for a customer address whose zilla/thana has no mapping yet in that specific courier's zone table.
Expected: staff is flagged to choose/confirm the zone by hand (ties to `CRR-10`); the order is never silently blocked from booking just because one courier's zone table is incomplete for that address.
Covers: `CUS-12`.

**S06-14 Fraud-check feature itself: running a check, signal-only behavior, shared hashing.**
Steps: 1) Run a check above the tenant's configured COD threshold — observe it's advisory, never auto-blocking an order on its own. 2) Contribute delivered/cancelled/returned outcomes from several tenants on the same customer phone; check the shared signal appears only once at least 5 tenants have contributed. 3) Exceed the check rate limit.
Expected: the result informs staff, never silently rejects the order by itself; the cross-tenant signal stays hidden below the 5-contributor floor (protects a single tenant's data from being individually identifiable); rate-limit exceeded is refused cleanly.
Covers: `FRD-01`, `FRD-02`, `FRD-06` to `FRD-09`, `FRD-11` to `FRD-14`.

---

## S07 — Payments (WAL, PAY, VER, LSN, TVR)

**S07-01 Wallet account management, one-active rule.**
Steps: save two bKash accounts, flag both active in one request; switch bKash off entirely.
Expected: exactly one ends up active (first wins); with it off, shoppers see no bKash option and manual bKash orders are refused.
Covers: `WAL-01` to `WAL-05`.

**S07-02 Hosted payment session lifecycle and tamper resistance.**
Steps: 1) Create a session for a known order — amount fixed server-side; attempt to tamper the amount client-side. 2) Let a session sit unverified past 30 minutes; reopen it. 3) Reopen an already-verified session.
Expected: tampered amount ignored; expired session shows "expired," no payment accepted; verified session shows "already paid."
Covers: `PAY-01` to `PAY-03`.

**S07-03 Level 1 — manual verification (and the only path for bank transfer).**
Steps: submit a bank-transfer payment; staff approve it in the dashboard.
Expected: session waits in `checking`; `payments:verify` staff notified; approval verifies; bank transfer always follows this level, never listener or gateway.
Covers: `VER-01`, `WAL-16`.

**S07-04 Level 2 — listener matching, including edge cases.**
Steps: 1) Forward a matching receipt SMS from the paired device. 2) Forward the identical SMS from a second paired device. 3) Forward an SMS before its payment record exists, then create the payment. 4) Forward a receipt with the right ID/amount but a different sender number than the shopper entered. 5) Forward from an unregistered/unrecognized sender.
Expected: 1 verifies; 2 produces one verification and a `duplicate`; 3 verifies automatically once the payment exists; 4 goes to `needs_review`; 5 is `ignored` with no text stored.
Covers: `VER-02` to `VER-06`.

**S07-05 Listener offline fallback.**
Steps: stop the paired device for 30+ minutes while a session is open; leave it unresolved 5 more minutes.
Expected: page shows "pending manual verification" instead of a countdown; staff notified after 5 minutes unresolved.
Covers: `VER-07`.

**S07-06 Level 3 — gateway verification, forged callback resistance.**
Steps: 1) Complete a real gateway payment. 2) Send a forged "success" callback for a payment that was never actually paid. 3) Send the same successful callback twice.
Expected: real payment verifies via a server-to-gateway query, never trusting return parameters alone; forged callback leaves the payment unverified; duplicate callback produces one ledger entry.
Covers: `VER-08`, `VER-09`.

**S07-07 Transaction-ID permanent uniqueness, even after deletion.**
Steps: 1) Use transaction ID X to verify a payment for tenant A. 2) Attempt to reuse X for a different payment, same or different tenant. 3) Hard-delete tenant A (day 60). 4) Attempt to reuse X again.
Expected: reuse refused at step 2; still refused at step 4, after tenant A no longer exists — `control.used_transaction_ids` persists independent of tenant deletion.
Covers: `DAT-09`, `DAT-15`, `PAY-16`.

**S07-08 SMS listener pairing and abuse controls.**
Steps: 1) Owner generates a pairing QR, expires after 10 minutes unused. 2) Pair within the window. 3) Use a device token from a second installation. 4) Repeat the mismatch twice more. 5) Attempt to pair a 2nd device on Starter (limit 1).
Expected: expired code refused; valid pairing registers the device; copied-token use is refused and flags the device; 3rd flag auto-revokes it with owner+operator notice; 2nd pairing on Starter refused with `plan_limit_reached`.
Covers: `LSN-01`, `LSN-08`, `LSN-09`, `LSN-12`.

**S07-09 Tenant verification before the hosted page goes live.**
Steps: attempt to create a payment session for a tenant whose owner phone isn't verified; verify it; retry.
Expected: refused until verified, then succeeds.
Covers: `TVR-01`.

**S07-10 Plan purchase payment is a required, auditable confirmation.**
Steps: attempt a plan purchase/renewal without an explicit confirm action.
Expected: no charge occurs without it; every confirmed purchase produces an invoice and an audit entry.
Covers: `BIL-16`, `BIL-05`.

**S07-11 Gateway credential storage and masking — priority, zero prior coverage.**
Preconditions: a wallet account with gateway credentials (e.g. bKash app key/secret, username/password).
Steps: 1) Save gateway credentials via the dashboard. 2) Fetch the wallet account via API and via the dashboard UI. 3) Inspect server logs and edge/proxy logs for the request that submitted them. 4) Force an outbound call to the gateway and inspect the debug/error log it produces. 5) Rotate the decryption key and attempt to decrypt an existing stored credential.
Expected: the saved credential is never returned by any API response, only a `hasCredentials` boolean and whether sandbox mode is set; the dashboard input renders masked (`type="password"`); no edge/proxy log line contains the raw value; the outbound-call log shows the credential masked even on a forced failure; a key rotation without re-entering credentials surfaces as "re-enter credentials" rather than a silent decrypt failure or a crash.
Covers: `WAL-09`.

**S07-12 Gateway account selection, test connection, and payment continuity.**
Steps: 1) Select an account without stored credentials to receive automated payments. 2) Select a valid one; use "test connection." 3) Start a payment on account A, switch the selected account to B mid-session, then complete it.
Expected: selecting an uncredentialed account is refused; test connection checks credentials without creating a real payment; the in-flight payment completes using account A's credentials regardless of the later switch.
Covers: `WAL-10`, `WAL-11`, `WAL-13`.

**S07-13 Bank-transfer account fields and the no-payment-method conflict.**
Steps: 1) Save a bank account missing the bank name or account number. 2) Save a valid one; switch it off; disable every other payment method too; attempt to create a payment session.
Expected: incomplete bank fields rejected with field errors; a valid bank account follows the same one-active-account rule as wallets; with nothing enabled at all, session creation returns `conflict` (`no_payment_method`).
Covers: `WAL-06`, `WAL-07`, `WAL-08`, `WAL-14`, `WAL-15`, `WAL-17`, `WAL-18`, `WAL-19`.

**S07-14 Hosted page content, allow-listed return, and transaction-ID format.**
Steps: 1) Open the hosted page — confirm it shows tenant name/logo, amount, order reference, each enabled method's active account, note, and a countdown, nothing from another tenant. 2) Submit a return address not on the tenant's allow-list. 3) Submit a transaction ID that's too short, and one already used platform-wide. 4) Let a session reach a final result and observe the redirect.
Expected: page content matches exactly what's specified, no cross-tenant leakage; an unlisted return address is rejected before session creation; malformed/duplicate transaction IDs are rejected with a clear message; the final redirect carries session ID and status, retry allowed after `failed` within the session window.
Covers: `PAY-04` to `PAY-08`, `PAY-17`, `PAY-19`.

**S07-15 Gateway button visibility and operator-level session exemption.**
Steps: 1) Check the pay-with-gateway button's visibility with and without a selected, credentialed gateway account. 2) Create a plan-purchase/top-up session while the tenant is already at its own session-limit for shopper payments.
Expected: the button appears only when a real gateway account is both selected and enabled; the platform's own plan/top-up sessions use a separate engine and never count against a tenant's own session limit.
Covers: `PAY-09` (webhook retry — covered in S06's webhook scenarios too, cross-reference), `PAY-10` (if distinct), `PAY-21`.

**S07-16 Gateway error handling and sandbox-payment exclusion from revenue.**
Steps: 1) Force a gateway credential/token error mid-session. 2) Complete a payment in a gateway's sandbox/test mode; check whether it appears in revenue reports.
Expected: a credential error fails the session with a clear message and notifies the tenant the gateway needs attention; a sandbox-mode payment never counts toward real revenue, balance, or the fraud-signal aggregation.
Covers: `VER-10`, `VER-11`, `VER-12`.

**S07-17 Hosted-page abuse controls: report link and operator suspension.**
Steps: 1) Submit the "Report this page" action 6 times from one IP within an hour. 2) As operator, suspend a specific tenant's payment page immediately.
Expected: the 6th report in an hour is rate-limited; suspension takes effect within 1 minute — new sessions refused, any already-open page shows "unavailable" — and is audited.
Covers: `TVR-02`, `TVR-03`.

**S07-19 Return-isn't-proof, secret-key session control, and session rate limits.**
Steps: 1) Forge a client-side "success" redirect for a session that was never actually paid, without any gateway/listener confirmation. 2) As a secret key, read a session's status; attempt to cancel a session that's already `verified`. 3) Exceed the per-tenant payment-session creation rate.
Expected: the forged redirect alone changes nothing — the session's real status comes only from the server-side verification path; a secret key can read any session's status; cancelling an already-verified session is refused; excessive session creation is rate-limited per plan.
Covers: `PAY-11`, `PAY-12`.

**S07-20 Session-limit-per-period and amount/sender mismatch review.**
Steps: 1) Exceed a plan's payment-sessions-per-period limit. 2) Submit a listener-matched receipt where the amount is off by more than 0.01 TK, or the sender's last-11-digits don't match what the shopper entered.
Expected: session creation refused with `quota_exceeded` past the limit; a mismatched amount/sender routes to `needs_review`, never auto-verifies and never silently fails.
Covers: `PAY-13`, `PAY-14`.

**S07-21 Verified payment mirrors correctly into the ledger.**
Steps: complete a real verification (any of the three levels); inspect the resulting ledger/payment record.
Expected: the payment record's amount, method, and verification level match exactly what was verified, with no field left stale from the session's original request.
Covers: `PAY-15`.

**S07-22 Listener calls are gated by live tenant state.**
Steps: attempt a pairing request and an upload from an already-paired device while the tenant is in `locked` and in `archived`.
Expected: both calls refused with 403 `tenant_offline` in either lapsed state; only `trial`, `active`, and `grace` allow listener calls at all.
Covers: `LSN-07`.

**S07-18 Listener device management, rate limits, and lifecycle cleanup.**
Steps: 1) List paired devices (name, model, app version, last seen, uploads today); rename and revoke one. 2) Let a device go 30+ minutes without contact — check online/offline status. 3) Exceed the per-device and per-tenant upload rate limits, and the per-batch/size/message-length caps. 4) Use an app version below the enforced minimum. 5) Operator blocks a device/installation platform-wide. 6) Let a tenant reach day 60 of deletion.
Expected: device list/rename/revoke work as shown; status flips to offline past 30 minutes with no contact; each limit (30/min/device, 120/min/tenant, 50/batch, 64KB/request, 1,000 chars/message, 4 heartbeats/hour) returns 429/413 appropriately; an outdated app version gets `app_update_required` and can't upload; a platform-blocked device/install gets 403 immediately; at day 60 every device/token for that tenant is removed.
Covers: `LSN-02`, `LSN-03`, `LSN-10`, `LSN-11`, `LSN-13`, `LSN-15`, `LSN-16`, `LSN-18` to `LSN-23`.

---

## S08 — SMS and notifications (SMS, NTF, NTC, I18N)

**S08-01 Event defaults and essential lock.**
Steps: inspect a new tenant's SMS settings; attempt to toggle an essential event off.
Expected: order placed/verified/shipped/cancelled default on, delivered/new-order-alert/payment-needs-verification default off; essential toggles are disabled, not togglable.
Covers: `SMS-01` to `SMS-03`.

**S08-02 Essential allowance, overage charging, and the trial figure.**
Steps: 1) On Starter (10/month), send the 11th essential SMS. 2) On trial (8 total), send the 9th. 3) Force a provider-reported failure.
Expected: 11th Starter SMS charges the ledger at rate; 9th trial SMS refused, nothing charged; a failed-delivery SMS is neither charged nor counted against the allowance.
Covers: `SMS-04`, `SMS-05`, `SMS-08`, `TRL-05`.

**S08-03 Platform-notice SMS never touches the balance or the essential allowance.**
Preconditions: a tenant with its essential-SMS counter at a known value (e.g. 3 of 10 used).
Steps: 1) Advance the tenant into `locked`; have the owner sign in, triggering a sign-in-code SMS (`LIF-10`). 2) Separately, advance a tenant to day 45 and day 57 of its lapse countdown, triggering both deletion-warning SMS (`LIF-18`). 3) After each, re-check the balance and the essential-SMS counter.
Expected: the sign-in-code SMS and both deletion warnings are sent successfully; the balance is unchanged after every one; the essential-SMS counter reads exactly what it did before each SMS (3 of 10 throughout) — none of these three SMS decrement it, since they're the platform notifying the tenant about their own account, not usage the tenant generated (`SMS-04`'s general rule).
Covers: `LIF-10`, `LIF-18`, `SMS-04`.

**S08-04 Balance exhaustion behavior, essential vs. optional.**
Steps: drain balance to the overdraft floor (−50 TK) with essential SMS flowing; attempt one more.
Expected: optional SMS already stopped before the floor; the essential SMS past the floor is refused with `quota_exceeded` and the tenant warned.
Covers: `SMS-06`.

**S08-05 Tenant-editable SMS templates, Bangla default.**
Steps: 1) Inspect a new tenant's templates — confirm Bangla. 2) Edit the "order placed" template into English, observing live character/cost count. 3) Save. 4) Trigger that event. 5) Reset to default.
Expected: default is Bangla; live count updates while typing; only the edited event sends in English afterward, others stay Bangla; reset restores original wording; shop name is prepended automatically and isn't part of the editable body.
Covers: `SMS-19`, `SMS-16`, `I18N-03`.

**S08-06 Notifications are fixed copy, not tenant-editable.**
Steps: attempt to find any template-editing control for a push/in-app notification event.
Expected: none exists; the notification renders in the viewing user's own chosen language, with variables filled, but the wording itself can't be changed per tenant.
Covers: `NTF-03`, `I18N-03`.

**S08-07 Renewal/balance/limit warnings never cost SMS.**
Steps: trigger a renewal reminder, a low-balance notice, and a plan-limit warning; check the ledger after each.
Expected: all three arrive via in-app + push + email only; ledger unchanged by any of them.
Covers: `NTF-05`, `BAL-13`, `BIL-14`.

**S08-08 Notice board publish and per-tenant language fallback.**
Steps: 1) Operator publishes a notice with both Bangla and English bodies. 2) Publish a second with only a Bangla body. 3) View both as an English-set tenant.
Expected: first notice shows English to the English-set tenant; second falls back to Bangla since no English body exists.
Covers: `NTC-01`, `NTC-15`.

**S08-09 Lapsed tenants never message their own shoppers.**
Steps: advance a tenant into `grace` (day 3+); attempt any shopper-facing push/SMS/email trigger.
Expected: no outbound tenant-to-shopper message from day 3 onward.
Covers: `LIF-14`.

**S08-10 Notification centre and push subscription basics.**
Steps: 1) Trigger a permission-scoped event (e.g. a new order) for a user with `orders:read` and one without. 2) Subscribe a device to web push, send a self-test, unsubscribe.
Expected: only the permitted user gets the badge/list entry; the permission-less user never receives it; test push arrives, nothing arrives post-unsubscribe.
Covers: `NTF-01`, `NTF-02`.

**S08-11 Blocked SMS logging and billing-unit sizing.**
Steps: 1) Trigger an SMS blocked for insufficient balance; check the usage report. 2) Send messages at 74, 76, and 151 characters; check the unit count charged for each, in both Bangla and English.
Expected: a blocked-for-balance SMS logs `blocked: insufficient_balance` and appears in the usage report; 74 chars = 1 unit, 76 = 2 units, 151 = 3 units, regardless of language (though Bangla's technical segment limit is shorter, the billing *unit* size stays the configured constant).
Covers: `SMS-07`, `SMS-09`.

**S08-12 Template variables and OTP rate limiting.**
Steps: 1) Insert order number, tracking link, and amount variables into a template; trigger the event and confirm they render correctly. 2) Exceed the OTP resend/request limits per phone, per IP, and per tenant simultaneously from different angles.
Expected: variables substitute correctly with no raw placeholder text leaking through; each of the three independent OTP limits (phone/IP/tenant) enforces on its own axis.
Covers: `SMS-10`, `SMS-11`.

**S08-13 Optional SMS blocked in trial and lapsed states.**
Steps: attempt to trigger an optional (non-essential) SMS event during `trial`, and again during `locked`.
Expected: refused in both states per the same codes `BAL-06`/`BAL-07` already define for balance usability — optional SMS never slips through just because the event itself fired.
Covers: `SMS-15`.

**S08-14 Rate-change triggers a prefilled notice offer.**
Steps: operator changes a per-use rate; observe whether a notice draft is offered.
Expected: a prefilled notice draft is offered (publishing it is the operator's choice, never automatic); the offer and the operator's decision either way are both recorded.
Covers: `NTC-13`.

**S08-15 Notice board: audience targeting, severity, scheduling, and isolation.**
Steps: 1) Operator creates a notice targeted at a specific audience (e.g. only Growth/Pro tenants) with "urgent" severity. 2) Schedule a notice for a future publish time and an end time. 3) Pin a notice. 4) Attempt to inject a script tag into a notice body. 5) Confirm a tenant never sees another tenant's targeting-excluded notice. 6) Let a tenant acknowledge/dismiss a notice.
Expected: only the targeted audience sees it; urgent severity renders distinctly (e.g. a banner, not just an inbox item); scheduled notices don't appear before publish time and disappear after the end time; pinned notices stay pinned; injected markup is sanitized inert, never executes; excluded tenants see nothing; acknowledgment state is per-tenant/per-user.
Covers: `NTC-02` to `NTC-08`, `NTC-10`, `NTC-11`, `NTC-16` to `NTC-18`.

---

## S09 — Public API and webhooks (API)

**S09-01 Key scoping and tenant resolution.**
Steps: 1) Attempt a request with a public key to a secret-key-only action. 2) Submit a body containing a `tenantId` field different from the key's own tenant.
Expected: scope violation refused; the `tenantId` body field is silently ignored, tenant always comes from the key/session.
Covers: `API-10`, `TEN-02`.

**S09-02 Idempotency — required, not optional, for ORD-02/PAY-01.**
Steps: 1) Call order creation with no `Idempotency-Key` header at all. 2) Call it with a key, same body, twice. 3) Call it with the same key, a different body.
Expected: missing header refused with 400 `idempotency_key_required` before anything is created; same key/body returns the original response with `Idempotent-Replay: true`; same key/different body returns 422 `idempotency_conflict`.
Covers: `API-11`.

**S09-03 Webhooks out — registration, delivery, SSRF guard.**
Steps: 1) Register an HTTP (not HTTPS) endpoint. 2) Register a valid HTTPS endpoint resolving to a public IP, select events. 3) Trigger an unselected event. 4) Re-point the registered domain's DNS to a private/link-local address, trigger a delivery. 5) Have the endpoint respond with a 3xx to an internal address.
Expected: HTTP registration refused; unselected events never deliver; the delivery after DNS repointing is blocked and logged, not sent; the redirect is not followed.
Covers: `API-12`, `SEC-15`.

**S09-04 Webhook delivery log, resend, and auto-disable.**
Steps: force 50 consecutive failures on one webhook endpoint; attempt resend of a specific delivery.
Expected: delivery log matches each attempt (status, first 1KB of response); endpoint disabled with a notice after the 50th failure; manual resend works on a past delivery.
Covers: `API-13`.

**S09-05 Versioning and deprecation headers.**
Steps: call an unversioned path; call a deprecated version.
Expected: unversioned returns 404; deprecated version carries `Deprecation` and `Sunset` headers.
Covers: `API-14`.

**S09-06 OpenAPI spec stays honest.**
Steps: add a new route without updating the generated spec (simulate a build with a missing decorator).
Expected: CI build fails; every real route otherwise appears in `/api/v1/openapi.json`.
Covers: `API-15`.

**S09-07 Error contract — code vs. message vs. stack trace.**
Steps: 1) Trigger a validation error; inspect `code`/`message`/`details`. 2) Repeat with `Accept-Language: bn` and `en`. 3) Force an unhandled exception in a production-configured environment; inspect the full response body and headers for any stack trace, file path, or internal error text — try sending headers claiming "debug mode." 4) Repeat the forced exception in a non-production environment.
Expected: `code` is identical regardless of language; `message` localizes correctly; production response contains no stack trace/path under any client-supplied header; non-production may include `debug.stack`; the full detail is present in the log/error-tracking record either way.
Covers: `SEC-16`, §2.6's error contract.

**S09-08 Pagination caps.**
Steps: request a list with `limit=500`.
Expected: capped at 100, `total`/`pages` returned correctly.
Covers: `API-17`.

**S09-09 API and dashboard produce identical metering.**
Steps: send an SMS via the dashboard; send an equivalent SMS via a secret-key API call.
Expected: identical ledger entry shape and counter change either way.
Covers: `API-18`, `API-19`.

**S09-10 API key lifecycle: create, scope, revoke, rotate.**
Steps: 1) Create a public key and a secret key, each with specific scopes. 2) Use a key outside its granted scope. 3) Revoke a key; retry a call with it. 4) Rotate a key; confirm the old one stops working while the new one works immediately.
Expected: scope violations return 403; a revoked or pre-rotation key fails immediately, with no grace window unless explicitly designed; the new key works without any deploy.
Covers: `API-01`, `API-03` to `API-08`.

**S09-11 CORS enforcement and request body-size limits.**
Steps: 1) Make a public-key request from an origin not on the tenant's registered list. 2) Submit a request body exceeding the configured size cap.
Expected: unregistered-origin request refused (ties to `API-07`/`RTE-07`'s origin check); oversized body rejected cleanly, not a server crash or timeout.
Covers: `API-16`, `API-21`.

**S09-12 Bulk endpoint limits.**
Steps: submit a bulk import at and beyond its stricter per-request size cap.
Expected: within-cap bulk request processes; beyond-cap is rejected with a clear size-limit error, distinct from the normal single-item rate limit.
Covers: `API-23`, `API-24`, `API-26` to `API-28`.

---

## S10 — Chat and AI (CHT, AI)

**S10-01 Anonymous chat start and rate limits.**
Steps: start a thread anonymously; send 11 messages in a minute; start a 4th new thread in an hour from one visitor/IP.
Expected: thread starts fine; 11th message in a minute is 429; 4th new thread in an hour is refused.
Covers: `CHT-06`.

**S10-02 AI reply gating by plan, balance, and trial.**
Steps: 1) Enable chat AI on a plan that includes it (Growth/Pro). 2) Attempt on trial, PAYG, and Starter. 3) Drain balance to the configured floor mid-conversation. 4) Hit the configured monthly spend cap.
Expected: only Growth/Pro can enable it at all; trial/PAYG/Starter can't; AI stops replying (humans still can) once balance/cap is exhausted, with the owner warned before it runs out.
Covers: `AI-01`, `AI-03`, `AI-04`.

**S10-03 AI charging correctness.**
Steps: get a successful AI reply; force a provider error on another attempt; force an empty response.
Expected: only the successful reply charges the ledger at the configured rate; the error and empty cases charge nothing.
Covers: `AI-02`.

**S10-04 Staff takeover pauses AI; language matching.**
Steps: 1) Have staff reply on a thread; send a new shopper message within 30 minutes. 2) Send a Bangla message, then an English one, in two separate threads.
Expected: AI doesn't reply within 30 minutes of the staff reply; each thread's reply matches the shopper's own message language, not a toggle.
Covers: `AI-06`, `AI-09`.

**S10-05 AI hands off what it can't answer.**
Steps: ask something outside the shop's configured information.
Expected: thread flagged "needs human," appears on the staff thread list.
Covers: `AI-08`.

**S10-06 Provider failure doesn't block chat.**
Steps: force the configured AI provider to fail entirely; switch the provider setting.
Expected: human chat keeps working throughout; switching providers requires no deploy.
Covers: `AI-10`, `PRF-05` (circuit breaker applies here too).

**S10-07 Chat thread basics: creation, reply, media, and public-key scoping.**
Steps: 1) A shopper starts a thread with a message and a media attachment via the public key. 2) Staff reply from the dashboard. 3) Shopper sends a follow-up; confirm it threads correctly, not a new thread. 4) Attach a file exceeding the configured media limit.
Expected: thread creation and staff/shopper replies work bidirectionally; media attaches and counts toward storage (same validation rules as product media); an oversized attachment is rejected with a clear message.
Covers: `CHT-01`, `CHT-02`, `CHT-03`, `CHT-04`.

**S10-08 Chat retention and lapsed-state offline behavior.**
Steps: 1) Let chat media/messages age past the plan's chat retention (e.g. Starter 30 days). 2) Attempt to start or continue a chat thread while the tenant is in `read_only`/`locked`/`archived`.
Expected: aged messages/media are purged by the scheduled job per the plan's retention; chat is fully offline in lapsed states, consistent with `LIF-07`'s storefront-offline rule.
Covers: `CHT-05`, `CHT-09`.

**S10-09 New-message notification to permitted staff.**
Steps: a shopper sends a new message on an existing thread.
Expected: users with `chat:read` get an in-app and push notification; a user without that permission does not.
Covers: `CHT-07`.

**S10-10 AI reply rate limiting and the Messenger/plan-feature gate.**
Steps: 1) Burst AI replies beyond 1 per 5 seconds on one thread and 30 per minute tenant-wide. 2) Check chat AI's availability against the same plan-feature gate as any other Growth/Pro-only feature, including the Messenger integration if applicable.
Expected: bursts beyond either limit are queued or dropped without charge, never double-charged; the feature gate matches `AI-01`'s plan restriction exactly, with no separate inconsistent rule for Messenger specifically.
Covers: `AI-07`, `AI-11`.

---

## S11 — Operator and support (ADM, SUP, NTC, RAT)

**S11-01 Operator console isolation and mandatory 2FA.**
Steps: 1) Attempt to sign a tenant credential into the operator console. 2) Create a new operator account; attempt to use it before completing TOTP enrollment. 3) Complete enrollment with a wrong code, then the right one. 4) Use a backup code; attempt to reuse it.
Expected: tenant credential never works on the console; account unusable until a valid TOTP code confirms enrollment; backup code works once, rejected on reuse.
Covers: `ADM-01`.

**S11-02 2FA break-glass recovery.**
Preconditions: solo-operator state (`OD-32`).
Steps: simulate losing both the TOTP device and all backup codes; run the documented break-glass recovery.
Expected: account recovered via the logged break-glass procedure; account unusable again until 2FA is freshly re-enrolled; with a second operator present, the same recovery requires their approval instead of being self-service.
Covers: `ADM-18`.

**S11-03 View-as-tenant, scoped and audited.**
Steps: open view-as-tenant with a reason under 10 characters; retry with a valid reason; attempt a write while viewing; let 30 minutes pass.
Expected: short reason refused; valid reason opens a read-only, time-limited, banner-shown session; writes refused; every page opened is logged to the tenant's own activity log; access ends at 30 minutes.
Covers: `ADM-05`.

**S11-04 Payment/top-up review queue, no double-credit.**
Steps: approve a queued top-up claim twice.
Expected: first approval credits the balance once; second approval has no further effect.
Covers: `ADM-06`.

**S11-05 Manual entry for an out-of-band payment.**
Steps: record a plan purchase paid outside the normal flow, with evidence and a reason.
Expected: produces the same ledger entries, snapshot, and invoice as the automatic path, marked "recorded by the platform."
Covers: `ADM-14`.

**S11-06 Platform settings — audited, live, no redeploy.**
Steps: as operator, change a per-use rate (e.g. SMS per part) and a lifecycle stage length; inspect the audit log; check effect on future vs. past charges/tenants.
Expected: rate change applies immediately to future charges only, past ledger entries unchanged; lifecycle change applies only to periods ending after the change, an already-lapsed tenant keeps its original schedule; both changes appear in the audit log with old/new values and the acting operator.
Covers: `RAT-01` to `RAT-03`, `LIF-26`, `ADM-11`.

**S11-07 Setup checklist auto-detection.**
Steps: complete each checklist item (add product, connect courier, add wallet, choose SMS events, create API key, pair listener) one at a time.
Expected: each ticks off automatically without a page reload.
Covers: `SUP-01`.

**S11-08 Tenant list, search, and detail view.**
Steps: 1) Search the operator's tenant list by shop name, owner phone, and subdomain; filter by state and plan. 2) Open a tenant's detail view.
Expected: each search/filter returns exactly the expected tenants, sortable/paginated; detail view shows plan/snapshot, period end, state, balance and frozen flag, usage against every limit, recent errors, failed SMS/bookings/webhooks, last sign-in, open tickets, and payments awaiting review — all matching the underlying data.
Covers: `ADM-02`, `ADM-03`.

**S11-09 Operator tenant actions, all audited.**
Steps: suspend a tenant and its payment page; restore it; extend a plan by days with a reason; adjust a balance with a reason; attempt each with an empty reason; reset an owner's sign-in; set an override.
Expected: every action succeeds with a reason, fails without one; each writes a platform audit entry and, where relevant, a tenant activity entry.
Covers: `ADM-04`.

**S11-10 Platform audit log filtering and manual-entry guardrails.**
Steps: 1) Filter the platform audit log by tenant, actor, action, and date. 2) Record a manual out-of-band payment (`ADM-14`-style) with an invalid or missing required field.
Expected: filters return correct results; entries are immutable (can't be edited, matching `DAT-10`); an incomplete manual entry is rejected before it produces any ledger/invoice effect.
Covers: `ADM-08`, `ADM-15`, `ADM-16`.

**S11-11 Reports and daily operator digest.**
Steps: pull tenant-count-by-state-and-plan, revenue-by-period, and top-consumer (storage/bandwidth/SMS) reports with CSV export; check for a daily summary digest.
Expected: figures match underlying records exactly; CSV exports correctly; a daily digest surfaces the kind of cross-tenant signal an operator would otherwise have to go looking for.
Covers: `ADM-09`, `ADM-10`, `ADM-12`.

**S11-12 Support ticketing and sign-up rate limiting.**
Steps: 1) Submit a support ticket with subject/message/images — confirm tenant ID, plan, state, and recent errors attach automatically. 2) Attempt rapid repeated sign-ups from one IP/device beyond the configured limit.
Expected: ticket auto-attaches context without the user re-typing it; excessive sign-up attempts are rate-limited, independent of the trial-count limit in `AUTH-09`.
Covers: `SUP-04`, `SUP-05`, `SUP-08`.

**S11-13 Activity log read permission boundary.**
Steps: attempt to read another user's/tenant's activity log entries without the right permission.
Expected: refused; a user only ever sees the log scoped to their own tenant and permission level.
Covers: `AUD-08`.

---

## S12 — Non-functional (LOG, MON, AVL, BKP, PRF, SEC, LEG, DAT)

**S12-01 Standby failover drill.**
Steps: simulate the primary becoming unreachable; follow the documented semi-automatic promotion.
Expected: monitor (checking from two locations) alerts the operator; one command fences the old primary, promotes the standby, verifies with a test write, all within 10 minutes of approval; the last 30 minutes of payments are reconciled against wallet/gateway/SMS records afterward.
Covers: `DAT-37`, `DAT-53`, `OD-37`.

**S12-02 Backup restore drill, including a single-tenant restore.**
Steps: monthly: restore the latest base backup + dumps into a clean environment, verify row counts/checksums; separately, restore a single tenant's data only.
Expected: full restore matches source; single-tenant restore procedure works in isolation and is what the cell-move/transaction-ID-permanence mechanisms are built on.
Covers: `BKP-01`, `BKP-02`, `DAT-26`.

**S12-03 Point-in-time recovery to an arbitrary minute.**
Steps: recover to a specific timestamp within the retention window.
Expected: recovery lands at the chosen minute; newest archived WAL segment is under 2 minutes old at drill time.
Covers: `DAT-34`.

**S12-04 Load test at twice expected peak.**
Steps: run the load profile from the capacity model at 2x peak for 100 tenants and a launch sign-up burst.
Expected: error rate under 1%; 95th-percentile API read response under 500ms.
Covers: `PRF-01`, `PRF-03`.

**S12-05 Shared Redis failure and fallback.**
Steps: stop the shared Redis instance while traffic is flowing on every application server.
Expected: every server falls back to its own in-process limiters simultaneously (not just one, since the instance is shared); sensitive endpoints apply the stricter fallback limit; one alert is raised naming the shared instance.
Covers: `RED-01`, `RED-05`.

**S12-06 Active-active failover and zero-downtime deploy.**
Steps: stop the application process on one server under live traffic; separately, run a deploy with a forced-failing health check on the standby.
Expected: traffic moves entirely to the surviving server with no errors beyond in-flight requests; the deploy with a failing standby health check stops before touching the primary.
Covers: `AVL-01`, `AVL-02`, `AVL-05`.

**S12-07 Security scan sweep.**
Steps: run an automated scan for SQL injection, missing security headers, and credential leakage in logs/responses across the full endpoint list; attempt a state-changing dashboard request with a valid session cookie but no CSRF token.
Expected: no injectable parameter found; all required headers present; no credential value anywhere in logs; CSRF-missing request returns 403.
Covers: `SEC-03`, `SEC-04`, `SEC-08` to `SEC-14`.

**S12-08 Single-tenant migration rehearsal.**
Steps: rehearse migrating the existing MongoDB single-tenant data into PostgreSQL as tenant #1; compare row counts/checksums per collection/table; keep the old system read-only throughout.
Expected: reconciliation report shows equal counts and checksums; a rollback plan restores service on the old system if needed.
Covers: `DAT-16`.

**S12-09 Legal and terms checklist.**
Steps: review the terms-of-service checklist against `LEG-02`'s required disclosures (lifecycle, no-refund policy, balance freezing, deletion timing, R2 media with no separate backup, credential-usage logging).
Expected: every listed item is present in the actual terms document; sign-off recorded.
Covers: `LEG-01`, `LEG-02`, `LEG-03`.

**S12-10 Credential hashing and encryption at rest — priority, zero prior coverage.**
Steps: 1) Inspect the database directly for a sample of stored passwords and courier/gateway credentials. 2) Attempt to read a credential value through any API response, including error responses. 3) Check the webhook-signing secret storage.
Expected: passwords are a slow hash, never plaintext or reversible; courier/gateway credentials are encrypted with a key held outside the database; no API response, under any condition including a forced error, returns a plaintext credential.
Covers: `SEC-01`.

**S12-11 Signed/validated/allow-listed webhooks and redirects, platform-wide sweep.**
Steps: across every outbound webhook and redirect surface (payment gateway, courier, tenant-configured outbound webhooks, OAuth returns), verify signing, validation, and allow-listing are actually applied, not just on the one or two already exercised in S06/S07/S09.
Expected: every surface matches `API-13`/`PAY-04`/`PAY-09`'s pattern — nothing is an unsigned or unvalidated exception.
Covers: `SEC-05`.

**S12-12 Session/reset token unguessability and single-use.**
Steps: inspect token entropy/length for session and password-reset tokens; reuse a consumed reset token; reuse an old session token after sign-out.
Expected: tokens meet the stated minimum randomness; a used reset token fails on reuse; a signed-out session token is rejected.
Covers: `SEC-07`.

**S12-13 Cacheable-reads-first performance ordering, under load.**
Steps: under the load-test profile (S12-04), measure the latency ordering between the rate-limit check and a cache hit at volume, not just functionally (that correctness check is `S04-10`/`RTE-04`).
Expected: the rate-limit check still precedes the cache lookup under real load, with no latency regression introduced by checking the limit first.
Covers: `PRF-02`.

**S12-14 Payment-record recovery time objective.**
Steps: restore to a chosen point in time; confirm every payment up to that moment is present within the 1-hour recovery objective.
Expected: payment records recoverable to within 1 hour, verified in the same drill as the general backup restore (S12-02) but checked specifically against payment completeness, not just row counts.
Covers: `BKP-03`.

**S12-15 Health endpoint, job-runner lease takeover, and proactive tenant-problem surfacing.**
Steps: 1) Call the health endpoint; inspect its reported status, DB connectivity, and version. 2) Kill the primary's job runner; confirm the standby takes over leadership and no job runs twice. 3) Force a courier booking failure for a tenant; check the operator's tenant-detail view before that tenant files a support ticket.
Expected: health endpoint accurately reports status/DB/version; job leadership moves to the standby within the lease window with no double-run; the forced failure appears on tenant detail within 1 minute, ahead of any tenant report.
Covers: `MON-02`, `MON-04`, `MON-05`.

**S12-16 Degraded-mode and read/write pool routing under database stress.**
Steps: 1) Trigger the degraded-mode switch (one server carrying everything) — check rate limits lower and heavy jobs pause. 2) Force the write pool to point somewhere other than the primary — confirm the startup/periodic check catches it. 3) Write, then immediately read the same row — confirm it reads from a pool that has the write (read-your-writes), not a lagging replica.
Expected: degraded mode visibly tightens limits and pauses heavy jobs; a misrouted write pool is caught by the periodic check, not silently allowed; a read immediately following a write never shows stale data.
Covers: `DAT-38`, `DAT-41` to `DAT-47`, `DAT-51`.

**S12-17 Usage-record retention for billing disputes.**
Steps: raise a billing dispute referencing a usage record (SMS/AI/storage/bandwidth/API calls) older than the plan's normal activity-log retention; attempt to view another tenant's usage totals.
Expected: usage records relevant to billing are retained long enough to resolve a dispute, independent of the shorter activity-log retention; a tenant's own totals are visible to them and the operator only, never another tenant's.
Covers: `LOG-04`.

---

## S13 — Tenant identity verification (KYC)

**S13-01 Trigger thresholds and non-blocking banner.**
Preconditions: a tenant with `KYC-01` threshold N = 50 handled orders and a balance top-up threshold T set.
Steps: 1) Handle orders one by one up to 50; then handle a 51st. 2) As operator, request verification on a second tenant. 3) Top up a third tenant above T. 4) On the first tenant, place orders and a payment while the banner is showing.
Expected: the 50th handled order creates exactly one open request; the 51st creates none; each operator request and the top-up above T create one open request each; while a request is open the banner shows and orders and payments still work.
Covers: `KYC-01`, `KYC-02`.

**S13-02 Submission validation and consent.**
Steps: 1) Submit without consent. 2) Submit with NID `12AB`. 3) Submit a 31 February date of birth. 4) As the owner, request a front upload URL, upload a PDF renamed `.jpg`, then submit. 5) As a staff member, request an upload URL. 6) As the owner, upload a valid 4 MB JPEG NID front, NID back and owner photo directly to the signed URLs, consent ticked, with the consent version recorded, then submit. 7) Submit once with the owner photo omitted.
Expected: 1–3 are refused with `validation_error` and nothing is stored; in 4 the renamed PDF is deleted from the temporary area and no submission row exists; 5 returns 403; 6 succeeds, the consent text, version and timestamp are stored before submission, all three images move to permanent keys, nothing remains in the temporary area, and status becomes `submitted`; 7 is refused with `validation_error`.
Covers: `KYC-03`, `KYC-04`, `KYC-15`.

**S13-03 Separate store, access rules and metering.**
Preconditions: a tenant whose storage quota is at 100%.
Steps: 1) Check that the KYC bucket holds no object under any tenant media prefix. 2) As the owner, open a signed image URL. 3) As a staff member with every other permission, request the same URL. 4) As a different tenant's owner, request the same image. 5) Wait five minutes and reuse the first URL. 6) Record storage, bandwidth and request counters before and after step 2.
Expected: step 1 finds no KYC object under a tenant prefix; step 2 displays the image; steps 3 and 4 return 403; step 5 returns an expired-URL error; the counters in step 6 do not change; the owner can still view the images at 100% storage.
Covers: `KYC-05`, `KYC-06`, `KYC-13`, `MED-01`, `STO-01`.

**S13-04 Owner view-only and masking.**
Steps: 1) As the owner, open the verification page after submission. 2) Check whether a download control or a re-upload control exists on the images. 3) Check the masked NID shown in lists and detail. 4) As the owner, call the image endpoint with a wrong side value.
Expected: images open for viewing only, with no download control; the NID shows masked (last four digits); a wrong side value returns `validation_error`.
Covers: `KYC-08`, `KYC-09`, `KYC-10`.

**S13-05 Manual review, four-eyes, rejection and resubmission.**
Preconditions: two operators, one of whom requested the verification.
Steps: 1) The requesting operator tries to approve. 2) The second operator reveals the full NID, which requires a reason. 3) The second operator rejects with an empty reason, then with a reason. 4) The owner resubmits. 5) Approve the resubmission.
Expected: step 1 is refused where the four-eyes rule applies; step 2 writes an audit entry with the operator, time and reason; step 3 refuses the empty reason; step 4 keeps the rejected submission and its reason in history; step 5 sets status `verified`.
Covers: `KYC-07`, `KYC-08`, `KYC-09`, `KYC-12`.

**S13-05b Tenant status follows review.**
Steps: 1) Check the tenant's status before and after submission. 2) Approve the submission. 3) As an operator, revoke the verified status with an empty reason, then with a reason. 4) Check the owner's view of the status after each step.
Expected: `unverified` → `pending` on submission → `verified` on approval, with no delay; the revoke with an empty reason is refused; with a reason the status becomes `revoked`, the reason is in the audit log, and the owner sees `revoked`; the status always matches the latest verification record.
Covers: `KYC-16`, `KYC-07`, `KYC-12`.

**S13-06 Re-upload request, no backup.**
Steps: 1) On a submitted verification, mark the back image as unreadable and request a re-upload. 2) Check the owner's notice in-app and by email. 3) The owner submits a new submission. 4) Confirm the earlier submission and its images still appear in the history. 5) Check that no backup restore was needed.
Expected: the owner gets the notice in both channels; the new submission is recorded as a separate entry; the earlier submission stays listed with its outcome.
Covers: `KYC-14`, `KYC-08`.

**S13-07 Deletion at day 60.**
Preconditions: a verified tenant with KYC records and images, advanced on the test clock to day 60.
Steps: 1) Run the day-60 job. 2) Query the KYC table and the KYC bucket for that tenant. 3) Check the platform audit log for the submission and reveal entries. 4) The former owner signs in and checks for a KYC record.
Expected: no KYC row or image object remains for the tenant; the verification query returns zero; the audit entries remain without any NID value or image reference; the former owner has no KYC record and must submit again if they return.
Covers: `KYC-10`, `LIF-19`, `DAT-15`, `KYC-11`.

**S13-08 Logs never carry KYC values.**
Steps: submit a verification with a known NID and DOB, then force a validation error and a server-side exception during the same submission. Search the application logs, error tracker and API responses for the NID digits and the image object key.
Expected: no match anywhere.
Covers: `KYC-11`.

---

## Coverage note

The first version of this document (v1, same date) claimed full `M`-priority coverage without actually being audited against the requirement list. An audit then run against it found that claim false — roughly 63% of Must requirements were never named in any scenario, with whole feature areas (product/variant CRUD, the storefront itself, plan administration, wallet/gateway credential handling, the API key lifecycle, courier connection management, fraud checks, the notice board, chat, the media pipeline) essentially untested. This revision adds the scenarios that close those gaps, prioritizing the two security-sensitive items the audit flagged with zero coverage (`WAL-09` gateway-credential masking, `SEC-01` password/credential hashing) first.

**Before treating this as release-blocking per `SRS-detailed.md` §26.4, run the same audit again** — a fresh extraction of every `M`-priority requirement ID against every scenario's "Covers" line in this now-larger document — rather than trusting this note's own claim of completeness a second time. Deliberately excluded from that audit, as architecture/code-review (`MAN`) items better verified by inspection than by an E2E scenario: most of `DAT`'s internal schema/replication rows, `SCL`'s capacity-model and module-boundary rules, `RED`'s internals, and `LOG`'s schema rows — these are reasonably stood in for by S12's drills (failover, backup/restore, PITR, Redis-fallback, security sweep), not by a 1:1 named scenario each.
