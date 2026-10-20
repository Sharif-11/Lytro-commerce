# Tenant dashboard: the full design

Status: v2.1, 2026-10-20. One design for the whole seller journey: sign-in and onboarding, and the
dashboard (`apps/dashboard`, served at `app.lytro.app/<shop>`). It replaces the screen designs in
`DASHBOARD-SECTIONS-DESIGN.md` and the shell and screen visuals in `ONBOARDING-FLOW-DESIGN.md` (that
document's flow, decisions and routing rules still hold and are referenced below). The interactive
prototype is **one document**, `docs/brand/lytro-dashboard.html` (open in a browser; needs internet for
Google Fonts): every screen of the journey as the product stands after **Phase 3 Slice 3**, with the
onboarding steps, the Phase 1 to 2 money and team sections, and the Slice 1 to 3 catalogue, delivery and
inventory screens; Bangla with the EN toggle; phone, tablet and desktop; the shop's lifecycle states
switchable. Screens designed for later phases (orders, customers, payments, usage, notices, purchases,
SMS) are kept in the same document under "Later phases (design only)" so the architecture stays whole,
and they do not appear in the navigation of the current state.

Designed from `SRS-detailed.md` (sections 3 to 14 and 19 to 23), `BRAND-IDENTITY.md`, `PHASE-3-PLAN.md`
§6, `API-CONTRACT.md` §2 to §4 and §8, and the routes `apps/server/src/modules/team/controllers` expose
after #161. Nothing in the old `apps/admin` or the current `apps/dashboard` screens was used as a starting
point. Where the SRS defines a screen whose backend is later, the screen is designed from the SRS and the
section says what it waits for.

---

## 1. Thesis

**One hand, one job.** The seller runs the shop from a phone between Messenger chats, usually with one
thumb. Their day is a queue of small jobs: confirm the new orders, verify two payments, book the couriers,
answer "is it in stock", top up before the SMS stop. The dashboard is that queue first and a records system
second. Every primary screen answers two questions in the first viewport: *what needs me now*, and *what is
the one tap that does it*.

Ten rules follow from this. They are checked against every screen in §7 and §8.

1. **Jobs before sections.** Home is a list of jobs with counts, not a wall of statistics. Each job opens the
   exact list, already filtered, with the action ready.
2. **Lists are the product.** A row carries who, what, how much, state and when, so most work finishes
   without opening a detail. A detail exists for editing and history.
3. **The action lives where the state is.** A record's primary action is sticky at the foot of the screen on
   a phone and in the header on a desktop, and it changes with the record's state. Never two primaries.
4. **One accent per screen.** Marigold is reserved for the action that moves money or a parcel. A screen with
   nothing to move has no marigold at all.
5. **Numbers are typeset.** Inter 600 tabular, `৳` first, paisa small and only when non-zero, counts on chips,
   Western digits in Bangla UI, dates and times as `BRAND-IDENTITY.md` §5 sets them.
6. **Progressive layout, never a separate mobile site.** 360 px is the base. 640 px adds a second column and
   side panels. 1024 px adds the rail and the list-plus-detail split. 1280 px adds the hub's own column.
7. **One status vocabulary.** Order statuses, the three stock states (in, low, out) and the lifecycle states
   use the status colours only, as chips, with the same Bangla words everywhere.
8. **Every state is designed.** Empty, loading, error, offline, no-permission and read-only are drawn, not
   left to a spinner. An empty state says what will appear and offers the one action that starts it.
9. **Bangla sets the measure.** Line height 1.6, body 16 px on phones, secondary text neutral-700 or darker,
   buttons wrap, Noto Sans Bengali wherever a Bangla string can appear.
10. **Nothing drawn that the server cannot return.** Each figure comes from a named endpoint or SRS row; a
    screen or row that waits for a later slice is marked, never faked.

---

## 2. Scope of the current state (Phase 0 to Phase 3 Slice 3)

What the prototype's navigation shows today, and what it holds back.

| Area | In the current state | Held for later (and where it sits in the prototype) |
| --- | --- | --- |
| Onboarding and sign-in | every step of §6 | nothing |
| Home | the job queue from stock, batches, balance and plan; the "Right now" tiles; the checklist with the items that exist; the shop link | the order and payment job rows and the sales tiles (Phase 4, 5) |
| Shop hub | Products, Categories, Attributes, Stock, Delivery, with every sheet of §7.6 to §7.12 | Purchases (Slice 4, "Later phases") |
| Money hub | Balance, Plan, Invoices | Payments, Payment methods, Usage (Phase 5, Slice 10) |
| Menu | Team, Activity, Settings (shop details, delivery, data export), Account | Notices (Phase 7); the settings rows for payments, couriers, listener, SMS, notifications, API keys, ad tracking, brand identity and storefront are listed under "Coming later" with their phase |
| Shell | app bar with search and **+** (Add product, Add stock, Top up); tab bar Home, Orders, Shop, Money, Menu; rail and secondary column on desktop | the bell and notifications (Phase 7); the Orders tab opens a placeholder that says orders arrive in Phase 4; the + menu shows "New order" greyed with its phase |

The "Later phases (design only)" group of the prototype keeps the Orders, Customers, Payments, Payment
methods, Usage, Notices, Purchases, SMS, Notifications and Search designs exactly as §8 describes them.
When one of them opens, the navigation switches to the full information architecture of §3 so the design
can be judged in its own context.

---

## 3. Information architecture

Five destinations, each a **hub** with its own sections. The hub names are the seller's words for the parts
of the business, not the platform's module names. Routes are under `app.lytro.app/<shop>`.

| Hub | Sections (route) | Needs | Backend today |
| --- | --- | --- | --- |
| **Home** `/` | The queue, "Right now" tiles, set-up checklist, banners | any member | `/me`, `/balance`, `/products`, `/batches` (built); order and payment counts later |
| **Orders** `/orders` | Orders, one order, new order, Customers | `orders:*`, `customers:read` | later (Phase 4); the tab opens the placeholder |
| **Shop** `/products` | Products `/products`, one product `/products/:id`, new `/products/new`, Categories `/categories`, Attributes `/attributes` (with Option sets), Stock `/stock`, Stock checks `/stock/checks`, Expiring `/stock/expiring`, Delivery `/delivery`; Purchases `/purchases` later | `products:*`, `inventory:*`, `settings:manage` (delivery, business type) | built (Slices 1 to 3) |
| **Money** `/balance` | Balance `/balance`, Plan `/plan`, Invoices `/invoices`; Payments, Payment methods, Usage later | `balance:*`, `payments:read/manage` | built (Phase 2) |
| **Menu** `/menu` | Team `/team` (+ `/team/roles`), Activity `/activity`, Settings `/settings/*`, Account `/account`, Help, Language, Sign out; Notices later | per row | built |

Rows and sections a staff member lacks the permission for are **hidden, never disabled** (STF-11). The owner
sees everything. A hub whose every section is hidden disappears from the navigation.

**Why Attributes is a section.** Attributes are created inline while editing a product (ATR-01), but ATR-10
asks for a place to rename, re-colour and retire the shop's own ones and to see the platform's library, so
the hub carries it as one screen with Option sets as its second segment.

**Why Delivery sits in Shop and not Settings.** Delivery zones decide what every product charges (DLV-03);
the seller changes them beside the products, and the product editor's "Delivers to" sheet names them.

**Why Payments and Balance will share a hub.** Both are money the seller watches daily. Until Phase 5 the
hub's first section is Balance.

---

## 4. Shell and navigation

### 4.1 Phone (360 to 639 px)

- **App bar**, 56 px, white with a hairline: the shop's monogram or logo at 32 px and the shop name
  (TEN-16), a search icon, a **+** icon, and, from Phase 7, the bell with its unread count (NTF-01). The
  language toggle and sign-out live in Menu.
- **Tab bar**, 64 px plus the safe area: Home, Orders, Shop, Money, Menu. Icon above a 12 px label,
  teal-700 when active. The Shop tab carries the low-stock count as a small pill; Orders and Money carry
  their counts once Phase 4 and 5 exist; Menu carries a dot when a notice is unread.
- **Page title** in the content, 22 px, with the hub's section chips under it (Shop: Products · Categories ·
  Attributes · Stock · Delivery) as a scrolling row.
- **Sheets** for every action that creates or changes one record: a bottom sheet with a grab handle, the
  action sticky at its foot. A record's full editor (product) is a page.
- **Back** is the app bar's leading icon on any page below a hub root; the tab bar stays.

### 4.2 Tablet (640 to 1023 px)

The phone shell with more room: forms gain a second column, stat tiles sit four across, a sheet becomes a
480 px panel from the right. The tab bar remains.

### 4.3 Desktop (1024 px and up)

- **Rail**, 72 px, teal-900: the five hub icons with 11 px labels, teal-800 active, the shop's monogram and
  "Powered by Lytro" at the foot (TEN-18). The only chrome-coloured surface.
- **Secondary column**, 224 px, white, from 1280 px: the hub's sections as text rows with counts.
- **Header**, 64 px: page title left; search (320 px), **+**, language, the person's initial on the right.
- **List and detail split** for Products from 1024 px (and for Orders and Customers later).
- **Sheets** are a 480 px right panel over a scrim.

### 4.4 Global search

One field for an order number, a phone number, a customer name or a product name, grouped results with the
same rows the lists use. Products search is `GET /products?search=` today; orders and customers are Phase 4.

### 4.5 The + menu

Add product, Add stock, Top up today; New order and Record a payment join with Phase 4 and 5. Rows a staff
member cannot do are hidden.

### 4.6 Banners

Under the app bar, one at a time: support view (ADM-05, ink and marigold, never dismissable), urgent notice
(NTC-04, Phase 7), lifecycle (§7.24), offline.

---

## 5. Layout system

### 5.1 Breakpoints and grid

| Width | Columns | Gutter | What changes |
| --- | --- | --- | --- |
| 360 to 639 | 1 | 16 px | Base. Tab bar. Sheets from the bottom. |
| 640 to 1023 | 2 (forms, tiles) | 24 px | Side-by-side actions, 480 px side panel, stat tiles ×4. |
| 1024 to 1279 | rail + content | 32 px | Rail, header, list-plus-detail split (400 px list). |
| 1280 and up | rail + 224 px + content | 32 px | Secondary column. Content max-width 1120 px, centred. |

Every page is a vertical stack of blocks on a 4 px base: block gap 16 px on phones and 24 px from 640 px;
card padding 16 px; section gaps 32 px. A card is white, radius 10 px, hairline border, no shadow except the
sheet. Tables and dividers are square.

### 5.2 Type and colour

From `BRAND-IDENTITY.md` §5 and §14: page title 22 px Noto Sans Bengali 700 / Inter 600; card title 17 px;
body 16 px on phones and 14 px in desktop tables; money 16 px inline, 28 px in a stat tile; eyebrows 12 px
Inter 600 uppercase in marigold-700. Background neutral-50, surfaces white, primary teal-700, the single
accent marigold-500 with ink text, status colours only for status, chrome teal-900 on the desktop rail only.

### 5.3 Icons and motion

Lucide at 20 px in rows and 24 px in the tab bar, 1.75 px stroke. State changes 150 ms, sheets 250 ms. The
confirm-order tick draws once (400 ms). `prefers-reduced-motion` turns every transition into a cut.

---

## 6. Onboarding and sign-in

The flow, routing and refusals are `ONBOARDING-FLOW-DESIGN.md` §2 (AUTH-28 to AUTH-31, TEN-31). This section
draws the screens in the dashboard's language: one 480 px column, the Lytro wordmark (no shop exists yet),
the language toggle, a four-segment progress bar on the owner's steps, one white card, and "Powered by
Lytro" at the foot. Every field is 48 px, every button full width, every message one sentence.

| Screen (route) | What it shows | States drawn | SRS |
| --- | --- | --- | --- |
| Sign-in `/sign-in` | the held address and picked plan as chips when the visitor came from the site; phone with `+880`; **এগিয়ে যান**; "use a password instead"; the free-SMS line; Google and Facebook with their marks; the terms line; the staff link | code mode; password mode with "forgot your password?" | AUTH-01, 12, 21, 24, 28, 29, LEG-01 |
| Verify code `/verify-code` | six boxes, "works for 5 minutes", resend countdown, change number, use a password | three digits typed; wrong code with tries left and the 15-minute lock line | AUTH-05 to 07, 13, 14 |
| OAuth return `/auth/oauth/:p/callback` | a spinner and "back to sign-in" | | AUTH-24 |
| Create shop `/create-shop` | shop name (any script, 60); the link with the `.lytro.app` suffix and the live verdict; both addresses previewed; owner name; the final-address line; **দোকান তৈরি করুন** | available; taken with the `megh-2` chip; refused (AUTH-30) with everything kept; after a deleted shop, the carry-over note | AUTH-10, 11, 23, 30, TEN-19, 26, 31 |
| Checkout `/checkout` | plan and term chips; price, monthly equivalent and saving; the no-refund line; the four wallet marks; **পেমেন্ট পেজে যান · ৳4,741**, which opens the hosted payment page with Lytro as the payee (§7.19); "continue without paying" | before; returned while the payment is still being checked ("your shop runs on the trial meanwhile"); returned paid ("Starter is on", the period, invoice, SMS and email) | AUTH-29, BIL-01, 02, 03, 04, 18, TRM-12, PAY-21 |
| Set password `/set-password` | the new password with three live rules; Save; Skip | optional; Facebook-only account with the recovery note; required (no Skip) after a reset or an owner-set staff password | AUTH-19, 20, 27 |
| Set up `/set-up` | the eleven shop types as chips; the home area as chips with a search; the two-zone preview (৳70 inside, ৳130 outside); Save or Skip | | AUTH-28, PST-01, DLV-01 |
| Staff sign-in `/staff-sign-in` | phone and the owner-set password; the "ask the owner" line; the owner link | | AUTH-31 |
| Staff new password `/staff-set-password` | the required password screen with the staff lead | | AUTH-19, STF-13 |
| Forgot password `/forgot-password`, `/verify` | phone; the same-reply line; the reset code boxes; then the required password screen | | AUTH-17, 18 |
| Opening your shop `/shops` | a spinner while `/me` answers | | TEN-31 |
| Shop picker `/shops` | the person's shops with role and address; no "new shop" | | TEN-15, TEN-31 |

The set-up answers reach the dashboard's defaults: the business type through `PUT /business-type` and the
home area through `PUT /delivery-zones/home-area` (both built).

---

## 7. Screens of the current state

Each screen is written the same way: **Job**, **Layout**, **Content** (the endpoint or SRS row every figure
comes from), **Actions**, **States**.

### 7.1 Home (`/`)

**Job.** See what needs me, in order, and the shop's numbers without reading a chart.

**Layout.** Banner (if any). Then the **queue** of job rows, each opening its filtered list:

1. Low or out-of-stock products (INV-08) → `/stock?state=low`
2. Batches expiring within 30 days (INV-13) → `/stock/expiring`
3. A top-up being checked (BAL-03) → `/balance`
4. A plan payment being checked (BIL-04) → `/plan`
5. Balance under ৳50 (BAL-13) → `/balance`
6. Trial or plan ending inside 7 days (TRL-08, BIL-14) → `/plan`

Phase 4 and 5 add payments to verify, orders to confirm, orders to book and unverified orders at the top of
the queue, and staff without a password once `/staff` returns it (§10).

Then **Right now**: four tiles: Products (with the active count), Low stock (with the out count), Balance
(with the free SMS used), Plan days left (with the date). Then the **set-up checklist** (SUP-01): shop
created, delivery charges, add the first product, share the link; the items that wait for later slices (logo,
wallet number, courier, SMS events, listener, API key) are listed greyed with their phase. Then the **shop
link** card with Copy, Facebook and WhatsApp. On desktop the queue takes two thirds and the tiles, checklist
and link the right third.

**Content.** `GET /products` stock states, `GET /batches?state=expiring`, `GET /balance` (balance, free SMS,
pending top-up), `/me` (plan, period end). **States.** Day one: the checklist opens first and the tiles read
zero with the trial days; a queue with nothing says so in one line.

### 7.2 Orders tab (placeholder)

"No orders yet. Orders arrive in Phase 4; you will confirm and book couriers from here." with the share-link
button. The Orders designs themselves are in §8.

### 7.3 Products (`/products`)

**Job.** Find a product, see its stock state at a glance, add one.

**Layout.** Title with the Shop chips. Search and a category filter (the tree sheet). Segments: All, Active,
Inactive, Low stock, Out. **Add product** in the header. Rows: thumbnail or monogram tile, name, "n variants
· category", the price or range above the stock chip. Desktop: a table with the same columns.

**Content.** `GET /products?search=&categoryId=&page=`, `GET /categories`. **States.** Empty with the trial's
product limit line (TRL-03); at the plan limit the server's `plan_limit_reached` becomes a sheet naming the
limit with "See plans" (PRD-04).

### 7.4 Product editor (`/products/new`, `/products/:id`)

**Job.** Save a sellable product with the fewest fields and reach every setting when needed.

**Layout.** Four cards and a sticky **Save**:

1. **Basics**: photos (reorder, delete, one video; upload waits for Slice 6), name, price, category (opens
   the picker sheet), description (plain text, PRD-01).
2. **Options and variants** (ATR-11): "Add attribute" (sheet), each attribute as a mini card with its role
   chip, its options with swatch dots, the option-set chips; "Sizes share one stock" (INV-24); the variant
   matrix with Price and Stock columns and "Fill all" (ATR-17); the limits line (ATR-14).
3. **Stock and delivery**: tracked or made to order (INV-02), unit (UOM-01), low-stock threshold (INV-08),
   weight, delivery charge and mode (PRD-16, DLV-03), "Delivers to" (sheet, DLV-07), payment policy (sheet,
   PRD-08).
4. **More settings** (collapsed, PST-05): size chart (sheet), condition, the product link (sheet), active,
   Duplicate, Archive, Delete for good.

**Sheets.**
- *Pick categories*: the tree with a checkbox per category, the primary marked and "make primary" on the
  others, Uncategorized last (PRD-03, PRD-15).
- *Add attribute*: a search that autocompletes the library and the shop's own, the category's suggestions as
  chips (ATR-02), "Create …" for a new name (ATR-01), and the role: describes, splits into variants (needs
  options, at most 3), asked when ordering (ATL-02, ATR-08).
- *Options and swatches*: the option-set chips inserted in one tap (ATR-16), the option list, "Add option",
  a swatch per option from a palette or a photo (ATR-18), "Save as a set".
- *Size chart*: use the category's chart or the product's own; a table up to 15 × 10 with add row and add
  column (PRD-17).
- *Product link*: the link with Copy, Facebook and WhatsApp, a variant picker that appends `?v=`, and
  "Change the link" with the redirect note (LND-04, LND-06).
- *Delivers to*: wherever the shop delivers, or only the chosen zones (DLV-07).
- *Payment policy*: shop default, no advance, delivery charge in advance, partial advance with its amount,
  full prepayment (PRD-08).
- *Remove*: archive (default) or delete for good, each with its consequence (PRD-13).

**Content.** `GET /product-defaults?categoryId=`, `POST /products`, `PATCH`, `PUT …/variants`,
`…/attributes`, `…/slug`, `…/size-chart`, `…/delivery-zones`, `POST …/duplicate`, `DELETE` (built).

### 7.5 Categories (`/categories`)

**Job.** Keep a small tree the storefront can navigate, without ever blocking a product (PRD-03: a
product sells with no category, and "Uncategorized" always exists).

**Layout.** The tree, four levels deep, one row per category: name, the product count, a "Hidden" chip when
it is off the storefront, the "behaves like" chip when set (PST-06), the visibility switch (saves at
once, `PATCH`) and a ⋯ menu. **Add category** in the header. Tapping a row opens the category sheet.
Day one: the empty state with the one button, and the shop type's suggested categories as chips with
"Add these n" (PST-02; the list is the operator's preset data and is empty until curated, PST-04).

**The flow.**
- *New category* (sheet, `POST`): name (any script, 80), where it sits (the parent picker, top level by
  default), visible, "behaves like" (follows the shop's type by default), and the line that the link name
  is made from the name and never changes. Saving returns to the tree with the new row marked and a toast.
- *Sub-category*: the same sheet with the parent filled from the row's menu; the depth line says four
  levels.
- *Row menu*: Edit, Add a sub-category, Move up, Move down (`sortOrder`), Hide or Show on the storefront,
  Delete.
- *Category sheet* (`PATCH`, `PUT …/attributes`, `PUT …/size-chart`): name; where it sits (the parent
  picker, with the category itself and its subtree greyed as "cannot sit inside itself", and the note that
  sub-categories move with it); visible; "behaves like"; the suggested attributes as chips with a checklist
  picker over the library and the shop's own (ATR-02, ATL-05); the size chart with its editor (PRD-17); a
  Delete button.
- *Delete* (`DELETE`, three cases): a category holding products asks to move them to Uncategorized first
  ("Move the products and delete", nothing is removed); a category with sub-categories is refused with the
  count and the way out; an empty one confirms in one tap. The tree then shows the toast with what moved.
- *From the product editor*: the category picker's last row, "New category", opens the same sheet and
  returns to the picker with the new category selected.

**Content.** `GET /categories` (tree with counts, suggestions, "behaves like", charts), `POST`,
`PATCH`, `DELETE /categories/:id` with `?products=uncategorize`, `PUT …/attributes`, `PUT` and
`DELETE …/size-chart` (all built, #150 and #152). **States.** Read-only: the switches, menu and buttons
are absent; the tree stays.

### 7.6 Attributes and option sets (`/attributes`)

**Attributes**: every attribute the shop sees, the platform's with a "Library" chip and the shop's own with
"Yours", each with its type and option count; the sheet renames (own only), lists and adds options with
swatches, and retires with the one-line consequence (ATR-10). "New attribute" asks the name and the type
(options, number with a unit, text, yes/no). **Option sets**: the platform's sets and the shop's own, with
delete for the shop's own (ATR-16). Built: `GET/POST/PATCH /attributes`, `…/options`, `/option-sets`.

### 7.7 Stock (`/stock`)

**Job.** Know what I can sell right now, what is waiting to ship, fix a wrong number without inventory
words (INV-22).

**Layout.** Header actions **Check stock** and **Add stock**. The figures row for `inventory:manage`
(D3-9): stock value, cost of goods sold this month, losses by reason, expiring batches (INV-18). Search and
the segments All, Low, Out. Each product is a card with its variants as rows: three figures (**Can sell**,
**Waiting to ship**, **On hand**), the stock chip, "Add stock" and "Edit". Slice 4 adds "Coming" (PUR-05).
A made-to-order product shows one line. A variant row opens the sheets below.

**Sheets.**
- *Add stock* (`POST …/stock-additions`): variant, quantity in the unit, unit cost, supplier name typed
  (the purchase record arrives with Slice 4), batch code and expiry on a batch-tracked product (INV-12),
  serials on a serial-tracked one with "add later" (INV-14).
- *Edit stock* (`PUT …/stock`, INV-06): the number with steppers, the four reason chips, a note.
- *Stock history* (`GET …/stock-history`, INV-09): a timeline in everyday words with the actor and the
  on-hand after.
- *Average cost* (`PUT …/cost`, INV-10): by hand until the first receipt sets it.
- *Batches* (`GET /products/:id/batches`, INV-12, 13): code, expiry, quantity, state (fine, expiring in n
  days, expired, no expiry) and Write off on an expired batch (`POST …/write-off`).
- *IMEI / serials* (`GET …/serials`, INV-14): the units held with their status chips (in stock, sold,
  returned, written off), the "n units still have no serial" line, Fix and Remove per serial while the unit
  is in stock. *Add serials* (`POST …/serials`, INV-23): scan, paste a list or type, each line checked
  (15-digit IMEI with its check digit, duplicates in the shop) before the button names how many will be
  added.

### 7.8 Stock checks (`/stock/checks`, `/stock/checks/new`, `/stock/checks/:id`)

The list: number, date, who counted, lines and changed count, the value gained or lost (manage only).
**New check** (INV-07): pick products or a category, a table of expected and counted with the running
difference, the note that differences are recorded as "counted again", Save. **Detail**: the three figures
(lines, gained, lost) and the line table. Built: `POST/GET /stock-checks`, `GET /stock-checks/:id`.

### 7.9 Expiring (`/stock/expiring`)

Batches within 30 days then expired, soonest first, each with the product, code, expiry, quantity and Write
off once expired (`GET /batches?state=`, INV-13). Built.

### 7.10 Delivery (`/delivery`)

**Job.** Set what delivery costs where, in the two numbers every Facebook seller already uses.

**Layout.** The **home area** card: the area and the two charges "Inside Dhaka city ৳70" and "Outside Dhaka
city ৳130", each editable (DLV-01, DLV-05). **More zones** with name, charge, areas as chips, the "No
delivery" chip (DLV-06), and "Add zone". **Check an address**: a thana and the zone and charge it resolves
to (`/delivery-zones/resolve`). The extra charge per kg (RAT-14) at the foot.

**Sheets.** *Home area*: a city, a district, or the shop's own thanas, with a search and the two-zone
preview; "changing the area renames the two zones, the charges stay". *Zone*: name, charge, the areas as
chips with "add a district, city or thana", the conflict line when an area is already in another zone
(DLV-02), the no-delivery switch, Delete (refused for the home and fallback zones and for a zone a product
names). Built: `GET/POST/PATCH/DELETE /delivery-zones`, `PUT …/home-area`, `…/areas`, `GET /locations`.

### 7.11 Balance (`/balance`)

A plain card: the amount in 36 px, the "frozen" chip when frozen (BAL-08), this month's free SMS as a bar,
**Top up** (marigold, `balance:manage`), "Current rates". The statement grouped by day with units × rate
and the balance after, segments by type, dates, CSV; the rates card. The **top-up sheet** (BAL-03, 04): the amount with quick chips and "buys about n SMS", the four wallet
marks, and **পেমেন্ট পেজে যান · ৳500**, which opens the hosted payment page for that amount (§7.19).
Coming back, the Balance screen shows the "৳500 top-up is being checked" banner until it matches, then
the credited toast and the ledger row. Built today as `POST /balance/top-up/quote` then `/confirm`; the
page replaces the inline wallet step in Phase 5.

### 7.12 Plan (`/plan`)

Banners first (a scheduled downgrade or pay-as-you-go switch with "Keep Growth", a pending cancellation with
Undo, the lapsed state line). The **current plan** card: name and state chip, term, three figures (days left,
next payment, orders handled), the one action for the state (Renew for ৳…, Pick a plan, Keep the plan),
"See invoices", the auto-renew switch (BIL-17; its read is a backend addition). **Change plan**: term chips
(TRM-12), plan cards (price, monthly equivalent, three limits, the one allowed move), the dashed
pay-as-you-go card. Add-ons as a card that says what will be bought here (Slice 10a). Stop the subscription
as a disclosure at the foot.

**Sheets.** *How to pay* (BIL-02, BIL-08): from the balance when it covers the price, else greyed with
the reason, or on the payment page with the four wallet marks; the line that nothing changes before the
payment is confirmed and that the request lapses after 24 hours (BIL-04, BIL-15). *Upgrade* (UPG-06,
UPG-16): new price, credit for unused days, amount due, the new period, the limits that change, pay from
balance (enough here) or on the payment page, the 15-minute validity and no-refund lines. *Downgrade*
(DWN-03): the effective date first, the over-limit list, one sentence per consequence, the new price,
"Move down on 9 Nov". Coming back from the page, Plan shows the "payment being checked" banner (nothing
changes until it is confirmed), then "Renewed · runs until 9 Dec" or "Growth is on" with the new figures.
Built.

### 7.13 Invoices (`/invoices`)

Rows with number, plan and term, date, amount and method; "Earlier shop" chip (BIL-13); the detail with
issued and period dates, plan and version, price, discount, credit, paid by, billed to and the limits
snapshot. PDF is later. Built.

### 7.14 Team (`/team`, `/team/roles`)

Seats line with the bar (STF-02) and the two ways out when full; the owner pinned; staff rows with role
chips and "Off"; the staff sheet with the generated first password (STF-13, AUTH-19), the active switch with
its consequence and the roles as a checklist; roles with holders and permission chips, the editor as plain
sentences with "Spends the balance" where it applies, delete disabled with the holder count (STF-09). Built.

### 7.15 Activity (`/activity`)

A timeline grouped by day; one sentence per entry with the detail line; the result chip only on failure;
"Lytro support" or "System" for platform actors (AUD-08); filters by actor and action group; the retention
line (AUD-06). Built.

### 7.16 Settings (`/settings`)

Rows into pages: **Shop details** (name, logo with the monogram preview, business type with "existing
products do not change" (PST-01, 03, `PUT /business-type`), contact phone, email and street address
(TEN-30)); **Delivery** (§7.10); **Data export** (LIF-16: request, the list with preparing, download and
failed states, "lasts 24 hours", owner only). Under "Coming later", greyed with their phase: payment
methods, couriers, listener phone, SMS, notifications, API keys, ad tracking and feed, brand identity,
storefront.

### 7.17 Account (`/account`)

The identities as rows with the provider's mark and the action per row (AUTH-26, AUTH-27), the language
toggle (I18N-02), Sign out. Built.

### 7.19 Paying the platform through the hosted page

Every payment to Lytro (a plan at checkout, a renewal, an upgrade, a top-up) goes through the hosted
payment page of `PAYMENT-PAGE-DESIGN.md` with Lytro as the payee, the platform's wallet numbers, the exact
amount and the reference (PAY-21, BIL-03, BAL-03). The dashboard never shows a wallet number or asks for a
transaction ID itself. The wiring:

| Where the seller taps | The page opens with | Coming back |
| --- | --- | --- |
| Checkout, "পেমেন্ট পেজে যান · ৳4,741" | Lytro · Starter · 12 months · ৳4,741 | paid → "Starter is on" and the password step; still checking → "submitted, the trial runs meanwhile" and the password step; closed → the checkout again |
| Balance, Top up, "পেমেন্ট পেজে যান · ৳500" | Lytro · Top-up · ৳500 | paid → the credited toast and ledger row; still checking → the "being checked" banner; closed → Balance |
| Plan, Renew → How to pay, "পেমেন্ট পেজে যান · ৳449" | Lytro · Starter · 1 month · renewal · ৳449 | paid → "Renewed · runs until 9 Dec"; still checking → the banner; closed → Plan |
| Plan, Upgrade, "Pay on the payment page" | Lytro · Upgrade to Growth · ৳400 | paid → "Growth is on"; still checking → the banner; closed → the upgrade sheet |

In the prototype the page is embedded as its own document inside the frame: the picker, the wallet's
coloured card, Verify, the checking ring and the verified card, then "back to shop" returns to the state
above (auto-return after five seconds when paid, PAY-08). The page is in the toolbar's "Payment page"
group with each of the four contexts.

### 7.20 Lifecycle, suspension and support view

| State | What the shell does | SRS |
| --- | --- | --- |
| `trial` | Teal-50 banner "n days left in the trial · See plans"; warning-soft inside 3 days | TRL-08 |
| `grace` | Warning banner "Plan ended n days ago. Renew to keep selling." Everything works | LIF-05 |
| `read_only` | Neutral banner; every create, edit and delete control absent; export offered | LIF-06 |
| `locked` | No shell: the **Renew** page (plan picker, pay-as-you-go, export); staff refused | LIF-11, 15 |
| `archived` | The Renew page with the deletion date and export | LIF-12, 18 |
| suspended | `/unavailable` with support; the owner's Balance and Top up still reachable | LIF-24 |
| support view | The ink-and-marigold bar on every screen, never dismissable | ADM-05 |

---

## 8. Screens designed for later phases

Kept in the prototype under "Later phases (design only)", exactly as designed on 2026-10-20, so the
architecture is whole when each phase arrives. Their endpoints do not exist yet.

- **Orders** (`/orders`, Phase 4): status segments with counts, search and dates, rows with number, name,
  area and items, the total above the status chip, the fraud dot (FRD-01); desktop list-plus-detail.
- **Order detail**: customer with Call and the fraud chip, items as snapshots (ORD-46), pricing with advance
  and cash on delivery, payment, courier with the area warning (CUS-12), timeline, and the state's one
  action: Confirm, Book courier (sheet: courier, area, COD, weight, note), Mark shipped, Sync.
- **New order**: paste the message (ORD-30) with the per-read cost, the customer with the known-phone
  fill (CUS-01) and the zone line (DLV-05), items with the variant chooser, payment, the sticky Create.
- **Customers**: search by name or last digits, rows with orders and spend, the detail with the fraud level,
  addresses, orders and the privacy delete (CUS-02, 06, 09).
- **Payments** (Phase 5): To verify first (PAY-14) with the mismatch line, Approve and Reject, proof image;
  listener health (VER-07); the verified list. **Payment methods**: one card per type with accounts, the one
  active radio, gateway credentials (WAL-01 to 13).
- **Usage** (Slice 10): every metric against its limit with thresholds and the bandwidth chart (LIM-02,
  BND-08). **Notices** (Phase 7): pinned first, category chips, "I understand" (NTC-03 to 05).
- **Purchases** (Slice 4): purchase orders with status chips, "Order from supplier", "It arrived",
  suppliers (PUR-01 to 06). **SMS events** (Phase 7): switches with the estimated monthly cost and the
  template link (SMS-02, 10, 12). **Notifications** and **Search**: §4.4 and §4.6.

---

## 9. States that apply everywhere

| State | What the screen shows |
| --- | --- |
| Loading | Skeleton rows in the list's own shape; the title and chips drawn at once. |
| Empty | One sentence on what will appear and the one button that starts it. |
| Error | The server's `message` in one sentence with Retry; never a code. `plan_limit_reached` becomes a sheet naming the limit with "See plans"; `tenant_offline` becomes the lifecycle banner. |
| Offline | The offline banner; lists show what was loaded; forms keep what was typed. |
| No permission | The section is not in the navigation; a deep link lands on Home with a toast. |
| Read-only | Controls that write are absent, not disabled; the banner explains once. |

Accessibility and Bangla: tap targets 44 px, focus rings teal-500, every icon-only control labelled, chips
are buttons, colour never carries meaning alone; Bangla line height 1.6, buttons wrap, nothing uppercased,
Western digits; English is a full toggle stored per device (I18N-01, 02).

---

## 10. What the backend must add for this design

| Need | Where | For |
| --- | --- | --- |
| `autoRenewEnabled` on `/me`'s tenant | billing | the auto-renew switch's read (BIL-17) |
| `GET /usage`: every counter against its limit, plus the daily bandwidth series | limits | §8 Usage, Home's tiles (LIM-02, BND-08) |
| Top-up bounds on `GET /balance` | balance | the sheet's hint before a refused quote (BAL-04) |
| `periodStart` / `periodEnd` on the upgrade quote | billing | UPG-06 |
| `mustSetPassword` on each `/staff` row | staff | the Home queue row and the People list (STF-13) |
| A one-call Home read (`GET /home`): low-stock and expiring counts, pending top-up and plan payment, and later the order and payment counts | several | §7.1 without six list calls |
| Invoice PDF | billing | BIL-13 |
| Pay-as-you-go estimate | billing | PYG-12 |
| Media upload | Slice 6 | product photos and the shop logo (§7.4, §7.16) |
| Orders, customers, payments, couriers, SMS, notifications, notices, keys, add-ons, purchases | Phases 4 to 8, Slices 4, 10a | §8 |

---

## 11. Mapping onto `apps/dashboard` (for the UI slice, not built here)

| Piece | Where |
| --- | --- |
| Onboarding screens of §6 | `views/sign-in`, `verify-code`, `oauth-callback`, `create-shop`, `checkout`, `set-password`, `set-up`, `staff-sign-in`, `staff-set-password`, `forgot-password`, `shops` (the routes already exist; the views are rebuilt to this design) |
| Shell: app bar, tab bar, rail, secondary column, banners, + menu, search | `components/shell/*` |
| Components of §5 | `packages/ui` (shared with the operator console where it uses the same shape) |
| Hubs | `routes/$shop/{index,orders,products,balance,menu}.tsx` with their sections as child routes |
| Screens | `views/<section>/*` as container plus presentational files, hooks in `api/*` |
| Dictionaries | `i18n/locales/{bn,en}.json`, one namespace per hub, the vocabulary of `BRAND-IDENTITY.md` §7 |

---

## 12. Open questions

1. Whether the tab bar should carry four hubs and a centre **+** instead of five hubs; the prototype uses
   five with **+** in the app bar so the destinations stay stable as phases arrive.
2. Whether Customers earns its own hub once Phase 4 ships and the list is used daily.
3. Whether the desktop rail should collapse to icons only below 1280 px (as drawn) or keep labels and drop
   the secondary column instead.
4. The order of the Home queue once real volumes are seen; the order here puts money before parcels because
   a payment to verify blocks an order from being booked (CRR-09).
