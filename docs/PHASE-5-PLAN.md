# Phase 5 plan: payments

Status: agreed 2026-10-31 — the decisions in §2 were settled in the Phase 5 read the same day. Builds on
`IMPLEMENTATION-PLAN.md` Phase 5, with these changes agreed before this plan was written:

- **Built after Phase 4's screens.** The plan is written now; building starts once Slice 4.8 is built (D5-1). Amended
  2026-10-31: the backend slices start now, beside Slice 4.8; the screens (Slice 5.8) still wait.
- **Three verification levels, one after another:** verification by hand first, usable on its own, then the SMS
  listener, then bKash's gateway (D5-2). Checkpoint 5A comes after verification by hand.
- **Lytro's own payments** (plans, add-ons, top-ups) move onto the payment page with the listener (D5-3).
- **An advance nobody paid cancels its order:** when the 30-minute payment window ends with no transaction ID, or a
  payment is rejected, the order is cancelled with the reason "advance not paid"; a transaction ID typed in time waits
  for staff (D5-4, D5-5).
- **Wallets:** bKash, Nagad, Rocket and Upay, and bank transfer (D5-6); the gateway is bKash's only (D5-7).
- **Moved out:** payment webhooks and secret-key session reads (PAY-09 to PAY-12) go to Phase 8, with the shop API
  (D5-8).

Requirement IDs refer to `SRS-detailed.md` §19 (WAL, PAY, VER, LSN, TVR), RAT-15 and RAT-16, plus the ORD, INV, SFT,
LND and PRD rows named below. Schema refers to `DATABASE-SCHEMA.md` §3.4 and §8, which each slice brings in line with
§4 of this plan.

All decisions in §2 were agreed on 2026-10-31; reopening one needs an explicit change to that row, not a silent
deviation during a slice. The points §2.1 leaves to a slice's read are settled there, each with its own answer.

---

## 1. Goal and exit criteria

**Goal.** A shopper who orders a product that needs an advance, or full prepayment, pays it by bKash, Nagad, Rocket,
Upay or bank transfer to the shop's own account, on Lytro's payment page or bKash's own checkout, and the payment is
verified exactly once -- by staff, by the shop's listener phone reading the receipt SMS, or by bKash's API -- before
the order goes on to its confirming call. Money never moves through Lytro: it goes from the shopper to the shop.
Lytro charges the shop's balance a small fee for each payment it verifies automatically, and verification by hand is
free. Lytro's own payments from sellers use the same page and the same listener.

**Phase 5 is complete when all of these hold:**

1. Every requirement in §3.1 has a passing automated test, or, for `MAN` requirements, a recorded manual check.
2. **The prepaid golden path** passes as one test for each verification level, for one clothing shop:
   a landing-page order for a shirt needing a 300 TK advance → its stock is held → the payment page shows the shop's
   active bKash account → the shopper types the transaction ID → verified (by staff; by a paired listener's receipt;
   by bKash's sandbox) → the order moves from Unverified to New, then to its confirming call → shipped → delivered,
   collecting only the cash-on-delivery remainder. The fee is charged once: none by hand, 0.10% by the listener,
   1.00% by the gateway. At every step the session, the order's two axes, the payments, the balance ledger and the
   stock agree.
3. **The unpaid paths:** an order with no transaction ID when its window ends is cancelled ("advance not paid") and
   its stock released in one step; a transaction ID typed in time keeps the order and its stock until staff decide;
   a rejected payment cancels its order; money that turns up after a cancellation goes to staff review and reopens
   nothing.
4. **Exactly once:** one transaction ID sent to two sessions in two shops at once is accepted once; two listener
   phones forwarding the same SMS verify once (VER-03); a gateway callback sent twice credits once (VER-09); staff
   recording a payment by hand while a session verifies never takes more than is due.
5. **The balance never blocks a shopper** (WAL-21): too little balance hides bKash's checkout and sends a listener
   match to free review, with a low-balance notice.
6. **Lytro's own payments:** a plan bought on the payment page, verified by Lytro's own listener phone, activates
   once, with no fee and no session limit (PAY-21).
7. **The milestone** (`IMPLEMENTATION-PLAN.md`): the scripted order-and-payment check of OBS-08 passes against a
   staging shop with bKash's sandbox, for one wallet by the listener and one by the gateway.
8. CI is green on `main`, and the pull-request flow has been used for every slice.

---

## 2. Decisions

**D5-1 to D5-9 agreed 2026-10-31** (the Phase 5 read).

| # | Decision | Decided | Affects |
|---|---|---|---|
| D5-1 | **When.** Phase 4's screens (Slice 4.8) are being built. | The plan is written now; building starts once Slice 4.8 is built (the owner's pick over starting beside it). **Amended 2026-10-31** (the owner's "can we start phase 5 now?"): the backend slices (5.1 – 5.7) start now, beside Slice 4.8, as Phase 4's did beside Slice 11; Slice 5.8's screens still wait. | Planning |
| D5-2 | **The order of the verification levels.** VER-01 (by hand), the listener (VER-02 – 07, LSN) and the gateway (VER-08 – 11) each stand alone (WAL-19). | By hand first (Slices 5.1 – 5.3), usable on its own, then checkpoint 5A; then the listener (5.4, 5.5); then bKash's gateway (5.7). Most sellers take money on personal bKash numbers, which only the listener can verify on its own. | Slices 5.1 – 5.7 |
| D5-3 | **Lytro's own payments** (plans, add-ons, top-ups). Sellers send money to Lytro's wallet and type the transaction ID in the dashboard, and the operator approves each one (D2-1); PAY-21 puts them on the same engine as shoppers'. | They move onto the payment page with the listener (Slice 5.6), Lytro's own listener phone verifying them; until then today's wallet step and the operator's queue stay. `control.plan_payments` stays their record, each linked to its session. A gateway for Lytro's own payments (ADM-10) may come later (the owner's "we may have automated checkout in future"). | Slice 5.6 |
| D5-4 | **An advance nobody paid.** PAY-03's session lasts 30 minutes and INV-16's stock hold with it; ORD-08 sends an order with a rejected payment to `rejected`. | Cancelled automatically (the owner's pick over leaving it to staff): when the window ends with no transaction ID typed, the order is cancelled with a new reason, "advance not paid" (ORD-52), its session expired and its stock released, in one transaction. A payment staff reject cancels the order the same way. Money that turns up later -- a receipt or a transaction ID for a cancelled order -- goes to staff review and never reopens the order on its own. §2.3.1, ORD-08, ORD-52, PAY-14 and INV-16 amended. | Slice 5.3 |
| D5-5 | **A transaction ID typed but not yet checked.** By hand, staff may take hours to check one. | Typing the transaction ID inside the window stops the clock: the session waits in `checking`, and the order and its stock hold wait until the payment is verified or rejected. Only an order nobody paid for within the window is cancelled on its own. PAY-03 and INV-16 amended. | Slice 5.3 |
| D5-6 | **Wallets for manual payment.** WAL-01 lists bKash, Nagad and Rocket; the payment page design, ORD-15 and the payment methods already built include Upay. | bKash, Nagad, Rocket and Upay (wallet kind) and bank transfer (bank kind). WAL-01 amended. The listener reads bKash's receipts first, and the others once real samples arrive (LSN-06). | Slices 5.1, 5.4 |
| D5-7 | **Gateways.** | bKash's tokenized checkout only; Nagad's later (OD-07). Lytro applies for bKash's sandbox early enough for Slice 5.7. | Slice 5.7 |
| D5-8 | **Moved out of this phase.** PAY-09 – 12 (signed webhooks, their retries, the secret-key read and cancel) are must-haves, but webhooks and secret keys are Phase 8 (D4-5). | They go to Phase 8, with the shop API. Phase 5 serves Lytro's own storefront, landing pages and staff, which read a session's state from the server. | Scope |
| D5-9 | **A prepaid order's flow** (agreed in Phase 4's read, D4-3). | Unverified until its payment is verified, then New (`pending`) and the usual confirming call (ORD-51). An order waiting on its advance is not confirmed or shipped (agreed 2026-10-31 in Slice 5.1's read); staff who received the money another way record it (ORD-22), which verifies it. | Slice 5.3 |

### 2.1 Points left to each slice's read

Each is settled in its slice's read, before code, and recorded there.

| Slice | To settle |
|---|---|
| 5.1 | Settled in its read, 2026-10-31 (below). |
| 5.2 | Settled in its read, 2026-10-31 (below). |
| 5.3 | When Meta's `Purchase` is sent for a prepaid order (on placing or on payment); refunds recorded (PAY-20, ORD-44) and proof images (PAY-18), in or deferred; the new-tenant volume limit's default (TVR-04 says off, §2.1 on for pay-as-you-go). |
| 5.4 | The listener's should-haves (LSN-04, 05, 14, 17); devices and uploads for a pay-as-you-go shop (LSN-07 and LSN-08 name only trial, active and grace); a listener match whose fee the balance cannot cover (WAL-21: free review). |
| 5.5 | The app's technology (React Native, as decided for the admin mobile app in OD-52, or native Kotlin); how it is installed (Google Play limits apps that read SMS, so a signed APK may be the way); the device-integrity check (LSN-25, off by default). |
| 5.6 | Pairing Lytro's own listener phone; whether today's wallet step stays as a fallback; the amount a seller says they sent (not stored today, §3.5). |
| 5.7 | Holding the gateway fee (WAL-21) as a held amount or a charge reversed on failure; where a credential's use is logged (SEC-11); bKash's sandbox access. |
| 5.8 | Where the payment page lives (its own small app, or a host of the storefront app with its own policy, PAY-23); redirect, as SFT-07 says, rather than the frame the drawings show; the drawn page's extras (contact buttons, support chat, its fonts, an SMS promise) against PAY-05; "switch to cash on delivery" after a failed payment, which PRD-08 refuses. |

---

## 3. Requirement coverage

Rules used below: **completed** means every pass criterion is provable by the end of this phase; **partial** means
this phase builds a working part and a named later phase finishes it. Notices delivered through a stand-in port
(D4-10) count as complete.

### 3.1 Completed by this phase

| Family | Requirements |
|---|---|
| WAL | WAL-01 (amended) – WAL-21 (WAL-18 by a manual check) |
| PAY | PAY-01 – 08, 13 – 17, 19, 21 – 23; PAY-18 and PAY-20 if Slice 5.3's read keeps them |
| VER | VER-01 – VER-12 |
| LSN | LSN-01 – LSN-24 (the should-haves as Slice 5.4's read settles) |
| TVR | TVR-01 – TVR-04 |
| RAT | RAT-15, RAT-16 |
| From Phase 4's partials | ORD-07, ORD-08 (payment events), SFT-06 (payment methods), SFT-07, SFT-10, LND-10, INV-16, RTE-08 (payment sessions), API-07 (payment sessions), API-11 (required on sessions), LIM-02, LIM-04, TRL-03, PLN-19, DWN-12, DWN-14, DWN-15, UPG-10 (sessions and devices), AUD-01 (verified by the listener or the gateway), LIF-16, LIF-19 (payments, wallet accounts, devices, credentials); ORD-44 with PAY-20 |
| Lytro's own payments | PAY-21 and the payment page's part of AUTH-29, BIL-03, BAL-03 and PLN-14 |

### 3.2 Partially completed by this phase

| Req | Done in this phase | Remaining | Finished in |
|---|---|---|---|
| VER-01, VER-07, VER-10, PAY-15 | the staff notices through stand-in ports | push and SMS ("payment verified", "payment needs verification") | Phase 7 |
| LSN-06 | bKash's receipts | Nagad, Rocket and Upay as real samples arrive | when samples arrive |
| SEC-11 | a gateway credential's use logged where Slice 5.7's read decides | the full security pass | Phase 9 |
| RTE-08, RTE-09 | session windows on the in-process limiter (D4-13) | exact counters in PostgreSQL (RED-11) | Phase 9 |
| OBS-08 | the scripted order-and-payment check, run on staging for this phase's milestone | monitored probes | Phase 9 |

### 3.3 Listed for Phase 5 but not built here

| Req | Why | Goes to |
|---|---|---|
| PAY-09 – PAY-12 | webhooks and secret keys come with the shop API (D5-8) | Phase 8 |
| LSN-25 | a could-have, off by default | later |
| ADM-10 | a gateway for Lytro's own payments (D5-3) | later |
| ADM-14 – ADM-17 | manual entries and claims, the operator's tooling | Phase 8 |
| KYC-01 – KYC-16 | in the payments chapter but scheduled nowhere; nothing in this phase needs it | unscheduled |

### 3.4 Dependencies between requirements

Read each row as: the requirements on the left can only be built or proven once those on the right exist.

| Requirement(s) | Depend on | Why |
|---|---|---|
| PAY-01, PAY-05, WAL-08, WAL-17 | WAL-01 – 07, WAL-14 – 16, TVR-01 | a session needs an enabled method with an active account, and a verified owner phone |
| PAY-07, PAY-16, VER-02 | ORD-15's transaction ID registry | one ID, one payment, platform-wide |
| PAY-15, ORD-07, ORD-08, D5-4 | ORD-43 (`PaymentRecorder`), ORD-52, INV-16 | a verified payment settles the order; an unpaid one cancels it and frees its stock |
| LND-10, SFT-07, SFT-10 | PAY-01, ORD-02, PRD-08 | the public order makes the session for its advance |
| VER-02 – 07, LSN-01 – 24 | VER-01, PAY-07 | the listener verifies the same sessions staff verify by hand |
| WAL-20, WAL-21, RAT-15, RAT-16 | BAL ledger (PYG-02's pattern) | the fee joins the verification's transaction |
| VER-08 – 11, WAL-09 – 13, WAL-19 | PAY-06, SecretBox, the circuit breaker | the gateway is a plugin with sealed credentials |
| PAY-21 | LSN-01 – 24, PAY-01 – 08 | Lytro's own payments use the listener and the page (D5-3) |

### 3.5 Rework of code and documents built before this phase

| What | Today | After | Slice |
|---|---|---|---|
| The order's payment standing (`PaymentRecorder.standingWithin`) | worked out from recorded payments only, so an edit would reset an order waiting on its payment | an order waiting on its advance keeps waiting until money comes (`pending_verification`) | 5.2 |
| Shoppers' orders needing an advance | refused (`advance_needed`, D4-2) | placed `unverified`, with a session for the advance; the session's own minute pass, not the stock hold's, lets the stock go | 5.2 |
| The stock-hold expiry tick | releases stock only | the session's minute pass expires the session, cancels the order and lets its stock go in one transaction (D5-4); a checkout's hold has no expiry of its own | 5.2 |
| Delivery's cash collection | collects the whole `due` as cash on delivery | collects the cash-on-delivery remainder only; an order waiting on its advance is not shipped (D5-9) | 5.3 |
| `tenant.payments` (0088) | the app may change only the void columns | the session, verification level and verifier, and refunds if kept | 5.2, 5.3 |
| `payments:manage` | covers both paying Lytro and recording a shopper's payment | verifying and rejecting under `payments:verify`, which exists unused | 5.3 |
| The transaction ID registry | exact text; lengths differ (orders 64, billing none); a race gives an untranslated error; a plan payment checks it only at approval | one shape for every ID (PAY-07's 6 to 20 letters and digits, matched ignoring case, VER-02), claimed when a payment is verified, a clash answered plainly; Slice 5.2 already keeps the page's IDs in capitals and refuses one the registry holds | 5.3 |
| `PlanPaymentsService.approve` | the verifier is an operator | a system verifier too (the listener) | 5.6 |
| A seller's top-up flagged for review | the amount they say they sent is not stored, and approving credits the quoted amount | the amount sent stored and shown to the operator | 5.6 |
| `DATABASE-SCHEMA.md` §3.4, §8 | `payment_sessions` thin and keyed by one column; no Upay; no fee ledger type; `platform_wallets` and `idempotency_keys` missing | §4 of this plan, slice by slice | 5.1 – 5.7 |
| `API-CONTRACT.md` §8 | "plan payments do not create a payment_sessions row" | PAY-21 (D5-3) | 5.6 |
| The payment page, storefront and dashboard drawings | an SMS promise, support chat, a frame, "switch to cash on delivery" | redrawn first, in Slice 5.8 | 5.8 |
| `IMPLEMENTATION-PLAN.md` Phase 5 | a SIM-swap cooldown with no requirement; webhooks inside | this plan | 5.0 |

---

## 3.6 Architecture for this phase

- **Verification is one transaction:** the session marked verified, the payment row through `PaymentRecorder`, the
  transaction ID claimed, the order's payment axis and its move from Unverified to New, the fee
  (`BalanceService.charge` joining the transaction, never blocking it, WAL-21), the audit entry and the staff notice
  queued -- all or nothing, and a second verification of the same session or ID refused by the database.
- **Expiry is one transaction:** the session expired, the order cancelled ("advance not paid") and its stock
  released together (D5-4); a session in `checking` never expires on its own (D5-5).
- **The listener verifies what staff verify:** a receipt is matched to a session by transaction ID, amount and
  sender (VER-02) within its own shop (VER-05); receipts are kept once per shop and transaction ID, so two phones
  verify once (VER-03), and an early receipt waits unmatched (VER-04).
- **Gateways are plugins** (WAL-19), registered by key, their credentials sealed with the SecretBox; every call
  goes through the circuit breaker; the return is never trusted -- the payment is executed or queried (VER-08) and
  each raw callback stored before it is acted on.
- **The payment page runs no outside code** (PAY-23) and finds its shop from the session, never from the host
  (TEN-29).
- **Lytro's own payments** stay in `control` with `plan_payments` as their record (D5-3); a shop's payments stay in
  its tenant schema with RLS.
- **Notices** go through one port per module with a console stand-in, as Phase 4 did (D4-10).

---

## 4. Database work

All in the `tenant` schema with RLS forced, unless marked `control`; money `numeric(12,2)` throughout (DAT-05).

| Table | What | For |
|---|---|---|
| `wallet_accounts` | a shop's accounts by method type (bKash, Nagad, Rocket, Upay; bank transfer): number or bank fields, name, account type, note, active for manual, selected for automated, sealed gateway credentials and the sandbox flag | WAL-01 – 17 |
| `payment_sessions` | keyed `(tenant_id, id)`: amount, the order, method and account, return and cancel addresses, state (§2.4), verification level, expiry, the transaction ID and sender typed, the review reason, the gateway's reference and the fee held | PAY-01 – 08, 13 – 17 |
| `payments` | adds the session, the verification level and verifier (VER-12), and refunds if kept | PAY-15, VER-12, PAY-20 |
| `listener_pairing_codes`, `listener_devices`, `listener_messages` | codes and device tokens as hashes, devices bound to an installation, receipts once per shop and transaction ID, redacted after 90 days | LSN-01 – 23, VER-02 – 07 |
| `payment_page_reports`, the page's suspension | reports per session; a payment page suspended apart from the whole shop | TVR-02, TVR-03 |
| ledger and rates | a verification-fee ledger type; the rate keys for the listener and the gateway | WAL-20, RAT-15, RAT-16 |
| `control.plan_payments` | the session linked, the amount the seller sent | PAY-21 (D5-3) |
| platform settings | the session lifetime (also the stock hold's), the listener's offline minutes, session limits | PAY-03, VER-07, RTE-08 |

---

## 5. API surface for this phase

Every route lands in `API-CONTRACT.md` with its slice; the isolation registry gains each shop-owned one (SEC-02).

- **Dashboard:** payment methods and accounts (`wallets:*`), gateway credentials and the test connection; the
  payments list, search and CSV (`payments:read`); verify and reject (`payments:verify`); listener pairing codes and
  devices (`listener:*`).
- **Public** (`api.lytro.app/v1`, a public key): the shop's payment methods for checkout; a public order needing an
  advance answers with its session and payment address.
- **The payment page** (`pay.lytro.app`, the session ID only): the session's page content and state; the
  transaction ID typed; the gateway's return; "Report this page".
- **The listener app:** pairing, heartbeat and receipt upload, with its device token.
- **Operator:** page reports and the page's suspension, devices and blocking, the fee rates.

---

## 6. Slices

### Slice 5.0: the plan
- **Delivers:** this plan; `SRS-detailed.md` §2.3.1, WAL-01, ORD-08, ORD-52, PAY-03, PAY-14 and INV-16 amended;
  `IMPLEMENTATION-PLAN.md` Phase 5 brought in line. Docs only.

### Slice 5.1: payment methods and accounts
- **Depends on:** this plan (D5-1 amended).
- **Read agreed 2026-10-31:** only the owner changes the accounts shoppers pay into -- `wallets:manage` is never held by a
  staff role, so no staff member can put their own number there; staff with `wallets:read` see them (WAL-07, STF-07
  amended); every owner verifies a phone at sign-up, whatever they signed up with, its code paid by Lytro (the owner's
  pick over asking on the payment methods page; TVR-01, AUTH-28 amended), built with the screens in Slice 5.8, server
  and screen together; until then a shop whose owner has no verified phone shows shoppers no payment method. Also
  settled, for Slice 5.3: an order waiting on its advance is not confirmed or shipped (D5-9). Settled building: the
  accounts use the order payments' method keys (`bkash`, `nagad`, `rocket`, `upay`, `bank`), so a payment and its
  account agree; a wallet keeps a number and an account type, a bank the WAL-14 details; a method's accounts are saved
  as one list, an account named by its id kept in place (so a payment that names it still finds it) and two may swap
  numbers; a method is switched off by a row of its own; Rocket's numbers may carry a twelfth digit; the activity log
  names the active account's number; staff refused a change are told it is the owner's alone; shoppers' list is never
  cached.
- **Delivers:** the method types as a registry (WAL-18); wallet and bank accounts, one active per type, nothing
  activated on its own, a type switched off (WAL-01 – 07, WAL-14 – 17); the owner's verified phone as the page's
  gate (TVR-01); the accounts in the data export and the day-60 deletion (LIF-16, LIF-19).

### Slice 5.2: paying -- the order, its session and the page
- **Read agreed 2026-10-31** (all four as recommended): sessions are limited only by a per-minute flood guard per
  shop, one figure for every plan, like order creation's -- no per-period cap, so a shopper's payment is never refused
  for the shop's plan (RTE-08 amended, RTE-09 withdrawn, KNOWN-GAPS §19 decided); Phase 5's sessions always belong to a
  Lytro order, the amount set by the server, while a session for any amount with no order (PAY-01's other form,
  PAY-02's cap) waits for webhooks and secret keys in Phase 8; staff may make a payment link for an order to send by
  message, which only expires, never cancelling a staff order (PAY-24 added); and the slices are re-cut as paying
  (5.2) then verifying (5.3), since a session needs an order waiting on its payment. Settled building: two parts --
  **5.2a** an order paid at checkout, its session and the page; **5.2b** payment links, the flood guard, and "Report
  this page" with the operator's suspension. In 5.2a: a session is opened in the order's own transaction, with the
  Idempotency-Key's reply, so a replay gives the same page; its reference is 128 random bits in 22 characters,
  found by the page through `control.payment_session_refs`, never the host (TEN-29); its lifetime is the stock hold's
  setting, and the session's minute pass alone lets a checkout's stock go, with the order's cancellation; the
  return addresses must be on the key's websites (PAY-04); a cash-on-delivery order ignores a payment it doesn't
  need; the page reads the shop's name and logo and the methods on now, never another of the shop's brand settings;
  the page's requests are not counted against the shop's API requests, only the visitor's per-minute window; the
  transaction ID is kept in capitals and one the registry holds is refused, the registry itself claimed at
  verification (Slice 5.3); tracking shows an unverified order's open payment, to go back to.
- **Delivers (5.2a):** a shopper's order needing an advance placed `unverified` with its session (PAY-01, LND-10,
  SFT-06, SFT-07, SFT-10, ORD-07, WAL-08, WAL-17), its amount set by the server (PAY-02), single use and its window
  (PAY-03, D5-5, INV-16), the return address allow-list (PAY-04); the page's content and state reads (PAY-05's data,
  PAY-17, PAY-22) and the transaction ID typed (PAY-07, PAY-16); the redirect's status (PAY-08); the window's end
  cancelling an unpaid order (D5-4); session IDs of 128 bits (PAY-23).
- **Delivers (5.2b):** payment links (PAY-24); the flood guard (PAY-13, RTE-08); "Report this page" and the
  operator's suspension (TVR-02, TVR-03).

### Slice 5.3: verifying by hand
- **Delivers:** verification by hand and review (VER-01, PAY-14, VER-12) settling the order once (PAY-15, ORD-08);
  rejection cancelling it (D5-4); the payments list and CSV (PAY-19); the new-tenant volume limit (TVR-04); sessions
  on the usage page and in the downgrade checklist (LIM-02, LIM-04, TRL-03, PLN-19, DWN-12, DWN-14, DWN-15, UPG-10);
  the audit entries (AUD-01).
- **Rework:** §3.5's rows for this slice.

**Checkpoint "5A" after this slice:** shoppers pay an advance and staff verify it by hand, end to end (exit
criterion 2 by hand, and 3). If velocity suggests it, the rest can become Phase 5B without re-planning.

### Slice 5.4: the listener, on the server
- **Delivers:** pairing codes, devices and tokens (LSN-01, 02, 09 – 12, 19 – 22), heartbeats and online status
  (LSN-03, VER-07), uploads and their limits (LSN-13 – 16, LSN-18), the tenant-state gate (LSN-07) and device limits
  (LSN-08); bKash's receipt parser (LSN-06); matching (VER-02 – 06); the listener fee and its short-balance path
  (WAL-20, WAL-21, RAT-16); the test mode (LSN-04), redaction and purge jobs (LSN-05, LSN-17); devices removed at
  day 60 (LSN-23).

### Slice 5.5: the listener app
- **Delivers:** the Android app: pairing by QR or code, reading receipt SMS from allowed senders in the background,
  uploading with an offline queue, heartbeats, its version check and its status screens (LSN-24), sketched first.

### Slice 5.6: Lytro's own payments on the page
- **Delivers:** plans, add-ons and top-ups paid through a session to Lytro's wallets with no fee and no session limit
  (PAY-21, AUTH-29, BIL-03, BAL-03, PLN-14), verified by Lytro's own listener phone or the operator's queue;
  activation unchanged (BIL-05).
- **Rework:** §3.5's rows for this slice.

### Slice 5.7: bKash's gateway
- **Depends on:** bKash's sandbox access (D5-7).
- **Delivers:** gateway credentials, sealed, with the sandbox flag and the test connection (WAL-09, WAL-12, WAL-13);
  the account selected for automated payments, a payment finishing on its own account (WAL-10, WAL-11); the plugin
  (WAL-19); straight to bKash's checkout and back through `pay.lytro.app` (PAY-01, PAY-06); execute, query and
  idempotent callbacks (VER-08, VER-09); errors and test payments (VER-10, VER-11); the gateway fee held, charged or
  released (WAL-20, WAL-21, RAT-15).

### Slice 5.8: the screens
- **Sketch first** (`sketch-every-screen-before-building`): the payment page redrawn to PAY-05 and §2.1's 5.8 row
  from `brand/lytro-payment-page.html`; checkout's payment step and its return on the storefront and landing page;
  the dashboard's Payment methods, Payments (to verify, list, CSV), listener pairing and devices; Lytro's own
  payments opening the page; the operator's page reports, suspension, devices and fee rates.
- **The sign-up phone** (Slice 5.1's read): the step after a Google, Facebook or email sign-up that verifies a phone,
  sketched with the rest, then server and screen together (AUTH-28 amended).
- **Builds** them, pixel perfect to the approved sketch.

---

## 7. Slice dependencies and order

```
Slice 4.8 built
      │
      ▼
5.0 plan ──► 5.1 methods ──► 5.2 sessions ──► 5.3 orders paid, by hand  ◄── checkpoint 5A
                                                    │
                       5.4 listener (server) ◄──────┤
                       5.5 listener app ◄── 5.4     │
                       5.6 Lytro's own ◄── 5.4      │
                       5.7 bKash's gateway ◄────────┘
                                 all backend slices ──► 5.8 the screens
```

| Slice | Depends on | Can run in parallel with |
|---|---|---|
| 5.1 Methods and accounts | 4.8 | — |
| 5.2 Sessions | 5.1 | — |
| 5.3 Orders paid online | 5.2 | — |
| 5.4 Listener, server | 5.3 | 5.7 |
| 5.5 Listener app | 5.4 | 5.6, 5.7 |
| 5.6 Lytro's own payments | 5.4 | 5.5, 5.7 |
| 5.7 bKash's gateway | 5.3, sandbox access | 5.4 – 5.6 |
| 5.8 Screens | 5.1 – 5.7 | — |

**Suggested order for one developer:** 5.0 → 5.1 → 5.2 → 5.3 (checkpoint 5A) → 5.4 → 5.5 → 5.6 → 5.7 → 5.8 (D5-2).

---

## 8. Non-functional requirements for this phase

- **Money moves exactly once:** every path that verifies, cancels, refunds or charges a fee has a test that runs it
  twice and at once from two callers, and the ledger, the payments and the order agree after it.
- **Integrity:** an order's paid amount re-derives from its payments; a session's fee from its ledger entries; the
  transaction ID registry holds one row for each ID in use.
- **Security:** RLS on every new table; tokens and pairing codes kept only as hashes; gateway credentials sealed and
  never returned (WAL-09); no provider's raw error text on the page or in a reply (SEC-16, rechecked on every payment
  error path); the payment page's policy (PAY-23); the isolation registry covers every new route.
- **Performance:** `EXPLAIN ANALYZE` on session creation, matching and the payments list; the page's state read
  within PRF-03's 500 ms, polled every 3 seconds (PAY-17).
- **Language:** every new string in Bangla and English, in the owner's style guide; amounts and transaction IDs in
  Western digits.

## 9. Risks

| Risk | Mitigation |
|---|---|
| A bug moves real money wrongly (double credit, a payment lost) | one transaction per money event (§3.6), database constraints for "exactly once", exit criterion 4, and a deliberate-break pass on every money rule |
| Google Play refuses an app that reads SMS | Slice 5.5's read settles distribution first; a signed APK works without the store |
| bKash's sandbox or merchant access takes weeks | apply before Slice 5.4; 5.7 comes last and can wait without holding the rest |
| bKash changes its receipt wording | the parser has its sample suite (LSN-06); an unrecognised receipt is ignored, so the payment falls back to staff, never to a wrong match |
| A shop's balance runs out | the shopper is never blocked (WAL-21); the fee is skipped into free review with a low-balance notice |
| Money arrives after the order was cancelled | staff review (D5-4); nothing reopens on its own |
| Phase size (nine slices) | checkpoint 5A after Slice 5.3; the rest can become Phase 5B without re-planning |
| Handling money for shops needs a licence | money never passes through Lytro; the legal check (OD-08) is Phase 9's, before launch |

## 10. Definition of done (per slice)

Same as Phase 4, plus the money rule in §8:
- its own branch and PR
- every listed requirement proven by a test written against its pass criteria
- a sabotage-confirm-restore pass on the slice's central rule, and on every money rule it adds
- `typecheck`, `lint`, `build` and every package's tests clean, the full server suite, and a real boot of the built
  server
- the isolation registry updated for any new shop-owned route
- `KNOWN-GAPS.md` updated if anything listed here turns out not to hold
- this plan's slice entry marked shipped with its PR number
