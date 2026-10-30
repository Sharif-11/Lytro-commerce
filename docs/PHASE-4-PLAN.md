# Phase 4 plan: orders and customers

Status: agreed 2026-10-27 — the decisions in §2 were settled in the Phase 4 read the same day. Builds on
`IMPLEMENTATION-PLAN.md` Phase 4, with these changes agreed before this plan was written:

- **Built after Phase 3.** The plan is written now; building starts once Phase 3's Slices 11 (dashboard), 12
  (storefront and landing pages) and 13 (custom domains) are done (D4-1). Amended 2026-10-29: the backend slices
  start now, beside Phase 3's remaining slices; the screens (Slice 4.8) still wait for Slice 12's storefront app.
- **The order flow follows Bangladeshi sellers:** a new order is confirmed by a phone call before it ships, every
  call is logged, and a cancellation carries its reason (D4-3). `SRS-detailed.md` gains the `confirmed` status,
  ORD-51 and ORD-52.
- **Order numbers read as dates:** `261027-0041`, a sequence per shop per day (D4-4, ORD-04 amended).
- **Shoppers order cash on delivery only until Phase 5** brings the payment page (D4-2).
- **Moved out:** order extraction from text goes to Phase 7 with the AI provider; courier booking and courier areas
  stay in Phase 6; fraud checks and order SMS stay in Phase 7 (D4-5).

Requirement IDs refer to `SRS-detailed.md` §13.4 (QTA), §14.9–§14.10 (TAX, MNU), §14.15 (CMB), §15 (ORD, STA) and §16
(CUS), plus the LND, SFT, PRD, ATR, INV, DLV and PYG rows named below. Schema refers to `DATABASE-SCHEMA.md` §3.3,
which Slice 4.1 brings in line with §4 of this plan.

All decisions in §2 were agreed on 2026-10-27; reopening one needs an explicit change to that row, not a silent
deviation during a slice.

---

## 1. Goal and exit criteria

**Goal.** A seller takes an order however it arrives -- entered by staff from a Facebook message or a phone call,
placed by a shopper on the storefront or a product's landing page, or sent by the seller's own site through the API
-- confirms it by phone, ships it with a tracking code and records what came back. Every order holds its stock from
the moment it is created, is priced by one function wherever a price is shown, and counts toward the plan only when
it is handled. Shoppers check out, track their orders and keep an account; the seller sees its customers and its
sales. Payments (Phase 5) and couriers (Phase 6) then attach to orders that already work.

**Phase 4 is complete when all of these hold:**

1. Every requirement in §3.1 has a passing automated test, or, for `MAN` requirements, a recorded manual check.
2. **The order golden path** passes as one test, for one cosmetics shop with no manual steps:
   staff enter an order of two shades and a combo pack → its stock is held → a call with no answer, then a call that
   confirms → marked shipped with a tracking code (serials asked, stock taken earliest expiry first) → counted toward
   the plan once and, on pay-as-you-go, charged its fee once → delivered → one unit returned damaged, one sellable.
   At every step the order's two axes and visible status, the stock ledger, the levels, the customer's totals and the
   sales figures all agree.
3. **The shopper path:** a cash-on-delivery order from the storefront and one from a landing page, each submitted
   twice, create one order each at exactly the price the cart and the form showed; the tracking page shows no address
   or phone; a signed-in shopper sees their own orders only.
4. **Concurrency:** 50 orders created at once in one shop on one day get 50 distinct consecutive numbers; two orders
   racing for the last unit leave one refused and nothing oversold (INV-01, KNOWN-GAPS §75).
5. **Limits:** order creation is never refused for a handling limit (QTA-07); handling is refused past a trial's 40th
   handled order and past the daily limit; the 11th order from one visitor in a minute is refused (RTE-06).
6. CI is green on `main`, and the pull-request flow has been used for every slice.

---

## 2. Decisions

**D4-1 to D4-14 agreed 2026-10-27** (the Phase 4 read; D4-3 shaped by the owner's "mimic the conventional e-commerce
sellers in Bangladesh").

| # | Decision | Decided | Affects |
|---|---|---|---|
| D4-1 | **When.** Shopper checkout, tracking, accounts and the landing page's order form live in Slice 12's storefront app, which does not exist yet. | Build Phase 4 after Phase 3's Slices 11, 12 and 13; this plan is written now. **Amended 2026-10-29** (the owner's "start phase 4 now"): the backend slices (4.1 – 4.7) start now, beside Phase 3's remaining slices, since they need only the API; Slice 4.8's screens still wait for Slices 11 and 12. | Planning |
| D4-2 | **Advance payments before Phase 5.** A product's payment policy may need an advance (PRD-08), but the payment page and wallet checkout (LND-10, SFT-07, PAY-01) arrive in Phase 5. | Public orders (storefront, landing page, public key) take cash-on-delivery products only; a product whose policy needs an advance is refused with a plain message naming it. Staff may enter such an order and record the advance received (ORD-22). Nothing is live before launch, so no sale is lost. | Slices 4.2, 4.8 |
| D4-3 | **The order flow.** Sellers in Bangladesh phone a cash-on-delivery customer before shipping and cancel fake or unreachable orders; the sketches draw "To confirm" and Confirm, but no status backed them. | New (`pending`, "to confirm") → a confirming call → Confirmed (`confirmed`, new) → Processing (courier booking, Phase 6) → Shipped → Delivered or partly delivered → Returned. Every call is logged with its outcome -- confirmed, no answer, call back later (with a time), cancelled -- and an optional note; the order shows the calls and the unanswered count; "call back later" holds the order until then. A cancellation needs a reason: customer cancelled, fake order, unreachable, out of stock, duplicate, other. The calls and reasons later feed Phase 7's fake-order check. §2.3.1, ORD-07, ORD-08 and ORD-41 amended; ORD-51 and ORD-52 added. | Slices 4.1, 4.3, 4.8 |
| D4-4 | **Order numbers.** ORD-04's `ORD-YYYYMMDD-NNNN` is 17 characters, hard to read out on a call. | `YYMMDD-NNNN` (`261027-0041`): the order's day in Asia/Dhaka and a sequence per shop per day from 0001, five digits past 9,999; gap-proof, never reused. Lists show the full number. ORD-04 amended. | Slice 4.1 |
| D4-5 | **Moved out of this phase.** `IMPLEMENTATION-PLAN.md` lists extraction from text in both Phase 4 and Phase 7, and the drawn order screens carry later phases' parts. | Extraction from text (ORD-30 to 34) → Phase 7, with the AI provider; the New order screen shows its paste box greyed until then. Courier booking, sync and courier areas (CRR, CUS-10 to 13) stay in Phase 6. Fraud checks (FRD) and order SMS (ORD-20's SMS half) stay in Phase 7; Phase 4's storefront and confirmation copy promises no SMS. Webhooks for orders and secret keys stay in Phase 8. Auto-archiving old orders (ORD-49) is deferred. | Scope |
| D4-6 | **Payments recorded by staff.** ORD-15 and ORD-22 (Phase 4) write `tenant.payments`, which the schema gives to Phase 5. | Build `tenant.payments` now for manual entry only -- wallet name, sender number, transaction ID unique platform-wide (`control.used_transaction_ids`), amount -- recorded as verified by a holder of `payments:manage`. Phase 5 adds payment sessions, verification levels and refunds (ORD-44, PAY-20) on the same table. It lives in the `orders` module for now; the existing `payments` module is the shop's own payments to Lytro. | Slice 4.3 |
| D4-7 | **Moving an order without couriers.** Courier booking and courier reports arrive in Phase 6. | By hand, the whole order at once: Confirm (a confirming call), Mark shipped (a tracking link or code and the courier's name; asks serials; takes the stock out; sets `handled_at`), Delivered, Cancel (with its reason; releases the stock; refused once shipped), Hold, In review, and Return (each line's units sellable or damaged). Partly shipped and partly delivered states come with Phase 6's courier reports. | Slices 4.1, 4.3 |
| D4-8 | **Idempotency (API-11).** Today a request that fails leaves its key "in progress" for 24 hours, so a retry after a timeout or an error is refused; keys are shared by every shop; the header is optional; the stored reply is written after the response, outside the business transaction. | Keys scoped to the shop and the caller; the header required on order creation (and Phase 5's payment sessions); the reply stored inside the order's own transaction; a request that fails releases its key so a retry runs again. The existing billing routes keep working on the reworked service. | Slice 4.1 |
| D4-9 | **One pricing function** (`ENGINEERING-STANDARDS.md` §4). | `OrderPricing` computes item totals, the zone charge and per-line delivery (ORD-06, ORD-06a), each line's payment policy, the advance and the cash-on-delivery remainder (PRD-08, ORD-16), discounts and tax (TAX-03). Order creation, the storefront's estimate (SFT-20) and the landing form's totals (LND-08) all call it; public routes give the location list (CUS-08) and the estimate. | Slices 4.1, 4.2 |
| D4-10 | **Notices.** Phase 3 planned one `TenantNotifier` (D3-5) but built one port per module with a console or email stand-in. | The same here: an `OrderNotifier` port with a console stand-in for ORD-20's in-app notice; Phase 7 adds push and the notification centre (NTF-01, NTF-03). A requirement counts as complete once the once-per-event logic is proven, as D3-5 did. | Slice 4.2 |
| D4-11 | **Scope inside the phase.** | Delivery, takeaway or dine-in (MNU-04) is stored on every order from the first slice; tax classes and modifiers (TAX-01 to 03, MNU-01 to 03) are a late slice; combo packs their own slice; statistics last; the privacy delete (CUS-09) is in. | Slices 4.1, 4.5–4.7 |
| D4-12 | **Module boundaries** (`ENGINEERING-STANDARDS.md` §1). | Two new modules: **`orders`** (orders, lines, numbering, pricing, the call log, status, tracking, returns, staff-recorded payments) and **`customers`** (customers, addresses, shoppers and their sign-in; amended 2026-10-30 in Slice 4.4b: shoppers and their sign-in are a third module, **`shoppers`**, depending on `customers`' tables, the balance, SMS and delivery's thana list, so `customers` stays light for `orders`). `orders` depends on `catalogue`, `inventory`, `delivery` and `customers`; `customers` depends on nothing new. The plan fee, quotas and usage stay in `balance` and `usage`, called through their existing services in the order's transaction. Combo parts belong to `catalogue`; a combo's order-line components to `orders`. | All |
| D4-13 | **Order limits per minute** (RTE-06, RTE-08). `RED-11` asks for exact counters in PostgreSQL for order creation and shopper codes; D3-2 built in-process windows, exact while there is one server. | Per-visitor and per-shop order-creation windows, and the per-visitor shopper-code window, on the D3-2 limiter now; Phase 9 moves them to PostgreSQL counters with the Redis swap. | Slices 4.2, 4.4 |
| D4-14 | **Shopper accounts** (CUS-03 to 06). Owners' sign-in codes live in `control.verification_challenges`, whose indexes are still open (KNOWN-GAPS §95). | Shoppers belong to one shop: `tenant.shoppers`, their sessions and saved addresses, and their own one-time codes, separate from the owners' challenges. Amended 2026-10-30 (Slice 4.4's read): the code is sent once, to make the account, and charged to the shop's balance (CUS-04); a shopper signs in with phone and password. | Slice 4.4 |

---

## 3. Requirement coverage

Rules used below: **completed** means every pass criterion is provable by the end of this phase; **partial** means
this phase builds a working part and a named later phase finishes it. Notices delivered through a D4-10 stand-in
count as complete.

### 3.1 Completed by this phase

| Family | Requirements |
|---|---|
| ORD | ORD-01, 02, 03, 04 (amended), 05, 06, 06a, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 40, 41 (amended), 43, 45, 46, 47, 48, 50, 51 (added), 52 (added) |
| QTA | QTA-01 – QTA-07 (the manual trigger; Phase 6's courier booking calls the same counting) |
| CMB | CMB-01 – CMB-10 |
| CUS | CUS-01 – CUS-07, CUS-09 |
| STA | STA-01 – STA-04 |
| TAX, MNU | TAX-01 – TAX-03, MNU-01 – MNU-04 |
| LND | LND-07, 08, 09, 11, 12, 13, 15, 16 |
| SFT | SFT-08, SFT-09, SFT-20 |
| From Phase 3's partials | PRD-06, 07, 08, 13; ATR-07, 08, 09, 15; ATL-06; UOM-04; INV-14, 15, 17, 23, 24; MED-09; CCH-07; DAT-13; API-21; RTE-06; DLV-03, 04, 06, 07 |
| PYG | PYG-02, 03, 04, 05, 14 (the order fee at handling, never at creation) |

### 3.2 Partially completed by this phase

| Req | Done in this phase | Remaining | Finished in |
|---|---|---|---|
| ORD-07 | `pending` for cash on delivery; staff choose a status | `unverified` for an order awaiting an online payment | Phase 5 |
| ORD-08 | confirming call, manual shipped and delivered, cancel and return moves with history | moves from payment events and courier reports | Phases 5, 6 |
| ORD-20 | the in-app notice through the console stand-in, never for staff-entered orders | push and SMS | Phase 7 |
| ORD-42 | whole-order shipped and delivered | partly shipped and partly delivered from courier reports | Phase 6 |
| SFT-06 | checkout through the public order endpoint with its key, cash on delivery | payment methods | Phase 5 |
| LND-10 | cash-on-delivery products order directly | advance and full prepayment through the payment page | Phase 5 |
| INV-16 | expiry exists (Phase 3); no Phase 4 order awaits an online payment | reservations set to expire with the payment session | Phase 5 |
| ATR-13 | effective weight and delivery charge used by order pricing | used by courier booking | Phase 6 |
| RTE-08 | order creations per minute per shop, one figure for every plan (amended 2026-10-30) | payment sessions per minute | Phase 5 |
| API-07 | public keys create orders, read tracking, locations and the estimate, and sign shoppers in | payment sessions, courier locations, chat | Phases 5–7 |
| API-11 | required on order creation; reworked keys (D4-8) | required on payment sessions | Phase 5 |
| LIM-02, LIM-04 | orders on the usage page and their counters | payment sessions | Phase 5 |
| TRL-03, PLN-19 | handled orders on a trial; "unlimited" honoured for orders | paired device, sessions | Phase 5 |
| DWN-12, DWN-14, DWN-15, UPG-10 | orders in the downgrade checklist and the per-period reset | payment sessions | Phase 5 |
| AUD-01 | order created, edited, status changed, deleted; payment recorded; call logged | payment verified by the listener or gateway | Phase 5 |
| LIF-16, LIF-19 | the export and the day-60 deletion include orders, customers and products (KNOWN-GAPS §13) | payments, chat, courier credentials | Phases 5–7 |

### 3.3 Listed for Phase 4 but not built here

| Req | Why | Goes to |
|---|---|---|
| ORD-30 – ORD-34 | extraction needs the AI provider (D4-5) | Phase 7 |
| ORD-44 | refunds come with payments (PAY-20) | Phase 5 |
| ORD-49 | auto-archive is a convenience on top of ORD-48; deferred (D4-5) | later |
| CUS-10 – CUS-13 | courier areas need couriers | Phase 6 |
| FPR-01 – FPR-04 | formula pricing, adopted for "any time after Slice 1", is not needed by orders | unscheduled |
| KYC-01's handled-order trigger | reads `handled_at`, which this phase sets; the KYC flow itself is not yet in `IMPLEMENTATION-PLAN.md` | unscheduled |

### 3.4 Dependencies between requirements

Read each row as: the requirements on the left can only be built or proven once those on the right exist.

| Requirement(s) | Depend on | Why |
|---|---|---|
| ORD-01, ORD-02 | PRD-07 (INV-15), ORD-06 (D4-9), CUS-01 | an order holds its stock, is priced by the one function and updates its customer |
| ORD-06, ORD-06a, SFT-20, LND-08 | DLV-02, DLV-03, RAT-14, PRD-08, TAX-01 | one function: zone, overrides, weight extras, policy, tax |
| ORD-04 | — | a counter per shop per day (D4-4) |
| ORD-51, ORD-52 | ORD-41 | a confirming call and a cancellation are status moves |
| ORD-09, QTA-01, PYG-02 | INV-15 consume, INV-14 serials | marking shipped takes the stock out and is the handling moment |
| ORD-10 | INV-15 release, INV-17 | cancelling releases; a return restocks or writes off |
| ORD-43, ORD-16, ORD-22 | ORD-15 (D4-6) | payment status follows the recorded payments |
| ORD-17, ORD-18, SFT-08 | ORD-05, CUS-03 | tracking by ID, and by phone for a signed-in shopper |
| SFT-06, LND-07 – 12 | ORD-02, API-11 (D4-8), CUS-08, RTE-06 | the storefront and the landing form create an ordinary public order |
| LND-15 `Purchase`, LND-16 | ORD-02, FED-02 | the event fires when an order is created, with the feed's item IDs |
| CMB-03 – 05 | INV-15, ORD-46 | a combo reserves, ships and returns each part |
| STA-01 – 04 | ORD-40, ORD-43, INV-18 | figures read paid orders and their costs |
| QTA-02, LIM-02 | UsageWarnings, usage metrics | the generic warning path and usage page gain orders |

### 3.5 Rework of code and documents built before this phase

| What | Today | After | Slice |
|---|---|---|---|
| Idempotency (API-11) | global keys, optional header, a failure locks the key for 24 hours, reply stored outside the transaction | D4-8 | 4.1 |
| `DeliveryZoneService.resolve`, `ShopDeliveryRateService.get` | open their own transaction | also take the caller's transaction, for pricing inside order creation | 4.1 |
| A variant's effective price, weight, delivery mode and payment policy | private inside `ProductService` | one shared read used by product detail, the public catalogue and order pricing | 4.1 |
| `GET /locations` | dashboard only, though promised to public keys | also a public route (CUS-08) | 4.2 |
| `stock_reservations.order_id`, `serial_numbers.sold_order_id` | held by value | foreign keys to `tenant.orders` | 4.1 |
| `DATABASE-SCHEMA.md` §3.3 | `ORD-YYYYMMDD-NNNN`, no daily counter, no advance or zone columns, `numeric(10,2)` money, no `landing_page` source | §4 of this plan | 4.1 |
| Storefront and dashboard sketches | SMS promised on confirmation; no Confirmed status, call log or cancel reasons; Phase 6–7 parts inside Phase 4 screens | redrawn first, in Slice 4.8 | 4.8 |
| `IMPLEMENTATION-PLAN.md` Phase 4 | extraction listed in Phases 4 and 7; SFT-06/08/09/20 and RTE-08 missing | this plan | 4.0 |

---

## 3.6 Architecture for this phase

- **Two new server modules** (D4-12), each with ports and adapters, white-box service tests over the real database,
  and dashboard routes in the team module as before.
- **Order creation is one transaction:** number, customer upsert (CUS-01), lines priced by `OrderPricing`, stock
  reserved (`ReservationService.reserve`), the idempotency reply stored (D4-8), the audit entry -- all or nothing.
  Locks follow KNOWN-GAPS §75's order: products, levels, reservations, batches, serials. Amended 2026-10-29 (Slice
  4.1, KNOWN-GAPS §98): then the customer, locked only to work out its figures, and the day's counter row last, so
  the number is taken only as the order is finished and 50 orders at once never queue past the statement timeout.
- **Handling is one transaction:** consume the reservations, set `handled_at` once, count the order (QTA), charge the
  pay-as-you-go fee (`PayAsYouGoBillingService.chargeOrderFee`, PYG-02) -- so a refusal at a limit or a short
  balance leaves the order unchanged (PYG-04).
- **Public ordering** goes through `PublicKeyGuard` on `api.lytro.app/v1`, the per-visitor and per-shop windows
  (D4-13), and the reworked idempotency; prices and stock are read from PostgreSQL at order time (CCH-07).
- **Meta's `Purchase` event** (LND-16) is sent from the job queue after commit, with the browser event's ID, through
  a circuit breaker (PRF-05), its token use logged (SEC-11); a failure never touches the order.
- **The visible status is computed**, never stored: a fixed lookup from the two axes, the confirmed mark and the
  manual overrides (ORD-41), shared by the list filter, tracking and the API.

---

## 4. Database work

All in the `tenant` schema with RLS forced, unless marked `control`; money `numeric(12,2)` throughout (DAT-05).

| Table | What | For |
|---|---|---|
| `order_counters` | `(tenant_id, day)` → `last_number`, the purchase counters' pattern | ORD-04 (D4-4) |
| `orders` | schema §3.3, plus: `order_number` `YYMMDD-NNNN`; `confirmed_at`, `confirmed_by`; `cancel_reason`, `cancel_note`; `fulfilment_type` (delivery, takeaway, dine-in) and `table_ref`; the delivery zone's id and name as held at order time; `advance_due`, `cod_amount`; the manual `courier_name`, `tracking_code`, `tracking_link`; `shipped_at`, `delivered_at`; `handled_at`; `source` (dashboard, api, storefront, landing_page); `status_override` checked to hold, cancelled, in_review | ORD-01 – 16, ORD-41, ORD-51, ORD-52, MNU-04, PRD-08 |
| `order_lines` | schema §3.3, plus the line's payment policy and advance, captured inputs (ATR-08), tax class name, rate and amount (TAX-02), chosen modifiers (MNU-02) | ORD-46, PRD-08, ATR-08, TAX-02, MNU-02 |
| `order_line_components` | schema §3.2 (combos) | CMB-03 – 05 |
| `order_status_history` | schema §3.3 | ORD-08 |
| `order_calls` | each call: outcome (confirmed, no answer, call back later, cancelled), note, call-back time, who, when | ORD-51 |
| `payments` | schema §3.4's columns used by manual entry: order, wallet name, sender number, transaction ID, amount, verified, recorded by; `control.used_transaction_ids` for platform-wide uniqueness | ORD-15, ORD-22 (D4-6) |
| `customers` | schema §3.3, plus trigram indexes on name and phone, and `erased_at` for a privacy delete | CUS-01, CUS-02, CUS-09, DAT-13 |
| `shoppers`, `shopper_sessions`, `shopper_codes`, `shopper_addresses` | a shop's shoppers, their tokens, one-time codes and up to 10 saved addresses (built in Slice 4.4b; the addresses are the account's, so named for it) | CUS-03 – 07 (D4-14) |
| `combo_parts`, `combo_part_variants`; `products.kind` | schema §3.2 | CMB-01, 02, 06 – 10 |
| `tax_classes`, `products.tax_class_id`; `modifier_groups`, `modifier_options` | | TAX-01, MNU-01 |
| `control.idempotency_keys` | scoped to shop and caller (D4-8) | API-11 |
| plan limit keys | `orders_handled_daily` (QTA-05) beside today's `orders_total` and `orders_handled_monthly`; the platform settings `order_limit_mode` (QTA-03) and `public_orders_per_shop_per_minute` (RTE-08, one figure for every plan since 2026-10-30) | QTA, RTE-08 |
| foreign keys | `stock_reservations.order_id` / `order_line_id` and `serial_numbers.sold_order_id` to orders and lines | INV-15 |

---

## 5. API surface for this phase

Every route lands in `API-CONTRACT.md` with its slice; the isolation registry gains each shop-owned one (SEC-02).

- **Dashboard** (`orders:*`, `customers:*`, `payments:manage`):
  - `POST /orders`, `GET /orders` (status, both axes, source, cancel reason, dates, search), `GET /orders/:id`,
    `PATCH /orders/:id`, `DELETE /orders/:id`;
  - `POST /orders/:id/calls`; `POST /orders/:id/cancel`; `POST /orders/:id/override`;
  - `POST /orders/:id/ship`, `POST /orders/:id/deliver`, `POST /orders/:id/returns`;
  - `POST /orders/:id/payments`; `GET /orders/:id/print`;
  - `GET /customers`, `GET /customers/:id`, `DELETE /customers/:id`;
  - the statistics reads; tax classes; combo parts and modifiers inside the product routes.
- **Public** (`api.lytro.app/v1`, a public key):
  - `POST /v1/orders` (`Idempotency-Key` required), `GET /v1/track/:trackingId`;
  - `GET /v1/locations`, `POST /v1/delivery-estimate`;
  - `POST /v1/shopper/code`, `POST /v1/shopper/signup`, `POST /v1/shopper/signin` (Slice 4.4b's read: a code once,
    then a password), `POST /v1/shopper/signout`, `GET` and `PATCH /v1/shopper/me`, `POST /v1/shopper/password`,
    `/v1/shopper/addresses`, `GET /v1/shopper/orders` (ORD-18); and on the dashboard `POST /customers/:id/password`
    (CUS-14).

---

## 6. Slices

### Slice 4.0: the plan
- **Delivers:** this plan; `SRS-detailed.md` §2.3.1, ORD-04, ORD-07, ORD-08 and ORD-41 amended, ORD-51 and ORD-52
  added; `IMPLEMENTATION-PLAN.md` Phase 4 brought in line. Docs only.

### Slice 4.1: order core and staff orders
- **Depends on:** Phase 3's backend (amended with D4-1, 2026-10-29).
- **Read agreed 2026-10-29:** one PR for the whole slice; an order is deleted only before it ships and with no
  verified payment (ORD-12 amended); a customer counts its orders not cancelled or deleted and its spending on
  delivered orders, and takes the latest order's name (CUS-01 amended); a delivery needs the customer's name,
  phone, thana and address, a takeaway the name and phone, a dine-in only its table (MNU-04, ORD-01 amended).
  Also settled: items change until the order ships, holding their stock afresh in one transaction (refused
  whole if short); staff start an order `pending` or `confirmed`; a price or delivery charge set by hand is kept in
  the order's history; the zone is resolved when the order is made and kept with its name and charge; each item
  keeps its photo's media id and link (MED-09's count). A cancellation is final. The New order screen's totals
  come from `POST /orders/quote`, priced by the same `priceOrder`.
- **Delivers:** the schema of §4 for orders, lines, counters, history, calls and customers; numbering (D4-4) and
  tracking IDs (ORD-05); `OrderPricing` (D4-9) with delivery, takeaway and dine-in (MNU-04); staff creation (ORD-01)
  holding stock (PRD-07) and snapshotting each line (ORD-46, ATR-08, ATR-09, ATL-06, UOM-04, INV-24); the staff
  warning for a no-delivery zone or a limited product (DLV-06, DLV-07); the list, search and detail (ORD-13, ORD-14,
  ORD-45, DAT-13); edits (ORD-11); the call log, Confirm, Hold, In review and cancellation with its reason (ORD-41,
  ORD-51, ORD-52, ORD-10's release); delete (ORD-12); order audit entries (AUD-01); the idempotency rework (D4-8);
  PRD-06, PRD-13, ATR-15, MED-09's warning; orders in the data export and the day-60 deletion.
- **Rework:** §3.5's rows for this slice.

### Slice 4.2: public ordering and tracking
- **Read agreed 2026-10-30:** the shop-wide window on shoppers' orders (RTE-08) is one figure for every plan, [60] a
  minute, a platform setting, its refusals counted -- a flood guard, never a cap on demand (QTA-07; RTE-08 and
  2.1's row amended); tracking follows the storefront sketch's courier line, the courier and its link once shipped,
  never the address or phone, a hold or review showing the status under it (ORD-17 amended); a shopper's comment is
  its own field, `shopper_note`, never edited by staff (LND-07 amended). Also settled: delivery only, as the sketch
  draws; `source` is the Lytro storefront key's to say (`storefront` or `landing_page`), any other key's order is
  `api`; LND-10 reworded to the call flow (a cash-on-delivery order waits as pending, ORD-07). Backend only: the
  storefront's checkout and the landing form stay disabled until Slice 4.8. ORD-02's secret keys wait for Phase 8;
  SEC-11's log of a token's use is a server log line until a store for it lands with Phase 5's gateways.
- **Delivers:** `POST /v1/orders` (ORD-02, ORD-21) with cash on delivery only (D4-2), available variants only
  (ATR-07), no inactive product (PRD-06), no-delivery and limited zones refused (DLV-06, DLV-07), prices read from
  PostgreSQL (CCH-07); the per-visitor and per-shop windows (RTE-06, RTE-08, D4-13); public locations and the delivery
  estimate (CUS-08, SFT-20, LND-08's backend), already built in Phase 3 Slice 12a (pulled forward 2026-10-29, for the
  storefront's product and landing pages), the estimate answering each item as it stands since Slice 12b (the cart's
  check); tracking by ID (ORD-17); the new-order notice (ORD-20, D4-10); Meta's
  server-side `Purchase` (LND-16); writes made with a key audited (API-21).

### Slice 4.3: fulfilment, limits, fees and payments
- **Read agreed 2026-10-30:** marking an order Delivered collects what is due as a cash-on-delivery payment, so it is
  paid with nothing due, until Phase 6 matches courier settlements (ORD-43 amended); a takeaway or dine-in order is
  handed over in one step, which handles, charges, delivers and collects it (QTA-01, PYG-02 amended); shipping an order
  no call confirmed confirms it (ORD-51 amended); a cash payment needs no transaction ID (Slice 4.3b). Also settled:
  two parts -- **4.3a** shipping, handing over, delivering and returning, with the handling limits and the pay-as-you-go
  fee, and `tenant.payments` for the collected cash; **4.3b** payments recorded by staff -- returns item by item, the
  order returned once every unit is back; a held or in-review order is not sent; no extra-orders add-on seeded (the
  operator can add one with `limit_key` `orders_handled_monthly`); the usage page's orders figures are counted now and
  drawn with Slice 4.8's screens; the activity log records each move as the order's status changing.
- **4.3b read agreed 2026-10-30:** a payment received as a staff order is entered is saved with it under the same
  idempotency key and needs `payments:manage` as well as `orders:manage` (ORD-22 amended); a payment above what is due
  is refused; a payment recorded by mistake is voided with a reason by `payments:manage`, stays on the order marked
  void and stops counting, and its transaction ID may be recorded again on that shop's orders, never another shop's
  (ORD-15 amended). Also settled: the record route `POST /orders/:id/payments`; a wallet needs the sender's mobile and
  the transaction ID, a bank transfer its reference, cash neither; any method, whatever the shop lists; refused on a
  cancelled order; partially paid and paid as ORD-43, a met advance counting as paid. Following from those: an edit
  may not bring the total below what is paid (ORD-43 amended); the cash on delivery a delivery collected is not
  voided; an ID the shop used to pay Lytro is refused like another shop's; each payment recorded or voided is in the
  activity log (AUD-01's "payment verified").
- **Delivers:** Mark shipped with a tracking code, serials and earliest-expiry stock (ORD-09, INV-14, INV-15,
  INV-23), Delivered, and returns line by line (ORD-10, INV-17); the two axes and the computed status (ORD-40 – 43,
  ORD-45); staff-recorded payments (ORD-15, ORD-16, ORD-22, D4-6); the handling quota with its limit keys, mode,
  warning and usage (QTA-01 – 07, LIM-02, LIM-04, TRL-03, PLN-19, DWN-12, DWN-14, DWN-15, UPG-10); the pay-as-you-go
  order fee at handling (PYG-02 – 05, PYG-14).

**Checkpoint "4A" after this slice:** staff take, confirm, ship and settle orders end to end (exit criterion 2 minus
combos and statistics). If velocity suggests it, the rest can become Phase 4B without re-planning.

### Slice 4.4: customers and shopper accounts
- **Read agreed 2026-10-30:** a shopper makes an account with a code sent once to the phone, then a name and a
  password, and signs in with phone and password from then on (CUS-03 amended); the code is charged to the shop's
  balance at the SMS rate, never the free allowance, and not sent when the balance can't cover it (CUS-04, SMS-06
  amended); a forgotten password is set again by staff with `customers:manage` (CUS-14 added); a signed-in shopper
  sees every order with their phone, from any source, each opening its tracking (ORD-18, CUS-05 amended); accounts
  are made on the sign-up page only, a guest order making none (CUS-07 amended; an account at checkout is for later);
  a privacy delete is refused while an order is on its way (CUS-09 amended). Also settled: two parts -- **4.4a** the
  customers list, search and page, the order history by customer, and the privacy delete; **4.4b** shopper accounts,
  sign-up and sign-in, profile, saved addresses and their orders, and the staff password reset -- the privacy delete
  also clearing the stored replies of the customer's orders, which hold their details (API-11). Settled building
  4.4b: the shoppers' accounts are their own module, `shoppers`, so `customers`, which orders depend on, stays free of
  the balance, SMS and password pieces (D4-12); a shop sends at most 30 sign-up codes an hour (SMS-11's per-tenant
  limit), a phone one a minute and five an hour, a visitor five a minute (RTE-06); a code's text names the shop, in
  the shopper's language; the token lasts 30 days and comes back as `X-Shopper-Token`.
- **Delivers:** customers' list, search and detail (CUS-01, CUS-02); shopper codes, sessions, profile and saved
  addresses (CUS-03 – 06, D4-14), the per-visitor code window (RTE-06); track by phone (ORD-18); the optional account
  on guest checkout (CUS-07); the privacy delete (CUS-09).

### Slice 4.5: combo packs
- **Read agreed 2026-10-30:** one pull request; a combo's parts may be changed while open orders hold it, each open
  order keeping the components it was ordered with (CMB-04 amended); a combo comes back whole, each component
  sellable or damaged (CMB-05 amended); low-stock notices come from the components only (CMB-02 amended); a
  product's kind is chosen at creation and never changes (CMB-01 amended); every sale and return in stock history
  shows its order, and one through a combo names the combo -- the server read now, the history sheet drawn in 4.8
  (CMB-05 amended). Backend only; the screens are Slice 4.8's. Settled building: the choices describe one combo, a
  line of N combos is N alike and combos picked differently go on separate lines (CMB-03 amended), so returns stay
  whole; a combo is made to order with one variant, no stock level of its own and a piece unit; its state is worked
  out again in the ledger whenever a part's stock or status moves; a part's variants and a line's components each
  keep their place (the order the shop listed them, the order they were picked); a combo's weight is its own, else
  its parts' (CMB-07); a combo line is one order line at the combo's own price, its components carrying no money.
- **Delivers:** CMB-01 – CMB-10: the combo kind and its parts, "can make N", ordering, shipping and returning each
  part, the saving, delivery and weight, the zone rule, never a silent change, and the limits.

### Slice 4.6: tax and modifiers
- **Read agreed 2026-10-30:** prices include the tax (Bangladeshi MRP style), so an order shows "includes ৳X VAT" per
  class and no total changes; items are taxed after their discounts, the delivery charge never (TAX-01 to TAX-03
  amended); a shop names one default class each new product starts with; a combo line takes the combo's own class;
  modifier groups belong to each product, never a combo, and both staff and shoppers choose them. Coded on top of Slice
  4.5 (the overlap in order creation), in two parts: **4.6a** tax classes and their lines, **4.6b** modifiers. Settled
  building 4.6a: up to 20 classes, one name each ignoring case, a rate of 0 to 100 with two decimals; each line's tax
  rounded to the paisa, the class lines summing them; the product form reads the classes with `products:read`,
  changing them needs `settings:manage`.
- **4.6b read agreed 2026-10-30:** a group a line names nothing for takes its defaults; a price change may be negative,
  but never takes a unit price below zero; a price set by hand is final, its choices still kept; an edited line given
  its choices again takes the options' prices of that day (MNU-01 to MNU-03 amended). Settled building 4.6b: up to 10
  groups a product and 20 options a group, names up to 60; a group's most is at least 1 and no more than its options,
  its defaults no more than its most; modifiers change neither stock nor weight; every variant shares its product's
  groups; the tax is worked on the unit price with the choices in it; the public product shows the groups; the line
  keeps a copy of each choice (group, option, price change), so groups changed or removed later leave orders as they
  were; a copy of a product copies its groups.
- **Delivers:** tax classes and their lines on an order (TAX-01 – 03); modifier groups, their choices on a line and
  their limits (MNU-01 – 03).

### Slice 4.7: sales figures
- **Read agreed 2026-10-30:** an order counts once delivered (the user's pick over paid-or-part-paid; STA-01 amended),
  on the Asia/Dhaka day it was placed; revenue is the items after discounts, tax included, with the delivery charges
  and the tax inside it shown on their own; returned units come off units and revenue; a combo counts as itself in the
  best sellers (STA-02 amended); profit is the items' revenue less its tax, less the cost of the goods kept, with
  delivery charges left out (INV-18 amended); weeks start on Saturday; `orders:read` sees the figures, and profit needs
  `inventory:manage` (D3-9). Backend only; the screens are Slice 4.8's. Settled building: one pull request, no
  migration; an order every unit of which came back is not counted (STA-04 amended); a line's revenue takes off the
  same share of the order's discount its tax was worked out on (TAX-02), so revenue and tax agree; the shop's revenue
  is the sum of its lines', so the best sellers add up to it; units are totalled per stock unit, never across units;
  a period is at most 1,830 days, the first and last bucket cut to it; best sellers default to 10, at most 50; a
  product deleted for good ranks under its items' name.
- **Delivers:** orders and revenue by week, month, quarter and year; best sellers by units and by revenue; trends;
  test and refunded orders excluded (STA-01 – 04); profit beside stock value from each shipment's cost (INV-18).

### Slice 4.8: the screens
- **Sketch first** (`sketch-every-screen-before-building`): the status flow with the call log, Confirm, cancel
  reasons, Mark shipped and returns; the storefront's checkout for cash on delivery, the confirmation without an SMS
  promise, tracking with its Confirmed step; the Phase 5–7 parts of today's drawings shown as later.
- **Dashboard:** Orders, Order detail, New order, Customers, the Phase 4 parts of Stock (shortfall, returns, profit),
  search over orders and customers, Home's order rows and tiles, New order in the + menu, orders on Usage, printing
  (ORD-19).
- **Storefront and landing pages** (in Slice 12's app): checkout, confirmation, tracking and the shopper account
  (SFT-06, SFT-08, SFT-09, SFT-20); the landing page's order form (LND-07 – 12) and its Pixel events (LND-15).

---

## 7. Slice dependencies and order

```
Phase 3 (Slices 11, 12, 13) done
        │
        ▼
4.0 plan ──► 4.1 order core ──► 4.2 public ordering ──► 4.3 fulfilment, limits, fees  ◄── checkpoint 4A
                                                              │
                         4.4 customers and shoppers ◄─────────┤
                         4.5 combos ◄──────────────────────────┤
                         4.6 tax and modifiers ◄───────────────┤
                         4.7 sales figures ◄── (4.3, 4.5) ─────┘
                                   all backend slices ──► 4.8 the screens
```

| Slice | Depends on | Can run in parallel with |
|---|---|---|
| 4.1 Order core | Phase 3 | — |
| 4.2 Public ordering | 4.1 | 4.3 |
| 4.3 Fulfilment, limits, fees | 4.1 | 4.2 |
| 4.4 Customers and shoppers | 4.1, 4.2 | 4.5, 4.6 |
| 4.5 Combos | 4.1, 4.3 | 4.4, 4.6 |
| 4.6 Tax and modifiers | 4.1 | 4.4, 4.5 |
| 4.7 Sales figures | 4.3, 4.5 | — |
| 4.8 Screens | 4.1 – 4.7; Phase 3's Slices 11 and 12 | — |

**Suggested order for one developer:** 4.0 → 4.1 → 4.2 → 4.3 (checkpoint 4A) → 4.4 → 4.5 → 4.6 → 4.7 → 4.8, the
screens last as one pass, as Phase 3's Slice 11 was.

---

## 8. Non-functional requirements for this phase

- **Concurrency:** 50 creations at once get 50 consecutive numbers; 100 attempts at 50 units never oversell; two
  shipments of one order never consume twice; the same idempotency key sent twice at once creates one order.
- **Integrity:** an order's totals re-derive from its lines; a customer's count and spend re-derive from its orders;
  `reserved` still equals the active reservations (INV-05) after every order test.
- **Performance:** `EXPLAIN ANALYZE` on order creation and the list (`ENGINEERING-STANDARDS.md` §5); keyset pages;
  no per-line query in the list or the detail; public reads within PRF-03's 500 ms.
- **Security:** RLS on every new table; tracking never returns an address or phone (ORD-17); a shopper's token reads
  only their own orders (CUS-05); the isolation registry covers every new route; personal fields gone after CUS-09.
- **Language:** every new string in Bangla and English, in the owner's style guide (familiar terms transliterated,
  explanations as sentences); order numbers and money with Western digits.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Phase size (nine slices) | checkpoint 4A after Slice 4.3; the rest can become Phase 4B without re-planning |
| The status model grows complex with overrides, two axes and the confirmed mark | one lookup function with an exhaustive table test over every combination; the visible status is never stored |
| Pricing drifts between the estimate, the form and the order | one function (D4-9); a test that the estimate and the created order agree for random carts |
| Phase 5's payments or Phase 6's couriers need a different order shape | the schema leaves room (payment axis values, `processing`, courier columns); D4-6's table is Phase 5's own |
| Slice 12's storefront is not ready when 4.8 starts | 4.1 – 4.7 need only the API; 4.8's storefront half waits for Slice 12 |
| Shopper codes cost SMS | per-visitor window (RTE-06), counted on the essential allowance (CUS-04) with its warnings |
| Meta's API is slow or down | the queue, retries and a circuit breaker; the order never waits on it |

## 10. Definition of done (per slice)

Same as Phase 3:
- its own branch and PR
- every listed requirement proven by a test written against its pass criteria
- a sabotage-confirm-restore pass on the slice's central rule
- `typecheck`, `lint`, `build` and every package's tests clean, the full server suite, and a real boot of the built
  server
- the isolation registry updated for any new shop-owned route
- `KNOWN-GAPS.md` updated if anything listed here turns out not to hold
- this plan's slice entry marked shipped with its PR number
