# Orders beyond stock -- plan

**Status:** APPROVED by the owner 2026-11-25 ("ok fine"): OB-1 to OB-20 and every question in section 7 as recommended,
plus OB-20's list rows (photos, name, phone, a two-line address, total, status and the short chip). Built in one PR
(feat/orders-beyond-stock); the SRS amendments of section 4 are in SRS-detailed.md.

**Sketch:**
- `docs/brand/lytro-dashboard.html`, group "Orders beyond stock (proposal 2026-11-25)", screens `obs-*` (`ob-*` was
  taken by the onboarding screens);
- `docs/brand/lytro-storefront-builder.html`, the one product page's `obs-pp-short`;
- screenshots in `C:/Users/Dell/Desktop/Lytro screenshots/orders-beyond-stock/`.

**The owner, 2026-11-25:** "currently we are preventing order for out of stock product, but from shoppers points of
view we shouldn't do this, if the product is out of stock then it is upto seller to add stock or reject the order. here
we prevent the seller to ship the products if it is out of stock and ask him to add stock before doing anything which
result negative stock."

**Today:**
- PRD-07 and INV-15 refuse an order whose line would exceed available stock (`NotEnoughStockForOrder`, raised in
  `ReservationService.reserve`).
- INV-01 keeps on-hand, reserved and available from ever going negative, enforced in the database.
- ATR-07, SFT-04 and LND-07 offer only variants with available stock, and the product page's `pp-out` state drops the
  order form for a sold-out product.

**The idea.** Take the order and hold what is free. Record the rest as **short** on that line: a count of units the order
waits for, not stock. Stock still never goes negative (INV-01 stays). When stock arrives it goes to the waiting orders,
oldest first. While a line is short, the order can't leave the shop.

## 1. The owner's decisions (2026-11-25)

| # | Decision |
| --- | --- |
| OB-1 | **A shopper can order any active product, in stock or not.** It is up to the seller to add stock or reject the order. Made-to-order products (INV-02) are unchanged: they never hold stock. |
| OB-2 | **Shoppers see no stock wording**: no "স্টক নেই" or "স্টক শেষ" on cards, the product page, the landing form, the cart, checkout or tracking. In-stock products still list first (the out-of-stock-last PR's rule). |
| OB-3 | **Restock fills short orders oldest first, automatically.** Stock left over after the waiting orders is free stock. |
| OB-4 | **While any line of an order is short, the order can't leave the shop:** booking a courier, handing over, printing its label and marking it shipped are refused, each with the reason and an inline **"স্টক যোগ করুন"**. Confirming, the call, editing and cancelling still work. |
| OB-5 | **An advance payment works as usual.** If the seller rejects the order, the existing refund flow (PAY refunds) handles it. |
| OB-20 | **Each order row in the dashboard's order list shows only what the seller acts on** (the owner on #443, 2026-11-25: "order listing should show the selected design", then "in order list just customer phone number, his address and order total and the image is ok", keeping the status, the "স্টক কম" chip and the customer's name): <ul><li>**the photos its lines were ordered with:** the first line's photo (a design's cover, the one pinned on the order line, ATR-20; else the product's first photo), and with several lines up to 3 stacked, each 14 px further right so its design shows, then "+N";</li><li>**the customer's name;**</li><li>**the phone;**</li><li>**the address, on two lines** (the owner: "you can use two line for address in order list: delivery address in a line and thana/zilla in the last line, if too long then three dot"): the delivery address (house, road, area) on one line, then thana and zilla (মিরপুর, ঢাকা) on the last, each ending in "…" when too long. A counter order shows its takeaway tag instead; a locked order shows its district only;</li><li>**the order total** and **the status** (নতুন, কনফার্মড…);</li><li>**"2টা কম"** on a short order, on a small line of its own.</li></ul> **Gone from the row:** the order number (search still finds it, and the order shows it) and the item count. **Pay-as-you-go fair use (PF-7, PF-21):** a locked order's row masks as the list does today: the name's first letter (`স•••`), the phone's ends (`017•••••842`, written as one run of characters, as every phone in the app is (the owner, 2026-11-25: "all digit are together everywhere")) and the district only. **Size:** 44 px photos; a row has four lines of text (name, phone, two address lines), five when short; the stack takes 44 to 72 px of width. |

## 2. My calls (for approval)

| # | Call | Why |
| --- | --- | --- |
| OB-6 | **Short is stored in a new table, `tenant.stock_shortfalls`**, one row per order line × variant (like a reservation): `ordered`, `pack_amount`, the `short` quantity (> 0), the order and line, `created_at`. A line can have a reservation for what was free and a shortfall for the rest. A row disappears once it is filled, or when its line is cancelled or edited away. | A separate table keeps INV-05 exact (reserved = the sum of active reservations, and a shortfall is not reserved). The previous release never reads it, so a rollback reads nothing new; quantity-0 reservations would break its `quantity > 0` rule. |
| OB-7 | **Placing an order holds `min(asked, available)` and records the rest as short**, inside the order's own transaction and with the same lock order (products, then levels, then reservations, then shortfalls). `NotEnoughStockForOrder` is no longer raised for a tracked product. `WholeUnitsOnly` and `WholePacksOnly` still refuse. | One rule for the storefront, landing pages, the public API (`POST /v1/orders`) and orders typed in the dashboard. |
| OB-8 | **The fill runs wherever free stock appears, in the same transaction:** a receipt (PUR), an adjustment up (INV-06), a stock check that finds more (INV-07), opening stock, a sellable return (INV-17), a booking cancelled before pickup (CRR-28), and a reservation released by a cancelled or edited order. Oldest shortfall first (`created_at`, then id). Each fill moves up to the free quantity from the shortfall into the line's reservation, raising reserved, in INV-24 stock units and whole packs for shared stock. | Stock freed by one cancelled order goes to the next waiting order, the way the owner's "oldest first" reads. |
| OB-9 | **One guard for leaving the shop:** `ReservationService.consume` refuses with `conflict` `OrderShortOfStock`, naming the product, while any shortfall of the order remains. Shipping (`ship`), hand-over (`handOver`), courier booking (whose stock trial, `checkStockWithin`, runs before the courier is called) and marking shipped all go through it. The dashboard shows the reason first and greys the buttons, so the refusal is a backstop. Label printing is a dashboard rule: a short order can't be picked for printing, with the reason shown. | The courier is never called for an order that can't leave. |
| OB-10 | **The seller hears about it.** The new-order alert, push and SMS (when on) carry "স্টক কম". When a fill completes orders, one notice says so: "স্টক দেওয়া হলো: {n}টা অর্ডারে". | The seller acts on short orders before calling the customer. |
| OB-11 | **The orders list gets a "স্টক কম" chip,** with its count, beside the status chips, and each short order's row says "২টা কম" in the warning colour. The order shows the short line, an orange banner and the blocked next step. | The work is easy to find. |
| OB-12 | **"স্টক যোগ করুন" opens the add-stock sheet for that variant, prefilled with what covers this order**: its own shortfall plus any older waiting order's (in the sketch 3 = 1 for an older order, then 2 for this one), with the reason "নতুন মাল এসেছে" (INV-06). The sheet lists where the stock goes, oldest first; more than that is free stock. | The rule stays oldest first, and the seller sees why before saving. |
| OB-13 | **Order edits:** raising a quantity holds what is free and shorts the rest. Lowering it takes from the shortfall first, then releases held units. Removing a line drops both. | Least surprise: held stock stays held. |
| OB-14 | **Combos:** each component variant holds and shorts on its own; the combo line is short while any component is. **Shared stock (INV-24):** the shortfall sits on the stock holder in stock units and fills in whole packs. **Photo designs:** a design is a variant, nothing more. | The model already reserves per component and per holder. |
| OB-15 | **Batches and serials don't change.** Batches are drawn (FEFO) and serials named when the order leaves, and a short order can't leave, so neither is touched early. | INV-12 and INV-14 stay as built. |
| OB-16 | **Unchanged:** PAYG fair-use unlock charges (PF-2, PF-3), fraud checks, sales figures and reports (counted when an order leaves), and the low-stock alert (INV-08: available reaches 0 as today). The stock history gains no row for an order arriving short; a fill is not a movement, it reserves. | A shortfall is not stock. |
| OB-17 | **The public API:** the catalogue (`/v1/catalogue/*`) offers every active variant, with its `available` count unchanged, for a site that wants to show it. `POST /v1/orders` no longer answers `NotEnoughStockForOrder`. The developer docs (`@lytronix/validators/developer-api`, #441) drop it from that route's errors, and its samples test follows. | API sites behave like the storefront. |
| OB-18 | **The storefront:** the variant picker offers sold-out sizes and designs like any other (no grey, no word). The product page keeps its order form for a sold-out product (the `pp-out` state is retired for tracked products). Cards carry no stock badge. The green "● স্টকে আছে" stays on in-stock products only, which is question 5. | OB-2. |
| OB-19 | **The shopper's tracking page shows the order's status as today**, with nothing about stock. | OB-2. |

## 3. Screens

**Dashboard (`docs/brand/lytro-dashboard.html`, `obs-*`), drawn from the built orders screens (`o29-*`). Every list row
leads with its lines' design photos (OB-20): several designs of one kurti, so the rows differ by design, and one
order of 5 lines showing 3 and "+2":**
- `obs-list`: the orders list with the "স্টক কম" chip first in the row (with its count), and short rows marked "2টা কম".
- `obs-list-short`: that chip on, only short orders listed.
- `obs-list-payg`: a pay-as-you-go shop's list, one locked order on top, masked as the list masks today (OB-20).
- Every list row follows OB-20: photos, name, phone, address, total, status, and "2টা কম" when short; no order number or
  item count. `obs-list-desktop` shows the list beside an order on a computer.
- `obs-order`: a short order with the banner "২টা পণ্যের স্টক নেই · কুরিয়ার বুক বা শিপ করার আগে স্টক যোগ করুন", the
  short line ("চিকনকারি কুর্তি · গোলাপি · M · 2টা কম", and why it waits), the shipping card's blocked step, and the
  action bar's greyed "কুরিয়ার বুক করুন" beside "স্টক যোগ করুন". Also `obs-order-desktop`.
- `obs-book-blocked`: the courier booking sheet opened on a short order: the reason instead of the courier fields.
- `obs-add-stock`: the add-stock sheet launched from the order, its variant fixed, the reason "নতুন মাল এসেছে", and where
  the stock goes: the older waiting order first (1), then this one (2), so 3 covers both.
- `obs-filled`: after saving: the line covered, "কুরিয়ার বুক করুন" live, and the toast "স্টক দেওয়া হলো: 2টা অর্ডারে".
- `obs-alert`: the bell: the new order arrived short, and the earlier fill notice.
- `obs-print`: picking orders to print labels, with a short order unpickable and its reason.

**Storefront (`docs/brand/lytro-storefront-builder.html`, `obs-pp-short`):** the one product page for a sold-out
product: the same page as an in-stock one, with no stock wording and the order form and button working.
`before-pp-out.png` shows today's sold-out page (no form) for comparison.

## 4. Proposed SRS amendments (text only; `SRS-detailed.md` changes in the build PR)

- **PRD-07:** "Order creation shall reserve the available stock atomically (as a reservation, INV-15) and record any
  remainder of a tracked product's line as a shortfall (INV-25) instead of refusing the order; a failed order creation
  shall restore both. A product whose stock is not tracked (INV-02) holds and shorts nothing." Acceptance: "With stock
  1, two simultaneous orders for 1 unit both succeed: one holds the unit, the other is short 1; available is 0."
- **INV-15:** "…reserving raises reserved by what is available, never beyond it; the rest of the line is a shortfall
  (INV-25)…" The rest stays. A new sentence: "Fulfilment is refused with `conflict` naming the product while any
  shortfall of the order remains."
- **INV-25 (new): shortfalls.** "A tracked product's order line may wait for units: a shortfall (variant, quantity,
  order, line, time) is recorded when an order asks for more than is available. It is not stock and not reserved.
  Whenever stock becomes free (a receipt, an adjustment or stock check up, opening stock, a sellable return, a booking
  cancelled before pickup, a reservation released), it is given to the oldest shortfalls of that variant first, in the
  same transaction, moving each into its line's reservation. An order with any shortfall can't be booked, handed over,
  printed or shipped; cancelling or editing it drops its shortfalls." Acceptance: "Two orders short 1 and 2, then 2 units
  received: the older is covered, the newer is short 1 holding 1."
- **ATR-07:** "the public catalogue and order-creation endpoints shall offer every active variant of a tracked product,
  whatever its available stock…" The feed keeps FED-03's availability (question 4).
- **SFT-04 / LND-07:** drop "refuse add to cart for an unavailable combination" and "offering only available ones".
  "The picker offers every active variant; stock is not shown to the shopper (OB-2), except 'in stock' where it is
  (question 5)."
- **INV-06 / INV-07:** what happens when a count falls below what is held (question 3).
- **ORD-13 (the order list), amended (OB-20):** "…paginate at [20] per page, and sort newest first. Each row shall show
  the photos its first [3] lines were ordered with (the line's pinned photo, ATR-20) and how many more lines there are,
  the customer's name and phone, the delivery address on one line and its thana and district on the next (each cut with
  an ellipsis when too long), the order total, its status,
  and its shortfall when it has one (INV-25); not the order number or the item count. An order still locked on
  pay-as-you-go shows its name, phone and address masked as PYG-22 says." Acceptance: "An order of 5 lines of three
  designs lists with those designs' 3 photos and +2, the name, phone, address line, 'পাঁচলাইশ, চট্টগ্রাম', total and status,
  and no order number; an address too long for its line ends in '…';
  a locked order lists as স•••, 017•••••842 and its district."
- **ORD (new, the order list):** "Orders with a shortfall shall be findable by a 'short' filter with its count, and an
  order shall show each short line and why its next step waits."
- **NTF:** the new-order alert carries the shortfall, and a fill notice names the orders it completed.

## 5. Build (one PR, after approval)

- **Migration (expand-only, single step):**
  - the new table `tenant.stock_shortfalls`, with RLS like `stock_reservations`;
  - the checks `short > 0` and `ordered > 0`, and the foreign keys to the order and its line with `ON DELETE CASCADE`;
  - a partial index `(tenant_id, variant_id, created_at, id)` for the fill.
  - **Rollback:** the previous release ignores the table; on a rollback a short order could ship short (only its held
    units), and that is stated in the PR. **Readers before writers:** no new value is written into a table the previous
    release reads.
- **Server:**
  - `ReservationService.reserve` splits held and short, and a new `ShortfallService` fills them, called from
    `InventoryLedger.apply` for every positive change and from `letGo` (the release path);
  - `consume` gets its guard; order edits follow OB-13; combos follow OB-14;
  - order views carry `short` per line and `shortTotal`, plus a `short=true` list filter and a count;
  - the order list read gains the customer's phone and delivery address line for each row (masked for a locked order,
    as today), and `thumbs: string[]` (up to 3, the first lines' `order_lines.thumbnail_url` in line order, the
    product's first photo where a line has none) and `lineCount: number`, read with one `LEFT JOIN LATERAL` per page
    (no N+1; served from `order_lines` by its order index);
  - notifications for OB-10; the developer-api content and samples test for OB-17; the isolation registry for any new
    route (none planned: the add-stock sheet uses the existing stock routes).
- **Dashboard:** the `obs-*` screens; the add-stock sheet from the order; the print picker rule.
- **Storefront:** stock wording removed (OB-2, OB-18), the picker offering every active variant, and the form kept for
  sold-out products. This lands together with the server change, so a shopper never sees a product they can't order.
- **Tests:**
  - server e2e: two simultaneous orders over 1 unit; restock oldest first; release refills; the guard on ship, hand-over
    and booking; edits; a combo; shared stock; the public `/v1/orders`;
  - dashboard e2e for every `obs-*` state, and an order row showing its design photos and "+N"; storefront e2e ordering a sold-out size;
  - break checks; the previous-release job.

## 6. What it depends on

- **The out-of-stock-last PR** (lists show every product, sold-out last) ships first or with this one.
- **The developer docs PR (#441)** is merged first, so its samples test can be updated here.

## 7. Open questions (recommendation first)

| # | Question | Recommendation |
| --- | --- | --- |
| Q1 | A cap on how many units one order may ask for beyond stock? | **No new cap.** Today's per-line limits and the fraud check apply; the seller rejects what they can't supply. |
| Q2 | Tell the shopper when their waiting order is covered? | **No.** The seller calls to confirm anyway, and a "your order is ready" SMS would cost the shop. |
| Q3 | The seller counts fewer than are held (a stock check or adjustment below reserved; today refused with `NotEnoughStock`). | **Accept it.** The newest orders give up their held units into shortfalls, oldest keep theirs, and the seller sees which went short. Refusing a true count leaves the books wrong. |
| Q4 | Feeds (Facebook, Google; FED-03) for a sold-out variant: keep "out of stock", or say "backorder"? | **Keep "out of stock".** Advertising stock the seller hasn't got breaks the catalogues' rules and wastes ad money. |
| Q5 | Keep the green "● স্টকে আছে" on in-stock products (no wording at all on sold-out ones)? | **Keep it.** It sells, and its absence says nothing negative. |
| Q6 | Ship part of an order now (what's in stock), the rest later? | **No, not now.** One order is one parcel today (CRR); the seller can edit the order down instead. |
| Q7 | Orders already placed before this ships? | **Nothing to migrate:** they were all fully held. |

## 8. What today's code says that a decision changes

- **`ReservationService.reserve`:** throws `NotEnoughStockForOrder` on a `StockRefused` shortfall. Under OB-7 it holds
  the free part and writes a shortfall.
- **`OrderFulfilment.checkStockWithin`:** already tries the stock step before the courier is called. With OB-9's guard
  inside `consume`, it refuses a short order before any courier call, with no new code in the courier adapters.
- **The storefront builder's `pp-out`:** a sold-out product page with no form. It is retired for tracked products
  (OB-18).
- **#394's design cards:** "sold-out designs leave lists" was already overridden by the out-of-stock-last PR. OB-18
  keeps them orderable too.
