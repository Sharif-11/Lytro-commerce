# Tenant dashboard: the full design

Status: v2.3, 2026-10-22 (v2.2 of 2026-10-21 brought up to the prototype as it stands after Slice 10a: the screens
of Slices 4 to 10a get their sections in §7, the decisions of 2026-10-22 for Phase 3 Slice 11 are recorded in §2,
§10 and §11, and the prototype's faults are fixed). One design for the whole seller journey: sign-in and onboarding,
and the dashboard (`apps/dashboard`, served at `app.lytro.app/<shop>`). It replaces the screen designs in
`DASHBOARD-SECTIONS-DESIGN.md` and the shell and screen visuals in `ONBOARDING-FLOW-DESIGN.md` (that
document's flow, decisions and routing rules still hold and are referenced below). The interactive
prototype is **one document**, `docs/brand/lytro-dashboard.html` (open in a browser; needs internet for
Google Fonts): every screen of the journey as the product stands after **Phase 3 Slice 10a**, with the
onboarding steps, the Phase 1 to 2 money and team sections, and the Slice 1 to 10a catalogue, stock, purchasing,
delivery, media, usage, add-on, key, Meta and brand screens; Bangla with the EN toggle; phone, tablet and desktop;
the shop's lifecycle states switchable. Screens designed for later phases (orders, customers, payments, notices,
the bell and its notifications, storefront settings, shortfall and returns, SMS) are kept in the same document
under "Later phases (design only)" so the architecture stays whole, and they do not appear in the navigation of
the current state. Phase 3 Slice 11 builds the dashboard to this document, from scratch (§11).

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

## 2. Scope of the current state (Phase 0 to Phase 3 Slice 10a)

What the prototype's navigation shows today, and what it holds back. Decided 2026-10-22 for Slice 11: the bell
waits for Phase 7; storefront settings wait for Slice 12; shortfall, returns and profit wait for Phase 4.

| Area | In the current state | Held for later (and where it sits in the prototype) |
| --- | --- | --- |
| Onboarding and sign-in | every step of §6 | nothing |
| Home | the job queue from stock, batches, money being checked, low balance, the plan's end and staff without a password; the fast-spend banner; the "Right now" tiles; the set-up checklist; the shop link | the order and payment job rows and the sales tiles (Phase 4, 5) |
| Shop hub | Products (with photos and video), Categories, Attributes, Stock (checks, expiring, value and losses), Purchases (with suppliers), Delivery | shortfall, returns and profit (Phase 4, "Later phases") |
| Money hub | Balance, Plan, Invoices, Usage, Add-ons | Payments, Payment methods (Phase 5); the hosted payment page (Phase 5, §7.19) |
| Menu | Team, Activity, Settings (shop details, delivery, brand identity, API keys, Facebook and Meta, data export), Account; install the app, language, help, sign out | Notices (Phase 7); storefront settings and its banner slides (Slice 12); the settings rows for payment methods, couriers, listener, SMS and notifications under "Coming later" with their phase |
| Shell | app bar with search (products) and **+** (Add product, Add stock, Top up); tab bar Home, Orders, Shop, Money, Menu; on desktop the rail, the header and, from 1280 px, the side column | the bell and notifications (Phase 7); the Orders tab opens a placeholder that says orders arrive in Phase 4; the + menu shows "New order" greyed with its phase |

The "Later phases (design only)" group of the prototype keeps the Orders, Customers, Payments, Payment
methods, Notices, SMS and order-and-customer Search designs exactly as §8 describes them, and since 2026-10-22 the
bell with its panel and page, storefront settings with its slides, and the shortfall and return screens. When one of
them opens, the navigation switches to the full information architecture of §3 so the design can be judged in its
own context.

---

## 3. Information architecture

Five destinations, each a **hub** with its own sections. The hub names are the seller's words for the parts
of the business, not the platform's module names. Routes are under `app.lytro.app/<shop>`.

| Hub | Sections (route) | Needs | Backend today |
| --- | --- | --- | --- |
| **Home** `/` | The queue, "Right now" tiles, set-up checklist, banners | any member | `GET /home` (Slice 11, §10) and `/me`; order and payment counts later |
| **Orders** `/orders` | Orders, one order, new order, Customers | `orders:*`, `customers:read` | later (Phase 4); the tab opens the placeholder |
| **Shop** `/products` | Products `/products`, one product `/products/:id`, new `/products/new`, Categories `/categories`, Attributes `/attributes` (with Option sets), Stock `/stock`, Stock checks `/stock/checks`, Expiring `/stock/expiring`, Stock value `/stock/value`, Purchases `/purchases` (one purchase `/purchases/:id`, Suppliers `/purchases/suppliers`), Delivery `/delivery` | `products:*`, `inventory:*` (costs and value only with `inventory:manage`, D3-9), `settings:manage` (delivery, business type) | built (Slices 1 to 9) |
| **Money** `/balance` | Balance `/balance`, Plan `/plan`, Invoices `/invoices`, Usage `/usage`, Add-ons `/addons`; Payments, Payment methods later | `balance:*`, `payments:read/manage` | built (Phase 2, Slices 10 and 10a) |
| **Menu** `/menu` | Team `/team` (+ `/team/roles`), Activity `/activity`, Settings `/settings` (Shop details `/settings/shop`, Brand identity `/settings/brand`, API keys `/settings/api-keys`, Facebook and Meta `/settings/meta`, Data export `/settings/export`), Account `/account`, Help, Language, Sign out; Notices later | per row: `keys:manage` for API keys, `settings:manage` for the rest of Settings, the owner alone for the export | built; the brand identity's backend is Slice 11 (§10) |

Rows and sections a staff member lacks the permission for are **hidden, never disabled** (STF-11). The owner
sees everything. A hub whose every section is hidden disappears from the navigation.

**Why Attributes is a section.** Attributes are created inline while editing a product (ATR-01), but ATR-10
asks for a place to rename, re-colour and retire the shop's own ones and to see the platform's library, so
the hub carries it as one screen with Option sets as its second segment.

**Why Delivery sits in Shop and not Settings.** Delivery zones decide what every product charges (DLV-03);
the seller changes them beside the products, and the product editor's "Delivers to" sheet names them.

**Why Payments and Balance will share a hub.** Both are money the seller watches daily. Until Phase 5 the
hub's first section is Balance.

**Why Usage and Add-ons sit in Money.** Room costs money: a usage warning ends in a pack, an add-on or a plan,
and every one of those is paid from the balance or like a plan. The add-ons screen is also reached from Usage,
Plan, the brand editor and a refusal at a limit.

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
- **Side column** (secondary column), 224 px, white, from 1280 px: the shop's name and address, the hub's label,
  and its sections as text rows with counts; it replaces the section chips. Kept on 2026-10-22, once the
  prototype's frame showed it.
- **Header**, 64 px: page title left; search (320 px), **+**, language, the person's initial on the right; the
  bell joins in Phase 7.
- **List and detail split** for Products from 1024 px (and for Orders and Customers later).
- **Sheets** are a 480 px right panel over a scrim.

### 4.4 Global search

One field for an order number, a phone number, a customer name or a product name, grouped results with the
same rows the lists use. Products search is `GET /products?search=` today; orders and customers are Phase 4, so
until then the results hold the Products group alone (`search-products` in the prototype).

### 4.5 The + menu

Add product, Add stock, Top up today; New order and Record a payment join with Phase 4 and 5. Rows a staff
member cannot do are hidden.

### 4.6 Banners

Under the app bar, one at a time: support view (ADM-05, ink and marigold, never dismissable), urgent notice
(NTC-04, Phase 7), lifecycle (§7.20), offline. A screen's own warning sits at the top of its content: a usage
level (§7.24), the low balance (§7.11), a key spending fast (Home, §7.1), an add-on ending (§7.25).

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
7. A staff member who has not set a password yet (STF-13) → `/team`

Phase 4 and 5 add payments to verify, orders to confirm, orders to book and unverified orders at the top of
the queue. A key spending fast (RTE-12) is a banner above the queue, not a row: "More than 5% of this cycle's
requests went in the last hour, from the "Website" key. Nothing is blocked; check the key", with See keys
(`home-fast-spend`).

Then **Right now**: four tiles: Products (with the active count), Low stock (with the out count), Balance
(with the free SMS used), Plan days left (with the date). Then the **set-up checklist** (SUP-01), the owner's
alone, each item ticked by the server: "Get your shop ready" -- shop created and delivery charges (done from the
start, with their amounts), add the first product, upload your logo, share the shop link (done once any shop or
product link is copied or shared, on any device), and "add a wallet number" greyed until Phase 5; "Later, when you
need them" -- create an API key (ticked once one is live), and connect a courier, choose SMS events and pair a
listener phone, greyed with their phases. The checklist folds away once the first group is done, remembered per
device, and can be opened again from Settings. Then the **shop link** card with Copy, Facebook and WhatsApp. On desktop the queue takes two thirds and the
tiles, checklist and link the right third.

**Content.** `GET /home` (a Slice 11 addition, §10): the queue's counts and the checklist in one read, with
"link shared" recorded by the server rather than on one phone; `/me` for the plan and its end; `GET /balance`
for the tile. **States.** Day one: the checklist opens first and the tiles read zero with the trial days; a queue
with nothing says so in one line.

### 7.2 Orders tab (placeholder)

"No orders yet. Orders arrive in Phase 4; you will confirm and book couriers from here." with the share-link
button. The Orders designs themselves are in §8.

### 7.3 Products (`/products`)

**Job.** Find a product, see its stock state at a glance, add one.

**Layout.** Title with the Shop chips. Search and a category filter (the tree sheet). Segments: All, Active,
Inactive, Low stock, Out. **Add product** in the header. Rows: thumbnail or monogram tile, name, "n variants
· category", the price or range above the stock chip. Desktop: a table with the same columns.

**Content.** `GET /products?search=&categoryId=&page=`, `GET /categories`. **States.** Empty with the trial's
product limit line (TRL-03); at the plan limit the server's `plan_limit_reached` becomes a banner over the list:
the limit, that everything already listed keeps selling, and the cheapest ways to room (the next plan or the
add-on, LIM-01), with See plans (PRD-04, `products-limit`).

### 7.4 Product editor (`/products/new`, `/products/:id`)

**Job.** Save a sellable product with the fewest fields and reach every setting when needed.

**Layout.** Four cards and a sticky **Save**:

1. **Basics**: photos and the one video (the media sheet, §7.23), name, price, category (opens the picker
   sheet), description (plain text, PRD-01).
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
`…/attributes`, `…/slug`, `…/size-chart`, `…/delivery-zones`, `…/images`, `…/video`, `POST …/duplicate`,
`DELETE` (built).

### 7.4a The product form by shop type (`/products/new`)

Added 2026-10-21. One form, ten starting points. The shop type never adds a different form: it sets the
defaults a new product starts with and decides which optional block is shown up front, exactly as the
presets seed them (PST-02, PST-05; `control.business_type_presets`, migrations 0051, 0052, 0059). The
sketch draws every default type with a realistic product, so each kind of seller can check that the first
product takes the fewest taps for their trade.

**What every type shares.** The title "New product" with the line *Defaults: Clothing · change* under it
(the link opens the category picker, since a category that "behaves like" another type is what changes
the defaults, PST-06). Then the cards of §7.4 in this order: Basics (photos and the one video with the
Slice 6 upload states, name, price, category, description), the type's up-front block, Options and
variants with the type's suggested attributes as links (ATR-02), Stock and delivery, More settings, the
sticky Save. On desktop a right-hand card, *What this shop type sets*, lists the unit, tracking, batches,
serials, low-stock alert, suggested attributes and up-front fields with the sentence that it is a starting
point only (PST-02), so the adaptive behaviour is visible rather than magic.

| Type | Starts with | Up front | The sketch's product and what it shows |
| --- | --- | --- | --- |
| Clothing | piece, counted, low at 5; Size, Color, Fabric | Size chart | Cotton Panjabi: Size (S to XXL in one tap, ATR-16) and Colour split it; Fabric describes; the chart line reads "Uses the category's chart" (PRD-17); the matrix takes price, opening stock and SKU per variant. |
| Shoes and bags | piece, counted; Size, Color, Material | Size chart | Leather Loafers: EU sizes 38 to 44 in one tap; its own chart. |
| Cosmetics | piece, counted, batches on; Shade, Size, Skin type | Batches and expiry | Matte Lipstick: shades with swatches (ATR-18); the opening stock of each shade is a batch with an optional code, expiry and unit cost (INV-12, INV-10), entered in the *Opening batch* sheet. |
| Electronics | piece, counted, serials on, any code; Brand, Warranty, Compatible models | Serial numbers, Condition | Rechargeable Table Fan: no variants; opening stock 5 with "serials later" (INV-14); condition New, Used, Refurbished as a segmented control (FED-02). |
| Mobiles and gadgets | piece, counted, serials on, IMEI; Storage, RAM, Color | Serial numbers, Condition | Galaxy A16: Storage and Colour split it, RAM describes; the matrix carries an *Opening serials* column ("3 / 5") opening the serials sheet: Scan, Paste a list or Type, each IMEI checked for 15 digits and for duplicates in the shop, the rest allowed later (INV-14, INV-23). |
| Grocery | kg, counted, batches on; Pack size, Brand | Batches and expiry | Miniket Rice at ৳78 per kg: Pack size splits it (5, 10, 25 kg) and *Sizes share one stock* is on, so the matrix has a *Pack holds* column and one opening stock in kg with its batch (INV-24, UOM-03); the unit line says decimals are allowed. |
| Food and bakery | piece, made to order; Size, Flavour | Stock tracking | Chocolate Cake: *Made to order: always available* up front, so no unit, threshold or opening stock fields (INV-02); Size splits the price, Flavour is asked when ordering (ATL-02); payment policy "Advance ৳200" (PRD-08). |
| Books and stationery | piece, counted; Author, Publisher, Edition | nothing | Pather Panchali: the plain form; three describing attributes; one default variant with opening stock 12 (ATR-04). |
| Pharmacy | box, counted, batches on; Strength, Pack size | Batches and expiry | Napa Extra at ৳36 per box: Strength and Pack size describe; the opening stock is a batch with an expiry. |
| Home and décor | piece, counted; Color, Material, Size | nothing | Wooden Wall Clock: Colour splits it, Material and Size describe; the plain form. |

Every up-front block is a switch or a control with one sentence under it that says what it does: serials
("A serial number on every unit · IMEI"), batches ("Each arrival takes a batch code and an expiry, both
optional; the earliest expiry sells first"), made to order ("No stock count, no low-stock alerts, never
refused for stock"). What a type does not show up front sits under More settings unchanged, so a bakery
can still turn serials on and a bookshop can still add a size chart (PST-05).

**Three more states.**
- *Category changed the defaults* (PST-06): choosing "Phones" on a clothing shop's form shows the banner
  "Filed under Phones, which behaves like Mobiles and gadgets: serials turned on (IMEI) and condition came
  up front", with Undo. Existing products never change (PST-03).
- *Photos and video uploading* (Slice 6): tiles for uploading with a progress bar, preparing ("about
  30 s", a video "about 5 min"), refused ("6 MB · limit 5 MB"), and the storage line under them (STO-04,
  STO-09, MED-03).
- *Errors*: a missing name, and serials switched on for a product counted in kg, which the database refuses
  ("use piece as the unit or turn serials off"); the Save button reads "Fix 2 things to save".

**Editing.** A phone that already holds stock shows the stock chip, the Stock card with "Serials: 10 held,
2 missing · Add the missing ones", a *Serials* column in the matrix instead of opening stock, and More
settings open with Duplicate and Archive (PRD-18, PRD-13). Rice with shared stock shows the sharing switch
locked with "Can be switched off only once the stock is 0" (INV-24) and the on-hand line "240 kg across 3
batches · earliest expiry 12 Jan 2027".

**Content.** `GET /product-defaults?categoryId=` (the preset's defaults and up-front fields for the chosen
category or the shop), `POST /products` with `variantAttributes`, `variants` (opening stock, opening batch,
opening serials per variant, or `sharedOpeningStock` with its batch), `attributes`; media through Slice 6's
signed uploads; all built. **Prototype:** the group "Product form by shop type · Slices 1 to 9" in the
toolbar of `docs/brand/lytro-dashboard.html`.

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
(D3-9): stock value, cost of goods sold this month, losses by reason, expiring batches (INV-18); the first
three open Stock value and losses (§7.22). Search and the segments All, Low, Out. Each product is a card with
its average cost and its variants as rows: the figures **Can sell**, **Waiting to ship** and **On hand**, and
**Coming** when a placed purchase brings more (PUR-05), the stock chip, "Add stock" and "Edit". A made-to-order
product shows one line. A variant row opens the sheets below.

**Sheets.**
- *Add stock* (`POST …/stock-additions`): variant, quantity in the unit, unit cost, the supplier picked or
  typed (a new name makes a supplier, PUR-01; the arrival is recorded as a purchase received in full), batch
  code and expiry on a batch-tracked product (INV-12), serials on a serial-tracked one with "add later"
  (INV-14).
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
off once expired (`GET /batches?state=`, INV-13). The **write-off sheet** shows the batch, the units left, the
reason (expired) and the loss at average cost; damaged or lost stock goes through Edit stock with its reason, as
`POST …/write-off` takes an expired batch only (`sh-writeoff`). Built.

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
and the balance after, segments by type, dates, CSV; the rates card. Below ৳50, a warning banner says what may
stop and offers Top up (BAL-13, `balance-low`). The **top-up sheet** (BAL-03, 04): the amount with quick chips
and "buys about n SMS", the platform's lowest and highest amounts said before quoting (`GET /balance` gains them,
§10), the four wallet marks, and **পেমেন্ট পেজে যান · ৳500**, which opens the hosted payment page for that amount
(§7.19). Coming back, the Balance screen shows the "৳500 top-up is being checked" banner until it matches, then
the credited toast and the ledger row. Built today as `POST /balance/top-up/quote` then `/confirm`; the page
replaces the in-dashboard wallet step in Phase 5, and until then Slice 11 keeps that step (sender number and
transaction ID), drawn in this design (decided 2026-10-22).

### 7.12 Plan (`/plan`)

Banners first (a scheduled downgrade or pay-as-you-go switch with "Keep Growth", a pending cancellation with
Undo, the lapsed state line, and for 30 days after a downgrade its checklist). The **current plan** card: name
and state chip, term, the figures days left and next payment (orders handled joins in Phase 4), the one action
for the state (Renew for ৳…, Pick a plan, Keep the plan), "See invoices", the auto-renew switch (BIL-17; its
read is a backend addition, §10). **Change plan**: term chips (TRM-12), plan cards (price, monthly equivalent,
four limits, the one allowed move), the dashed pay-as-you-go card. The **add-ons** card: what is active, what
renews with the plan and for how much, the packs left, See all (§7.25). Stop the subscription as a disclosure at
the foot.

**Sheets.** *How to pay* (BIL-02, BIL-08): from the balance when it covers the price, else greyed with
the reason, or on the payment page with the four wallet marks; the line that nothing changes before the
payment is confirmed and that the request lapses after 24 hours (BIL-04, BIL-15). *Upgrade* (UPG-06,
UPG-16): new price, credit for unused days, amount due, the new period, the limits that change, pay from
balance (enough here) or on the payment page, the 15-minute validity and no-refund lines. *Downgrade*
(DWN-03): the effective date first, the over-limit list, one sentence per consequence, the new price,
"Move down on 9 Nov". Coming back from the page, Plan shows the "payment being checked" banner (nothing
changes until it is confirmed), then "Renewed · runs until 9 Dec" or "Growth is on" with the new figures.

*Stop the subscription* (LIF-01, `sh-cancel`): everything runs until the period's end, then the dated steps
(grace, view only, locked, deletion after day 60, with the balance and invoices kept), and "you can undo any time
before 9 Nov"; afterwards the banner with Undo (`plan-cancelled`). *Downgrade scheduled* (DWN-02): the banner with
Keep Growth (`plan-downgrade-scheduled`). *Switch to pay-as-you-go* (PYG-10, `sh-payg-switch`): the date, the
fees, the limits that fall, what happens to what is over. *A pay-as-you-go shop* (PYG-01, `plan-payg`): the plan
that would cost less against the fees paid this month (from the ledger), Take Growth, add-ons in their own 30-day
periods, and Closing the shop: *Close the shop* (PYG-09, `sh-close-shop`) says what goes offline now, what is
deleted after 60 days, and that a plan or pay-as-you-go brings it back (LIF-15), with Export the data first.
*30 days after a downgrade* (DWN-12, `downgrade-checklist`): each limit over with its fix and Open, and the final
warning's date (`GET /billing/downgrade/checklist`). Built.

### 7.13 Invoices (`/invoices`)

Rows with number, plan and term, date, amount and method; "Earlier shop" chip (BIL-13); the detail with
issued and period dates, plan and version, price, discount, credit, paid by, billed to and the limits
snapshot. PDF is later. Built.

### 7.14 Team (`/team`, `/team/roles`)

Seats line with the bar (STF-02) and the two ways out when full; the owner pinned; staff rows with role
chips, "Off", and "Password not set" until they choose their own (STF-13; the flag is a backend addition, §10);
the staff sheet with the generated first password (STF-13, AUTH-19), the active switch with its consequence and
the roles as a checklist; roles with holders and permission chips, the editor as plain sentences with "Spends
the balance" where it applies, listing the permissions of the sections that exist (products, stock, API keys,
staff, balance, payments, activity, settings; the rest join with their phases), delete disabled with the holder
count (STF-09).

*Edit staff* (STF-03, `sh-staff-edit`): name, the phone that cannot change, roles, Reset password, Deactivate.
*Deactivate* (STF-05): signed out at once, the seat frees, history stays; the toast. *Reactivate* refused when
every seat is in use names the three ways out: deactivate someone, buy a seat (the add-on), or the next plan
(STF-04). *Reset the password* (STF-13): a new first password shown once with Copy. *Delete a role* refused while
someone holds it (STF-09). Built.

### 7.15 Activity (`/activity`)

A timeline grouped by day; one sentence per entry with the detail line; the result chip only on failure;
"Lytro support" or "System" for platform actors (AUD-08); filters by actor and action group; the retention
line (AUD-06). Built.

### 7.16 Settings (`/settings`)

Rows into pages: **Shop details** (name, logo uploaded as §7.23 does with the monogram until then
(`PUT /shop-settings/logo`), business type with "existing products do not change" (PST-01, 03,
`PUT /business-type`), contact phone, email and street address (TEN-30)); **Delivery** (§7.10); **Brand
identity** (§7.28); **API keys** (§7.26); **Facebook and Meta** (§7.27); **Data export** (LIF-16: request, the
list with preparing, download and failed states, "lasts 24 hours", owner only). Under "Coming later", greyed with
their phase: payment methods (Phase 5), couriers (Phase 6), listener phone (Phase 5), SMS (Phase 7),
notifications (Phase 7), storefront (Slices 12 to 13).

### 7.17 Account (`/account`)

The identities as rows with the provider's mark and the action per row (AUTH-26, AUTH-27), the language
toggle (I18N-02), Sign out. *Change password* (AUTH-20, `sh-password`): the current one with "send a code to the
phone" when forgotten, the new one with its rules, and the line that every other device is signed out. *Add an
email* (AUTH-26): the address, the six-digit code, the toast. *Connect* Facebook or Google, with the toast.
*Remove* asks first and says nothing in the shop changes; removing the only way in is refused with "add another
first". Built.

### 7.18 Menu (`/menu`)

The shop card (name, address, the person's role); Team with the seats, Activity, Settings; Account; Language,
which switches at once; Help with the WhatsApp hours; Sign out; "Powered by Lytro". On a phone browser that can
install, an **Install** card heads the page: "Install Megh Fashion on this phone · an icon on the home screen,
opens full screen, with your logo" (TEN-17, `menu-install`); the installed app takes the shop's name and logo,
scoped to `/<shop>/`, from a per-shop manifest (a Slice 11 addition, §10). Notices joins in Phase 7.

### 7.19 Paying the platform through the hosted page

Every payment to Lytro (a plan at checkout, a renewal, an upgrade, a top-up) goes through the hosted
payment page of `PAYMENT-PAGE-DESIGN.md` with Lytro as the payee, the platform's wallet numbers, the exact
amount and the reference (PAY-21, BIL-03, BAL-03). From then on the dashboard never shows a wallet number or
asks for a transaction ID itself. Until the page exists (Phase 5), the dashboard keeps today's wallet step (the
platform's wallet numbers, then the sender number and transaction ID, confirmed by an operator), drawn in this
design (decided 2026-10-22). The wiring, once the page exists:

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

### 7.21 Purchases and suppliers (`/purchases`, `/purchases/:id`, `/purchases/suppliers`)

**Job.** Know what is coming from suppliers and record it when it arrives, in plain words (PUR-01 to PUR-07).

**Layout.** **Order from supplier** in the header. A "Coming" line: the units on order and in how many purchases.
Segments Open, Drafts (count), All, and Suppliers (count). Rows: the number and the supplier, "units · items ·
date · expected on", and the status chip: Draft, Ordered, Partly received, Received, Closed short, Cancelled.

**The flow.**
- *Order from supplier* (sheet, `POST /purchase-orders`): the supplier typed (an existing one is found, a new one
  is made), the expected date and notes (optional), items with quantity and unit cost (optional); **Place with
  supplier** gives the purchase its number and counts it as coming, or Save draft. Items can change until the
  first delivery.
- *A draft* (`PATCH`, `POST …/place`, `DELETE`): everything editable; Place with supplier, Save draft, Delete
  draft.
- *A placed purchase* (`GET /purchase-orders/:id`): per item ordered, received, outstanding and unit cost; the
  total at known costs with the count of items without one (costs only with `inventory:manage`); the deliveries;
  **It arrived**, and Cancel purchase while nothing has arrived (`POST …/cancel`; the number is never reused).
- *It arrived* (sheet, `POST …/receipts`): per item accepted and rejected, the unit cost, the batch code and
  expiry on a batch-tracked product and the serials on a serial-tracked one, a note; accepted units enter stock
  and set the average cost, rejected ones stay outstanding (PUR-04).
- *Partly received*: each delivery with its date, who took it and its batch; **Close short** drops what is still
  outstanding with its reason kept (`POST …/close`). A closed purchase shows the reason.
- *Suppliers* (`GET`, `POST`, `PATCH /suppliers`): name, phone and last purchase; the sheet edits the name, phone,
  email, address and notes, and archives (an archived supplier is not offered for new purchases and is never
  deleted, PUR-01); "Show archived".

**Content.** The routes above; the units per purchase, the "coming" total and a supplier's last purchase are
Slice 11 additions (§10). **States.** Empty: "Nothing on order" with Order from supplier; without
`inventory:manage` the costs and totals are absent; read-only shows no actions.

### 7.22 Stock value and losses (`/stock/value`)

**Job.** See what the stock is worth and what was lost, for those who may see costs (D3-9, `inventory:manage`).

**Layout.** Stock on hand at average cost with its units, then by category; losses this month by reason
(damaged, expired, missing at a count, written off) with units and value; the line "Profit arrives with orders
(Phase 4)". **Content.** `GET /inventory/figures?dateFrom=&dateTo=`; the units and the split by category are
Slice 11 additions (§10).

### 7.23 Photos and video (the media sheet)

**Job.** Add, order and remove a product's photos and its one video, and know how much storage is left.

**Layout.** From the editor's Photos card, a sheet: the tiles in order, the first marked Cover, drag to reorder,
up to [10] photos and one video with its length, size and poster, Replace; the storage line (used of the limit,
and this product's share); the line that deleting frees storage and that past orders show a placeholder where it
was (MED-09). **Upload states** (also in §7.4a): uploading with its progress, preparing with how long it takes (a
photo about 30 s, a video about 5 min), refused with the reason ("6 MB · limit 5 MB"). **Storage full**: the
banner with what was refused and the ways out, Buy 1 GB (the add-on, §7.25) or the next plan (`sh-media-full`).

**Content.** `POST /media/uploads` (answers a signed upload address the browser sends the file to),
`POST /media/:id/finish`, `GET /media/:id` while it prepares, `PUT /products/:id/images` and `…/video`,
`DELETE /media/:id`, `GET /media/usage`. The same upload serves the shop logo, category images, swatches and
size-chart images.

### 7.24 Usage (`/usage`)

**Job.** See how close the shop is to each limit, and get room before anything stops (LIM-01, LIM-02).

**Layout.** The cycle's dates. One card per metric: products, seats and storage (totals), bandwidth, API requests
and free SMS (each cycle), each "used / limit" with its bar; for bandwidth and requests the run-out date at the
current pace, worked out from the daily figures; and "To raise it:" naming the add-on or pack and the plan that
would give room. The auto-buy switch for packs at 100% (BND-04, RTE-11). Bandwidth and requests a day as bar
charts (BND-08). A banner by level: at 80% the run-out date with Turn on auto-buy (`usage-80`); at 95% with Buy
10 GB · ৳30 (`usage-warning`); past the grace what has stopped (images on the storefront, or the catalogue API),
that nothing past the limit is charged, and the one-tap pack (`usage-stopped`). A refusal at a limit (products,
seats, storage) is the banner of §7.3; the 30 days after a downgrade sit on Plan (§7.12).

**Content.** `GET /usage` (each metric with its allowance, packs left and stop, the daily bandwidth, the
suggestions, the packs on offer and auto-buy), `GET /addons` for the per-metric line, `PATCH /addons/auto-buy`,
`POST /addons/packs`.

### 7.25 Add-ons and packs (`/addons`)

**Job.** Raise one limit, top up bandwidth or requests, or switch on the brand, without changing plans (PLN-13 to
PLN-15, BRN-05).

**Layout.** The line "3 add-ons active · renew with the plan on 9 Nov for ৳347". Groups: **Raise a limit**
(products, a seat, storage), **Packs** (bandwidth, requests: "adds once and carries over until used", with what
is left), **Features** (brand identity, with Set up). Each row: its price a month or per pack, then Active with
its end and how it renews, or Buy. The **auto-buy** switches with "at most 3 packs a cycle by themselves; with no
balance it stops".

**Sheets.** *Buy* (`POST /addons/quote`, then `POST /addons/purchase`): how many (up to [10], a feature once), the
limit before and after, due now for the days left and then the price with the plan; from the balance (active at
once) or by the wallet step until Phase 5 (active when confirmed); the renewal switch; a short balance names the
shortfall with Top up. *Buy a pack* (`POST /addons/packs`): the two packs, from the balance only, with the
auto-buy switches. *Turn renewal off* (`PATCH /addons/mine/:id`): when it ends and what happens to what is over
the limit (LIM-03). **Banners and toasts:** an add-on ending in 7 days with renewal off, with Turn renewal on; the
toast after a purchase with the new limit and the invoice. **States:** on the trial every row reads "Needs a
plan", and the brand can be designed but not switched on.

**Content.** `GET /addons`, `GET /addons/mine`, and the routes above.

### 7.26 API keys (`/settings/api-keys`)

**Job.** Give the shop's own website or app a key, and change or revoke it without breaking the site (API-01,
RTE-12).

**Layout.** What keys are for and that up to [20] can be live. Rows: name, the key's start, its websites, last
used, expiry, Revoke; a revoked key with its chip. The cycle's requests against the limit (from `/usage`); the
rotation line. **Sheets.** *New key*: name, websites as exact https origins (up to 10), expiry (optional). *Key
made*: shown this once, Copy, Download, and what to do if it is lost. *Edit key*: name and websites; the value is
never shown again. *Revoke*: it stops at once and a site using it breaks; put the new key in first. Home's
fast-spend banner links here. **Content.** `GET`, `POST`, `PATCH /api-keys`, `POST /api-keys/:id/revoke`
(`keys:manage`).

### 7.27 Facebook and Meta (`/settings/meta`)

**Job.** Connect the Meta Pixel and the Conversions API once, and hand the catalogue to Commerce Manager (LND-15
to LND-17, FED-01 to FED-06).

**Layout.** The Pixel ID with Connected or Not connected and the events it sends; the Conversions API token,
entered once and then "Token set · hidden" with Replace and Remove; the catalogue feed link with Copy, when it was
made and New link (the old link answers 404 at once, FED-05); the four steps in Commerce Manager; Save; the line
that every change is in the activity log. **Content.** `GET`, `PUT`, `DELETE /ad-tracking`, `GET /catalog-feed`,
`POST /catalog-feed/regenerate` (`settings:manage`).

### 7.28 Brand identity (`/settings/brand`)

**Job.** Make the storefront, the landing pages and the dashboard the shop's own, without ever making them hard
to read (BRN-01 to BRN-07).

**Layout.** **Use my brand** with its state: on, with the add-on's end; or off, everyone seeing the Lytro
default. Logos on light, on dark, and the square icon (uploaded as §7.23 does). Colours: main, accent and
background, with the three pairs checked as ratios with ✓ or ✗ (text on main, text on accent buttons, text on
background); the text colours are derived. Fonts from the approved list, Bangla and Latin. Corners: square, soft,
round. Spacing: compact, comfortable, airy. The line on what never changes (BRN-04). The preview, with Storefront,
Landing and Dashboard tabs, changing as the settings change (BRN-06). **Apply**, and Save without switching on.

**States.** A failing pair names the pair and its ratio, Apply stays off until every pair passes, and the nearest
passing shade is offered (BRN-03, `brand-contrast`). On the trial: design and preview, with "Buy the add-on to
switch on" (`brand-trial`). After the add-on lapses: the default shows, the settings are kept and Buy again
restores them (`brand-lapsed`).

**The dashboard themed.** With the identity on, the dashboard takes its colours, fonts, corners and spacing through
the same tokens as the storefront (BRN-07); the status colours, "Powered by Lytro" and the layout never change.

**Content.** The identity's storage, the contrast check, the font list and the switch are Slice 11's brand backend
(§10); whether the shop may switch it on comes from `GET /addons/mine` (`brandIdentity`).

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
- **Notices** (Phase 7): pinned first, category chips, "I understand" (NTC-03 to 05). **SMS events** (Phase
  7): switches with the estimated monthly cost and the template link (SMS-02, 10, 12).
- **The bell and notifications** (Phase 7, decided 2026-10-22): the bell in both bars with its unread count; the
  panel from the top right with Today and Earlier, an icon per kind, unread rows marked, a row's own action, Mark
  all read; nothing yet; all read; the full page with filters (NTF-01). The dashboard has no bell before then.
- **Storefront settings** (Slice 12): the home page's banner slides as a carousel or one banner with two tiles,
  the slide editor with the focal point and both crops, the home page line (`storefront`, `sh-slide`).
- **Shortfall, returns and profit** (Phase 4): units held for orders whose payment ran out (5a,
  `stock-shortfall`); taking shipped stock back, sellable or damaged (INV-17, `sh-return`); profit beside stock
  value. **Search** for orders and customers (Phase 4, §4.4).

---

## 9. States that apply everywhere

| State | What the screen shows |
| --- | --- |
| Loading | Skeleton rows in the list's own shape; the title and chips drawn at once. |
| Empty | One sentence on what will appear and the one button that starts it. |
| Error | The server's `message` in one sentence with Retry; never a code. `plan_limit_reached` becomes the banner of §7.3 naming the limit and the way to room; `tenant_offline` becomes the lifecycle banner. |
| Offline | The offline banner; lists show what was loaded; forms keep what was typed. |
| No permission | The section is not in the navigation; a deep link lands on Home with a toast. |
| Read-only | Controls that write are absent, not disabled; the banner explains once. |

Accessibility and Bangla: tap targets 44 px, focus rings teal-500, every icon-only control labelled, chips
are buttons, colour never carries meaning alone; Bangla line height 1.6, buttons wrap, nothing uppercased,
Western digits; English is a full toggle stored per device (I18N-01, 02).

---

## 10. What the backend must add for this design

Checked on 2026-10-22 against every figure the prototype draws ("nothing drawn that the server cannot return").
The Slice 11 rows are built before the screens that need them, in two pull requests: the smaller reads, then the
brand identity.

| Need | Where | For | When |
| --- | --- | --- | --- |
| `autoRenewEnabled` on `/me`'s tenant | billing | the auto-renew switch's read (BIL-17) | built (11.1a) |
| Top-up bounds on `GET /balance` | balance | the sheet's hint before a refused quote (BAL-04) | built (11.1a) |
| `periodStart` / `periodEnd` on the upgrade quote | billing | UPG-06 | built (11.1a) |
| `mustSetPassword` on each `/staff` row, and a new member's first sign-in asking for their own password | staff | the Home queue row and the team list (STF-13, AUTH-31, KNOWN-GAPS §89) | built (11.1a) |
| `GET /home`: low and out counts, expiring batches, a top-up or plan payment being checked, a balance under ৳50, staff without a password, the fast-spend alert, and the set-up checklist with "link shared" kept by the server (`POST /home/link-shared`) | several | §7.1 in one read (SUP-01); the plan's end stays on `/me` | built (11.1a) |
| Whether a shop address is free, with a suggestion (`GET /shops/address-check`) | identity | create-shop's live verdict (AUTH-11, §6) | built (11.1a) |
| A per-shop app manifest and its icons, scoped to `/<shop>/` | tenancy | installing the dashboard as the shop's own app (TEN-17, KNOWN-GAPS §88) | Slice 11 |
| The units by stock unit, and the split by top-level category, on `GET /inventory/figures`, and each loss reason's units | inventory | §7.22 | built (11.1a) |
| The units and outstanding units of each purchase in the list, and the "coming" total | purchasing | §7.21 (PUR-05) | built (11.1a) |
| A supplier's last purchase | purchasing | §7.21 | built (11.1a) |
| The brand identity: its storage, the approved fonts, the contrast check shared with the editor, the switch held to the add-on or the plan, and the tokens the dashboard and the storefront read | branding | §7.28 (BRN-02, 03, 07) | Slice 11 |
| `GET /usage`, media upload, add-ons and packs, API keys, purchases and suppliers, Meta | | §7.21 to §7.27 | built |
| Invoice PDF | billing | BIL-13 | later |
| Pay-as-you-go estimate | billing | PYG-12 (needs order history) | later |
| The notifications feed behind the bell | notifications | §8 (NTF-01) | Phase 7 |
| Orders, customers, payments, couriers, SMS, notices; storefront settings | Phases 4 to 8; Slice 12 | §8 | later |

---

## 11. Building it (Phase 3 Slice 11)

Decided 2026-10-22.

| Piece | How |
| --- | --- |
| The app | Rebuilt from scratch to this document: a new `apps/dashboard`, same package, port and paths. The views of the first build are a reference for behaviour and API calls only, never for layout. |
| Routes | §3 under `app.lytro.app/<shop>`: `routes/$shop/` with a file per hub and its sections as child routes; onboarding (§6) at the top level as today. |
| Look | The values of §5 (radii 6, 10 and 16 px; background neutral-50) through the dashboard's own theme, `packages/ui` `light.css` roles. The shared base and the operator console's look do not change, proven by before-and-after captures. |
| Components | Shell (app bar, tab bar, rail, header, side column, banners, + menu, search), sheet, dialog, list row, chips, segmented control, switch, stat tile, banner, toast, empty state, skeleton, field, quantity stepper, timeline, variant matrix, category tree, bar chart. In `packages/ui` where the console uses the same shape, else `apps/dashboard/src/components`. |
| Words | `i18n/locales/{bn,en}.json`, one namespace per hub, taken from the prototype's Bangla and English (the vocabulary of `BRAND-IDENTITY.md` §7); Western digits throughout. |
| Libraries | The bandwidth and request charts drawn as plain SVG; IMEI scanning with the browser's BarcodeDetector, and `@zxing/browser` loaded only where it is missing; Lucide icons. |
| Tests | Playwright in `apps/dashboard`: every screen's states (empty, loading, error, read-only, no permission) against a mocked API, on phone and desktop, in Bangla and English; the slice's walkthrough (clothing, cosmetics and grocery: a product, stock added, a stock check, a purchase) against a real server and database in CI. Each pull request shows its screens beside the prototype's. |
| Security | The dashboard's Content Security Policy (KNOWN-GAPS §65) in `deploy/Caddyfile`, its media and upload origins from the environment, checked as the console's was. |
| Order | This document; the backend reads (§10); the brand backend; the foundation and the shell; onboarding and Home; Money; Menu; products and media; categories and attributes; stock; purchasing; delivery; the brand editor and the themed dashboard; last, the policy and the walkthrough. |

---

## 12. Open questions

1. Whether the tab bar should carry four hubs and a centre **+** instead of five hubs; the prototype uses
   five with **+** in the app bar so the destinations stay stable as phases arrive.
2. Whether Customers earns its own hub once Phase 4 ships and the list is used daily.
3. Answered 2026-10-22: the rail keeps its icons and labels at every desktop width, and the side column shows
   from 1280 px, the section chips below it.
4. The order of the Home queue once real volumes are seen; the order here puts money before parcels because
   a payment to verify blocks an order from being booked (CRR-09).
