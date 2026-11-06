# Phase 6 plan: couriers

Status: agreed 2026-11-04. D6-1 to D6-9 were settled in the Phase 6 read the same day; D6-10 to D6-14 follow from them
or from existing requirements, and were raised with this plan. Builds on `IMPLEMENTATION-PLAN.md` Phase 6, with these
changes:

- **Server work starts now, beside Slice 5.8;** Phase 6's own screens come last (D6-1).
- **Couriers' messages bring the live news, and one check a night covers what they miss** (D6-3, D6-4). No courier
  lets Lytro register its address, so the owner pastes it into the courier's panel. CRR-02 and CRR-27 assumed otherwise.
- **A courier's area is chosen at booking, only where the courier requires one** (D6-5). CUS-13's picker on every order
  form is withdrawn.
- **One parcel per order** (D6-6), and **stock leaves at booking** (D6-7). Stock only comes back when a person counts it.
- **Cancelling a booked order:** from Lytro where the courier allows it, otherwise staff confirm they did it in the
  courier's panel (D6-8).
- **Courier money:** Lytro records what each courier tells, with no settlement page (D6-9).

Requirement IDs refer to `SRS-detailed.md` §17 (CRR), CUS-08 to CUS-13, and the ORD, INV, QTA and PYG rows named below.
Schema refers to `DATABASE-SCHEMA.md`, which each slice brings in line with §4 of this plan. What the couriers' own
documents say is in Appendix A, with where each fact came from. Nothing in it has been tested live yet.

Reopening a decision in §2 needs an explicit change to its row, not a silent deviation during a slice. The points §2.1
leaves to a slice's read are settled there, each with its own answer.

---

## 1. Goal and exit criteria

**Goal.** A shop connects its own courier account once. Staff book a confirmed order from its page in one step, choosing
an area only if that courier needs one. From then on the order moves by itself: the courier's messages bring live news,
one check a night covers anything they missed, and the cash is recorded when the courier confirms delivery. Money
between a courier and a shop never passes through Lytro.

**Phase 6 is complete when all of these hold:**

1. Every requirement in §3.1 has a passing automated test, or, for `MAN` requirements, a recorded manual check.
2. **The golden path** passes as one test for each courier, against its fake: a cash-on-delivery order → its confirming
   call → booked → stock out with its serials, the handling limit counted once and the fee charged once → news moves
   it to shipped → delivered, its cash recorded and nothing due. At every step the parcel, the order's two axes, the
   stock and the balance agree. It passes three ways: news by message, by the night check alone, and by Sync.
3. **A booking never doubles:** two at once make one parcel (CRR-08); a refused booking changes nothing, the balance
   included (CRR-07, PYG-04); a lost answer never leads to a second parcel (D6-11).
4. **News can't be forged or counted twice:** an unknown path is refused before any adapter code, a wrong signature is
   refused and logged (CRR-11), a repeat adds nothing (CRR-13), a report that arrives late can't move an order
   backwards, and a status the adapter doesn't know moves nothing (CRR-29).
5. **Nothing comes back without a person:** a partly delivered or returning parcel moves no stock until staff count it
   (D6-6, ORD-10, INV-17).
6. **Cancelling:** a booked order cancelled before pickup gets its stock back and keeps its fee and count; a delivered
   report arriving afterwards goes to staff and reopens nothing (CRR-28).
7. **Calls stay down:** a test counts outbound calls and proves the rules in D6-4: no page makes one, a parcel with
   recent messages gets none, a finished parcel never gets one, and a second Sync inside the limit gets none.
8. **The boundary holds:** the contract suite (CRR-21) passes for all three couriers, and adding Pathao and RedX changed
   no booking or order code beyond the adapter and what the adapter declares. That is the reason for building three.
9. **The milestone:** one real booking through to one real message for each courier, recorded: Steadfast on a real
   account, because it has no sandbox; Pathao and RedX in their sandboxes if those send messages, otherwise on a real
   account.
10. CI is green on `main`, and the pull-request flow has been used for every slice.

---

## 2. Decisions

**D6-1 to D6-9 agreed 2026-11-04** (the Phase 6 read).

| # | Decision | Decided | Affects |
|---|---|---|---|
| D6-1 | **When.** Slice 5.8's screens aren't started, and nothing here depends on them. | Server slices 6.1 to 6.6 start now, beside 5.8 in a separate session. Slice 6.7's screens come after them. | Planning |
| D6-2 | **Which couriers.** | All three, in this order: Steadfast, Pathao, RedX. RedX is the most work and can be dropped later without touching the others. | Slices 6.1, 6.3, 6.4 |
| D6-3 | **How Lytro hears the news.** CRR-02 and CRR-27 assume connecting a courier registers Lytro's address with it. None of the three offers a way to do that: the owner must paste it into the courier's panel. | Both routes. The courier's messages are the live news (the owner's words: "the real time status is provided by webhooks"), and one check a night is the safety net. Pasting is a normal step of connecting, with clear instructions, and never required: the connection says "no messages yet" until the first one arrives. CRR-02, CRR-15, CRR-27 amended. | Slice 6.2 |
| D6-4 | **Keeping calls to couriers down.** The owner asked for as few as possible. | One check a night, at about 23:00 Bangladesh time, for each parcel still on its way that is at least 6 hours old and has had no courier message in 24 hours. Only that check and the Sync button ever call a courier for status: no page, list or tracking view does. A finished parcel is never checked again. After 30 days with no change a parcel stops being checked and shows "no news from the courier", and Sync starts it again. Sync on a parcel checked in the last 10 minutes shows the saved answer, and there is no "sync all". Nothing runs for a lapsed shop, a disconnected courier or a login the courier refuses. If a check finds news that a working paste never sent, the owner is told, and the shop stays on the one check. These figures are platform settings. CRR-14, CRR-15 amended. | Slice 6.2 |
| D6-5 | **Courier areas.** Steadfast takes the address as text, Pathao's document says it fills its areas from the address, and RedX requires one. | Chosen at booking, by staff, only for a courier that requires one. Checkout, landing pages and order entry don't change. Pathao's text booking is confirmed in its sandbox first (§2.1). CUS-13 withdrawn; CUS-08, CUS-10, CUS-12, CRR-10 amended. | Slices 6.3, 6.4 |
| D6-6 | **Part of an order delivered.** Couriers report on the whole parcel, not item by item. | One parcel per order. A partly delivered report shows the order as partly delivered with the cash collected; staff say which items came back, sellable or damaged. `partially_shipped` stays unused. ORD-42 amended. | Slices 6.1, 6.2 |
| D6-7 | **When stock leaves.** Today it leaves at Mark shipped. | At booking, working as Mark shipped does: stock, serials, handling count and fee in one step, while a person is there to choose serials. CRR-06, ORD-10, INV-14, INV-15 amended, and CRR-22, which contradicted PYG-02: booking costs nothing of its own, and pay-as-you-go's order fee is charged as PYG-02 says. | Slice 6.1 |
| D6-8 | **Cancelling a booked order.** Only RedX's document has a cancel call. | RedX is cancelled from Lytro. For the others, Lytro asks whether staff have cancelled it in the courier's panel, then cancels the order and brings the stock back. The fee and count stay (PYG-04, QTA-01). A later delivered report goes to staff and reopens nothing. Added as CRR-28. | Slice 6.1 |
| D6-9 | **Courier money.** Steadfast lists payouts with amounts; Pathao and RedX say a parcel was paid, without one. | Lytro records what each tells: paid or not on each parcel, with the amount and delivery charge where given. Profit subtracts known charges and says how many orders have none. No page adds up what a courier owes. CRR-17 amended. Amended 2026-11-06 by Slice 6.5's read: no courier gives an amount per parcel, so the payout keeps it; delivery stays out of profit, and couriers' charges are a figure of their own. | Slice 6.5 |

**D6-10 to D6-14 follow from those or from existing requirements.** They weren't asked in the read, so the owner can
overrule any of them when reviewing this plan.

| # | Decision | Decided | Affects |
|---|---|---|---|
| D6-10 | **What can be booked.** CRR-09 says `pending` only; ORD-08 and the confirming call say `pending` or `confirmed`. | What `/ship` already accepts: a delivery order, `pending` or `confirmed`, not on hold or in review, with its advance in (D5-9). One nobody has confirmed is confirmed by whoever books it. CRR-09 amended. | Slice 6.1 |
| D6-11 | **A lost answer.** CRR-18 promises no duplicate parcel, but a booking that times out may still have made one. | The booking is `unknown`, never failed. Where the courier can be asked by Lytro's own number (Steadfast), Lytro asks and settles it. Otherwise the order says to check the courier's panel, and no second booking is allowed until staff enter the consignment ID or say it wasn't booked. CRR-18 amended. | Slice 6.1 |
| D6-12 | **Courier statuses and order statuses.** Couriers have many more statuses than the order does (§2.3.1). | No new order statuses. Each parcel shows the courier's own status beside the order's. The order moves only on a result the courier stands behind: Steadfast's `*_approval_pending` is "the rider's word" and settles nothing, and a hold, a parcel on its way back or a lost parcel shows without moving the order. Added as CRR-29. | Slice 6.2 |
| D6-13 | **By hand stays.** | Mark shipped (CRR-16, ORD-09) and Mark delivered stay for every shop, for couriers with no API and for the moment news is late. A later report that agrees changes nothing. | Slices 6.1, 6.2 |
| D6-14 | **Couriers' own limits.** Steadfast cuts long values without saying so; Pathao refuses them; Lytro allows a 500-character address, against Steadfast's 490 and Pathao's 220. | Each adapter declares its limits, and booking checks them before sending. An order outside them sends nothing and staff are told what to change, so a courier never receives a value it will cut. Added as CRR-30. | Slice 6.1 |

### 2.1 Points left to each slice's read

Each is settled in its slice's read, before code, and recorded there.

| Slice | To settle |
|---|---|
| 6.1 | Settled 2026-11-04: see Slice 6.1. |
| 6.2 | Settled 2026-11-05: see Slice 6.2. |
| 6.3 | Settled 2026-11-05: see Slice 6.3. |
| 6.4 | Settled 2026-11-06: see Slice 6.4. |
| 6.5 | Settled 2026-11-06: see Slice 6.5. |
| 6.6 | Settled 2026-11-06: see Slice 6.6. |
| 6.7 | Settled by its sketch: see that slice. |

---

## 3. Requirement coverage

Rules used below: **completed** means every pass criterion is provable by the end of this phase; **partial** means this
phase builds a working part and a named later phase finishes it. Notices through a stand-in port (D4-10) count as
complete.

### 3.1 Completed by this phase

| Family | Requirements |
|---|---|
| CRR | CRR-01 to CRR-30 (amended; CRR-21 and CRR-24 by a manual check) |
| CUS | CUS-10 to CUS-12 (amended), CUS-11 by a manual check |
| From Phase 4's partials | ORD-08 (courier moves), ORD-10, ORD-11 (the warning after booking), ORD-42, ORD-43 (a courier's report), ATR-13 and CMB-07 (weight at booking), INV-14, INV-15, QTA-01 to QTA-03 and PYG-02 to PYG-04 (booking as the trigger), API-11 (booking) |
| Others | LIF-13, LIF-19 (connections), AUD-01 (courier credentials changed), SEC-01, SEC-08 to SEC-10 and PRF-05 (for couriers), SUP-01 (connect a courier), INV-18 (delivery charges, as Slice 6.5's read settles) |

### 3.2 Partially completed by this phase

| Req | Done in this phase | Remaining | Finished in |
|---|---|---|---|
| CRR-25, CRR-28, CRR-15's notices | through a stand-in port | push and SMS | Phase 7 |
| NTF-03 | the event exists | "courier status change" as a push | Phase 7 |
| API-12 | the event exists | `courier.status_changed` to a shop's webhook | Phase 8 |
| API-CONTRACT's `session/secret` on `/book` | the session route | secret keys | Phase 8 |
| SEC-11 | every call with a courier credential logged per shop | the full security pass | Phase 9 |
| ADM-03, MON-05 | failed bookings readable by the operator's API | the operator console's rebuild | unscheduled |

### 3.3 Listed for Phase 6 but not built here

| Req | Why | Goes to |
|---|---|---|
| CUS-13 | withdrawn (D6-5) | never |
| `partially_shipped` (ORD-40) | one parcel per order (D6-6) | unused |
| Item-by-item courier reports (ORD-42) | couriers report on parcels (D6-6) | never |
| A settlement page | D6-9 | later, if asked |

**For Phase 7:** Steadfast's `/fraud_check/score/{phone}` returns a customer's delivery record with the shop's own key,
which bears directly on FRD-02 and OD-47.

### 3.4 Dependencies between requirements

| Requirement(s) | Depend on | Why |
|---|---|---|
| CRR-06, CRR-08, CRR-09 | `OrderFulfilment`'s first handling (QTA-01, PYG-02, INV-15) | booking is the same step as Mark shipped |
| CRR-11 to CRR-15, CRR-29 | CRR-06 | news needs a parcel to belong to |
| CRR-17, D6-9 | CRR-11, CRR-15 | payouts arrive by the same routes |
| CUS-10, CUS-12, CRR-10 | CUS-08's thanas | every area sits under one thana |
| CRR-21 | the adapter port | one suite, run by each courier |
| CRR-23 to CRR-25 | CRR-01, CRR-20 | retiring works on a registered adapter |

### 3.5 Rework of code and documents built before this phase

| What | Today | After | Slice |
|---|---|---|---|
| `OrderFulfilment.depart` | by hand only | its handling, stock and history steps shared with a booking's settling | 6.1 |
| `OrderService.cancel` | a `processing` order can't exist, and cancelling only releases held stock | a booked order's taken stock comes back with the opposite movement, its serials in stock again | 6.1 |
| `orders.courier_name`, `tracking_code`, `tracking_link` | typed by hand | filled on booking too, so tracking and the ship sheet's chips keep working with one definition | 6.1 |
| `OrderFulfilment.deliver`, `returnItems` | a staff actor; from `shipped` or `delivered` | a courier's report as the actor; from `partially_delivered` too | 6.2 |
| `timelineOf`, `trackedViewOf` | a fixed list of steps; the courier shown once shipped | the courier's news as well, in the viewer's language (CRR-12) | 6.2 |
| `API-CONTRACT.md` | `/locations/:id/courier-areas` for shoppers; `/book` moves `pending` only | staff only; `pending` or `confirmed` | 6.1, 6.4 |
| `DATABASE-SCHEMA.md` | `area_courier_key` and `courier_area_code` on orders; a thin `courier_connections` | §4 of this plan | 6.1 to 6.4 |
| API-07's "courier locations" | names a route shoppers no longer need | the location list | 6.4 |
| Drawings and copy | `order-book` asks Steadfast for an area; storefront checkout has a courier area field (`lytro-storefront.html`, `STOREFRONT-DESIGN.md`, `copy.ts`'s unused `courier_area`) | redrawn and removed | 6.7 |
| `SRS-detailed.md`, `TEST-PLAN.md`, `IMPLEMENTATION-PLAN.md` | the assumptions above | this plan | 6.0 |

### 3.6 Architecture for this phase

- **Couriers are plugins,** as gateways are (`WalletGateway`, `GatewayRegistry`): a `CourierAdapter` port registered by
  key, with an injected fetch and clock, and a fake courier per adapter in CI. An adapter declares its credential
  fields, its limits (D6-14), its status map, how it verifies a message and what it answers, and whether it can cancel,
  look up by our number, or needs areas. Shared code never asks which courier it is. Each runs one contract suite (CRR-21).
- **Booking is claim, call, settle,** and no database transaction stays open across a 30-second call. The claim, in one
  short transaction, refuses what can't be booked and writes a `booking` parcel; a unique index allows one live parcel
  per order (CRR-08). Because a courier's yes can't be taken back, whatever could refuse after it is dealt with here: the
  order takes its place under the limits, the fee is held, and the stock step is tried and undone. The call goes through
  the circuit breaker, scoped to shop and courier (CRR-26). An accepted parcel is written first and alone. Settling, in one
  transaction, moves the order, charges the held fee, takes the stock and writes the history. A parcel the courier accepted
  is never lost, whatever happens to settling: a stock problem is kept on the parcel for staff, and anything else is
  finished by the minute pass. A refusal ends the claim and gives everything back; a lost answer leaves it `unknown` with
  everything still set aside (D6-11).
- **News has one path.** A message, the night check and Sync all end in one method, which ignores repeats and old news,
  maps the status through the adapter, moves the order through `OrderFulfilment` and adds the timeline entry.
- **Messages are stored first.** The courier gets its answer inside its limit (Steadfast 5 seconds, Pathao 10) and the
  news is applied just after the answer, with the minute pass applying anything a restart left stored, so a slow apply
  never looks like a failed delivery. The address's token finds the shop
  before any adapter code runs (CRR-11). The raw body is kept for Steadfast's signature. Steadfast retries twice in
  about 2 minutes, so an outage can lose a message: the night check is what makes that harmless.
- **The night check** runs on one server at a time, picks due parcels from an index, spreads them out and paces each
  connection to its courier's limit, oldest first.
- **A refused login stops at once.** Steadfast locks a key out for an hour after 10 failures in 5 minutes, which the
  circuit breaker alone could reach. So a refusal ends that connection's calls for the run. Its 401 can also mean a
  parcel from another profile, so a test call decides whether the login is really bad before the owner is told.
- **Credentials** are sealed with the SecretBox, never returned, and opened only at the call (CRR-03, SEC-09).

---

## 4. Database work

In the `tenant` schema with RLS forced, unless marked `control`; money `numeric(12,2)` (DAT-05).

| Table | What | For |
|---|---|---|
| `courier_connections` | courier key, sealed credentials, default flag, state; sealed message address token and signing token, last message time, when a message last failed verification, when the owner was last told of a broken paste | CRR-02 to CRR-05, CRR-20 |
| `control.courier_message_routes` | the hash of an address's token → shop and courier, so a message finds its shop before RLS applies; removed on disconnect | CRR-11, CRR-20 |
| `courier_parcels` | an order's parcels, one live at a time: courier, booking state (`booking`, `booked`, `unknown`, `refused`, `cancelled`), invoice, consignment ID, tracking code, the courier's status, COD sent, weight, note, area, delivery charge, its refusal, the fee held and its rates, whether it took the order's place, the serials named, when it settled and any problem doing so, its look-ups; our reading of the status, the cash its courier reports, a COD changed in its panel, what staff should look at, last news, last change, last message, last check, when checks stopped; Slice 6.5 adds when it was paid and the payout that did, the amount staying on the payout | CRR-06, CRR-08, CRR-14, CRR-15, CRR-17, CUS-12 |
| `courier_payouts` | Slice 6.5: a payout as its courier gives it (ID, amount, charges, total, method, dates), how many parcels it settled and how many Lytro booked | CRR-17 |
| `courier_events` | a parcel's news: where it came from (message, check, Sync), a unique dedupe key, the raw status, our reading, messages in Bangla and English, its time, what the adapter read, whether it has been applied | CRR-12, CRR-13 |
| `courier_credential_uses` | every outbound call with a shop's credentials, without them | SEC-11 |
| `control.courier_areas` | as `DATABASE-SCHEMA.md` §2.5 | CUS-10 |
| `control.courier_adapters` | an adapter's `retiring` state | CRR-23 to CRR-25 |

`orders` keeps `courier_name`, `tracking_code` and `tracking_link`, filled on booking. The area goes on the parcel, so
the planned `area_courier_key` and `courier_area_code` order columns are dropped. No new ledger type: the fee stays
`order_fee`. Connections, parcels and events are cleared with the shop at day 60 (LIF-19).

---

## 5. API surface for this phase

| Who | Route | What |
|---|---|---|
| Team | `GET /api/v1/couriers/adapters` | available couriers and their fields (CRR-01) |
| Team, `couriers:manage` | `GET`, `POST`, `DELETE /api/v1/couriers/connections` | connect with a test call, replace, disconnect; the answer carries the address to paste (CRR-02, CRR-03, CRR-20) |
| Team, `couriers:manage` | `PUT /api/v1/couriers/connections/:key/default` | the default courier (CRR-05) |
| Team, `orders:manage` | `POST /api/v1/orders/:id/book` | books, with `Idempotency-Key` (API-11, CRR-06 to CRR-10) |
| Team, `orders:manage` | `POST /api/v1/orders/:id/parcel/sync` | Sync (CRR-14) |
| Team, `couriers:manage` | `GET`, `POST /api/v1/couriers/connections/:key/address` | what to paste, shown again, or a new pair (CRR-02, CRR-03) |
| Team, `orders:manage` | `POST /api/v1/orders/:id/parcel/settle` | staff settle a lost answer (D6-11), or finish a parcel whose stock wasn't ready |
| Team, `orders:manage` | `POST /api/v1/orders/:id/parcel/cancel` | only the booking is cancelled and the order stays (QTA-01, Slice 6.1's read) |
| Team, `orders:manage` | `POST /api/v1/orders/:id/cancel`, extended | a booked order's cancel (CRR-28) |
| Team, `orders:manage` | `GET /api/v1/locations/:locationId/courier-areas` | a courier's areas in a thana (CUS-12), now staff only |
| A courier | `POST /api/v1/webhooks/couriers/:token` | its messages (CRR-11 to CRR-13, CRR-27) |
| Operator | `GET /api/v1/operator/tenants/:id/courier-credential-uses` | a shop's credential log (SEC-11) |
| Operator | area list read, edit and refresh; `retiring`; what blocks removal | CUS-10, CRR-23, CRR-24 |

---

## 6. Slices

Each server slice starts with its read (§2.1). Every new route joins `test/isolation/registry.ts`.

### Slice 6.0: the plan
- **Delivers:** this plan; `SRS-detailed.md` CRR, CUS and ORD rows amended, as §2 says; `TEST-PLAN.md` S06-01, S06-02
  and S06-13; `IMPLEMENTATION-PLAN.md` Phase 6 brought in line. Docs only.

### Slice 6.1: connecting and booking, with Steadfast
- **Depends on:** this plan.
- **Delivers:** the adapter port, registry and contract suite; connections; the default courier; Steadfast's adapter and
  fake; `/book` by claim, call, settle (D6-7, D6-10, D6-14); a lost answer settled by invoice (D6-11); cancelling
  (D6-8); the circuit breaker (CRR-26, CRR-18, CRR-19); the credential log.
- **Done when:** exit criterion 3 and Steadfast's half of 2 and 6 pass with staff marking delivery by hand.
- **Built as PR #301** (migration 0107).
- **Read, agreed 2026-11-04:**
  - **Who connects:** `couriers:manage`, the default courier too. Whoever holds `orders:manage` can see which couriers are
    connected, to book. Credentials are sealed and never returned, whoever enters them.
  - **The booking sheet:** the COD is shown, not editable; it always equals what the order says is due, and staff edit the
    order to change it. Staff choose the courier, a note, serials, and a weight or area where that courier takes one.
  - **The fee during the call:** set aside first, as D5-7 holds a gateway fee, with the order taking its place under the limits
    the same way. Accepted, it is charged at the rates it was held at; refused, everything is released and the ledger shows
    nothing; a lost answer stays on hold until it settles.
  - **Cancelling only the booking:** allowed. Staff confirm they cancelled it in the courier's panel; the order stays
    `processing` with its stock out, to be booked again or marked shipped by hand, with no second fee or count. Only a
    cancelled booking gives the next attempt a new invoice (`261104-0017-2`), so a courier's refusal of a repeat still
    guards a refused or not-booked retry.
  - **A courier's refusal:** staff see its one short message field as plain text, cut to [200] characters and labelled as the
    courier's. Shoppers never do, and a raw page or unreadable reply shows our own words, the detail in server logs. CRR-07 and
    SEC-16 amended.
  - **SEC-11's log:** its own table, leaving the gateway's code alone. The owner's call to overrule.
  - **Steadfast's pickup requests and bulk booking:** left out; the SRS has neither. A later slice can add them if the first real
    parcel (checkpoint 6A) or sellers show the need. Bulk has no common shape across couriers: Pathao's answers with no IDs.
  - **One pull request,** the owner's choice over the two recommended.
- **Found in building it, beyond the read:**
  - The plan had settling count, charge and take stock after the courier's yes, but each of those can refuse, and by then the
    parcel exists. So all three are dealt with at the claim (§3.6): the limit under the shop's handling lock, the fee held,
    and the stock step tried in a savepoint and rolled back. Two bookings in flight can't name one serial.
  - The minute pass (`courier_booking_tick`) settles what a request couldn't: a `booking` older than 2 minutes means the server
    died, so its answer is lost; a lost answer is asked after by invoice from 2 minutes on, every 15 minutes, up to 8 times;
    two "no such parcel" answers close it as not booked. Steadfast's by-invoice answer gives a status and no IDs, so a parcel
    found that way shows no consignment ID until staff enter it, or Slice 6.2 reads one.
  - **The owner's call to overrule: ORD-11.** Its pass criterion had an item edited after booking, but D6-7 took the stock out at
    booking, so an item edit would have to return and take stock around a live parcel. After booking, the customer's details and
    notes can change, with the warning (`courierRecordUnchanged`); items and what moves the totals are refused, and staff
    cancel the order and enter a new one. ORD-11 amended.
  - Trying wrong keys stops after 5 failures in 5 minutes, since Steadfast locks a key out at 10.
  - A login the courier refuses at booking shows as a refusal; marking the connection and telling the owner (§3.6) comes with the
    night check in Slice 6.2, which is what would otherwise keep calling.

### Slice 6.2: the courier's news
- **Depends on:** 6.1.
- **Delivers:** the message route, the routes table and Steadfast's verification, with its token and `Idempotency-Key`;
  the one news path (D6-12, CRR-12, CRR-13, CRR-29); a report's cash through `PaymentRecorder` (ORD-43); partly
  delivered and returning parcels (D6-6); Sync; the night check and its rules (D6-3, D6-4); "no messages yet"; the
  broken-paste notice.
- **Done when:** exit criteria 2, 4, 5 and 7 pass for Steadfast. **Checkpoint 6A:** Steadfast works end to end on the
  server, and one real parcel has been booked with a real message received (exit criterion 9, Steadfast's half).
- **Built as PR #308** (migration 0108), against the fake; checkpoint 6A's real parcel is still to do.
- **Read, agreed 2026-11-05:**
  - **Shipped:** at Steadfast's `pending`, "with us, not yet attempted". The first real parcel confirms it; if `pending` turns out to
    come before collection, it is one line in the adapter's status map.
  - **Cash that differs from what's due:** the order records what the courier reports, so ৳900 of ৳1,000 leaves ৳100 due and staff
    are told. More than is due records what's due, and staff are told of the extra. No amount records what's due, as Mark
    delivered does; a partly delivered report with no amount records nothing, because nothing says how much.
  - **A delivered report the courier later reverses:** the status and cash stay. The parcel shows the courier's new status and staff
    are told, and they decide with the tools they have.
  - **A `cancelled` parcel:** checks stop at once. Messages still show, and stock only returns when staff count it. An order not yet
    shipped can be cancelled with no confirmation, since the courier has already said it is coming back.
  - **Other events:** shown in the parcel's history, moving nothing. A COD changed in the panel is also saved on the parcel and
    flagged. Asking for a parcel back stays in Steadfast's panel.
  - **A message with no good signature:** refused and logged. The connection shows the token is missing and the owner is told, at most
    once a day; the night check and Sync keep orders moving.
  - **An account whose one address is taken:** the night check and Sync serve it. Connecting never needs the paste (D6-3).
  - **The address and token:** shown again at any time to `couriers:manage`, with a way to make a new pair, because neither is the
    courier's credential. CRR-03 amended.
  - **Tracking:** the steps plus the courier's latest message, once shipped, as plain text cut to [200] characters; never the COD, the
    charge, a refusal or a change made in a panel.
  - **One pull request.**
  - **The real test:** a separate Steadfast profile for Lytro, if the owner finds in the panel that a profile has its own message
    address; otherwise this reopens. It needs a tunnel to a local server and the dev database migrated, which needs the owner's word.
- **Found in building it, beyond the read:**
  - News is applied just after the courier has its answer, not through a job queue: it is durable from the moment it is stored,
    and the minute pass applies what a restart left, so a queue would add a wait and nothing else.
  - A message about a parcel whose answer was lost proves it exists, so it settles the lost answer first (D6-11).
  - A login Steadfast refuses during a check stops that connection's calls for the run at once. A test call then decides: if it
    passes, the 401 was a parcel on another profile and nothing is marked; if it fails too, the connection is marked and the owner
    told, and it asks nothing more until the keys change (§3.6). Booking still only shows a refusal, because a person is there.
  - A check can't give an amount, since Steadfast's status call names none, so a delivered parcel found by a check or Sync records what's
    due. Only a message brings a differing amount.
  - The night's time is fixed in its schedule; the other three figures are platform settings. CRR-15 says "at about".
  - **Not done here: the real parcel.** Exit criterion 9 and checkpoint 6A wait for the owner's Steadfast key and profile, and
    `KNOWN-GAPS` §112 lists what it must confirm.

### Slice 6.3: Pathao
- **Depends on:** 6.2.
- **Delivers:** the adapter and fake: its token and refresh, its store, its limits; the handshake and answers (CRR-27);
  `X-PATHAO-Signature`; its status map, using its real pickup event; a computed dedupe key (CRR-13); no lookup, so a
  lost answer goes to staff (D6-11).
- **Done when:** the contract suite passes, shared code didn't change (exit criterion 8), and a sandbox booking with no
  area has been tried first.
- **Read, agreed 2026-11-05, with the sandbox tried first:**
  - **No area picker, so D6-5 stands.** Lytro's own form of address, text with thana and zilla, got the expected rate for
    all 64 zillas: ৳60 for Dhaka, ৳80 twice and ৳110 for the rest. A zilla with no thana stayed at the Dhaka rate, and an
    address naming no place was accepted at ৳60 with no refusal. The rate is the only sign of what it read, so this shows
    Dhaka from elsewhere and not one zilla from another, and reading a parcel back shows no area. A delivery order always
    has a thana's ID, so booking refuses only one no longer in the list. Pathao's charge is recorded on the parcel.
  - **Tokens only.** The owner types the password once to connect; Lytro logs in and throws it away. A refresh token works
    once, so one renewal runs at a time, and a lost answer can mean the owner logs in again.
  - **One store per connection,** set when connecting: used without asking if the account has one active, chosen by the
    owner if several, changeable later. Staff choose nothing at booking.
  - **Whole taka: round up** (the owner's pick; refusing and letting staff fix it was recommended). ৳499.50 asks Pathao
    for ৳500. The order counts as paid in full at ৳499.50 and staff aren't told of the extra. Anything else that arrives
    is still told.
  - **Weight:** what the items weigh if all are known, otherwise staff give it, with the ship sheet starting at 0.5 kg.
    Lighter than 0.5 is sent as 0.5, and above 10 kg is refused, though the sandbox took both 0.2 and 11.
  - **Quantity:** the total, rounded up, so 1.5 kg sends 2. Lytro's stock and prices don't change.
  - **Its test of an address** is answered at any known address without the secret, because it moves nothing, and
    doesn't count as a message arriving. Every real message needs the secret.
  - **One PR.**
- **Built as PR #311,** no migration, against a fake made from what the sandbox answered. The contract suite passes for both couriers, with two
  allowances Pathao needed: it has no rider's-word status, and its proof doesn't cover the body. **Exit criterion 8 holds
  with small exceptions,** all of them things the next courier can use. In booking: a renewal before the claim, the
  checks an adapter declares, and the order's total quantity. In order code: what the courier was asked to collect, for
  the rounding rule, and adding up the quantity. Connecting and messages grew more: login, renewal, stores, the test of
  an address and answer headers. **Not tried:** its sandbox can't send messages, so the test of an address, its event
  names and `collected_amount` need a real account, as checkpoint 6A does for Steadfast. `KNOWN-GAPS` §117 lists them.

### Slice 6.4: RedX and its areas
- **Depends on:** 6.2. Can run beside 6.3.
- **Delivers:** the adapter and fake; `control.courier_areas`, its refresh and the operator's edits (CUS-10); the booking
  sheet's area choice (CUS-12, CRR-10); both-language messages; its `paid` event routed away from the timeline (CRR-12);
  the cancel call (D6-8); its secret kept out of logs.
- **Done when:** the contract suite passes for all three.
- **Read, agreed 2026-11-06.** RedX's sandbox is a canned mock: one "Test Area", one tracking ID for every booking, parcel
  details that always answer "Service is currently unreachable", and a cancel that answers "Request Accepted" with a 503,
  even for a parcel that doesn't exist. So the live area list was read once, read-only, with the owner's own token: 2,866
  areas, all 64 districts matching Lytro's zillas. By name, 793 (28%) are named after a thana in their district, 1,078
  (38%) give one only in brackets, like "Kakoli(Banani)", and 929 (32%) match nothing, 340 of them in Dhaka. Brackets can
  mislead: "Duaripara-Pallabi(Mirpur 12)" names Mirpur though it is in Pallabi.
  - **Matching:** only an area named after its thana counts; brackets and near spellings are suggestions the operator
    confirms, many at a time; the rest wait. Until then every area is still found in its district.
  - **Refresh:** weekly, and when the operator asks, with Lytro's own RedX token in server settings, never a shop's.
  - **Auto-pick:** only where the thana's one area is named after it; everywhere else staff choose, the thana's areas
    first, then the district by search.
  - **Trust:** the address alone, like a secret link, kept out of every log and replaceable.
  - **Value:** the goods' worth, before the delivery charge. **Weight:** in grams, with Pathao's rule for a missing one.
  - **Part delivery:** partly delivered, no cash recorded by itself; staff record what came.
  - **Cancel:** only a clear success cancels; anything else is no answer, and staff confirm in RedX's panel. This now
    applies to every courier with a cancel call.
  - **Store:** like Pathao's, but booking never waits: with none chosen, RedX uses its own default.
  - **PRs: one** (the owner's pick; two, areas first, was recommended).
- **Built as PR #313,** migration 0109, against a fake made from its document and what the sandbox showed. Shared code grew where the adapter
  declares it (an area chosen from the list, the goods' worth, a store that may be left out) and in one rule for every
  courier: a cancel with no clear answer asks staff to confirm. The operator's screens for areas come with Slice 6.7.
  **Not tried:** a real RedX booking, message, cancel or parcel details; `KNOWN-GAPS` §121 lists them.

### Slice 6.5: courier money
- **Depends on:** 6.2.
- **Delivers:** a parcel's paid flag, payout and charge (CRR-17, D6-9) from what each courier tells; known charges in
  profit, saying how many orders have none (INV-18).
- **Read, agreed 2026-11-06.** Steadfast's live payouts were read once, read-only, with the owner's own key: 8 payouts on
  one page, oldest first, with no page count. Each has its ID, amount, charges, total, method (Bank), status and dates;
  one payout lists the parcels it settled with their numbers, but **no amount for any parcel**. Its guide has no "payout
  made" message, only a `payment_request` whose meaning it doesn't give.
  - **How payouts arrive: message, else night.** The message is used once a real one shows it reports payouts. Until
    then the night run reads new payouts after the check: one call for the list, and one for each payout not yet read.
    (The owner first chose the message alone; asked again once the guide showed no payout message.)
  - **What's kept:** a payout keeps its figures as Steadfast gives them, and its parcels take its ID and date. Pathao's
    and RedX's `paid` messages mark the parcel paid, Pathao's with its invoice, neither with an amount.
  - **Payout check: show only.** Its figures are never compared with the cash recorded, since its own fees would make
    false alarms.
  - **"What we owe you": left out** (the owner's pick; a line showing Steadfast's own figure was recommended).
  - **Profit: delivery stays out of it** (the owner's pick; counting both ways where known was recommended). Couriers'
    charges are a figure of their own beside what shoppers paid for delivery, with how many orders have none. CRR-17 and
    INV-18 amended.
  - **PRs: one.**
- **Built as PR #316,** migration 0111 (`tenant.courier_payouts`, a parcel's `paid_at` and `payout_id`, where a
  connection's payout read starts). Calls stay down: a shop is asked only while one of that courier's finished parcels
  waits to be paid (changed within the check's [30] days), so most nights cost nothing; a payout made before the oldest
  waiting parcel was booked is never opened; the list is read from the page the last night reached, a page shorter than a
  full one being the last ([8] at least, as the live list showed), at most [10] pages a night. A payout still being made
  up is listed again later. A parcel is matched by the courier's number, or by ours only where Lytro never learned the
  courier's, which the payout then fills in. Being paid stays off the parcel's news (CRR-12). The screens come with
  Slice 6.7. **Not tried:** a real `payment_request`, Pathao's `order.paid` and RedX's `paid`; `KNOWN-GAPS` §123 lists
  them.

### Slice 6.6: retiring a courier
- **Depends on:** 6.1.
- **Delivers:** CRR-23 to CRR-25: the operator's `retiring`, what blocks removal, and the notice through a stand-in port.
- **Read, agreed 2026-11-06:**
  - **The suggested courier:** the operator picks one other active courier when retiring.
  - **A shop's default on it moves** (the owner's pick; leaving it until the shop changes it was recommended): to the
    suggested courier if the shop has it, else its longest-connected other courier; a shop with no other keeps it.
  - **What blocks removal:** a parcel still on its way, and a delivered one still waiting for the courier's payout, for
    the [30] days the night run waits.
  - **Removal:** the operator's action, refused with the blocking orders listed; when clear, every shop's keys and
    message address go and its parcels stay; a developer deletes its code later.
  - **Undo:** allowed; shops told are told it's back, and defaults that moved stay.
  - **The notice:** Lytro's fixed words in Bangla and English; no note from the operator.
  - **Keys:** a shop already connected may still replace them; only connecting fresh is refused.
- **Built as PR #TBD,** migration 0112 (`control.courier_adapters`). Found in building it: a booking not yet settled
  blocks removal too; and a booking's claim reads the courier's state shared, so removal waits for any claim in flight
  and counts its parcel, and none starts once removed. Each shop's notice and an activity line ("Lytro is retiring a
  courier the shop uses") are written as the server; the operator's reason goes to the platform audit log only.

### Slice 6.7: the screens
- **Depends on:** 6.1 to 6.6.
- **Sketch first** (`sketch-every-screen-before-building`), design doc and HTML mock: Settings' couriers and connecting,
  with each courier's paste step written for a seller, step by step; choosing a pickup store, and logging in again when
  a login has ended (Slice 6.3); "no messages yet"; the booking sheet redrawn with serials, a weight that starts at
  0.5 kg where the items don't all have one (Slice 6.3), and an area only where needed, the thana's areas first and a
  search of the district (Slice 6.4), a limit's message and a lost answer's choices; the order page's parcel, its
  courier status and news, Sync; cancelling a booked order; paid marks and the delivery charge; profit's note; tracking's
  courier news; the setup checklist's "connect a courier" (SUP-01). Storefront's courier area field comes out.
- **Builds** them, pixel perfect to the approved sketch, in Bangla and English to the owner's style guide.
- **The operator's screens** for areas and retiring wait for the console's rebuild; the API serves them until then.

---

## 7. Slice dependencies and order

```
6.0 plan ──► 6.1 connect + book (Steadfast) ──► 6.2 news  ◄── checkpoint 6A
                        │                         │
                        │                         ├──► 6.3 Pathao
                        │                         ├──► 6.4 RedX + areas
                        │                         └──► 6.5 courier money
                        └──► 6.6 retiring
                                   all server slices ──► 6.7 the screens
```

**Suggested order for one developer:** 6.1 → 6.2 (checkpoint 6A) → 6.3 → 6.4 → 6.5 → 6.6 → 6.7.

**What the owner provides, when its slice starts.** Credentials are never pasted into a chat: each goes in a local file
outside every repo, which I name when it's needed and never open or print.

| Slice | Needs |
|---|---|
| 6.2 | A Steadfast key made for this work, and one real parcel with an invoice worth keeping, because Steadfast has no sandbox. A live account's message address isn't changed without the owner's word |
| 6.3 | Pathao's published sandbox logins work for the booking; a real message may need an account |
| 6.4 | RedX's sandbox token; a real message may need an account |

---

## 8. Non-functional requirements for this phase

- **Exactly once:** every path that books, charges, takes stock or records cash has a test that runs it twice and at
  once from two callers, and the parcel, the order, the stock and the ledger agree after it.
- **Security:** RLS on every new tenant table; credentials and message tokens sealed or hashed, never returned or logged;
  a forged message changes nothing; the message route reads nothing about a shop before its token is checked; the
  isolation registry covers every new route. A courier's raw error text follows Slice 6.1's read on SEC-16.
- **Calls to couriers:** counted by test (exit criterion 7); a booking and Sync limited per shop (CRR-19); each
  connection paced under its courier's limit.
- **Performance:** a message answered inside 5 seconds with the apply off a queue; `EXPLAIN ANALYZE` on the night check's
  pick and the parcel's lookup by consignment ID.
- **Language:** every new string in Bangla and English, to the owner's style guide; amounts and consignment IDs in
  Western digits.

## 9. Risks

| Risk | Mitigation |
|---|---|
| A parcel is booked twice, or real goods go out wrongly | claim, call, settle with a unique index; a lost answer blocks rebooking (D6-11); no automatic retry (CRR-18) |
| Couriers' documents are wrong, as bKash's were (Slice 5.7 found a misnamed field) | a live check per courier before shops rely on it (exit criterion 9); unknown statuses move nothing; a completed-looking answer that can't be read goes to staff |
| Sellers don't paste, or paste wrongly | a normal step with written instructions; "no messages yet"; the night check keeps every order moving, a day late at worst; Sync when staff need it now |
| A Steadfast account already sends its one message address elsewhere | the night check serves it; settled in Slice 6.2's read |
| A shop's Steadfast key is locked out for an hour | a refused login stops calls at once, and the owner is told (§3.6) |
| Pathao's address reading sends parcels to the wrong area | tried in its sandbox on 2026-11-05 and D6-5 stands (Slice 6.3); a live account may read differently, and its charge on the parcel is where a wrong rate would show |
| Pathao holds an account's real password | settled in Slice 6.3: the password isn't kept, and a lost renewal means the owner logs in again |
| RedX's secret travels in the address | settled in Slice 6.4: no log line holds it, and it can be replaced; a proxy or host in front of the server must not log the path either (`KNOWN-GAPS` §121) |
| A courier's status list changes | an unknown status shows and moves nothing, and is logged for the adapter to be updated |
| Phase size (eight slices) | checkpoint 6A after Slice 6.2; RedX and the rest can become Phase 6B without re-planning, and screens could be cut to Steadfast first |

## 10. Definition of done (per slice)

Same as Phase 5, plus the exactly-once rule in §8:
- its own branch and PR
- every listed requirement proven by a test written against its pass criteria
- a sabotage-confirm-restore pass on the slice's central rule, and on every rule about money or stock it adds
- `typecheck`, `lint`, `build` and every package's tests clean, the full server suite where shared foundations change,
  and a real boot of the built server
- the isolation registry updated for any new route
- `KNOWN-GAPS.md` updated if anything listed here turns out not to hold
- this plan's slice entry marked shipped with its PR number

---

## Appendix A: what the couriers' documents say

Read 2026-11-04. **Nothing here has been tested live.** Slice 5.7 found bKash's document wrong on a field name, so each
slice checks what it depends on.

### Steadfast

Source: its own API guide and webhook page, in the merchant panel.

- **Access:** `portal.packzy.com/api/v1`. `Api-Key` and `Secret-Key` on every call, no login step. Keys belong to one
  profile, can't see another's parcels, and a profile can hold several, so a shop can make one for Lytro. **No sandbox:**
  every booking is real. `/ping` needs no key; `/get_balance` is a harmless test call.
- **Limits:** 1,000 calls a minute, 6,000 for booking. 10 failures in 5 minutes from one address and key: refused for 60
  minutes, correct keys included. A 401 can also mean a parcel from another profile. A 403 means an inactive account or
  KYC details to resubmit. A 200 can hide a failure in its body.
- **Booking:** `POST /create_order`: invoice, recipient name, phone and address, COD amount, note; no weight in its
  sample. A repeated invoice is refused, so a retry can't double-book. Long values are cut, not refused: invoice 100,
  name 100, phone 40, address 490, note 480. `{ } ; < > $` become spaces. Bulk: up to 500.
- **Reading status:** one parcel at a time, by consignment ID, invoice or tracking code, and no call for many at once.
  Answers are cached for 60 seconds. `/trackings_by_invoice` gives every step.
- **Statuses:** `in_review` (every parcel starts here), `pending` (with them, not yet attempted), `hold`,
  `delivered_approval_pending`, `partial_delivered_approval_pending`, `cancelled_approval_pending`,
  `unknown_approval_pending` (the rider's word: "do not settle your books on it"), `delivered`, `partial_delivered`,
  `cancelled` (it comes back to you), `exceptional`, `unknown`. There is no pickup status. For a parcel that didn't fully
  arrive, `/status_with_return_status_by_cid` adds how far back it has got, down to `..._return_received`.
- **Messages:** one callback address and an optional auth token, set in the panel, with a health line showing the last
  delivery. Each carries `Authorization: Bearer <token>`, `X-Signature` (hex HMAC-SHA256 of the raw body, keyed with the
  token) and `Idempotency-Key`. Any 2xx within 5 seconds; on 5xx or no answer it retries after 30 seconds and 2 minutes;
  a 4xx isn't retried. The token may use only letters, digits and `- _ . =`.
- **Events:** `delivery_status` (`pending`, `delivered`, `partial_delivered`, `cancelled`, `unknown`, with `cod_amount`,
  `delivery_charge`, `tracking_message`, `updated_at`), `tracking_update`, `consignment_update` (address or COD changed
  in the panel), `cancel_request`, `return_request`, `return_list_accepted`, `payment_request`, `pickup_request`,
  `user_update`.
- **Money:** `/get_balance` (what they owe), `/payments`, `/payments/{id}` (one payout with every parcel it settled).
- **Other:** no cancel call. `/create_return_request` brings a parcel back before delivery. `/create_pickup_request`,
  `/police_stations`, `/fraud_check/score/{phone}`.

### Pathao

Source: its merchant API document and webhook page, in the merchant panel; rate limits are second-hand.

- **Access:** `api-hermes.pathao.com`; sandbox `courier-api-sandbox.pathao.com`, with published test logins. Client ID and
  secret plus the merchant's email and password; `POST /aladdin/api/v1/issue-token` lasts 5 days by its document and 90 in
  the sandbox (2026-11-05), so the answer's `expires_in` decides. A refresh returns a new access and refresh token and
  needs no password. The old refresh token then gets 400. The old access token was refused in one try and went on working
  through two refreshes in another, so nothing relies on it either way. A wrong login is also 400. About 60 calls a minute
  (second-hand).
- **Booking:** `POST /aladdin/api/v1/orders`. Required: `store_id`, name (3 to 100 characters), phone (11 characters),
  address (10 to 220), `delivery_type` (48 normal, 12 on demand), `item_type` (1 document, 2 parcel), `item_quantity`
  (integer), `item_weight` (0.5 to 10 kg), `amount_to_collect` (integer). City, zone and area are optional, and "our
  system will populate it automatically based on the recipient_address". `merchant_order_id` is optional, with no
  documented refusal of a repeat and no lookup by it, and the sandbox made a second parcel for one. The answer gives
  `consignment_id`, `order_status`, `delivery_fee`. In the sandbox, naming a city needs a zone too (Sylhet has 51), decimals
  in the amount or quantity are refused, an amount of 0 is taken, and weights of 0.2 and 11 were taken at ৳60 and ৳225.
  Bulk answers 202 with no consignment IDs, so it can't be tracked straight away.
- **Reading status:** `GET /aladdin/api/v1/orders/{id}/info`, one at a time. `order_status_slug`, `updated_at`, `invoice_id`.
- **Messages:** a callback address and a secret the merchant sets in the panel, which sends the secret unchanged as
  `X-PATHAO-Signature`. On adding it, Pathao sends `{ "event": "webhook_integration" }` and requires 202 within 10 seconds
  with `X-Pathao-Merchant-Webhook-Integration-Secret` set to a fixed value shown on its page. Later events need that
  header too, within 10 seconds. The address must resolve within 3 redirects.
- **Events (the merchant selects them):** order created and updated; pickup requested, assigned, done, failed and
  cancelled; at the sorting hub, in transit, at the last-mile hub; assigned for delivery; delivered, partial delivery,
  return, delivery failed, on hold; payment invoice, paid return, exchange; store created and updated; return ID created,
  return in transit, returned to merchant. A sample carries `consignment_id`, `merchant_order_id`, `updated_at`,
  `timestamp`, `store_id`, `event`, `delivery_fee`.
- **Not in the document:** a cancel call, or a payout list. `order.paid` has an invoice with no amount (second-hand).

### RedX

Source: its OpenAPI document, in the merchant panel.

- **Access:** `openapi.redx.com.bd/v1.0.0-beta`; sandbox `sandbox.redx.com.bd/v1.0.0-beta`, simulated, with its own token.
  A per-shop `API-ACCESS-TOKEN: Bearer <jwt>`. No limits documented.
- **Booking:** `POST /parcel`. Required: customer name, phone and address, `delivery_area`, `delivery_area_id`,
  `cash_collection_amount`, `parcel_weight` (its parcel details give grams), `value` (declared, for compensation).
  Optional: `merchant_invoice_id`, `instruction`, `pickup_store_id`, `is_closed_box`, `paid_return_charge`. Answers with
  only `tracking_id`. No documented refusal of a repeated invoice, and no lookup by it.
- **Reading status:** one parcel at a time. `/parcel/info/{id}` gives `status`, `charge` and `cash_collection_amount`.
  `/parcel/track/{id}` gives only its steps, each with `message_en`, `message_bn` and `time`.
- **Areas:** `/areas` gives `id`, `name`, `post_code`, `division_name`, `zone_id`, and can be read by `post_code` or
  `district_name`. `/pickup/stores` lists a shop's pickup stores. `/charge/charge_calculator` quotes a charge.
- **Messages:** an address set in the panel, with any credentials in its query and no signature. No answer code, time
  limit or retries documented. It carries `tracking_number`, `timestamp`, `status`, `message_en`, `message_bn`,
  `invoice_number`, `delivery_type`.
- **Statuses:** `ready-for-delivery` (received from the merchant), `delivery-in-progress`, `delivered`, `agent-hold`,
  `agent-returning`, `returned`, `agent-area-change`, `paid` (no amount). `/parcel/info`'s sample also shows
  `pickup-pending`. **Partial delivery shows in `delivery_type`, not `status`:** `partial-delivery` and `partial-return`,
  beside `regular`, `reverse`, `exchange-delivery` and `exchange-return`.
- **Cancelling:** `PATCH /parcels` with `status` set to `cancelled` answers "Request Accepted". There is no payout list.
- **Tried 2026-11-06:** the sandbox is a canned mock (Slice 6.4's read). It requires `value` (and takes 0), a known
  `delivery_area_id` and a `delivery_area`, and takes a mismatched area name, any weight, cash with paisa, a 600-character
  address, a `+880` phone and no pickup store. The live list had 2,866 areas, 2,019 of them with no post code.
