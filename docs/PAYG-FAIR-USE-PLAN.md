# Pay-as-you-go fair use -- plan

**Status:** APPROVED by the owner 2026-11-23 ("ok"), with one change: the top-up sheet's quick amounts are ৳10, ৳20,
৳50 and ৳100 (PF-41). My calls in the sketch (section 2) and my recommendations for the sub-questions (section 7) are
taken. Nothing is built yet; section 6 is the order of work.

**Sketch:** `docs/brand/lytro-payg.html` (`pf-*` screens), with screenshots in
`C:/Users/Dell/Desktop/Lytro screenshots/payg-sketch/`.

**The problem.**
- **Today a pay-as-you-go (PAYG) shop pays only when it moves an order inside Lytro:** 1.5% of the order, at least ৳20,
  when it books a courier, enters a tracking link or hands an order over (PYG-02).
- **A seller can skip that step.** They collect orders from the cached storefront and landing pages, read each
  customer's phone and address in the dashboard, and handle the order outside Lytro, never paying.
- **Lytro still carries the cost:** the storefront and its cache, the checkout, fraud checks, the shopper's SMS and
  the servers. A flash sale on a cached page costs Lytro and earns nothing.

**The fix.** Charge when the seller gets the value of Lytro's order, which is seeing the customer, and not at a step
they can skip. Charge the shop's own website's API traffic too.

## 1. The owner's decisions (2026-11-22 and 2026-11-23)

| # | Decision |
| --- | --- |
| PF-1 | **A two-step unlock for orders that arrive through Lytro** (storefront, landing pages, API). At **step 0, free,** the order shows its products, amount, district and a masked phone (`017•• ••• 842`); the seller may reject it at no cost. |
| PF-2 | **Step 1, "নম্বর দেখুন", ৳7,** shows the phone for the confirmation call. |
| PF-3 | **Step 2, "কনফার্ম করুন", ৳3,** shows the address. It includes courier booking, the label, the tracking SMS and payment matching. |
| PF-4 | **A flat ৳10 an order (7 + 3)** replaces 1.5%, at least ৳20. The owner chose 7 + 3 over 5 + 15. |
| PF-5 | **Paid from the prepaid balance.** With an empty balance, orders keep arriving and stay locked; none is ever refused. |
| PF-6 | **Step 1 is never refunded,** for example when the call shows a fake order. |
| PF-7 | **Masked until unlocked, everywhere:** alerts, SMS and push to the seller, CSV, the secret-key API, invoices, labels and the customers list. Lytro sends no webhooks today. |
| PF-8 | **The shop's daily order cap counts an order at step 1.** |
| PF-9 | **Plans and Pilot are unaffected.** |
| PF-10 | **Landing pages on every plan, PAYG included.** This is already so (LND-01); nothing to build. |
| PF-11 | **Manual orders** (typed in the dashboard) cost **৳10 when the courier is booked through Lytro**, and nothing otherwise. |
| PF-12 | **New products stay at ৳10 each** on PAYG (PYG-16). |
| PF-13 | **A one-time ৳10 activation top-up.** On PAYG, the storefront and landing pages pause until one top-up of at least ৳10. It is a credit, not a fee, and is spent on the first unlocks. Once is enough. A shop that ever paid a plan or topped up ৳10 or more is exempt. The dashboard and manual orders are never paused. Warnings come on trial days 25 and 29, in the app and by SMS. The paused storefront says "শিগগিরই আবার চালু হচ্ছে". The trial itself keeps no such rule. |
| PF-14 | **The PAYG API charge, for the shop's own website through its key:** 10,000 requests a month free, then ৳1 per 1,000. It is charged daily in whole 1,000s, with part-blocks carried over, and one ledger line a day. Only successful answers count. A monthly cap set by the seller, **৳200 by default,** warns at 80%. At the cap or with an empty balance, the API answers "limit reached", and nothing is ever charged past the cap. Storefront and landing visits are free and not counted. |
| PF-15 | **PAYG storefronts show no direct contact buttons** (WhatsApp, Messenger, call), so the shop can't be used as a catalogue only. Decided 2026-11-23. |
| PF-16 | **An operator report of PAYG shops with high traffic and few unlocks.** Decided 2026-11-23. |
| PF-17 | **The fraud check stays ৳0,** so a seller can reject a fake order at step 0 for free. Decided 2026-11-23. |

## 2. My calls in the sketch (for approval)

| # | Call | Why |
| --- | --- | --- |
| PF-20 | **Which orders lock:** a PAYG shop's orders from the storefront, its landing pages and its public key, from the moment they are placed. Orders typed in the dashboard never lock. Orders from a secret key: see PFQ-1. | PF-1. |
| PF-21 | **What step 0 shows:** <ul><li>shown: every item (photo, name, SKU, quantity, price), the totals, the delivery zone and charge, the payment method, the district, and the fraud check's counts (free, PF-17);</li><li>masked: the phone, as `017•• ••• 842` (first three and last three digits), and the name, as its first letter (`স•••`);</li><li>hidden: the shopper's note, which often carries a number or an address.</li></ul> | The seller can judge the order (what, how much, where, a risky number) without being able to reach the customer. |
| PF-22 | **Step 1 shows** the name, phone and note, and turns on the call log (ORD-51). The address stays hidden, with "কনফার্ম করলে ঠিকানা দেখা যাবে". A call marked **ক্যানসেল** charges nothing more. | PF-2, PF-6. |
| PF-23 | **Step 2 is any confirmation:** the confirm button, a call marked **কনফার্মড**, or booking a courier from step 1. Each charges the ৳3 once and shows the address. Step 0 offers no booking; the first paid step is always step 1. | One rule, whichever way the seller confirms (ORD-51 already confirms on booking). |
| PF-24 | **Each step is one balance charge,** in the same transaction as what it shows. Short of balance, the step is refused and the top-up sheet opens. A frozen balance refuses it too. | PF-5; the same guard as every balance charge (BAL-02). |
| PF-25 | **The order list:** <ul><li>a locked row shows a lock, the masked phone where the name goes, the district, the item count and the amount;</li><li>a line on top says how many are locked, the ৳7, and the balance;</li><li>a filter chip **লক করা** sits beside **কনফার্ম বাকি**.</li></ul> | The seller sees at a glance what waits and what it costs. |
| PF-26 | **Search** finds a locked order by its number only, never by phone or name. | Otherwise searching numbers would reveal whose order it is for free. |
| PF-27 | **Customers:** a customer record is made or updated at step 1, not when the order arrives. Until then the customers list doesn't hold that shopper. | PF-7; amends CUS-01. |
| PF-28 | **The new-order alert** reads "নতুন অর্ডার #… · ৳৯,৪৬৭ · ঢাকা · স্টোরফ্রন্ট · খুলতে ৳৭", with no name. | PF-7; amends ORD-20. |
| PF-29 | **Prints and exports:** <ul><li>the order-list print and the CSV show the masked values;</li><li>an invoice and a label can't be printed before step 2, so their buttons stay hidden: the label needs the address, and the invoice names the customer.</li></ul> | PF-7. |
| PF-30 | **A verified advance payment on a locked order:** its sender number is masked like the phone. Whether it unlocks the order: PFQ-3. | The sender number is usually the customer's phone. |
| PF-31 | **Staff:** whoever may handle orders (`orders:write`) may unlock. Every unlock lands in the activity log with who did it and the charge. | Unlocking is part of handling an order, and the owner sees every taka spent. |
| PF-32 | **Repeat shoppers:** every Lytro order costs ৳10 (7 + 3), even when the same customer was unlocked before. The fraud check shows counts, never which earlier order. | The fee is per order (PF-4). Naming the earlier order would reveal the phone for free. |
| PF-33 | **Plan switches:** an order keeps the rule it arrived under. <ul><li>Orders placed on a trial or a plan never lock.</li><li>Buying a plan from PAYG opens every locked order free, from the moment the plan starts (the plan covers them).</li><li>A move to PAYG, from a trial or a plan, locks only the orders placed after it.</li></ul> | No order changes its price after it arrives. |
| PF-34 | **An order cancelled before step 1** costs nothing, whether the seller rejects it or the shopper cancels it. | PF-1. |
| PF-35 | **Activation:** <ul><li>shown as one card on the dashboard home after the trial, and as the paused storefront page (`noindex`, answered 503 with `Retry-After`);</li><li>the shop's cached pages are purged from Cloudflare when it pauses and again when it activates.</li></ul> | PF-13. A 503 tells Google the shop is coming back; a page kept in the cache would sell while the shop is paused. |
| PF-36 | **The API screen** (Settings → API কী): <ul><li>this cycle's requests, the free 10,000 and then the paid ones;</li><li>this cycle's charge against the cap, and the day-by-day charges;</li><li>the cap, from ৳0 to ৳5,000, where ৳0 means stop at the free 10,000;</li><li>the 80% warning in the app, by push and by email, but not by SMS, which would itself cost.</li></ul> | PF-14. |
| PF-37 | **A successful answer** is an HTTP 2xx or 304. Every refused, limited or failed request is free. | PF-14. |
| PF-38 | **The operator report, "PAYG fair use":** <ul><li>one row per PAYG shop over the last 30 days: orders received through Lytro, opened (step 1), confirmed (step 2), the open rate, API requests and their charge, all fees earned, the balance and whether the storefront is active;</li><li>a shop with 20 or more orders and an open rate under 25% is marked **Watch**;</li><li>sorted by orders received.</li></ul> | PF-16. Storefront visits are served from Cloudflare's cache, so the origin can't count them (PFQ-7). |
| PF-39 | **The rates list:** <ul><li>new rows: unlock phone ৳7, unlock confirm ৳3, manual booking ৳10 and API ৳1 per 1,000;</li><li>the 1.5% and ৳20 rows leave the screens; their history stays.</li></ul> | RAT-01, RAT-05. |
| PF-40 | **Contact hidden on a PAYG storefront:** <ul><li>the product page's WhatsApp and Messenger row;</li><li>the footer's and menu's phone and email;</li><li>the call-the-shop buttons on sign-in, sign-up, checkout, the payment return and landing pages.</li></ul> The shop's address and its Facebook page link stay (PFQ-4, PFQ-5). | PF-15. |

## 3. Screens (`docs/brand/lytro-payg.html`)

Dashboard (phone and desktop, Bangla):
- `pf-list`: the order list with locked, phone-shown and confirmed orders, the top line and the **লক করা** chip.
- `pf-step0`: a locked order. Items, totals, district, masked phone, the fraud check; **নম্বর দেখুন · ৳৭** and **ক্যানসেল (ফ্রি)**.
- `pf-step1`: the phone shown, the call buttons and the call log; the address hidden; **কনফার্ম করুন · ৳৩**.
- `pf-step2`: confirmed. The address, **কুরিয়ার বুক করুন** with no fee left, and the timeline with both charges.
- `pf-empty`: a locked order with an empty balance; the step disabled, the top-up line and the top-up sheet.
- `pf-manual`: booking a courier for a manual order; the ৳10 fee line in the booking sheet.
- `pf-home`: the home after the trial, with the paused-storefront activation card.
- `pf-day25` and `pf-day29`: the trial warnings on the home, and the SMS text.
- `pf-api`: Settings → API কী, with the usage, the charges, the cap and the 80% warning.

Storefront (phone): `pf-paused` (the paused page) and `pf-product` (a PAYG product page with no contact row, beside
the same page on a plan).

Operator console (desktop): `pf-report` (the PAYG fair-use report) and `pf-rates` (the rates with the new rows).

lytro.app: `pf-site`, the pay-as-you-go pricing card's new wording, and the FAQ answers to change.

## 4. Proposed SRS amendments (text only; SRS-detailed.md is not edited here)

- **PYG-02, amended:** a pay-as-you-go order that arrives through the storefront, a landing page or the public key
  shall be charged in two steps from the balance:
  - ৳7 (RAT-17) when the seller first shows its phone;
  - ৳3 (RAT-18) when it is confirmed, by the confirm action, a call marked confirmed or a courier booking.
  An order typed in the dashboard shall be charged ৳10 (RAT-19) only when its courier is booked through Lytro.
  Nothing shall be charged at order creation, a manual tracking entry or a hand-over.
- **PYG-03, amended:** order creation shall never check the balance. A step whose charge the balance can't cover shall
  be refused, with a top-up prompt, and the order shall stay as it was.
- **PYG-04, amended:** an unlock charge shall be reversed only if the step itself fails. A later cancellation,
  rejection or return shall not refund it. An order never unlocked shall never be charged.
- **PYG-13, amended:** the operator's PAYG report shall show, per shop over 30 days: orders received through Lytro,
  opened, confirmed, the open rate, API requests and their charges, fees earned, the balance and the storefront's
  activation, marking a shop with 20 or more orders opened under 25%.
- **PYG-21, amended:** qualifying activity also includes an unlock charge and a daily API charge.
- **RAT-10 and RAT-11, retired** (their history is kept). **New:**
  - RAT-17, the phone unlock, ৳7.00;
  - RAT-18, the confirm unlock, ৳3.00;
  - RAT-19, the manual-order booking, ৳10.00;
  - RAT-20, the PAYG API price per 1,000 successful requests, ৳1.00.
  Each follows RAT-02 and RAT-03.
- **RTE-03, amended for PAYG:**
  - past the monthly allowance (10,000 on PAYG), successful requests shall be charged daily at RAT-20, in whole
    1,000s, up to the seller's monthly cap;
  - at the cap or when the balance can't cover the next 1,000, the API shall answer `quota_exceeded`, except for
    placing an order, the delivery estimate and locations, which stay served (QTA-07) and are not charged past the
    cap;
  - PAYG shops buy no request packs.
- **TRL-07, amended:** a trial that becomes PAYG keeps its storefront, landing pages and public key paused until
  the shop's first top-up of ৳10 or more (PAYG-activation setting), unless it ever paid a plan or such a top-up.
  Warnings come on days 25 and 29 in the app, by push, email and SMS; the SMS is a platform cost.
- **SFT-21, amended:** a PAYG storefront shall show none of the shop's direct contact: phone, email, WhatsApp,
  Messenger or call buttons. The shop address and its Facebook page stay.
- **CUS-01, amended:** a PAYG order that arrives locked shall create or update its customer when its phone is first
  shown, not at creation.
- **ORD-20, amended:** a locked order's notification shall carry no name, phone or address.
- **New PYG-22 to PYG-30:**
  - PYG-22: what step 0 shows;
  - PYG-23: masking points (PF-7, PF-26 to PF-30);
  - PYG-24: switches (PF-33);
  - PYG-25: activation (PF-13, PF-35);
  - PYG-26: the API charge and cap (PF-14, PF-36, PF-37);
  - PYG-27: staff (PF-31);
  - PYG-28: repeat shoppers (PF-32);
  - PYG-29: contact hiding (PF-40);
  - PYG-30: the operator switch (section 6).

## 5. Build

### Data (all expand-only first, per the migration checklist)

- **`tenant.orders.access`:** text, one of `open` (default; manual, trial and plan orders), `locked`, `phone` or
  `confirmed`.
  - Also `phone_shown_at` and `phone_shown_by`.
  - A partial index on `(tenant_id, access)` where `access` is `locked` or `phone`.
- **`LedgerEntryType.OrderUnlock`** (`order_unlock`, reference `{orderId, step: 'phone'|'confirm', rate}`) and
  **`LedgerEntryType.ApiRequests`** (`api_requests`, reference `{cycleStart, day, requests, blocks, rate}`).
  - `order_fee` stays, for manual bookings at a flat rate.
  - The daily reconciliation (DAT-52) learns both new types.
- **`RateKey`:** `payg_unlock_phone` 7.00, `payg_unlock_confirm` 3.00, `payg_booking_fee` 10.00 and
  `payg_api_per_thousand` 1.00. `payg_order_fee_min` and `payg_order_fee_pct` stay stored but are no longer read or
  shown (SHOWN_RATE_KEYS).
- **Platform settings:**
  - `payg_activation_topup` 10.00;
  - `payg_fair_use` (off, on), the switch in section 6.
- **`control.tenants.storefront_activated_at`:**
  - backfilled to now for every shop that ever paid a plan or topped up ৳10 or more, and for every shop not on PAYG;
  - left null only for PAYG shops that never paid (but see PFQ-9).
- **`control.tenants.api_monthly_cap`:** numeric(12,2), default 200.00.
- **`control.api_usage` and `control.api_usage_daily`:**
  - both gain `billable` (successful answers);
  - `api_usage` also gains `billed_blocks`, `charged` and `cap_warned_at`.
- **PAYG plan limits:** `requests_monthly` goes from 100,000 to 10,000, in the release that switches the charge on.

### Server

- **Unlocking:**
  - `POST /orders/:id/unlock-phone` charges step 1 and returns the order as it now reads;
  - the existing confirm, call-outcome and booking paths charge step 2 on a `locked` or `phone` order.
  - Both run under the order's row lock, so a double tap charges once.
- **One masking class** applies the order's `access` to every read:
  - the list, detail, search, the order-list print, the CSV export, the secret-key API, notifications (bell, push and
    email), payments' sender numbers and the activity log's text;
  - invoice and label routes refuse before `confirmed`.
- **Manual booking:** `holdOrderFee`/`chargeHeldOrderFee` charge `payg_booking_fee` for dashboard orders only.
  `handleWithin` (manual tracking entry, hand-over) charges nothing on PAYG.
- **Activation:**
  - TRL-07's conversion leaves `storefront_activated_at` null and purges the shop's edge tags;
  - a confirmed top-up of at least the setting sets it and purges again;
  - the storefront API answers `paused` to the storefront and refuses the public key while it is null (PFQ-2).
- **The API charge:**
  - the request flush counts `billable` beside `requests`;
  - a daily job (00:15 Asia/Dhaka) charges each PAYG shop's new whole 1,000s past its free 10,000, never past its
    cap and never more than its balance, as one ledger line;
  - the live check refuses with 429 `quota_exceeded` once unbilled successful requests would pass the cap or the
    balance (the minute's flush lag is written off, never charged);
  - warnings go out at the free 10,000, at 80% of the cap and at the stop.
- **Trial warnings:** the trial reminder job adds day 25 and day 29 for shops that would pause.
- **Operator:** `GET /operator/reports/payg-fair-use`, read from `tenant.orders` (source, `access`, created in 30 days)
  and `control.api_usage`.
- **Words:**
  - `plan-card.ts` (`paygFees`) reads the new rates, for the dashboard plan cards and the lytro.app pricing card;
  - the website FAQ answers change.

### What leaves an order today (each one masks or waits)

| Where | Today | Under PF-7 |
| --- | --- | --- |
| Order list, detail, search | Name, phone and address | Masked by `access`; search by number only |
| New-order bell, push, email (ORD-20, `orderPlacedText`) | Customer name | No name: amount, district, source |
| Customers list (CUS-01) | Made at order creation | Made at step 1 |
| CSV export (data-export) | Every field | Masked |
| Order-list print | Name, phone | Masked |
| Invoice, label | Name, phone, address | Refused before step 2 |
| Secret-key API order reads | Every field | Masked |
| Payment sender number (listener, manual) | Shown | Masked until step 1 (PFQ-3) |
| Fraud check | Counts, from the phone | Unchanged (counts only, free) |
| Activity log | Order events | No phone or address in its text |
| Courier booking | Needs the address | Only from step 1, as step 2 |
| SMS to the shopper | Sent by Lytro | Unchanged (it doesn't reach the seller) |

### Edge cases

- **A double tap or two staff at once:** the row lock charges once; the second caller gets the order as it now reads.
- **Cancelled after step 1:** no refund (PF-6) and no ৳3.
- **Reopened after a cancel:** it keeps its `access`, and nothing is charged twice.
- **An order edited by the seller after step 2:** unchanged. The seller typed it, so it is theirs.
- **A courier booking that fails after step 2's charge:** the ৳3 stays (step 2 happened). Only a failing step reverses
  its own charge (PYG-04).
- **A trial with orders in flight at the PAYG switch:** they stay `open` (PF-33). A trial order still unhandled is
  free to handle.
- **A plan lapsing to PAYG** (PYG-10, at period end): orders after that moment lock.
- **A PAYG shop buying a plan:** at activation (BIL-05) every `locked` and `phone` order becomes `open`, free. Step 1
  charges already made stay.
- **The cap reached mid-day:** the live check stops the API within about a minute. The day's job charges only whole
  1,000s within the cap. Order placement stays served (QTA-07) but past the cap it is never charged.
- **An empty balance mid-cycle:** the API stops as at the cap. A top-up restarts it at once.
- **The seller lowering the cap below this cycle's charge:** the API stops; nothing is refunded.
- **A new cycle** (PYG-19): a fresh free 10,000 and a fresh cap; a carried part-block resets.
- **Suspension, archive** (PYG-09, PYG-21): locked orders stay locked; nothing is charged.
- **Rates changed mid-order:** each step charges the rate when it happens (RAT-04).
- **Pilot and plan shops:** `access` is always `open`; none of this shows.

## 6. Pull requests (backend slices first, one UI pass after)

The rules change what a seller sees, so the server work ships dark behind `payg_fair_use` (off), and the operator
turns it on after the UI pass is live.

1. **Unlock:**
   - rates, ledger types, `orders.access`, the unlock and confirm charges, and the manual-booking ৳10;
   - masking at every point in the table above, and the customer deferral;
   - tests at each masking point, break-checked.
2. **Activation:** `storefront_activated_at`, the pause behind the storefront API and the public key, the top-up
   hook, the edge purges and the day-25 and day-29 warnings.
3. **The API charge:** `billable` counting, the daily job, the cap and its warnings, the 429 at the cap or the balance,
   no packs on PAYG; the PAYG plan's 10,000 goes into the release that turns this on.
4. **Operator:** the PAYG report and the rates rows.
5. **The UI pass, built pixel-perfect to the sketch:**
   - dashboard: the order states, list, top line, top-up sheet, home card, warnings and API screen;
   - storefront: the paused page and the hidden contact;
   - operator: the report and the rates;
   - lytro.app: the pricing card wording and the FAQ.

Then a notice-board post to PAYG shops seven days before the switch goes on (RAT-09, PFQ-8), and the switch.

## 7. Sub-questions (the recommendations were taken with the sketch, 2026-11-23)

**PF-41 (the owner, 2026-11-23): the top-up sheet offers ৳10, ৳20, ৳50 and ৳100,** as the dashboard's balance
top-up already does (`QUICK_TOP_UPS`, opening on ৳50); the activation prompt opens it on ৳10. **Before the switch goes
on,** the platform's smallest top-up (`top_up_min_amount`, BAL-04) must be ৳10 or less: it is ৳100 on production
(seeded by migration 0029, read 2026-11-23), which hides ৳10 to ৳50 and makes the ৳10 activation impossible. The
operator lowers it in the console's Settings.

| # | Question | My recommendation |
| --- | --- | --- |
| PFQ-1 | Orders sent with a **secret key** come from the seller's own server, which already holds the customer. Lock them, or treat them as manual (৳10 at a Lytro booking)? | **Treat as manual.** A lock hides nothing from the seller's own server. A public-key order from the seller's own site is in the same position (their page sees the form), so the API charge (PF-14) is the real control there; lock public-key orders as decided. |
| PFQ-2 | While a PAYG shop is paused (PF-13), does its **public key** pause too? | **Yes, all of it** except tracking for orders already placed, so the pause can't be routed round through the shop's own site. |
| PFQ-3 | A **verified advance payment** on a locked order. | **It opens both steps (৳10)** when the balance covers it. A shopper who paid is real, and the sender number on the seller's own listener phone shows the number anyway. |
| PFQ-4 | The footer's **email and shop address** on a PAYG storefront. | **Hide the email** (it is direct contact); **keep the address** and the Facebook page link. |
| PFQ-5 | The **shop's phone on the shopper's tracking page.** | **Show it only after step 1**, when the seller has reached the shopper anyway. |
| PFQ-6 | The **name at step 0.** | **The first letter only** (`স•••`). |
| PFQ-7 | **"Traffic" in the operator report.** Storefront visits are served from Cloudflare's cache and never reach the server. | **Orders received through Lytro and API requests,** both counted already. Cloudflare's per-host visits later, only if needed. |
| PFQ-8 | **Turning it on:** a notice to PAYG shops first? | **Yes:** a notice-board post 7 days before (RAT-09); the switch goes on after the UI pass is live. |
| PFQ-9 | **PAYG shops that exist on the day it goes on** and never topped up: pause their storefronts too? | **Yes, after the same 7-day notice.** On production today that is very few shops. |
| PFQ-10 | **The cap's range.** | **৳0 to ৳5,000,** where ৳0 means stop at the free 10,000. |
| PFQ-11 | **Request packs** (RTE-11) on PAYG. | **No new packs on PAYG** (the per-1,000 charge replaces them); a pack already bought counts first. |
| PFQ-12 | **Top-ups for activation,** while Lytro's own listener phone is not paired yet. | **Pair it before switching on.** Until then every ৳10 top-up waits in the operator's queue, and the storefront stays paused meanwhile. |

## 8. What today's code says that a decision changes

- **The order fee and when it is charged:**
  - `PayAsYouGoBillingService` and `OrderFulfilment` charge 1.5%, at least ৳20, at courier booking
    (`setAsideWithin` and `settleBookingWithin`) and at a manual tracking entry or hand-over (`handleWithin`);
  - PF-4 and PF-11 replace both: unlock steps for Lytro orders, ৳10 only at a Lytro booking for manual ones.
- **The words:**
  - `plan-card.ts` (`paygFees`) and the lytro.app card say "1.5%, at least ৳20" and "adding products is free";
  - the FAQ says "a small fee only when an order is booked or shipped".
  - All three change with the rates.
- **The PAYG plan's 100,000 monthly requests** with RTE-03's hard stop: PF-14 makes it 10,000, then a charge.
- **SFT-21** requires the shop's contact on every page; PF-15 removes it on PAYG.
- **CUS-01** fills customers at order creation; PF-7 defers it.
- **ORD-20's alert** names the customer; PF-7 removes the name.
- **TRL-07** keeps the storefront live at the PAYG switch; PF-13 pauses it until activation.
- **Landing pages** are already on every plan (LND-01), so PF-10 needs no change.
