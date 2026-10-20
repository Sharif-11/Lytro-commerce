# Tenant dashboard: the full design

Status: v2, 2026-10-20. A complete re-design of the seller's dashboard (`apps/dashboard`, served at
`app.lytro.app/<shop>`). It replaces the screen-by-screen designs in `DASHBOARD-SECTIONS-DESIGN.md` and the
shell in `ONBOARDING-FLOW-DESIGN.md` §3; the onboarding steps before the shop exists (sign-in, code, create
shop, checkout, password, set-up) keep their own document. The interactive prototype is
`docs/brand/lytro-dashboard.html` (open in a browser; needs internet for Google Fonts): phone first, Bangla
with the EN toggle, every hub and the main sheets, the shop's lifecycle states switchable.

Designed from `SRS-detailed.md` (sections 3 to 23), `BRAND-IDENTITY.md`, `PHASE-3-PLAN.md` §6 Slice 11 and
the routes `apps/server/src/modules/team/controllers` expose today. Nothing in the old `apps/admin` or the
current `apps/dashboard` screens was used as a starting point. Where the SRS defines a screen whose backend
does not exist yet (orders, customers, payments, couriers, SMS, notifications, notices, API keys, usage
counters, add-ons), the screen is designed here from the SRS so the architecture is whole, and the section
says exactly what it waits for. The dashboard is built in one UI slice after the phase's backend
(`PHASE-3-PLAN.md` Slice 11), so this document is the spec for that slice and the ones after it.

---

## 1. Thesis

**One hand, one job.** The seller runs the shop from a phone between Messenger chats, usually with one
thumb. Their day is a queue of small jobs: confirm the new orders, verify two payments, book the couriers,
answer "is it in stock", top up before the SMS stop. The dashboard is that queue first and a records system
second. Every primary screen answers two questions in the first viewport: *what needs me now*, and *what is
the one tap that does it*.

Ten rules follow from this. They are checked against every screen in §7.

1. **Jobs before sections.** Home is a list of jobs with counts, not a wall of statistics. Each job opens the
   exact list, already filtered, with the action ready.
2. **Lists are the product.** A row carries who, what, how much, state and when, so most work finishes
   without opening a detail. A detail exists for editing and history, not for reading what the row said.
3. **The action lives where the state is.** A record's primary action is sticky at the foot of the screen on
   a phone and in the header on a desktop, and it changes with the record's state (Confirm → Book courier →
   Mark shipped). There is never a second primary button.
4. **One accent per screen.** Marigold is reserved for the action that moves money or a parcel. Everything
   else is teal-700 or an outline. A screen with nothing to move has no marigold at all.
5. **Numbers are typeset.** Inter 600 tabular, `৳` first, paisa small and only when non-zero, counts on chips,
   Western digits in Bangla UI, dates and times as `BRAND-IDENTITY.md` §5 sets them.
6. **Progressive layout, never a separate mobile site.** 360 px is the base. 640 px adds a second column and
   side-by-side actions. 1024 px adds the rail and the list-plus-detail split. 1280 px adds the hub's own
   sub-navigation column. Nothing is taken away as the screen grows; nothing fixed is wider than the screen.
7. **One status vocabulary.** The 13 order statuses (SRS 2.3.1), the three stock states (in, low, out) and
   the six lifecycle states use the status colours only, as chips, with the same Bangla words everywhere.
8. **Every state is designed.** Empty, loading, error, offline, no-permission and read-only are drawn for each
   screen, not left to a spinner. An empty state says what will appear and offers the one action that
   starts it.
9. **Bangla sets the measure.** Line height 1.6, body 16 px on phones, secondary text neutral-700 or
   darker, buttons wrap long labels, Noto Sans Bengali everywhere a Bangla string can appear.
10. **Nothing drawn that the server cannot return.** Fields and figures come from a named endpoint or SRS
    row; what waits for a later slice is marked "later" in the section, never faked in the mock with a
    plausible number.

---

## 2. The people and the day

| Person | Opens the dashboard to | Screens they live in |
| --- | --- | --- |
| Owner (every permission) | See what needs doing, confirm and book orders, verify payments, keep stock right, pay the platform | Home, Orders, Payments, Stock, Balance, Plan |
| Order staff (`orders:*`, `customers:read`) | Work the order queue all day: confirm, call the customer, book, mark shipped | Orders, Order detail, New order |
| Stock staff (`products:*`, `inventory:*`) | Add products, add stock, count stock, see what is low | Products, Stock, Add stock, Stock check |
| Payment staff (`payments:verify`) | Approve or reject payments that did not match | Payments to verify |
| Everyone | Find one thing fast | Global search |

A shop on day one has no orders, so Home leads with the set-up checklist (SUP-01). A shop in its second
month has thirty orders a day, so Home leads with the queue. Both are the same screen; the queue simply has
no rows on day one and the checklist folds away once the first group is done.

---

## 3. Information architecture

Five destinations, each a **hub** with its own sections. The hub names are the seller's words for the parts
of the business, not the platform's module names. Routes are under `app.lytro.app/<shop>`.

| Hub | Sections (route) | Needs | Backend today |
| --- | --- | --- | --- |
| **Home** `/` | The queue, today's figures, set-up checklist, banners | any member | `/me`, `/balance`; the queue's order and payment counts are later (Phase 4, 5) |
| **Orders** `/orders` | Orders `/orders`, one order `/orders/:id`, new order `/orders/new`, Customers `/customers`, one customer `/customers/:id` | `orders:read`, `orders:manage`, `customers:read` | later (Phase 4) |
| **Shop** `/products` | Products `/products`, one product `/products/:id`, new `/products/new`, Categories `/categories`, Stock `/stock`, Stock checks `/stock/checks`, Expiring `/stock/expiring`, Purchases `/purchases`, Delivery `/delivery` | `products:*`, `inventory:*`, `settings:manage` (delivery) | built (Slices 1 to 3; purchases Slice 4 later) |
| **Money** `/payments` | Payments `/payments`, Payment methods `/payment-methods`, Balance `/balance`, Plan `/plan`, Invoices `/invoices`, Usage `/usage` | `payments:*`, `wallets:*`, `balance:*` | balance, plan, invoices built; payments and methods later (Phase 5); usage read later |
| **Menu** `/menu` | Team `/team`, Activity `/activity`, Notices `/notices`, Settings `/settings/*`, Account `/account`, Help, Language, Sign out | per row | team, activity, settings (shop details, delivery, business type), account, exports built; notices and most settings later |

Rows and sections a staff member lacks the permission for are **hidden, never disabled** (STF-11). The owner
sees everything. A hub whose every section is hidden disappears from the navigation, so an order-only staff
member sees Home, Orders and Menu.

**Why Customers sits in Orders and not alone.** A customer record is created by orders (CUS-01) and is opened
from an order to see history and the fraud level. It is a second list inside the same job, not a separate
job.

**Why Delivery sits in Shop and not Settings.** Delivery zones decide what every product charges (DLV-03,
ORD-06a); the seller changes them beside the products, and the product editor links to them.

**Why Payments and Balance share a hub.** Both are money the seller watches daily: money coming in from
shoppers, and money going out to the platform. The hub's first section is the one with a job in it
(payments to verify); the balance and the plan are a tap away.

---

## 4. Shell and navigation

### 4.1 Phone (360 to 639 px)

- **App bar**, 56 px, white with a hairline: the shop's monogram or logo at 32 px and the shop name
  (TEN-16), a search icon, a **+** icon, the bell with its unread count (NTF-01). The language toggle and
  the sign-out live in Menu, not the bar: they are used once a month.
- **Tab bar**, 64 px plus the safe area, white: Home, Orders, Shop, Money, Menu. Icon above a 12 px label,
  teal-700 when active, neutral-700 otherwise. Counts sit on Orders (to confirm) and Money (to verify) as
  small teal pills, and on Menu as a dot when a notice is unread. The tab bar hides while a sheet is open
  and while the keyboard is up.
- **Page title** sits in the content, 22 px, with the hub's section chips directly under it (for example
  Shop: Products · Categories · Stock · Purchases · Delivery) as a scrolling row. Section chips are the
  second level of navigation on a phone; they are the secondary column on a desktop.
- **Sheets** for every action that creates or changes one record (new order, add stock, top up, add staff):
  a bottom sheet with a grab handle, up to 92% of the height, scrolling inside, the action sticky at its
  foot. A record's full editor (product, order) is a page, not a sheet, because it is long and the seller
  may leave and return.
- **Back** is the app bar's leading icon on any page below a hub root; the tab bar stays, so a seller can
  jump hubs from anywhere.

### 4.2 Tablet (640 to 1023 px)

The phone shell with more room: forms gain a second column, stat tiles sit four across, a sheet becomes a
480 px panel from the right, and a list shows its trailing figures on one line. The tab bar remains, since
a tablet is held like a phone.

### 4.3 Desktop (1024 px and up)

- **Rail**, 72 px, teal-900 (`BRAND-IDENTITY.md` §8.2): the Lytro mark is **not** here; the rail carries
  the five hub icons with 11 px labels, teal-800 active, the bell and the shop's monogram at the foot with
  "Powered by Lytro" at 16 px under it (TEN-18). The rail is the dashboard's only chrome-coloured surface;
  the content area is neutral-50 with white cards.
- **Secondary column**, 224 px, white with a hairline, from 1280 px: the hub's sections as text rows with
  counts, the current one teal-700 with a 3 px left bar. Between 1024 and 1279 px the sections are the
  chip row under the page title, as on a phone.
- **Header**, 64 px, inside the content area: page title left; search (a 320 px field, `/` focuses it),
  **+**, language, and the person's initial on the right. The shop name and logo sit at the top of the
  secondary column, so the tab title and the header never fight.
- **List and detail split** for Orders, Customers and Products: the list keeps 400 px on the left, the
  detail fills the rest, the URL changes with the selected row, and the list keeps its scroll position.
- **Sheets** are a 480 px right panel over a scrim; the list behind stays visible so the seller never loses
  their place.

### 4.4 Global search

One field for everything the seller types into the chat beside it: an order number (`ORD-… or the last four
digits`), a phone number, a customer name, a product name. Results are grouped (Orders, Customers,
Products) with the same rows the lists use, so a result is actionable without opening it. On a phone it is
a full-screen sheet opened from the app bar; recent searches below the field. (Orders and customers wait
for Phase 4; products search is `GET /products?search=` today.)

### 4.5 The + menu

The five things a seller creates, in one sheet: **New order**, **Add product**, **Add stock**, **Record
a payment**, **Top up**. Rows a staff member cannot do are hidden. It is the only place these five share,
so a seller never hunts for "where do I add stock" inside Shop.

### 4.6 Banners

Banners stack under the app bar, one at a time in this order, each dismissable only when its row says so:

1. **Support view** (ADM-05): ink background, marigold text, never dismissable: "Lytro support is viewing
   this shop · ends in 42 min". It can never pass for the shop's own chrome.
2. **Urgent notice** (NTC-04): danger-soft, until dismissed.
3. **Lifecycle** (§7.24): trial days left, grace, read-only, over-limit countdown (DWN-12), KYC request
   (KYC-02). Teal-50 for information, warning-soft for a deadline inside 3 days.
4. **Offline** (CCH-10 for the storefront; the dashboard shows its own): neutral, "No connection. Showing
   what was loaded." with a retry.

### 4.7 Notifications

The bell opens a sheet: unread first, each row an icon, one sentence and the time, tapping opens the
record (NTF-01, NTF-03). A "Notices" row at the top carries the board's unread count (NTC-03). Waits for
Phase 7's notification module; until then the bell is hidden, not drawn empty.

---

## 5. Layout system

### 5.1 Breakpoints and grid

| Width | Columns | Gutter | What changes |
| --- | --- | --- | --- |
| 360 to 639 | 1 | 16 px | Base. Tab bar. Sheets from the bottom. |
| 640 to 1023 | 2 (forms, tiles) | 24 px | Side-by-side actions, 480 px side panel, stat tiles ×4. |
| 1024 to 1279 | rail + content | 32 px | Rail, header, list-plus-detail split (400 px list). |
| 1280 and up | rail + 224 px + content | 32 px | Secondary column. Content max-width 1120 px, centred. |

Every page is a vertical stack of **blocks** on a 4 px base: block gap 16 px on phones and 24 px from 640
px; card padding 16 px; section gaps 32 px. A card is white, radius 10 px, hairline border, no shadow except
the one raised card (the sheet). Tables and dividers are square.

### 5.2 Type

From `BRAND-IDENTITY.md` §14: page title 22 px Noto Sans Bengali 700 / Inter 600; card title 17 px; body 16
px on phones and 14 px in desktop tables; captions 13 px Latin only; money 16 px inline, 28 px in a stat tile.
Eyebrows are 12 px Inter 600 uppercase in marigold-700 (English) or 14 px Noto Sans Bengali 600 (Bangla, no
case). Bangla line height 1.6, never 1.5.

### 5.3 Colour roles on this surface

| Role | Token | Used for |
| --- | --- | --- |
| Chrome | teal-900 | the desktop rail only |
| Background | neutral-50 | the page |
| Surface | white | cards, app bar, tab bar, secondary column, sheets |
| Primary | teal-700, white text | one primary button per block, links, active navigation, selected chips |
| Accent | marigold-500, ink text | the single money-or-parcel action on a screen |
| Soft primary | teal-50 | selected rows, information banners, the current plan card |
| Text | ink / neutral-700 | body / secondary |
| Status | success, warning, danger, info and their soft tints | chips, banners, the stock bar; nothing decorative |

### 5.4 Icons and motion

Lucide at 20 px in rows and 24 px in the tab bar, 1.75 px stroke. State changes 150 ms, sheets 250 ms,
ease-out. The confirm-order tick draws once (400 ms). `prefers-reduced-motion` turns every transition into a
cut.

---

## 6. Components

The dashboard is built from these and nothing else. Each has the rule that makes it work with Bangla and a
thumb.

| Component | Shape | Rules |
| --- | --- | --- |
| **Job row** | 56 px: icon tile, one sentence, count pill, chevron | The sentence names the count and the job ("৫টি অর্ডার কনফার্ম করার অপেক্ষায়"). Tap opens the filtered list. A job with zero rows is not shown. |
| **Stat tile** | label 13 px, figure 28 px tabular, one-line delta or sub-label | Four across from 640 px, a horizontal snap row of 2.3 tiles on a phone. Never more than four. |
| **List row** | 64 px: leading avatar or thumbnail, two lines, trailing figure and chip | Line one: the name. Line two: the detail (area · items, or SKU · variants). Trailing: amount above the chip. Whole row is the tap target. |
| **Status chip** | 12 px Inter 600 / Noto 600 on a soft tint, pill | One colour per meaning; never two chips on one row. |
| **Segment chips** | scrolling row of pills with counts | The first is always "All". The selected chip is teal-700 with white text. Counts come from the list endpoint's totals. |
| **Sticky action bar** | white, hairline top, 16 px padding, one primary and at most one secondary | On a phone it sits above the tab bar; on a desktop the same buttons move to the page header's right. |
| **Sheet** | bottom sheet / 480 px panel, title, scroll area, sticky foot | Closes on scrim tap only when nothing was typed; otherwise asks. |
| **Stepper** | three dots and labels inside a sheet title | For top-up and purchase only. |
| **Field** | 14 px label above, 48 px control, 13 px help or error below | Phone field with fixed `+880`; money field with `৳` prefix and tabular digits; number fields `inputmode=decimal`. |
| **Area picker** | two-level sheet: district list with search, then its thanas | From `GET /locations` (CUS-08). The chosen thana shows which zone and charge it falls in (`/delivery-zones/resolve`, DLV-05). |
| **Stock number** | a figure, −/+ steppers, and the four reason chips under it when changed | INV-06. The reason defaults to "other" if skipped. |
| **Variant matrix** | columns per variant-defining attribute, then Price and Stock, "Fill all" above each | ATR-17. Horizontal scroll inside the card on phones; the first column sticks. |
| **Timeline** | dot-and-line, time at right, the latest first | Orders (ORD-14), stock history (INV-09), activity (AUD-04). |
| **Banner** | full-width, icon, one sentence, one link | One at a time; see §4.6. |
| **Empty state** | 48 px icon, one sentence, one button | "No orders yet. Share your shop link." |
| **Toast** | bottom, 3 s, one sentence, optional Undo | Saves and small actions. |
| **Confirm dialog** | title names the thing, the destructive button names the consequence | "Cancel order #0041" / "ক্যানসেল করুন", never "OK". |

---

## 7. Screens

Each screen is written the same way: **Job**, **Layout** (phone, then what changes on desktop), **Content**
(the endpoint or SRS row every figure comes from), **Actions**, **States**, and what is **later**.

### 7.1 Home (`/`)

**Job.** See what needs me, in order, and get the day's numbers without reading a chart.

**Layout.** Banner (if any). Then the **queue**: job rows in a fixed order of urgency, each tapping into
its filtered list:

1. Payments to verify (`payments:verify`, PAY-14) → `/payments?status=needs_review`
2. Orders to confirm (`pending`) → `/orders?status=pending`
3. Orders to book (`pending` with a verified payment, CRR-09) → `/orders?ready=book`
4. Unverified orders older than 30 min (ORD-07, PAY-03) → `/orders?status=unverified`
5. Low or out-of-stock products (INV-08) → `/stock?state=low`
6. Batches expiring within 30 days (INV-13) → `/stock/expiring`
7. Balance under ৳50 (BAL-13) → `/balance`
8. Trial or plan ending inside 7 days (TRL-08, BIL-14) → `/plan`
9. Staff who have not set their first password (STF-13) → `/team`

Then **Today**: a stat row of four tiles: Orders today, To ship, Sales today, Balance. Then the **set-up
checklist** (SUP-01) in its two groups with a progress bar, each item a link, folding to one line once the
first group is complete, reopening from Settings. Then the **shop link** card (`<slug>.lytro.app`) with
Copy, Facebook and WhatsApp (ticks the checklist). On desktop the queue takes the left two thirds and Today
plus the checklist the right third.

**Content.** Queue counts: orders and payments from the list endpoints' totals (later); stock from
`GET /products?…` stock states and `GET /batches?state=expiring` (built); balance from `GET /balance`
(built); days left from `/me` (built). Today's tiles: orders and sales from STA-01 (later); Balance built.

**States.** Day one: the queue is empty and the checklist opens first; Today shows zeros with "Your first
order will appear here" and two buttons: share the link, enter an order by hand (ORD-01). Read-only
(LIF-06): the queue rows lose their actions and a banner explains. Staff without a permission: the rows that
need it are absent.

**Later.** Queue rows 1 to 4 and Today's first three tiles wait for Phase 4 and 5. Until then Home shows the
checklist, the stock rows, the balance tile and the plan row, which is a complete screen for a shop that
has no orders yet.

### 7.2 Orders (`/orders`)

**Job.** Work the queue: see every order that needs a hand, in the state it is in, and act from the row.

**Layout.** Title "Orders" with the Orders · Customers chips. Then **status segments** with counts: All,
To confirm (pending), Unverified, Processing, Shipped, Delivered, Returned, Cancelled, and a "More" chip
for hold, in review, partial, completed, rejected, refunded (ORD-13, ORD-41). A search field (name, phone,
order number) and a Dates button beside it. Then the list, newest first, 20 per page with "Show earlier":

- Row: `#0041` and the time on line one with the customer's name; area · n items on line two; the grand
  total above the status chip on the right. A marigold dot after the name marks a fraud level of `high`
  when a check exists (FRD-01); an `SMS` glyph marks an order whose shopper SMS failed (SMS-17, later).
- The row's trailing area holds the one action for its state on 640 px and up (Confirm, Book, Sync); on a
  phone the action is on the detail.

Desktop: list left at 400 px, the selected order's detail right (§7.3).

**Content.** `GET /orders?status=&search=&dateFrom=&dateTo=&page=` (ORD-13, later), counts from the
totals. **States.** Empty: "No orders yet" with the share-link button; a filter with no rows: "No pending
orders" and "Show all". Read-only: rows stay, actions go.

### 7.3 Order detail (`/orders/:id`)

**Job.** Confirm, book, ship, record a payment, call the customer, fix a mistake.

**Layout.** Header: `#ORD-20261020-0041`, the status chip, the time; a kebab for Edit, Print label (ORD-19),
Cancel, Delete (`orders:delete`, refused when paid, ORD-12). Then cards in this order:

1. **Customer**: name, phone (tap to call, long-press to copy), district · thana · address, the fraud level
   chip with "Check" when none exists (FRD-01, charged per FRD-03, needs `fraud:manage`), the customer's
   order count (CUS-01) and a link to their history.
2. **Items**: each line as the snapshot stores it (ORD-46): thumbnail or placeholder (ORD-47), name,
   variant values, quantity × unit price, line total; a serial list on a serial-tracked line (INV-14).
3. **Pricing**: subtotal, delivery (named by zone, ORD-06a), discount, grand total; advance required and
   cash on delivery when the policy asks (ORD-16); due in marigold-700 text when unpaid.
4. **Payment**: verified payments with method, TrxID and time; "Record payment" (ORD-15, `payments:manage`);
   a needs-review payment shows Approve / Reject here too (PAY-14).
5. **Courier**: before booking, the default courier and the area it needs (CUS-12, CRR-10); after, the
   consignment and tracking code with Sync (CRR-14) and the courier's timeline (CRR-12).
6. **Timeline**: status and courier events, newest first, with the actor (ORD-14).
7. **Activity** for this order (AUD-04).

**Actions** (sticky bar on phone, header on desktop), by state: `unverified` → "Waiting for payment" (no
button) with "Record payment"; `pending` → **Confirm** (marigold); confirmed and ready → **Book courier**
(marigold; opens the courier sheet: courier, area, COD amount, weight, note, CRR-06) or "Mark shipped" with
a tracking link (ORD-09, CRR-16); `processing` → "Sync status"; `shipped` → "Mark delivered" / "Returned"
(the return sheet asks per unit sellable or damaged, INV-17); terminal states → none.

**States.** A failed booking shows the courier's message in the courier card and changes nothing (CRR-07).
Editing after booking shows the warning that the courier's record is not changed (ORD-11).

**Later.** All of it waits for Phase 4 (orders), 5 (payments), 6 (couriers).

### 7.4 New order (`/orders/new`)

**Job.** Turn a Messenger conversation into an order in under a minute.

**Layout.** A page (not a sheet) with three blocks:

1. **Paste the message** (ORD-30): a text area with "Read it" that fills the form from the draft and shows
   the confidence; unmatched district or thana is flagged for a manual choice (ORD-31); the cost per read
   from `/balance/current-rates` is written under the button (RAT-07), with "uses your allowance" when one
   exists (PLN-20).
2. **Customer**: phone first; a known phone fills the name and the last address (CUS-01); then name,
   district and thana from the area picker, address; the chosen thana shows the zone and charge (DLV-05).
3. **Items**: a product search that opens the variant chooser (only available variants, ATR-07) with
   quantity (decimal only for measured units, UOM-04) and any captured-at-order field (ATR-08); the line
   total updates; the pricing block under it shows subtotal, delivery, discount, grand total and the
   advance the policy requires (PRD-08).

Then payment: Cash on delivery, or a payment received now (method, sender, TrxID, amount; verified at once,
ORD-22). The sticky action is **Create order**. Desktop: the form in a 720 px column with the pricing block
sticky on the right.

**Later.** Phase 4 for the form and 4's AI extraction; the area picker and zone resolution exist today.

### 7.5 Customers (`/customers`, `/customers/:id`)

**Job.** Find the person by the last four digits of their phone, see what they bought, decide whether to
trust a new order.

**Layout.** Search (name or phone, CUS-02), list rows: initial, name, phone, order count · total spent on
line two, last order date trailing. Detail: the name and phone with Call and Copy; the fraud level with the
check's sources and time (FRD-01, FRD-02); saved addresses (CUS-06); the order list filtered to them; and,
under a disclosure, "Delete at a privacy request" (`customers:manage`, CUS-09) which names what is kept.
Desktop: list and detail split.

**Later.** Phase 4.

### 7.6 Products (`/products`)

**Job.** Find a product, see its stock state at a glance, add one.

**Layout.** Title with the Shop chips (Products · Categories · Stock · Purchases · Delivery). Search and a
category filter (a sheet with the tree, PRD-12). Segments: All, Active, Inactive, Low stock, Out. The
primary button **Add product** in the header (teal, not marigold: nothing moves). List rows: thumbnail or
the monogram tile, name, line two "n variants · category", trailing the price or the price range
(`minPrice`–`maxPrice`) above the stock-state chip. Desktop: a table at 1024 px and up with the same
columns plus "Updated", sortable; the editor opens as a page.

**Content.** `GET /products?search=&categoryId=&page=` (built), `GET /categories` for the filter.
**States.** Empty: "No products yet" with Add product, and, on a trial, the limit line "20 products on the
trial" (TRL-03). At the plan limit, Add product is still shown and the server's `plan_limit_reached`
becomes a sheet naming the limit with "See plans" (PRD-04).

### 7.7 Product editor (`/products/new`, `/products/:id`)

**Job.** Save a sellable product with the fewest fields, and reach every setting when needed.

**Layout.** A page in four cards, in this order, with the **Save** button sticky:

1. **Basics**: photos (add, reorder, delete; one video; MED limits, PRD-11), name, price, category (the
   tree sheet, with "Uncategorized" as the default, PRD-03), description (plain text, PRD-01).
2. **Options and variants** (ATR-11): "Add attribute" (autocomplete from `GET /attributes` and the
   category's suggestions, ATR-02; a new name creates the attribute on save, ATR-01), each with the role
   (describes / splits into variants / asked when ordering, ATL-02). For a variant-defining attribute the
   option list with "Add option" and the **option sets** as one-tap chips (`GET /option-sets`, ATR-16) and a
   swatch dot per option (ATR-18). Below, the **variant matrix** (ATR-17) with Price and Stock columns and
   "Fill all"; "Sizes share one stock" switches the Stock column to a pack amount per variant (INV-24).
   The limits (3 attributes, 100 variants, ATR-14) are stated under the card, never as a surprise.
3. **Stock and delivery**: tracked or made to order (INV-02); the stock unit (UOM-01); batch and serial
   switches where the shop type shows them up front (PST-05); the low-stock threshold (INV-08); weight,
   delivery charge and mode (PRD-16, DLV-03: "Follows the zone charge" by default); "Delivers to" zones
   (DLV-07); the payment policy (PRD-08: shop default, none, delivery charge only, partial advance, full).
4. **More settings** (collapsed; PST-05): the size chart (PRD-17, up front for clothing), condition
   (FED-02, up front for gadgets), the product link and slug (LND-04, LND-06: the link with Copy, Facebook,
   WhatsApp and a variant picker for `?v=`), active switch, and the danger zone: Duplicate (PRD-18),
   Archive, Delete for good (PRD-13).

Desktop: the four cards in a 720 px column, with the product link card and the stock summary in a 320 px
right column.

**Content.** `GET /product-defaults?categoryId=` sets the defaults when a category is chosen (PST-06);
`POST /products`, `PATCH`, `PUT …/variants`, `…/attributes`, `…/slug`, `…/size-chart`,
`…/delivery-zones`, `POST …/duplicate` (built). Media upload waits for Slice 6.

### 7.8 Categories (`/categories`)

A tree, four levels (PRD-03), each row with the name, the product count, a visibility switch and a kebab:
rename, move, "behaves like" a shop type (PST-06), suggested attributes (ATR-02), size chart (PRD-17),
delete (refused with the count, or "move its products to Uncategorized"). Add at any level from the row.
Built: `GET/POST/PATCH/DELETE /categories`, `PUT …/attributes`, `…/size-chart`.

### 7.9 Stock (`/stock`)

**Job.** Know what I can sell right now, what is waiting to ship, what is coming, and fix a wrong number
without learning inventory words (INV-22).

**Layout.** Segments: All, Low, Out, Coming (PUR-05). Search. Each product is a card with its variants as
rows: option values, then four figures as a compact row: **Can sell** (available), **Waiting to ship**
(reserved), **Coming** (incoming, later), **On hand**; a stock-state chip; "Add stock" and "Edit" per row.
A made-to-order product shows one line "Made to order, always available". Cost and the stock value are
shown only with `inventory:manage` (D3-9). Desktop: a table.

**Content.** `GET /products/:id/stock` per product (built). The shop-wide figures card (stock value, cost
of goods sold this month, losses by reason, INV-18) sits at the top for `inventory:manage` from
`GET /inventory/figures` (built).

### 7.10 Stock actions

- **Add stock** (sheet, PUR-07): product and variant (pre-filled from the row), quantity in the product's
  unit, unit cost (optional), supplier name (type a new one), batch code and expiry only when the product is
  batch-tracked (INV-12), serials only when serial-tracked (INV-14) by scan, paste or typing (INV-23) with
  "add later" and the missing count. Built today as `POST …/stock-additions` (no supplier; the purchase
  record arrives with Slice 4).
- **Edit stock** (sheet, INV-06): the stock number control; when the figure changes, the reason chips
  (new stock arrived, counted again, damaged or lost, other) and a note. `PUT …/stock` (built).
- **Stock check** (`/stock/checks/new`, INV-07): choose products or a category, then a list of variants
  with the expected figure and a counted field, a running "changed" count, and Save; the result shows the
  value gained or lost for `inventory:manage`. `POST /stock-checks`, the list and detail (built).
- **Expiring** (`/stock/expiring`, INV-13): batches within 30 days then expired, soonest first, each with
  the product, code, expiry, quantity and "Write off" once expired. `GET /batches?state=`, `POST
  …/write-off` (built).
- **Stock history** (sheet from a variant row, INV-09): the timeline in everyday words ("+20 new stock",
  "−2 sold, order #1001") with the actor. `GET …/stock-history` (built).

### 7.11 Purchases (`/purchases`)

Purchase orders (PUR-02) as rows: number, supplier, lines, status chip (draft, ordered, partly received,
received, closed short, cancelled), expected date. "Order from supplier" creates one; "It arrived" opens the
receive sheet (PUR-04) per line with accepted, rejected and reason, unit cost, batch or serials. Suppliers
as a segment: name, phone, archived toggle (PUR-01). **Later**: Slice 4.

### 7.12 Delivery (`/delivery`)

**Job.** Set what delivery costs where, in the two numbers every Facebook seller already uses.

**Layout.** The **home area** card: the area picker (a city, a district, or the shop's own thanas) and the
two charges, "Inside Dhaka city" and "Outside Dhaka city", each editable in place (DLV-01, DLV-05). Then
**More zones**: each zone with its name, charge, areas as chips, "No delivery" switch (DLV-06), and "Add
zone" which adds a whole district or city in one step or single thanas. Under it, **Check an address**: pick
a thana and see which zone and charge it gets (`/delivery-zones/resolve`). The extra charge per kg (RAT-14)
sits at the foot as one field with its one-sentence rule.

**Content.** All built (`GET/POST/PATCH/DELETE /delivery-zones`, `PUT …/home-area`, `…/areas`, `GET
/locations`).

### 7.13 Payments (`/payments`)

**Job.** Approve what did not match, find a TrxID, see today's money in.

**Layout.** Segments: **To verify** (needs review, PAY-14; first and badged), All, Verified, Failed,
Refunded. Search by TrxID, sender or order number; a Dates button; CSV export (PAY-19). Row: method logo
(third-party assets), amount, line two "TrxID · sender · order #", the time trailing and a state chip. A
needs-review row expands in place to show the mismatch (amount or sender) and the proof image if uploaded
(PAY-18), with **Approve** (marigold) and Reject (asks the reason shown to the shopper). Listener health
(VER-07, LSN-03) is one line at the top: "Listener phone seen 4 min ago" or the warning when not.

**Later.** Phase 5.

### 7.14 Payment methods (`/payment-methods`)

One card per method type (bKash, Nagad, Rocket, Bank) with its switch (WAL-05) and its accounts: number
or account details, account name, type, a note, the one **active** radio (WAL-03, WAL-04); "Add account";
for bKash the gateway credentials (entered once, `hasCredentials`, sandbox flag, Test connection, WAL-09,
WAL-13). The verification level per account (manual, listener, gateway; VER). A line at the top says the
payment page needs a verified owner phone (TVR-01). **Later**: Phase 5.

### 7.15 Balance (`/balance`)

**Job.** How much is there, what is using it, add more.

**Layout.** A plain white card, not a gradient: the amount in 36 px, the "frozen" chip when frozen (BAL-08)
with its one line, this month's free SMS as a bar with the count (`/balance/essential-sms`, SMS-04), and
**Top up** (marigold; `balance:manage`; absent when frozen, BAL-06). Then the **statement** (BAL-14)
grouped by day: icon by type, one line naming the thing ("SMS · order #1042", "Top-up · TrxID 9F2…",
"Plan · Starter, 1 month"), units × rate under it, the signed amount in success only when positive, the
balance after in 13 px. Segments: All, Top-ups, SMS, Chat AI, Fees, Plan; Dates; CSV (`/ledger/export`);
"Show earlier". **Current rates** (RAT-06) is a card under the statement on a phone and a right column on
desktop, one row per rate with its unit in words and its effective-from.

**Top-up sheet** (BAL-03, BAL-04, BIL-03): amount with quick chips, the line "buys about n SMS at today's
rate"; the platform's wallet numbers with the sender number and TrxID; then "৳500 is being checked" with
when it lands. `POST /balance/top-up/quote` then `/confirm` (built).

### 7.16 Plan (`/plan`)

**Job.** What am I on, when does it renew, what do I pay next; change it and see the consequences first.

**Layout.** Banners first: a scheduled downgrade or pay-as-you-go switch with its date and "Keep Growth"
(DWN-02, `/billing/downgrade`); a pending cancellation with Undo (`/billing/cancellation`); the lapsed
state line (LIF-15). Then the **current plan** card: plan name and state chip, term, three figures (days
left, next payment and date, orders handled against the limit), the one action for the state (Renew for
৳…, Pick a plan, Take Starter, Keep the plan), "See invoices", and the auto-renew switch with its one line
(BIL-17; the read is a backend addition, §10). Then **Change plan**: term chips (`/billing-terms`, TRM-12,
"12 months · 12% off"), plan cards from `/plans` and `/plans/:id/prices` (price, monthly equivalent, three
limits, the one allowed move: "Upgrade · ৳400 due", "Move down at period end", "You are here"), and the
dashed **pay-as-you-go** card with its fee rates (PYG-01; the estimate of PYG-12 is later). **Add-ons**
(PLN-13) as a card listing what is bought with its end date and renewal switch, and what can be bought:
later (Slice 10a). **Stop** is a disclosure at the foot: cancel at period end, or, on pay-as-you-go, close
the shop (owner only, PYG-09), each confirming in a dialog that names the shop and the date.

Sheets: **Upgrade** (UPG-06: new price, credit with unused days, amount due, new period dates, limits that
change, "Pay ৳… from balance" with the available balance, or the wallet numbers; 15-minute validity,
no-refund line last), **Downgrade** (DWN-03: effective date first, the over-limit list in marigold rows, one
sentence per consequence, "Move down on 9 Nov"), **Purchase** (BIL-01, from trial, grace or later).

### 7.17 Invoices (`/invoices`)

Rows: number, plan · term, date, amount, method; "Earlier shop" chip where it applies (BIL-13). The detail
(a sheet on phone, the right column on desktop): issued and period dates, plan and version, price, discount,
credit, paid by and reference, billed to, the limits snapshot under a disclosure (BIL-12). PDF is later. Built.

### 7.18 Usage (`/usage`)

Every metric against its limit (LIM-02): orders handled this period and today (QTA-01, QTA-05), products,
seats, storage, bandwidth with a daily bar chart (BND-08), requests, payment sessions, free essential SMS,
paired devices, and the allowances (PLN-20). Each is a labelled bar in the status colour of its threshold
(50/80/95%, LIM-01) with "Unlimited" where the plan says so (PLN-19), and a "Buy more" link into add-ons.
**Later**: a usage read does not exist yet (§10).

### 7.19 Team (`/team`)

One screen, two segments: **People** and **Roles**. The seats line "3 of 5 seats, owner included" with a
bar (STF-02); full: the two ways out (deactivate someone, or See plans). People: the owner pinned with
"Owner · every permission"; each staff row with the initial, name or phone, role chips, and "Off" when
deactivated. The staff sheet: phone with `+880`, name, a generated first password the owner reads out with
the line that it must be changed at first sign-in (STF-13, AUTH-19); in edit mode the active switch with
its consequence, Reset password, and the roles as a checklist of cards. Roles: name, holders, permission
chips; the editor lists permissions as plain sentences grouped by hub, with "Spends the balance" under the
ones that do; delete disabled with the holder count (STF-09). Built.

### 7.20 Activity (`/activity`)

A timeline grouped by day; one sentence per entry (actor, action, target), the detail line from `summary`,
time at right, the result chip only on failure; "Lytro support" or "System" for platform actors (AUD-08).
Filters: actors, action groups (Sign-ins, Staff and roles, Money, Products and stock, Failed only), Dates.
The retention line (AUD-06). Built (`GET /activity`).

### 7.21 Notices (`/notices`)

Pinned first, then newest; category chips; search; a notice page with the body, "I understand" when
acknowledgment is required (NTC-05), and "updated" when edited (NTC-08). The owner can read them in
read-only and locked (NTC-07). **Later**: Phase 7.

### 7.22 Settings (`/settings`)

A list of rows into pages, each page a card or two with its own Save:

| Page | Content | Backend |
| --- | --- | --- |
| Shop details | Name, logo (monogram preview), business type (PST-01, `PUT /business-type`), contact phone, email, street address (TEN-30) | built |
| Delivery | Opens §7.12 | built |
| Payment methods | Opens §7.14 | later |
| Couriers | Steadfast and Pathao cards with the credential fields, Test before save, default courier, disconnect (CRR-01 to 05, 20) | later |
| Listener phone | Pair a phone (code or QR, 10 min, LSN-01), the device list with name, last seen, uploads today, revoke (LSN-20); the plan's device count | later |
| SMS | Each event with its switch, the locked essential ones, the estimated monthly cost (SMS-12), the template editor with the live unit count using the real shop name (SMS-10), the monthly cap (SMS-13) | later |
| Notifications | Which types this person receives (NTF-04); push subscribe and test (NTF-02) | later |
| API keys | Keys with name, type, scopes, origins, expiry, last used (API-01, API-25); the value shown once; webhooks (API-12) | later |
| Ad tracking and feed | Meta pixel ID, Conversions API token entered once (LND-15 to 17); the catalog feed URL with Copy, regenerate, and the Commerce Manager steps (FED-05, FED-06) | later |
| Brand identity | The editor with live preview of storefront, landing page and dashboard; "Use my brand" (BRN-02, BRN-06); the add-on line (BRN-05) | later |
| Storefront | The on/off switch (SFT-16); the custom domain (TEN-09 to 14, `plan_feature_unavailable` on Starter) | later |
| Data export | Request, list, download (LIF-16) | built |

### 7.23 Account (`/account`)

The person's own: the identities as rows with the provider's mark and the action per row (change password,
remove, add; AUTH-26, AUTH-27), the language toggle (per device, I18N-02), and Sign out. Built
(`/me/identities/*`).

### 7.24 Lifecycle, suspension and support view

| State | What the shell does | SRS |
| --- | --- | --- |
| `trial` | Teal-50 banner "n days left in the trial · See plans"; warning-soft inside 3 days | TRL-08 |
| `grace` | Warning banner "Plan ended n days ago. Renew to keep selling." Everything works | LIF-05 |
| `read_only` | Neutral banner "Viewing only until you renew"; every create, edit and delete control is absent; export offered | LIF-06 |
| `locked` | No shell: the **Renew** page only (plan picker, pay-as-you-go as the no-payment choice, export); staff see "Shop is locked" | LIF-11, LIF-15 |
| `archived` | The Renew page with the deletion date and the export | LIF-12, LIF-18 |
| suspended | `/unavailable`: "Your shop is not available right now" with support; the owner's Balance and Top up still reachable | LIF-24 |
| over-limit after downgrade | A countdown banner listing each over-limit item, ticking off as fixed | DWN-12 |
| support view | The ink-and-marigold bar on every screen, never dismissable | ADM-05 |

### 7.25 Shop picker (`/shops`)

Only for a person in more than one shop (TEN-31): rows with the shop's monogram, name, role and address.
No "new shop" anywhere (TEN-15). Built.

---

## 8. States that apply everywhere

| State | What the screen shows |
| --- | --- |
| Loading | Skeleton rows in the list's own shape (never a centred spinner), the title and chips drawn at once. |
| Empty | One sentence on what will appear and the one button that starts it. |
| Error | The server's `message` in one sentence with Retry; never a code. A `plan_limit_reached` becomes a sheet naming the limit with "See plans"; a `tenant_offline` becomes the lifecycle banner. |
| Offline | The offline banner; lists show what was loaded; forms keep what was typed and retry on reconnect. |
| No permission | The section is not in the navigation; a deep link lands on Home with a toast. |
| Read-only | Controls that write are absent, not disabled; the banner explains once. |

---

## 9. Accessibility and Bangla

Tap targets 44 px; focus rings in teal-500 at 2 px; every icon-only control has a label; chips are buttons;
colour never carries meaning alone (each chip has its word). Bangla: Noto Sans Bengali at the same size as
Latin with line height 1.6; buttons wrap; nothing is uppercased; digits stay Western; dates and times as
§5. English is a toggle that changes every string (I18N-01), stored per device (I18N-02). Reduced motion
respected.

---

## 10. What the backend must add for this design

Each is a small read or field. None is drawn in the prototype with a made-up value.

| Need | Where | For |
| --- | --- | --- |
| `autoRenewEnabled` on `/me`'s tenant | billing | the auto-renew switch's read (BIL-17) |
| `GET /usage`: every counter against its limit, plus the daily bandwidth series | limits | §7.18, Home's tiles and the add-on links (LIM-02, BND-08) |
| Top-up bounds on `GET /balance` | balance | the sheet's hint before a refused quote (BAL-04) |
| `periodStart` / `periodEnd` on the upgrade quote | billing | UPG-06 |
| `mustSetPassword` on each `/staff` row | staff | Home's queue row 9 and the People list (STF-13) |
| Queue counts in one call (`GET /home`): pending orders, ready to book, unverified older than 30 min, payments to verify, low-stock count, expiring count | several | Home's queue without nine list calls |
| Invoice PDF | billing | BIL-13 |
| Pay-as-you-go estimate | billing | PYG-12 |
| Orders, customers, payments, couriers, SMS, notifications, notices, keys, add-ons, media | Phases 4 to 8, Slices 4, 6, 10a | §7.2 to 7.5, 7.11, 7.13, 7.14, 7.18, 7.21, 7.22 |

---

## 11. Mapping onto `apps/dashboard` (for the UI slice, not built here)

| Piece | Where |
| --- | --- |
| Shell: app bar, tab bar, rail, secondary column, banners, + menu, search | `components/shell/*` |
| Components of §6 | `packages/ui` (shared with the operator console where the operator uses the same shape) |
| Hubs | `routes/$shop/{index,orders,products,payments,menu}.tsx` with their sections as child routes |
| Screens | `views/<section>/*` as container plus presentational files, hooks in `api/*` |
| Dictionaries | `i18n/locales/{bn,en}.json`, one namespace per hub, the vocabulary of `BRAND-IDENTITY.md` §7 |

---

## 12. Open questions

1. Whether the tab bar should carry four hubs and a centre **+** instead of five hubs; the prototype uses
   five with **+** in the app bar so the destinations stay stable.
2. Whether Customers earns its own hub once Phase 4 ships and the list is used daily.
3. Whether the desktop rail should collapse to icons only below 1280 px (as drawn) or keep labels and drop
   the secondary column instead.
4. The exact nine-row order of the Home queue once real volumes are seen; the order here puts money before
   parcels because a payment to verify blocks an order from being booked (CRR-09).
