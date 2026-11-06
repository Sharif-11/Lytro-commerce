# Phase 5 plan: payments

Status: agreed 2026-10-31 — the decisions in §2 were settled in the Phase 5 read the same day. Builds on
`IMPLEMENTATION-PLAN.md` Phase 5, with these changes agreed before this plan was written:

- **Built after Phase 4's screens.** The plan is written now; building starts once Slice 4.8 is built (D5-1). Amended
  2026-10-31: the backend slices start now, beside Slice 4.8; the screens (Slice 5.8) still wait.
- **Three verification levels, one after another:** verification by hand first, usable on its own, then the SMS
  listener, then bKash's gateway (D5-2). Checkpoint 5A comes after verification by hand.
- **Lytro's own payments** (plans, add-ons, top-ups) are verified by Lytro's own listener phone, in the dashboard's own wallet
  step (D5-3, amended 2026-11-03).
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
free. Lytro's own payments from sellers use the same listener, from the dashboard's own wallet step.

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
6. **Lytro's own payments:** a plan bought in the dashboard's wallet step, verified by Lytro's own listener phone,
   activates once, with no fee and no session limit (PAY-21).
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
| D5-3 | **Lytro's own payments** (plans, add-ons, top-ups). Sellers send money to Lytro's wallet and type the transaction ID in the dashboard, and the operator approves each one (D2-1); PAY-21 puts them on the same engine as shoppers'. | They move onto the payment page with the listener (Slice 5.6), Lytro's own listener phone verifying them; until then today's wallet step and the operator's queue stay. `control.plan_payments` stays their record, each linked to its session. A gateway for Lytro's own payments (ADM-10) may come later (the owner's "we may have automated checkout in future"). **Amended 2026-11-03** (Slice 5.6's read, the owner's pick): sellers stay in the dashboard's wallet step, already built to the approved design, since what they lacked was automatic checking; Lytro's own phone verifies what they type there, and the operator's queue takes the rest. They do not move to the payment page, and a later gateway can open from that step. | Slice 5.6 |
| D5-4 | **An advance nobody paid.** PAY-03's session lasts 30 minutes and INV-16's stock hold with it; ORD-08 sends an order with a rejected payment to `rejected`. | Cancelled automatically (the owner's pick over leaving it to staff): when the window ends with no transaction ID typed, the order is cancelled with a new reason, "advance not paid" (ORD-52), its session expired and its stock released, in one transaction. A payment staff reject cancels the order the same way. Money that turns up later -- a receipt or a transaction ID for a cancelled order -- goes to staff review and never reopens the order on its own. §2.3.1, ORD-08, ORD-52, PAY-14 and INV-16 amended. | Slice 5.3 |
| D5-5 | **A transaction ID typed but not yet checked.** By hand, staff may take hours to check one. | Typing the transaction ID inside the window stops the clock: the session waits in `checking`, and the order and its stock hold wait until the payment is verified or rejected. Only an order nobody paid for within the window is cancelled on its own. PAY-03 and INV-16 amended. | Slice 5.3 |
| D5-6 | **Wallets for manual payment.** WAL-01 lists bKash, Nagad and Rocket; the payment page design, ORD-15 and the payment methods already built include Upay. | bKash, Nagad, Rocket and Upay (wallet kind) and bank transfer (bank kind). WAL-01 amended. The listener reads bKash's receipts first, and the others once real samples arrive (LSN-06). | Slices 5.1, 5.4 |
| D5-7 | **Gateways.** | bKash's tokenized checkout only; Nagad's later (OD-07). Lytro applies for bKash's sandbox early enough for Slice 5.7. Amended 2026-11-03: the owner chooses for each wallet how its money is taken -- automated checkout, the listener or by hand (PAY-06). | Slice 5.7 |
| D5-8 | **Moved out of this phase.** PAY-09 – 12 (signed webhooks, their retries, the secret-key read and cancel) are must-haves, but webhooks and secret keys are Phase 8 (D4-5). | They go to Phase 8, with the shop API. Phase 5 serves Lytro's own storefront, landing pages and staff, which read a session's state from the server. | Scope |
| D5-9 | **A prepaid order's flow** (agreed in Phase 4's read, D4-3). | Unverified until its payment is verified, then New (`pending`) and the usual confirming call (ORD-51). An order waiting on its advance is not confirmed or shipped (agreed 2026-10-31 in Slice 5.1's read); staff who received the money another way record it (ORD-22), which verifies it. Agreed 2026-11-06 (the close-out, the user's pick): an advance voided or refunded after it was verified leaves the order plain unverified, free to confirm and ship; staff decide whether it still needs one. | Slice 5.3 |

### 2.1 Points left to each slice's read

Each is settled in its slice's read, before code, and recorded there.

| Slice | To settle |
|---|---|
| 5.1 | Settled in its read, 2026-10-31 (below). |
| 5.2 | Settled in its read, 2026-10-31 (below). |
| 5.3 | Settled in its read, 2026-10-31 (below). |
| 5.4 | Settled in its read, 2026-11-01 (below). |
| 5.5 | The technology, installing and screens settled in its sketch's read, 2026-11-02 (below); the device-integrity check (LSN-25, off by default) stays undrawn. |
| 5.6 | Settled in its read, 2026-11-03 (below). |
| 5.7 | Settled in its read, 2026-11-03 (below). |
| 5.8 | Five parts, each with its own read (agreed 2026-11-04, below). Parts 1 and 2 are settled (below). |

---

## 3. Requirement coverage

Rules used below: **completed** means every pass criterion is provable by the end of this phase; **partial** means
this phase builds a working part and a named later phase finishes it. Notices delivered through a stand-in port
(D4-10) count as complete.

### 3.1 Completed by this phase

| Family | Requirements |
|---|---|
| WAL | WAL-01 (amended) – WAL-21 (WAL-18's registry by a manual check, §11; retiring a type in §3.2) |
| PAY | PAY-01 – 08, 13 – 17, 19 – 23 (Slice 5.3's read kept PAY-20; PAY-18 withdrawn 2026-11-04) |
| VER | VER-01 – VER-12 |
| LSN | LSN-01 – LSN-24 (the should-haves as Slice 5.4's read settles) |
| TVR | TVR-01 – TVR-04 |
| RAT | RAT-15, RAT-16 |
| From Phase 4's partials | ORD-07, ORD-08 (payment events), SFT-06 (payment methods), SFT-07, SFT-10, LND-10, INV-16, RTE-08 (payment sessions), API-07 (payment sessions), API-11 (required on sessions), LIM-02, TRL-03, PLN-19, DWN-12, DWN-14, DWN-15, UPG-10 (sessions and devices), AUD-01 (verified by the listener or the gateway), LIF-16, LIF-19 (payments, wallet accounts, devices, credentials); ORD-44 with PAY-20 |
| Lytro's own payments | PAY-21 and the wallet step's part of AUTH-29, BIL-03, BAL-03 and PLN-14 (D5-3, amended 2026-11-03) |

### 3.2 Partially completed by this phase

| Req | Done in this phase | Remaining | Finished in |
|---|---|---|---|
| VER-01, VER-07, VER-10, PAY-15 | the staff notices through stand-in ports | push and SMS ("payment verified", "payment needs verification") | Phase 7 |
| LSN-06 | bKash's receipts | Nagad, Rocket and Upay as real samples arrive | when samples arrive |
| SEC-11 | a gateway credential's use logged per shop in `tenant.gateway_credential_uses`, for the operator (Slice 5.7) | the full security pass | Phase 9 |
| RTE-08, RTE-09 | session windows on the in-process limiter (D4-13) | exact counters in PostgreSQL (RED-11) | Phase 9 |
| OBS-08 | the scripted order-and-payment check (`apps/server/scripts/order-payment-check.ts`), proven against a server; its run on staging for this phase's milestone waits for a staging deployment (§11) | monitored probes | Phase 9 |
| WAL-18 | the types as a registry, checked by hand (§11) | retiring a type, with the couriers' retire-then-remove lifecycle (CRR-23, CRR-24) | Phase 8 |
| LIM-04 | nothing: its only piece here, the session counters, went with RTE-09 (withdrawn 2026-10-31) | reconciling the counters on a live deployment | Phase 9 |

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
| A seller's top-up flagged for review | the amount they say they sent is not stored, and approving credits the quoted amount | the amount sent stored and shown to the operator, and what arrived credited (agreed 2026-11-03) | 5.6 |
| `DATABASE-SCHEMA.md` §3.4, §8 | `payment_sessions` thin and keyed by one column; no Upay; no fee ledger type; `platform_wallets` and `idempotency_keys` missing | §4 of this plan, slice by slice | 5.1 – 5.7 |
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
| `control.plan_payments`, `control.lytro_listener_messages` | the amount the seller sent, what arrived, and why it waits; what Lytro's own phones forwarded (Slice 5.6, amended 2026-11-03) | PAY-21 (D5-3) |
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
- **5.2b read agreed 2026-10-31** (all four as recommended): a payment link stays open **24 hours** -- staff send
  it, the order and its stock are unaffected, and staff make another if it lapses; it asks for **the advance still
  owed, else what is due**, and staff may switch it to the whole amount due; making one needs **`orders:manage`**;
  "Report this page" takes **a short list and a note** -- asked for my PIN or code, not the shop I ordered from, the
  amount is wrong, or something else with a note -- [5] an hour from one visitor (PAY-24 and TVR-02 amended).
  Settled building: the flood guard is checked just before a checkout opens its session, so a cash-on-delivery order
  never meets it; past it the order is refused with `429`, counted in the shop's usage (`refused_sessions`); its
  figure is a platform setting (`payment_sessions_per_shop_per_minute`, 60). Staff orders and links are not held by
  it, as order creation's guard holds only shoppers'. A link closes the order's session still awaiting money -- a
  checkout's too, staff taking the order over, so its window's end no longer cancels it -- and a payment being
  checked refuses one. A link has no return address: the page is where the shopper ends. A link needs no
  Idempotency-Key; made twice, the second replaces the first. Reports are counted per visitor in the database,
  across shops, so the limit holds with more than one server. The operator's queue lists reports with their shop and
  the page to open; suspending a page acts on the shop's open reports. A suspended page answers `403 tenant_offline`
  ("unavailable -- don't send money for it"), checkout offers no method (`no_payment_method`) and links are refused;
  the public API sees a suspension within its few-second shop lookup (TVR-03's minute). The reports go with the
  day-60 deletion (LIF-19).
- **Delivers (5.2b):** payment links (PAY-24); the flood guard (PAY-13, RTE-08); "Report this page" and the
  operator's suspension (TVR-02, TVR-03, ADM-12's queue, its screens with the operator console).

### Slice 5.3: verifying by hand
- **Read agreed 2026-10-31** (the first six as recommended): Meta's `Purchase` for an order paid in advance is sent
  **when its payment is verified** (a cash-on-delivery order's still on placing); staff **verify the amount that
  arrived**, never more than is due, the rest staying due; **refunds now** as a record (PAY-20, ORD-44), proof images
  with the page in Slice 5.8 (PAY-18, since withdrawn: Slice 5.8's part 2 read); the **new-shop cap on for new pay-as-you-go shops** (20,000 TK a day for their
  first 30 days), off on a plan, switched per shop by the operator; **one payments list** of every typed ID and every
  payment, "to verify" one of its statuses; a rejection's reason from **a short list and a note**; and **one PR** (the
  owner's pick over two). PAY-07, PAY-14, PAY-19, TVR-04, LND-16, LIM-02, DWN-15 and UPG-10 amended. Settled building:
  verifying records the order's payment through the same recorder staff payments use -- the amount checked against
  what is due, the ID claimed in the platform registry (a clash answered "already used", for staff to reject), the
  payment marked with its session and level (`manual`), the order's status worked out again -- and the session marked
  verified, in one transaction; it lives in its own module (`payment-review`) since a verified checkout queues Meta's
  event, which the public API owns. Rejecting a checkout's payment cancels its order (`advance_not_paid`, D5-4); a staff
  link's leaves the order, as an unpaid link does. Staff with `payments:verify` are told of each typed ID through a
  stand-in notifier until Phase 7 (VER-01); a notice that fails changes nothing. A wallet ID has one shape everywhere,
  6 to 20 letters and digits kept in capitals (the page, staff payments, plan, add-on and top-up payments); a bank
  reference stays looser; migration 0097 puts the registry's IDs in capitals, keeping an ID's first use where two
  differed only by case. A refund stops a payment counting as a void does; a refunded payment is never voided or
  refunded again (the database's guard); the order shows `refunded` once every live payment is. The new-shop cap counts
  the day's verified online payments and the sessions still open, checked as a checkout or a link opens a session; a
  cash-on-delivery order never meets it. A customer's privacy delete clears the number they paid from on their orders'
  sessions (CUS-09). The payments list's CSV holds up to 10,000 rows. Sessions' mentions in the plan limits (LIM-02,
  DWN-15, UPG-10) go, as RTE-09 was withdrawn.
- **Delivers:** verification by hand and review (VER-01, PAY-14, VER-12) settling the order once (PAY-15, ORD-08);
  rejection cancelling it (D5-4); the payments list and CSV (PAY-19); the new-tenant volume limit (TVR-04); sessions
  on the usage page and in the downgrade checklist (LIM-02, LIM-04, TRL-03, PLN-19, DWN-12, DWN-14, DWN-15, UPG-10);
  the audit entries (AUD-01).
- **Rework:** §3.5's rows for this slice.

**Checkpoint "5A" after this slice:** shoppers pay an advance and staff verify it by hand, end to end (exit
criterion 2 by hand, and 3). If velocity suggests it, the rest can become Phase 5B without re-planning.

### Slice 5.4: the listener, on the server
- **Read agreed 2026-11-01** (all six as recommended): **all four should-haves now** -- test mode (LSN-04), the purge
  (LSN-05), the volume flag (LSN-14) and redaction after 90 days (LSN-17); a **pay-as-you-go shop may listen, with 1
  phone** (LSN-07 and LSN-08 amended); a match whose fee the balance cannot cover goes to **free review by hand**, as
  WAL-21 says, with a low-balance notice; **bKash's parser is built now** from the known receipts (money received,
  cash out at an agent, a merchant payment), checked against real receipts before the app ships (5.5), an unknown
  format ignored and so verified by hand; **two parts**, 5.4a the phones and 5.4b the receipts; and, from 5.3, **an
  order's page awaiting money closes** once staff record its advance in full, so the shopper cannot pay twice.
  Settled building 5.4a: codes and phones live in control, as API keys do, since the app is found by its code or token
  before its shop is known; a code is 8 letters from an alphabet without look-alikes, kept only as its SHA-256 hash,
  open 10 minutes, made only while the shop may listen and has a phone left; a token is 32 random bytes, kept as its
  hash, shown once. Every app call names its installation (`x-installation-id`) and version (`x-app-version`) and is
  checked live -- the token, the phone's revocation (401 with the reason, which the app shows), its installation (a
  call from another flags the phone; the third flag revokes it and tells its owner and Lytro), the shop's state
  (`tenant_offline`) and the minimum version (`app_update_required`, a new 426 code, LSN-18) -- so a revocation or a
  state change shows on the next call (LSN-07, LSN-19). A wrong code names no code, so LSN-10's ten tries per code
  count the refusals of a code that was found (a blocked installation, a shop that may not listen, the plan full); a
  caller's five failures count every refusal. The device limit is the shop's composed limit (its plan, overrides and
  add-ons); Growth's 2 and Pro's 5 are set in migration 0098. Pairings, revocations, flags and limit refusals are in the
  shop's activity log and the platform's audit log (LSN-22); a block of an installation revokes its phones in every
  shop. The purge runs daily: codes a day after they are spent or run out, phones 30 days after revocation. A page
  closes when a payment leaves the order paid; a part leaves it open, and one where the shopper typed an ID waits for
  staff.
- **Slice 5.4b's read agreed 2026-11-02:** **no amount cap**, the owner's call over a recommended 10,000 TK cap, told that a
  forged sender name could release a large order; a match verifies by itself at any amount. **A receipt from more than
  5 minutes before the page opened goes to staff** (VER-04 amended), so money paid for something else cannot be reused.
  **No listener fee during a trial** (WAL-20 amended), since a new shop's balance is 0.00 and it would never see the listener
  work. **Unclaimed receipts are a list staff with `payments:verify` read and search, with no notices,** and recording a
  payment with that ID uses the receipt. **A shopper may correct a typed ID up to 3 times until someone decides** (PAY-07
  amended; the page's button stays on its later waiting states). **Of an unreadable message from the wallet's own sender
  Lytro keeps a masked shape and a daily count** (VER-06 amended). **One PR**, the owner's pick over two parts. It also takes
  the four additions in `LISTENER-APP-DESIGN.md` §7. Stated as following the requirements: one sender list for every shop
  (LSN-16 amended); with a phone online staff hear after 5 minutes, with none at once (VER-07 amended); other wallets never
  wait on a phone. Settled building it: a receipt and a typed ID take turns on an advisory lock on the shop's ID, and
  matching runs inside the typing's transaction, so a receipt already in verifies at once and neither can miss the other. A
  phone sending its own receipt again adds nothing and is told how it stands; another phone's copy is a `duplicate`. Only
  money reaching the account is a receipt, so a shop's own payments never verify anything. Short-balance, old-receipt and
  closed-order reviews show the shopper only "the shop will check" (`review.reason: other`), never the shop's balance. A
  message that could not be taken comes back with a null status, for the app to send again; its text is never logged. Staff
  rejecting a payment, or voiding one, leaves its receipt unclaimed again. The payment page's routes moved to their own
  module, at the same addresses, because typing an ID now reaches the verifying, which reaches the public API for Meta. A
  customer's privacy delete clears their number and text from receipts too (CUS-09 amended).
- **Delivers (5.4a):** pairing codes, devices and tokens (LSN-01, 02, 09 – 12, 19 – 22), heartbeats and online
  status (LSN-03), the tenant-state gate (LSN-07) and device limits (LSN-08), the minimum app version (LSN-18), the
  purge (LSN-05), devices removed at day 60 (LSN-23).
- **Delivers (5.4b):** uploads and their limits (LSN-13 – 16), bKash's receipt parser (LSN-06), matching (VER-02 – 06),
  the page's offline notice (VER-07), the listener fee and its short-balance path (WAL-20, WAL-21, RAT-16), the test
  mode (LSN-04), the volume flag (LSN-14) and redaction (LSN-17); correcting a typed ID (PAY-07), staff's list of receipts,
  the masked shapes for Lytro (VER-06), and for the app the shop's numbers and senders on its answers, its recent receipts
  and counts, and a phone unpairing itself.

### Slice 5.5: the listener app
- **Sketch's read agreed 2026-11-02** (Kotlin the owner's call, the rest as recommended):
  **Kotlin**, native Android, since the app's real work is Android's own, with OD-52's React Native staying for the admin
  app; the home screen shows **the status, today's counts and recent receipts**; installed as **a signed APK from Lytro**,
  Google Play perhaps later; **Bangla with an English switch**; and the sketch draws **the app only**, the dashboard's
  phones page staying in Slice 5.8. Design in `LISTENER-APP-DESIGN.md`, prototype in `docs/brand/lytro-listener.html`. Its §7
  lists four additions for Slice 5.4b: the shop's numbers and senders on the app's answers, recent receipts and counts,
  a phone unpairing itself, and test mode started from the phone (LSN-04 amended).
- **Build's read agreed 2026-11-03** (all as recommended): it **looks back through the inbox** on boot and at each report,
  so it needs `READ_SMS` as well as `RECEIVE_SMS`, and only money-looking messages leave the phone; **the signing key stays on
  the owner's computer** with a backup, PRs build with a throwaway debug key, one command per release, nothing that signs a real
  release on GitHub; **two parts**, 5.5a core and 5.5b the rest of the sketch; **real phones are Xiaomi, Redmi and POCO only**,
  so Oppo, Vivo and Samsung's battery paths stay unverified until someone can test them. Stated: `apps/listener-android` with its
  own CI job, Android 7 and later, Jetpack Compose, emulator tests with injected SMS, the download page with 5.8's screens.
- **5.5a's plan agreed 2026-11-03:** Android 15's block on SMS for an app installed from a browser was **tested and is real**,
  so a help screen was drawn and built; the SIM question **lists all the shop's numbers**, and with none says so and carries on;
  **a pairing link pairs straight away** (the owner's pick over the recommended filling the boxes, told a link sent by someone
  else could pair the phone with their shop); the look-back **never reaches behind this phone's pairing** (recommended).
- **Delivers (5.5a):** pairing by QR, link or code with every refusal; the SMS permission with Android's block, notifications
  and the test; the receiver, the inbox's look-back and the filter; the private queue and its uploads; heartbeats; Home's
  working, nothing yet, no internet, SMS off and no bKash number states. A revoked phone stops, clears its token and saved
  messages, and goes back to pairing; an inactive shop or an old app holds its receipts.
- **5.5b's read agreed 2026-11-03** (as recommended unless said): each report also carries **the phone's and the shop's names**
  and the receipt list **the sender**, two small server additions; the menu shows **just the version**, since the server knows only
  the oldest it accepts; the **signing key is made at the first real release**, with a key-making command and one release command
  that refuses without a key; the **battery warning clears once Android's exemption is on and the maker's setting has been opened**
  from our button, since no app can read Autostart; **Oppo, Vivo and Samsung show their drawn steps with a caution**, unverified;
  **support and Help open the same WhatsApp as the dashboard**, hidden without a number; **one PR, merged on green CI** (the owner's
  pick over testing on the Xiaomi first), so what that test finds becomes a follow-up.
- **Delivers (5.5b):** the stopped screens (LSN-24), at pairing too; the battery step by maker and Home's warning; test mode
  (LSN-04); the menu and unpairing from it; updates and problem notifications; the release command. On the server, the names on the
  report and pair answers and the sender on `GET /v1/listener/messages`.
- **Still between it and a shop:** the Xiaomi test with real bKash money, real receipts for the parser, the makers' paths on real
  phones, the download page and setup guide (5.8), the signing key and its backup, the support number.

### Slice 5.6: Lytro's own payments on the page
- **Read agreed 2026-11-03** (the first, third and fourth as recommended): **sellers keep the dashboard's wallet step**, and
  Lytro's own phone verifies what they type there (D5-3 amended; PAY-21, BIL-03, BAL-03, PLN-14 and AUTH-29 amended); **no
  amount cap**, the owner's pick over a recommended 10,000 TK, told that a forged sender name would cost Lytro itself, in
  real balance or an active plan; **what arrived is what counts** -- the amount sent is stored and shown to the operator,
  a top-up credits what arrived, and a plan or add-on at the wrong amount stays in the queue, where the operator approves
  it or puts the money on the balance (BIL-06 amended); and **one PR**. Stated, no objection: no fee or session limit
  (PAY-21); late money goes to the queue (BIL-15); Nagad stays by hand until samples arrive. Settled building: Lytro's
  phone has no shop behind it -- its device and code rows have no tenant, and its receipts live in their own table,
  `control.lytro_listener_messages`, since a hidden "Lytro" shop would meet every sweep, list and deletion. To the app it
  looks like any shop: the same routes, `shopName` "Lytro", `accounts` Lytro's bKash numbers. The operator makes its code
  (`POST /operator/lytro-listener/pairing-codes`). Receipts follow the shops' rules -- the amount within 0.01 TK, the sender
  the seller gave, after the quote less 5 minutes -- and a match runs the queue's own step, with no verifier (the
  `system` actor in the platform log). A receipt beats what a seller typed: a mistyped amount still verifies when the
  money is right, and with no receipt the operator's approval credits the quote unless they say otherwise, so typing a
  large figure credits nothing. A plan's money put on the balance turns its row into the top-up it now is, using its ID for
  good and cancelling the add-ons it carried. A decision settles the receipt: approved it is used, turned down it is
  unclaimed again.
- **Delivers:** plans, add-ons and top-ups typed in the dashboard's wallet step, verified by Lytro's own listener phone or
  the operator's queue, with no fee and no session limit (PAY-21, AUTH-29, BIL-03, BAL-03, PLN-14); activation unchanged
  (BIL-05).
- **Rework:** §3.5's rows for this slice.

### Slice 5.7: bKash's gateway
- **Read agreed 2026-11-03:** **the owner chooses how each wallet's money is taken** -- automated checkout, listener
  verification or by hand, the user's own answer over the two options offered (PAY-06 amended). It is **per wallet**, and
  only bKash has all three today; the others stay by hand until samples arrive, and a bank always is. Every wallet **starts on the
  listener** where it can be read, existing shops included, so nothing changes until an owner chooses. **By hand means staff
  decide, even with a phone paired**: a receipt never verifies and pays no fee, and waits beside the payment for staff. **The fee
  is held, not charged and reversed**: an open checkout holds it, the balance spendable is the balance less what is held, and a
  hold ends by itself as its session closes, so none can stick (WAL-21). **Free on a trial too**, as the listener (WAL-20
  amended). **One PR.** Stated, no objection: credentials are the owner's alone; automated needs credentials that open; if the
  gateway can't start or the fee can't be held the shopper pays on the page, never blocked; after a cancel or failure the shopper
  retries or pays by hand while the window lasts; refunds stay a record; CI uses a fake bKash, and the real sandbox runs only by hand
  from a local file outside every repo; SEC-11's log is per shop, in its own table, for the operator.
- **Settled building:**
  - The checkout always starts from the page: an order's reply gives the page's address, and the page calls
    `POST /v1/pay/:ref/checkout` and follows the answer. A storefront checkout that already knows the wallet gets the same
    address, and Slice 5.8's page goes straight on. The page's routes sit above the verifying, so `PublicOrderService` can't reach
    the gateway without a cycle.
  - A cancelled or failed try leaves the session open with `gatewayResult` beside it until its window ends (VER-09 amended), which is what lets
    PAY-08's retry and paying by hand both work.
  - Money only moves at execute, so execute is never asked for an order cancelled, or owing less than the page asks, while the
    shopper was at bKash; they are never charged for it, and money that moved anyway goes to staff with no fee.
  - bKash blocks an app for an hour past two token calls, so the count comes from the use log, which a restart doesn't
    forget, shoppers arriving together share one call, and a test of a connection spends nothing while a token is held. A third call
    isn't made: the old token serves if there is one, otherwise the shopper pays on the page (KNOWN-GAPS §107 on several servers).
  - The fee charged is the amount held, not the rate at verification, so a raised rate never asks for more than was set aside.
    A balance frozen or run down meanwhile charges nothing, for the shopper has paid. A fee that rounds to nothing holds nothing.
  - A test account also stays out of the fee, the payment totals, sales and the new-shop cap.
  - A checkout that ran out with no return is asked after by a minute pass (`gateway_reconcile_tick`), before the sessions'
    own pass closes it, and a payment the shopper authorised is executed. With bKash unreachable it keeps asking for an hour past
    the window, then lets go.
  - The real sandbox, 2026-11-03: the v2 addresses and the token, starting a payment and asking after it all work; the bare token and
    "Bearer" are both taken, so the code stays on the bare one; the checkout's address comes back as `bkashURL`, not the documents'
    `bKashURL`; a refusal is an HTTP 400 with its code. A completed answer is still unseen (KNOWN-GAPS §107), so its transaction is read
    under both spellings, and one called completed that can't be read is never let go as unpaid. Past execute, whatever it says short of
    completed, bKash's own record is asked. A checkout with no answer for an hour past its window lets go, and the owner hears, as money may
    have moved.
  - The owner hears of a gateway failure through `PaymentNotifier.gatewayNeedsAttention`, a stand-in until the notification phase,
    as the other payment notices are. The test connection answers bKash's code, never its words (WAL-13 amended, SEC-16).
- **Depends on:** bKash's sandbox access (D5-7).
- **Delivers:** gateway credentials, sealed, with the sandbox flag and the test connection (WAL-09, WAL-12, WAL-13);
  the account selected for automated payments, a payment finishing on its own account (WAL-10, WAL-11); the plugin
  (WAL-19); straight to bKash's checkout and back through `pay.lytro.app` (PAY-01, PAY-06); execute, query and
  idempotent callbacks (VER-08, VER-09); errors and test payments (VER-10, VER-11); the gateway fee held, charged or
  released (WAL-20, WAL-21, RAT-15).

### Slice 5.8: the screens
- **Sketch first** (`sketch-every-screen-before-building`): the payment page redrawn to PAY-05 and §2.1's 5.8 row
  from `brand/lytro-payment-page.html`; checkout's payment step and its return on the storefront and landing page;
  the dashboard's Payment methods, Payments (to verify, list, CSV), listener pairing and devices; the operator's page reports, suspension, devices and fee rates.
- **The sign-up phone** (Slice 5.1's read): the step after a Google, Facebook or email sign-up that verifies a phone,
  sketched with the rest, then server and screen together (AUTH-28 amended).
- **Builds** them, pixel perfect to the approved sketch.
- **Part 5's read, the console, agreed 2026-11-04** (all the recommended picks). It runs beside parts 2 to 4, in its own
  session. **All of it:** the sketch's 59 screens and the Phase 5 screens, with add-ons, shop types, attributes and option
  sets last, so the owner can stop before them. **The sign-in limit is built now:** `/auth/operator/signin`, `enroll` and
  `verify` had no limit, so AUTH-14's rule applies and ADM-01 is amended. **PRs by area:** the sketch
  (`OPERATOR-CONSOLE-DESIGN.md` v3); the server's missing reads and the limit (§15 there); frame, sign-in and account; Today
  and the queue; shops; the Phase 5 screens; pricing and platform; catalogue. **Tests as the dashboard's:** Playwright
  against a mocked API on phone and desktop, in both languages, in CI on every PR that reaches the console. Phase 6's console
  screens wait for its routes. **Fewer PRs, the owner's call on 2026-11-05:** after frame, sign-in and account (#305), two
  remain: Today, the queue, shops and the Phase 5 screens; then pricing, platform and catalogue. Both are built.
- **The read, agreed 2026-11-04.** Five parts, shop setup first, each with a short read, a sketch and a build: (1) the sign-up
  phone and Payment methods; (2) the payment page, and checkout's payment step and return; (3) Payments to verify, after
  which a shop can take payments checked by hand; (4) listener phones, the app's download page and setup guide; (5) the
  operator. **The operator console is rebuilt first** (the owner's pick over adding these to today's dark console): part 5
  builds `apps/operator` to the approved light design (`OPERATOR-CONSOLE-DESIGN.md` v2), then its payment screens on it. Until
  then Lytro's own phone is paired by a direct server call.
- **Part 1's read, agreed 2026-11-04** (drawn as `TENANT-DASHBOARD-DESIGN.md` §7.35): Payment methods lives in Settings, not
  Money. An owner verified another way gives a phone before Create shop, with no skip; a number on another account is
  refused, offering to sign in with it or use another. An owner with a shop and no phone isn't locked out: Payment methods
  says so and verifies it there. How a wallet's money is taken shows only where there's more than one way, with each fee.
  bKash's keys go in a sheet with Test connection and a test-account switch, and are never shown again. Balance gains an
  on-hold line, and the checklist's wallet item starts working. **Built** (as `TENANT-DASHBOARD-DESIGN.md` §7.35 records). One
  thing the read didn't settle, which the sketch draws: every method now starts off until the owner turns it on (WAL-05
  amended, migration 0104), since the server had them all on and a new shop would have opened on five warnings.
- **Part 2's read, agreed 2026-11-04** (drawn in `PAYMENT-PAGE-DESIGN.md` v3 and `STOREFRONT-DESIGN.md` §8a). The payment page is **rendered by the server** (the owner's pick over its own small
  app): templates, one stylesheet and two small scripts in `apps/server`, with its own Caddy block and PAY-23's policy. Placing an order **redirects straight to the page**, with no "Order held"
  screen and no frame (SFT-07). After a failed payment the shopper **tries again or calls the shop**; "switch to cash on delivery" comes out (PRD-08), and past the 30 minutes the order is cancelled
  (ORD-08). The page has **WhatsApp and call** from the shop's contact phone; support chat comes out. **Nothing promises an SMS**: the page points to the order's page, since a shop can turn that SMS
  off, a low balance stops it, and it isn't sent yet. **No screenshot at all**: PAY-18 is withdrawn, overriding Slice 5.3's read. Stated, no objection: PAY-05's missing pieces drawn; the payments-to-Lytro
  version out; Hind Siliguri from Lytro's own files; the server works out the order's advance; a shop with no method on says so plainly; two PRs, the page and then checkout with the return.
  **Built:** the page (`PAYMENT-PAGE-DESIGN.md` §7), then checkout's payment step and the return (`STOREFRONT-DESIGN.md` §8a).
- **Parts 3 and 4's read, agreed 2026-11-05** (drawn in `TENANT-DASHBOARD-DESIGN.md` §7.36 to §7.38 and `SITE-PAGES-DESIGN.md` §6; one PR holding the sketch and the
  build, the owner's call). **The app is on a public page, `lytro.app/listener`, with the file on its own R2 bucket at `download.lytro.app`,** no sign-in, a QR for computers and the SHA-256
  shown; the owner uploads each release in Cloudflare's panel. **Approve always opens a sheet** with the amount that arrived, over the first sketch's one tap, since it records money. **Phone
  receipts are a tab on Payments,** including money with no order. **Send payment link and Refund go on the order's Payment card,** which the server had (PAY-24, PAY-20) with no button.
  Stated, no objection: Payments first in Money, with the Proof button gone; Reject asks the agreed reasons and says what happens to the order; Listener phones in Settings with a QR, a typed code
  and Open in the app; install and setup guide on one page, with Android 15's block; until a signed app exists the page says it isn't ready. **Built** to those sections, with `GET /home` gaining
  `paymentsToVerify` and the checklist's `listenerPhone`.

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

## 11. Close-out check (2026-11-06)

Checked after Slice 5.8 merged (#310), against §1's eight criteria. Every slice is built. Three reviews read every requirement in §3.1 and
§3.2 against the tests and the code behind them, looking for the assertion and not for a test that names the ID. What they found was fixed
in this check's own pull request, which holds the fixes, the tests, this section and the SRS's amendments. The user settled four points
(2026-11-06): a voided or refunded advance (D5-9), the milestone (criterion 7), KNOWN-GAPS §113, and fixing every small issue found.

1. **Every completed requirement has a test or a recorded manual check: holds, with the exceptions below.**
   - **Fixed by this check:**
     - LSN-06, VER-02: bKash prints the payer's reference before its own TrxID, and the parser took the first, so a made-up ID in a
       reference could verify one order while the real one paid another by hand. A receipt naming two different IDs now verifies nothing.
     - PAY-03, D5-4: cancelling an order left its page taking money. A session still awaiting payment now closes; one with a typed ID stays
       for staff, and one whose shopper is at bKash's checkout stays for its return, so money taken there reaches staff.
     - VER-01, PAY-15: a gateway payment verified, or sent to staff, told nobody; the gateway had marked staff told. Both now notify.
     - VER-09: money bKash took while staff changed the session was dropped; it is now settled or sent to staff. Two starts of one checkout
       at once made two bKash payments; they share one. A staff link waits while the shopper is at bKash.
     - WAL-11, WAL-19: an account or its keys could be removed while a checkout ran on it; they now stay until it ends. The account a
       checkout ran on is the one recorded.
     - TVR-04: an open test checkout counted toward the new-shop cap. ORD-08: the unpaid cancel's payment status had no history line.
     - LSN-08: two phones pairing at once could pass the plan's limit; the count runs under the shop's lock. LSN-05: the purge ran at 09:23
       in Dhaka; it runs at 03:23. LSN-21: the owner is now told of a phone Lytro revoked or blocked.
     - Holding an order now takes its open session first, as verifying, the minute pass and settling do. The two orders could deadlock;
       a 25-round probe never reproduced it, so this fix rests on reading.
     - KNOWN-GAPS §113 (the user's pick): Balance's CSV and the export's download now name the shop.
   - **Built because they were counted here and weren't:** LIF-16's export now holds the payments shoppers made and the wallet accounts
     paid into, never a key; LSN-21's owner notice; OBS-08's script (criterion 7).
   - **Moved to §3.2, since a later phase finishes them:** WAL-18's retiring of a type (Phase 8, with the operator's tooling); LIM-04,
     whose only Phase 5 piece went with RTE-09 (its reconciling is live-only, Phase 9).
   - **Amended, the requirement and what was built having parted:** WAL-01, WAL-04, WAL-06, TVR-01, RAT-15, BIL-03, PLN-14, LSN-07,
     LSN-10, LSN-21, PAY-01, SFT-07, PAY-02, PAY-06, PAY-07, PAY-13, API-11, LIF-16; D5-9 by the user's decision.
   - **Tested by this check, built but asserted nowhere:** WAL-15, WAL-17 and VER-01 for bank transfer, PAY-02, PAY-05's account types,
     marks, bank details and monogram, WAL-20 on pay-as-you-go and a refund, AUD-01's gateway entry, LSN-05, LSN-07, LSN-09, PLN-19's
     paired devices and PLN-14 in the wallet step (`phase-5-requirements.e2e.spec.ts` and the specs of each area).
   - **Manual checks recorded:**
     - WAL-18: a type of an existing kind is one row in `PAYMENT_METHOD_TYPES` (its kind, number lengths and verification levels), its
       `payment_method` value with a migration, and the page's row for its USSD code and mark (`page/wallets.ts`). Order, session and
       page logic read only the common shape; nothing else names a type.
   - **Not built, open in KNOWN-GAPS:** §119 (what holds on one server only), §120 (a gateway review keeps no amount bKash reports, and
     one race after a timed-out execute).
   - **Live only:** a real completed bKash payment (VER-08, VER-09, §107); real receipts for LSN-06; the Xiaomi test; LIF-16's ten minutes;
     LIM-04; the milestone's run on staging.
2. **The prepaid golden path: holds.** `payment-golden-path.e2e.spec.ts` walks §1's path as one test for each level, each for one clothing
   shop: a landing-page order for a shirt needing a 300 TK advance, its stock held, the page showing the active bKash account alone, the
   order refused a confirming call or shipping before its advance, then verified by staff (no fee), by a paired phone's receipt (0.30, once)
   or at bKash's checkout (3.00 held, then charged once), on to its call, shipped and delivered collecting only the 770 TK left. After every
   step it reads the session, the order's two axes, the payments, the balance and its ledger and the stock, and re-derives each. Eight
   deliberate breaks of its money rules were each caught. The gateway is a fake bKash; the real sandbox's completed payment is §107's.
3. **The unpaid paths: holds.** An order with no ID typed when its window ends is cancelled ("advance not paid"), its stock let go and its
   payment status recorded, while one with an ID typed waits (`payment-sessions.e2e.spec.ts`); a rejected payment cancels its order
   (`payment-verify.e2e.spec.ts`); money after a cancellation goes to staff and reopens nothing (`listener-receipts.e2e.spec.ts`).
4. **Exactly once: holds.** `payment-exactly-once.e2e.spec.ts` sends two callers at once: one ID typed at two shops, one payment verified
   twice, verified and rejected, two phones forwarding one receipt, money recorded by hand while the session verifies, and one refund twice.
   A gateway return sent twice at once settles once (`gateway.e2e.spec.ts`).
5. **The balance never blocks a shopper: holds.** Too little balance sends the shopper to the page with a once-a-day notice
   (`gateway.e2e.spec.ts`), and a listener match to free review (`listener-receipts.e2e.spec.ts`).
6. **Lytro's own payments: holds.** A plan bought in the wallet step and verified by Lytro's phone activates once, with no fee and no cap,
   and an add-on bought there too (`lytro-listener.e2e.spec.ts`).
7. **The milestone: built, its run waits for staging** (the user's pick). `apps/server/scripts/order-payment-check.ts` places an order
   needing an advance as a website would, opens its page, follows bKash's checkout to its address when the shop takes bKash there, and reads
   the tracking, moving no money; `order-payment-check.e2e.spec.ts` runs it against a server for a listener shop, a gateway shop and a key
   refused. Run against a staging shop with bKash's sandbox, for one wallet by the listener and one by the gateway, it closes this criterion.
8. **CI green on `main`, every slice by pull request: holds** once this check's pull request merges. A green Deploy run deploys nothing,
   because its staging and production jobs are skipped.

Noted for later, none of them stopping this: KNOWN-GAPS §119 and §120. §107 is unchanged.
