# Tenant dashboard: the full design

Status: v3.16, 2026-10-29 (the Bangla in one word per thing, by the owner's style guide, throughout the prototype: শপ,
ক্যানসেল, এক্সপায়ার্ড, ডিলিট, সার্চ and the rest; KNOWN-GAPS §100; v3.15 of 2026-10-29: what the real-server walkthrough
found, Slice 11.13b, prototype Part 26: a variant's SKU in
its sheet only, no batch words for a shop that keeps no batches, no requirement id on any sheet; v3.14 of 2026-10-29:
Settings > Storefront as Slice 12a builds it, prototype Part 25: the shop's link with Copy, Share and Open, the switch
that answers "nothing here" while landing pages keep working, asked before turning off, and the key Lytro keeps for the
storefront first in API keys, never changed or revoked; v3.13 of 2026-10-29: the dashboard in a shop's identity as
Slice 11.12b builds it, prototype Part 24: the
rail at the depth of Lytro's own with the dark logo at its foot, only the page taking the background, figures kept in
Inter, the corner and spacing presets' sizes, the status colours unchanged; v3.12 of 2026-10-29: the brand editor as
Slice 11.12a builds it, prototype Part 23: the buttons follow
the switch, the contrast check as the server makes it with the nearest passing shade, a colour's sheet, the logos
set, uploading and refused, a paid shop without the add-on, a plan that includes it, leaving unsaved, and a toast
for each button; v3.11 of 2026-10-29: Delivery as Slice 11.11 builds it, prototype Part 22: no delivery outside the
home area, the two zones renamed or back to their automatic names, one area picker, an area held elsewhere named
before Save, a thana moving from a broader zone said, Check an address with its reason; v3.10 of 2026-10-29: a
screen that names one record, a purchase or a stock check, names it in the desktop header; v3.9 of 2026-10-29:
Purchases and suppliers as Slice 11.10 builds them, prototype Part 21: Open on order, Coming
in every unit, a supplier typed, Add item by product then variants, a placed purchase editable until its first delivery,
It arrived with reasons, batches and IMEIs, Cancel or Close short by deliveries, the archived suppliers, a variant's
purchases, the empty and look-only states; v3.8 of 2026-10-29: stock checks as Slice 11.9 builds them, prototype Part
20: Check stock opens the list of
checks, a new check starts with nothing picked, a category is counted whole, a check takes a note; v3.7 of 2026-10-29:
the Stock page's Add stock picks its product first, and its folding and "+n more" rules
said exactly, prototype Part 20; v3.6 of 2026-10-29 drew the Stock pages as Slice 11.9 builds them, prototype Part 20: a
variant row's own sheets,
the fine products opened in place and a made-to-order line, the Stock page for someone who may only look, Edit stock
naming its batch or the IMEIs leaving, a stock check's picker with batch-by-batch lines and an IMEI not found, and the
empty lists; v3.5 of 2026-10-29 drew the Categories and Attributes pages as Slice 11.8 builds them, prototype Part 19: the
attributes searched with the retired ones last and Bring back, New attribute as Part 14 makes it, a library attribute's
sheet, one option's step, a new option set, and a category's chart as a table or a picture; v3.4 of 2026-10-29 drew
the Stock card's sheets over a product as Slice 11.7c builds them, prototype Part 18: Stock
history and IMEI / serials pick their variant, Add stock takes a serial product's IMEIs, Add serials as Part 16 enters
them; v3.3 of 2026-10-28 drew the brand editor's fonts as Slice 11.12a builds them, prototype Part 17: one choice for
headings and one for body text, each a Bangla face with its Latin partner shown in its own faces, the seven pairs in a
sheet with Galada + Playfair Display held to headings, and the preview set in the chosen fonts; v3.2 of 2026-10-29 drew
opening serials as Slice 11.7c builds them, prototype Part 16: Paste a list, each line's check with its words for an
IMEI and for any code, a code typed twice, the lines to fix left out on Done, and the sheet full at the opening stock;
v3.1 of 2026-10-28 drew stock and delivery as Slice 11.7c builds them, prototype Part 15: the size chart as a table
with its names typed or a picture, Adjust by weight, the question before making a product holding stock to order,
serials typed and the camera missing or blocked, the variant sheet, SKU and barcode under More settings for a product
with no options, and a saved product's defaults line without "change"; v3.0 of 2026-10-27 drew the options and variants
Slice 11.7b builds, prototype Part 14: the bakery's Flavour splits
and its message is asked when ordering, a describing value entered by its type, a swatch per option with the library's
colours fixed, New attribute as a step, Show all past 6 variants, Fill all for one option's variants, the 3 and 100
limits, removing an option that holds stock, and an existing product's variants with what each can sell; v2.9 of
2026-10-27 drew the Products list's and the editor's states Slice 11.7a builds, prototype Part 13: leaving
with changes unsaved, the category filter, nothing matching, Show more, archived products and Restore, the limit before
typing, a part not saved, removing the video, the toasts; v2.8 of 2026-10-27 drew making and renaming a role, prototype Part 12:
the role's name in the editor, Create a role, a shop with no roles yet, and a role made from inside Add staff; v2.7 of
2026-10-27 drew the Menu hub as Slice 11.6
builds it, prototype Part 11: a staff member's Menu with its rows
by permission, Account for a sign-in made with the staff password, adding staff with every seat in use, Activity with
nothing yet or nothing under a filter, installing on an iPhone, the role editor with today's permissions in words, and
Brand identity until its editor; v2.6 of 2026-10-26 drew Usage and Add-ons as Slice 11.5c builds them, prototype Part 10: one usage banner by metric
and level, the run-out date and "To raise it" per metric from the server, the two auto-buy switches and what auto-buy
did, each way an add-on renews or ends, buying in grace, paying for an add-on by bKash or Nagad, a changed amount or
pack price, a pack with a short balance, the ending banner and the renewal-off dialog by kind, an add-on payment being
checked or rejected; v2.5 of 2026-10-26 drew the states Slice 11.5b builds: Billing's Cancelled
state and the Cancel on an awaiting request, the upgrade sheet when the amount changed, the Renew page of an archived
shop with its deletion date, Sign out on the two shell-less pages, and the pay-as-you-go page as built; v2.4 of
2026-10-23 made Billing, §7.13, replace the Invoices section; v2.3 of 2026-10-22 brought the document up to the
prototype after Slice 10a and recorded the Slice 11 decisions in §2, §10 and §11). One design for the whole seller journey: sign-in and onboarding,
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
| Home | the job queue from stock, batches, money being checked or rejected, low balance, the plan's end and staff without a password; the fast-spend banner; the "Right now" tiles; the set-up checklist; the shop link | the order and payment job rows and the sales tiles (Phase 4, 5) |
| Shop hub | Products (with photos and video), Categories, Attributes, Stock (checks, expiring, value and losses), Purchases (with suppliers), Delivery | shortfall, returns and profit (Phase 4, "Later phases") |
| Money hub | Balance, Plan, Billing (the shop's payments to Lytro, with their invoices), Usage, Add-ons | Payments (the shop's incoming payments) and Payment methods (Phase 5); the hosted payment page (Phase 5, §7.19) |
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
| **Money** `/balance` | Balance `/balance`, Plan `/plan`, Billing `/billing` (a payment opens from its row; on the phone at `/billing/:id`, drawn from the list), Usage `/usage`, Add-ons `/addons`; Payments, Payment methods later | `balance:*`, `payments:read/manage` | built (Phase 2, Slices 10 and 10a); the billing list is a Slice 11 addition (§10) |
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

**Why Billing, not Invoices or Payments.** The section holds every payment the seller made to Lytro, whatever
became of it, so a rejected or lapsed payment is found where the seller looks for money, not in the Activity log.
"Invoices" names only the paid ones, and "Payments" is what Phase 5 needs for the shop's incoming payments: to a
seller, a "payment" is money a customer sent. Billing (বিলিং) is the word a seller already uses for what a service
charges them.

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
  A screen below its section that names one record (a purchase's number or Draft, a stock check's number) puts
  that name in the header in place of its section's, since the page's own title is hidden from 1024 px (agreed
  2026-10-29, design v3.10: `purchase-edit-placed`, `stock-check-detail` and the purchase pages).
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
| Sign-in `/sign-in` | the address brought from the site ("Your link: megh.lytro.app", promising nothing: create-shop checks it) and the picked plan as chips; phone with `+880`; **এগিয়ে যান**; "use a password instead"; the free-SMS line; Google and Facebook with their marks; the terms line; the staff link | code mode; password mode with "forgot your password?" | AUTH-01, 12, 21, 24, 28, 29, LEG-01 |
| Verify code `/verify-code` | six boxes, "works for 5 minutes", resend countdown, change number, use a password (password sign-in with the number kept) | three digits typed; wrong code with tries left and the 15-minute lock line | AUTH-05 to 07, 13, 14 |
| OAuth return `/auth/oauth/:p/callback` | a spinner and "back to sign-in" | | AUTH-24 |
| Create shop `/create-shop` | shop name (any script, 60); the link with the `.lytro.app` suffix, filled from the name's Latin letters as it is typed until the owner edits it, and the live verdict (`GET /shops/address-check`) with the server's next free one as a chip; both addresses previewed; owner name; the final-address line; **শপ তৈরি করুন** | available; taken with the `megh-2` chip (the final-address line only for a free one); refused (AUTH-30) with everything kept; after a deleted shop, the carry-over note (`/me`'s `hasDeletedShop`) | AUTH-10, 11, 23, 30, TEN-19, 26, 31 |
| Checkout `/checkout` | plan and term chips; price, monthly equivalent and saving; the no-refund line; the four wallet marks; **পেমেন্ট পেজে যান · ৳4,741**, which opens the hosted payment page with Lytro as the payee (§7.19); "continue without paying" | before; returned while the payment is still being checked ("your shop runs on the trial meanwhile"); returned paid ("Starter is on", the period, invoice, SMS and email) | AUTH-29, BIL-01, 02, 03, 04, 18, TRM-12, PAY-21 |
| Set password `/set-password` | the new password with three live rules (8 to 20 characters, a digit, not a phone number), held on the screen; the server keeps AUTH-03's length (decided 2026-10-23); Save; Skip | optional; Facebook-only account with the recovery note; required (no Skip) after a reset or an owner-set staff password | AUTH-19, 20, 27 |
| Set up `/set-up` | the shop types as chips, from `GET /presets`; the home area as eight chips (five cities, three districts) with a search over every city and district, named as the server names them ("ঢাকা সিটি"); the two-zone preview (৳70 inside, ৳130 outside); Save sends only what differs, Skip nothing | | AUTH-28, PST-01, DLV-01 |
| Staff sign-in `/staff-sign-in` | phone and the owner-set password; the "ask the owner" line; the owner link | | AUTH-31 |
| Staff new password `/staff-set-password` | the required password screen with the staff lead | | AUTH-19, STF-13 |
| Forgot password `/forgot-password`, `/verify` | phone; the same-reply line; the reset code boxes; then the required password screen | | AUTH-17, 18 |
| Opening your shop `/shops` | a spinner while `/me` answers | | TEN-31 |
| Shop picker `/shops` | the person's shops from `/me`, with role and address; no "new shop"; one opens at once | | TEN-15, TEN-31 |

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
3. A payment to Lytro that was rejected or lapsed, "see why" (BIL-19, §7.13) → `/billing/:id` (`home-rejected`)
4. A top-up being checked (BAL-03) → `/balance`
5. A plan payment being checked (BIL-04) → `/plan`
6. Balance under ৳50 (BAL-13) → `/balance`
7. Trial or plan ending inside 7 days (TRL-08, BIL-14) → `/plan`
8. A staff member who has not set a password yet (STF-13) → `/team`

Phase 4 and 5 add payments to verify, orders to confirm, orders to book and unverified orders at the top of
the queue. A key spending fast (RTE-12) is a banner above the queue, not a row: "More than 5% of this cycle's
requests went in the last hour. Nothing is blocked; check the keys", with See keys (`home-fast-spend`). `GET /home`
carries only when the alert was raised, so the banner names no key (decided 2026-10-23).

The rows the prototype does not draw use its job row: the icon's tone by kind (stock and a low balance red,
batches, payments being checked and an ending plan marigold, staff teal), and the count pill only on rows that
count things (decided 2026-10-23).

Then **Right now**: four tiles: Products (with the active count), Low stock (with the out count), Balance (with the
free SMS used), Plan days left (with the date). Each shows only to whoever may see it (`products:read`,
`inventory:read`, `balance:read`, `payments:read`); Low stock hides while the shop has no products, the days read
"Trial days left" on a trial, and pay-as-you-go, which has no period, has no days tile. Then the **set-up
checklist** (SUP-01), the owner's alone, each item ticked by the server: "Get your shop ready" -- shop created and
delivery charges (done from the start, with their amounts), add the first product, upload your logo, share the shop
link (done once any shop or product link is copied or shared, on any device), and "add a wallet number" greyed
until Phase 5; "Later, when you need them" -- create an API key (ticked once one is live), and connect a courier,
choose SMS events and pair a listener phone, greyed with their phases. The first group is the shop, its delivery, a
first product, the logo and the link shared (the wallet number counts from Phase 5). Once it is done the checklist
folds into one row in the side column, "Get your shop ready · 5 of 5 done", naming what is left for later; tapping
it opens the list again for that visit (decided 2026-10-23). An item whose screen is not rebuilt yet is still
ticked by the server: the first product opens Products, and the logo and the API key show without a way there until
Slice 11.6. Then the **shop link** card with Copy, Facebook and WhatsApp, for every member; each records the link
as shared. On desktop the queue takes two thirds and the tiles, checklist and link the right third; below 1024 px
the two columns stack 16 px apart, as the items inside each column are (the prototype's `.two` leaves no space
there).

**Content.** `GET /home` (a Slice 11 addition, §10): the queue's counts, the payment needing the seller (§7.13), the tiles' figures and
the checklist in one read, with "link shared" recorded by the server rather than on one phone, and the delivery item named after
the shop's home area; `/me` for the plan and its end. **States.** Day one: the checklist opens first and the
tiles read zero with the trial days; a queue with nothing says so in one line; a failed read says so with Try
again.

### 7.2 Orders tab (placeholder)

"No orders yet. Orders arrive in Phase 4; you will confirm and book couriers from here." with the share-link
button. The Orders designs themselves are in §8.

### 7.3 Products (`/products`)

**Job.** Find a product, see its stock state at a glance, add one.

**Layout.** Title with the Shop chips. Search and a category filter (the tree sheet). Segments: All, Active,
Inactive, Low stock, Out. **Add product** in the header. Rows: thumbnail or monogram tile, name, "n variants
· category", the price or range above the stock chip. Desktop: a table with the same columns.

**Content.** `GET /products?search=&categoryId=&active=&stock=&page=`, with each segment's count (`counts`, over
what the search and category pick), `GET /categories`. **States.** Empty with the trial's
product limit line (TRL-03); at the plan limit the server's `plan_limit_reached` becomes a banner over the list:
the limit, that everything already listed keeps selling, and the cheapest ways to room (the next plan or the
add-on, LIM-01), with See plans (PRD-04, `products-limit`).

*The list's other states* (Part 13, 2026-10-27): the filter button opens *Filter by category*, the tree with one choice,
All categories first and Uncategorized last (`sh-products-filter`); a chosen category marks the button and shows as a
chip that clears it, the segments counting within it (`products-filtered`); nothing matching says so, with Show all
products (`products-none`); past 20, Show more and how many are shown (`products-more`). Once something is archived, an
Archived chip follows the five, its products opening their page with Restore (`products-archived`; agreed 2026-10-27).
Archiving, deleting for good and restoring each end on the list with a toast, archiving's saying where to find it. At
the limit, Add product and Duplicate show the banner at once instead of the editor, worded for what is already there
(`products-limit-now`; agreed 2026-10-27).

### 7.4 Product editor (`/products/new`, `/products/:id`)

**Job.** Save a sellable product with the fewest fields and reach every setting when needed.

**Layout.** Four cards and a sticky **Save**:

1. **Basics**: photos and the one video (the media sheet, §7.23), name, price, category (opens the picker
   sheet), description (plain text, PRD-01).
2. **Options and variants** (ATR-11): "Add attribute" (sheet), each attribute as a mini card with its role
   chip, its options with swatch dots, the option-set chips; "Sizes share one stock" (INV-24); the variant
   matrix with Price and Stock columns and "Fill all" (ATR-17); the limits line (ATR-14). Part 14 below draws how
   each part is edited.
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

*Options and variants* (Part 14, agreed in the 11.7b read, 2026-10-27):
- **Roles.** A mini card's chip names its role in one word: splits, describes, asked at order. Only an attribute
  with options (one option, or a number in a unit) splits a product, at most 3 of them (ATR-14, ATL-02); several
  options only describe; text and a number may be asked when ordering, never options (ATR-08). So the bakery's
  Flavour splits the cake into variants, and "Message on the cake" is asked when ordering (`pf-food_bakery`).
- **Add attribute.** A role the picked attribute's type cannot take shows greyed, saying why ("Only for text or a
  number"; "Already split by 3: Size, Colour, Fit", `sh-attribute-full`). "Create …" opens *New attribute* as a step
  with a way back: the name, the type (Options, Several options, Number, Text, Yes/no), for a number what it measures
  (weight in g or kg, volume in ml or L, a count), and that the type cannot change later (`sh-attribute-new`,
  `sh-attribute-new-number`). Create and pick returns to the first step with the new one picked (`sh-attribute-picked`).
- **A describing value.** Tapping a describing or asked card opens its sheet, entered by its type: text as typed
  (`sh-desc-text`), one option (`sh-desc-pick`), several (`sh-desc-multi`), a number with its unit (`sh-desc-number`),
  yes or no (`sh-desc-bool`); an asked attribute only says what the shopper fills in (`sh-asked`). Each has Remove from
  this product. Empty is allowed (ATR-03).
- **Swatches.** A swatch belongs to one option: the circle beside it, dashed when it has none (`sh-options`). Tapping it
  opens that option's palette under the row: the six drawn colours, Other colour (the browser's colour picker), From a
  photo (a small picture of the shop's as the swatch, MED-03; no sampling) and None. A library colour's swatch is fixed,
  "Library colour · fixed", since it shows the same in every shop (ATR-18, `sh-options-colour`).
- **The table.** The first 6 variants show, then "Show all n" (`pf-clothing`). Fill all, under Price and Opening stock,
  opens a sheet: the value and which variants, all or those of one option, each with its count (ATR-17, `sh-fill`).
  On a product that exists, Stock is "Can sell", read-only (`GET /products/:id/stock`); stock is added from the Stock
  card. A variant added later starts at 0, marked New, and the table opens in full (`product-size-added`).
- **Limits.** Past 100 variants the table gives way to a banner naming what multiplies to how many, with what to do,
  and Save reads "Fix 1 thing to save" (`pf-variants-over`). A 4th splitting attribute is greyed in Add attribute.
- **Removing.** An option's × removes it at once, unless its variants hold stock: then "Remove Blue?" says how much
  they hold, that they stop selling once saved, and that the stock stays and comes back with the option
  (`sh-remove-option`; retire keeps stock).

*Stock and delivery* (Part 15, agreed in the 11.7c read, 2026-10-27, and its supplement, 2026-10-28):
- **Size chart.** The product's own chart is a table or a picture (PRD-17): a Table/Picture choice under the two
  sources. The table's first row names the measures and its first column the sizes, typed like any cell
  (`sh-sizechart`); a picture shows with Replace and Remove (`sh-sizechart-picture`).
- **Adjust by weight.** With a weight, a switch under the delivery charge, on by default, says each kg after the first
  adds the shop's per-kg charge; turned off, the charge stays as it is. With no weight there is no switch (PRD-16).
- **Made to order.** Choosing it for a product that holds stock asks first, naming how much is written off and that
  counting again starts at 0 (`sh-made-to-order`, INV-02).
- **Serials.** Scan, Paste a list and Type, as drawn; Type takes one at a time with Add, and a USB or Bluetooth barcode
  scanner types there too (`pf-sh-serials-type`). With no camera, Scan says so and points to the other two
  (`pf-sh-serials-nocamera`); a camera the browser blocks says how to allow it, with Try again
  (`pf-sh-serials-blocked`). A product with serials shows Opening serials in its table; its SKU is in the variant sheet,
  as every product's now is (v3.15).
- **Opening serials, line by line** (Part 16, agreed in the step-2 read, 2026-10-29). Paste a list takes one per line, or
  separated by commas, semicolons or tabs; spaces inside an IMEI are dropped (`pf-sh-serials-paste`). Each line is
  checked as it is added: an IMEI is 15 digits ("not 15 digits") with its check digit ("not a valid IMEI"); any other
  code is letters, digits and dashes, at most 64 ("letters, digits and dashes only", "over 64 characters"); a code
  already in the list is "twice in this list", one the shop holds is "already in the shop" (INV-23). A flagged line
  has × to remove it; Done keeps the OK lines and leaves the flagged ones out, saying how many
  (`pf-sh-serials-states`, `pf-sh-serials-any`). The camera ignores a code it has already read; each new one gives a
  short vibration and a green flash, no sound. The sheet stops at the opening stock: "All 5 units have a serial", and
  more need the opening stock raised first (`pf-sh-serials-full`).
- **The variant sheet.** A variant's name in the table opens what it sets for itself: SKU, barcode, weight and delivery
  charge (empty follows the product, its value as the hint), Adjust by weight, and On sale (`sh-variant`; ATR-05,
  ATR-13). Amended in v3.15 (Part 26, after the real-server walkthrough, 11.13b): the table has no SKU column, so a
  variant's SKU is set here only; an SKU another variant has marks the variant's name in the table and is said under
  this sheet's SKU field (`sh-variant-sku-taken`).
- **One variant.** A product with no options keeps its SKU and barcode under More settings, shown only while it has none
  (`pf-books_stationery`).
- **Opening cost.** The opening batch sheet's unit cost is saved as the variant's cost entered by hand (INV-10), with
  the new product, in its one request.
- **The defaults line.** On a saved product it names the shop type without "change": after saving, the category never
  changes its settings (PST-06; `pf-edit-mobile`).
- **The Stock card's sheets** (Add stock, Stock history, Batches, IMEI / serials, Fix a serial) open over the product,
  as drawn over the Stock page; the Stock page (11.9) reuses them.
- **The Stock card over a product** (Part 18, agreed in the step-3 read, 2026-10-29). Stock history and IMEI / serials
  are a variant's, so each starts with the "Product · variant" field Add stock has, opening a list of the variants with
  what each holds (`sh-pick-variant`, `sh-history-product`, `sh-serials-product`); a product with no options has no
  field. Add stock on a serial product takes the arriving units' IMEIs as Part 16 enters them, up to the quantity, and
  fewer leave the rest for later (`stock-add-serials`). Add serials uses that same sheet, its button "Add 1", rather than
  the older chips and ticked list (`sh-serials-missing`). Editing a count stays on the Stock page (11.9).

*Leaving with changes unsaved* (Part 13, agreed 2026-10-27): Back, a tab, a section chip or the browser's back, while
something typed is not saved, asks first in a small dialog, "Leave without saving?": a product being edited is named
("Your changes to Cotton T-shirt are not saved yet", `sh-leave`), a new one is "this new product" (`sh-leave-new`).
Keep editing stays with everything typed; Leave drops it and goes. Nothing asks when nothing changed or once Save has
finished; a sheet the editor opens is part of the editor, so closing one never asks. Closing or reloading the browser
tab asks with the browser's own question, whose words a page cannot set.

*The editor's other states* (Part 13): an archived product's page says so, with Restore and Delete for good, its own
fields shown as they were and no Save (`product-archived`); a save the limit refused after all keeps everything typed
under the drawn banner (`product-limit`); a part refused while the rest was saved names itself, with its way out
(`product-partial`, the storage add-on for full storage); a copy opens at once, inactive, with a toast
(`product-copied`); saving an inactive product says Saved, without "is on the storefront" (`product-saved-inactive`).

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

*Agreed in the 11.8 read, 2026-10-29 (Part 19):*
- **Search.** A search box above the list; the Library and Yours chips stay on each row.
- **Retired.** A retired attribute is listed last, greyed, with Bring back; so is a retired option at the end of its
  attribute's sheet (`retired: false` brings either back). Retired, neither is suggested for new products; products
  that use them keep them (ATR-10).
- **New attribute** is the step Part 14 draws for the product editor: the name, the five types (one option, several,
  a number with what it measures, text, yes/no), and that the type cannot change later; Create closes it.
- **A library attribute's sheet**: its name is fixed (a lock, and why); the library's options are listed with their
  chip and stay as they are; the shop's own values are added and edited like any of its own (`sh-attr-library`).
- **One option** opens a step with a way back: its name, a swatch from Part 14's palette, and Retire this option with
  its consequence (`sh-attr-option`, `sh-attr-edit-retired`).
- **Option sets**: New set takes a name and its options, typed and inserted as an options sheet does; a set of the
  shop's own is deleted from its row, never edited -- one with a typo is deleted and made again (`sh-optset-new`).

*A category's size chart* (§7.5's category sheet) is Part 15's chart editor: a table or a picture, Remove the chart,
and Done to keep it for the category sheet's Save (`sh-category-chart-19`).

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

*Agreed in the 11.9 read, 2026-10-28 (Part 20):*
- **The list** comes from one read, `GET /inventory/stock`: a page of products, each variant with its figures (Can sell,
  Waiting to ship, Coming, On hand, its state, and its average cost for those who may see costs) and its name, with
  the All, Low and Out counts. Products with a variant low or out show in full first; the rest fold into one "Stock
  is fine" row that opens them in place, with Show less. A product shows two variants, then "+n more". A made-to-order
  product is one line: made when ordered, no stock counted.
- **A variant row tapped** opens its own sheet: on hand and what can sell, then Stock history, Average cost (for those
  who may see costs), Batches on a product kept in batches, and IMEI / serials on a serial-numbered one, each opening
  the sheet above (`stock-row-sheet`, `-batch`, `-serial`).
- **Someone who may only look** sees no figures row, no Check stock or Add stock, no Add stock and Edit on the rows,
  and no average cost (`stock-staff`). Nothing low or out says so (`stock-low-none`).
- **Edit stock** on a product kept in batches names the batch a fall leaves, the soonest to expire unless another is
  chosen, and the batch a rise joins: a new one with its code and expiry, or one held (`stock-edit-down-batch`,
  `stock-edit-up-batch`). On a serial-numbered product a fall names the IMEIs leaving when every unit has one; only
  units without an IMEI may leave unnamed, as the server holds (`stock-edit-down-serial`).

*Said exactly for the build, v3.7 (Part 20):*
- **Which products want seeing to**: one out of stock, one low, or one with a variant on sale low or out though another
  keeps it in stock (a size sold out). The read lists them first, out ones before the rest, and the page shows them in
  full; the others fold into "Stock is fine". A search shows what it finds in full, folding nothing.
- **"+n more"**: a product with up to four variants shows them all; past four, its first two in its own order and any
  other low or out, the rest behind "+n more", which opens them in place.
- **Add stock from the header or the + menu** picks its product first, found by name, each with its variants and what
  it holds; made-to-order products count no stock and are not listed. Picked, Add stock opens on its first variant, and
  its own "Product · variant" picks among the rest (`stock-add-pick`).

### 7.8 Stock checks (`/stock/checks`, `/stock/checks/new`, `/stock/checks/:id`)

The list: number, date, who counted, lines and changed count, the value gained or lost (manage only).
**New check** (INV-07): pick products or a category, a table of expected and counted with the running
difference, the note that differences are recorded as "counted again", Save. **Detail**: the three figures
(lines, gained, lost) and the line table. Built: `POST/GET /stock-checks`, `GET /stock-checks/:id`.

*Agreed in the 11.9 read (Part 20):* each check has the shop's own number (#12), the older ones numbered by date. New
check picks products or a category (`stock-check-pick`); a product kept in batches is counted batch by batch, each a
line; a serial-numbered line counted short names the IMEI not found when every unit short had one
(`stock-check-batches`, `sh-check-missing`). The lines name their variant ("Denim jacket · M"). No check yet says so
(`stock-checks-empty`).

*Amended in v3.15 (Part 26, after the real-server walkthrough, 11.13b):* a shop that keeps no batches meets no batch
words. The pick sheet's note that a product kept in batches is counted batch by batch shows only when a product it
lists keeps batches, or it has more to list (`stock-check-pick-plain`); the Stock page's Expiring figure is not drawn
where it would say the shop has no batches (`stock`). The arrival sheet's note (`sh-receive`) and the supplier sheet's
archive help no longer end with a requirement id.

*Said exactly for the build, v3.8 (Part 20):* the Stock page's **Check stock** opens this list, whose **New check**
starts one, so every past check is reachable (agreed 2026-10-28). A new check starts with nothing picked
(`stock-check-start`); the pick sheet's category side counts every product filed there (`stock-check-pick-category`),
read from `GET /inventory/stock?categoryId=`. A check takes a note, which its list and detail show ("Month-end count",
`stock-check-note`).

### 7.9 Expiring (`/stock/expiring`)

Batches within 30 days then expired, soonest first, each with the product, code, expiry, quantity and Write
off once expired (`GET /batches?state=`, INV-13). The **write-off sheet** shows the batch, the units left, the
reason (expired) and the loss at average cost; damaged or lost stock goes through Edit stock with its reason, as
`POST …/write-off` takes an expired batch only (`sh-writeoff`). Built.

Nothing expiring within 30 days says so (`expiring-empty`).

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

*Agreed in the 11.11 read, 2026-10-28 (Part 22):*
- **The two fixed zones**: "No delivery outside <home area>" under the outside charge (DLV-06), and each renamed in a
  small sheet with "Use the automatic name" to go back (`delivery-22`, `delivery-outside-off`, `sh-zone-rename`). A
  zone that delivers nowhere shows the No delivery chip in place of its charge.
- **One area picker**, searched in Bangla or English and grouped Cities, Districts, Thanas (a thana with its district);
  a district opens its thanas; an area another zone holds says which and is not picked; a thana that a broader area of
  another zone covers says where it is now (`sh-area-pick`, `sh-area-district`). It serves a zone's areas, the shop's
  own thanas (built now, `sh-homearea-thanas`) and Check an address.
- **One Save** for the page, as drawn: only what changed is sent (the home zone, the fallback zone, the extra charge
  per kg), each refusal on its own field. The extra charge per kg comes with the zones (`GET /delivery-zones`), so
  whoever may see the zones sees it.
- **An area another zone holds** is named before Save, on the zone sheet, and removed there (`sh-zone-taken`); the
  server's refusal stays the backstop. **A thana moving** from a broader zone says so in one line (`sh-zone-new`).
- **Check an address**: one thana, its zone, its charge and why: by thana, by city, by district, or in no other zone;
  a no-delivery zone shows the red chip (`delivery-check-nodelivery`).
- No zones of its own (`delivery-empty`); twenty zones, where Add zone gives way to the limit's line (`delivery-full`);
  someone who may only look sees plain values, no Add zone or Save, and Check still works (`delivery-staff`).
- A delete asks first (`sh-zone-delete`); a zone products still name lists them, an active one to Open, an archived
  one to Restore (`sh-zone-in-use`). The home area note: the two zones are renamed "unless you named them".

### 7.11 Balance (`/balance`)

A plain card: the amount in 36 px, the "frozen" chip when frozen (BAL-08), this month's free SMS as a bar,
**Top up** (marigold, `balance:manage`), "Current rates". The statement grouped by day with units × rate
and the balance after, segments by type, dates, CSV; the rates card. Below ৳50, a warning banner says what may
stop and offers Top up (BAL-13, `balance-low`). The **top-up sheet** (BAL-03, 04): the amount with quick chips
and "buys about n SMS", the platform's lowest and highest amounts said before quoting (`GET /balance` gains them,
§10), the four wallet marks, and **পেমেন্ট পেজে যান · ৳500**, which opens the hosted payment page for that amount
(§7.19). Coming back, the Balance screen shows the "৳500 top-up is being checked" banner until it matches, then
the credited toast and the ledger row. The banner reads the shop's payments (§7.13), not the device, so it holds
across a reload and a second phone; a rejected top-up shows the red banner with support's note and Details
(`balance-rejected`). Built today as `POST /balance/top-up/quote` then `/confirm`; the page
replaces the in-dashboard wallet step in Phase 5, and until then Slice 11 keeps that step (sender number and
transaction ID), drawn in this design (decided 2026-10-22).

### 7.12 Plan (`/plan`)

Banners first (a scheduled downgrade or pay-as-you-go switch with "Keep Growth", a pending cancellation with
Undo, the lapsed state line, and for 30 days after a downgrade its checklist). The **current plan** card: name
and state chip, term, the figures days left and next payment (orders handled joins in Phase 4), the one action
for the state (Renew for ৳…, Pick a plan, Keep the plan), "See billing" (§7.13), the auto-renew switch (BIL-17; its
read is a backend addition, §10). **Change plan**: term chips (TRM-12), plan cards (price, monthly equivalent,
four limits, the one allowed move), the dashed pay-as-you-go card. The **add-ons** card: what is active, what
renews with the plan and for how much, the packs left, See all (§7.25); on the pay-as-you-go page each add-on
renews from the balance. Stop the subscription as a disclosure at the foot.

**Sheets.** *How to pay* (BIL-02, BIL-08): from the balance when it covers the price, else greyed with
the reason, or on the payment page with the four wallet marks; the line that nothing changes before the
payment is confirmed and that the request lapses after 24 hours (BIL-04, BIL-15). *Upgrade* (UPG-06,
UPG-16): new price, credit for unused days, amount due, the new period, the limits that change, pay from
balance (enough here) or on the payment page, the 15-minute validity and no-refund lines; when the amount worked out
as the seller commits differs from the one shown (a day of credit less), the sheet says the new amount and asks
again, nothing charged (`upgrade-amount-changed`, BIL-09). *Downgrade*
(DWN-03): the effective date first, the over-limit list, one sentence per consequence, the new price,
"Move down on 9 Nov". Coming back from the page, Plan shows the "payment being checked" banner (nothing
changes until it is confirmed), then "Renewed · runs until 9 Dec" or "Growth is on" with the new figures. A rejected
payment shows the red banner with support's note and Details, which opens the payment in Billing (`plan-rejected`);
both banners read the payments list (§7.13), never the browser's memory.

*Stop the subscription* (LIF-01, `sh-cancel`): everything runs until the period's end, then the dated steps
(grace, view only, locked, deletion after day 60, with the balance and invoices kept), and "you can undo any time
before 9 Nov"; afterwards the banner with Undo (`plan-cancelled`). *Downgrade scheduled* (DWN-02): the banner with
Keep Growth (`plan-downgrade-scheduled`). *Switch to pay-as-you-go* (PYG-10, `sh-payg-switch`): the date, the
fees, the limits that fall, what happens to what is over. *A pay-as-you-go shop* (PYG-01, `plan-payg`): the fees
paid this month (from the ledger, `GET /balance`) and the balance; the plan cards to take a plan -- the estimate of
what each would have cost at this volume waits for PYG-12, and "orders shipped" for Phase 4 (drawn so since
2026-10-26); add-ons in their own 30-day periods, and Closing the shop: *Close the shop* (PYG-09, `sh-close-shop`) says what goes offline now, what is
deleted after 60 days, and that a plan or pay-as-you-go brings it back (LIF-15), with Export the data first.
*30 days after a downgrade* (DWN-12, `downgrade-checklist`): each limit over with its fix and Open, and the final
warning's date (`GET /billing/downgrade/checklist`). Built.

### 7.13 Billing (`/billing`)

**Job.** Did my payment to Lytro go through, and where is the receipt? Every payment the shop made to the platform
(a plan at checkout, a renewal, an upgrade, an add-on or pack, a top-up) is a row here from the moment it is
requested, whatever becomes of it, so a seller never has to find a rejection in the Activity log. Added 2026-10-23
in place of the Invoices section of v2.3: an invoice is the receipt of a paid row and opens from it (BIL-12, BIL-13),
and the Phase 5 "Payments" section (§8) keeps its name for the shop's incoming payments.

**Layout.** Filter chips (All, Being checked, Paid, Rejected). The list grouped by month, newest first, in the
statement's shape (§7.11): a lead icon tinted by the state, the payment's name ("Starter · 1 month · renewal",
"Balance top-up", "Upgrade to Growth", "Add-on · 100 products"), the date, the method ("bKash", "From the balance";
the transaction ID is in the payment) or "No payment submitted", the invoice number when there is one and,
while a request awaits payment, the hours before it lapses; on the right the amount with the **state chip** under
it; the "Earlier shop" chip on a deleted shop's rows (BIL-13); "Show earlier". A row opens the payment from the
list already loaded, which carries everything the payment screen shows: on the phone its own screen with Back
(`/billing/:id`; opened cold, it loads the list first), on desktop the right column beside the list, the row marked
(the order detail's split, §8). The Billing section chip carries a count while a payment needs the seller.

| Server state | The seller reads | Chip | Lead |
| --- | --- | --- | --- |
| `pending`, no transaction ID yet | Awaiting payment (পেমেন্ট বাকি), "lapses in n h" (BIL-15) | neutral | marigold |
| `pending` or `needs_review` with a transaction ID | Being checked (চেক হচ্ছে) | info | teal |
| `verified` | Paid (পেইড) | success | green |
| `rejected` | Rejected (রিজেক্টেড) | danger | red |
| `expired` | Expired (মেয়াদ শেষ) | neutral | grey |
| `cancelled` (by the shop, or replaced by its newer request) | Cancelled (বাতিল) | neutral | grey |

A request is made only when the seller commits to paying (BIL-09, decided 2026-10-23): from the balance on that tap,
by a wallet when the wallet step opens, and once Phase 5's page exists, when it opens. Every price shown before then
comes from `GET /billing/prices`, which makes no payment, so browsing plans never leaves a request behind. A new
request of the same kind (a plan bought or renewed, an upgrade, an add-on, a top-up) closes the open one nothing was
sent for; it is listed as Cancelled and never warned about.

**The payment.** A card: the name and the state chip, the amount in 32 px, the state's own line, the facts (For:
"Starter · 1 month · 10 Nov – 9 Dec 2026" or "৳500 added to the balance"; Paid by, with the TrxID; Sent from;
Submitted, or Requested when nothing was submitted, with the time; Invoice) and the one action for the state. Under
it **What happened**, a timeline newest first: requested, submitted (method and TrxID), then checking, confirmed
with the invoice, rejected by Lytro support with the note, or lapsed after 24 hours.

- *Being checked* (`billing-checking`): "Lytro support is matching the payment, usually within an hour. Nothing
  changes before it is confirmed; we will tell you when it is." The only action is Contact support.
- *Paid* (`billing-paid`): the invoice card as v2.3 drew it (number, PDF later, issued and period dates, plan and
  version, price, discount, total, paid by, billed to, the limits snapshot under a disclosure). A paid top-up has no
  invoice and offers See statement instead.
- *Rejected* (`billing-rejected`): the red banner with **support's note** as written (AUD-08), the line that nothing
  was activated and the plan and balance are as they were, then **Pay again** (marigold; opens How to pay with the
  same plan and term, or the top-up sheet) and Contact support. The same transaction ID may be submitted again on the
  new request: a rejected payment lets go of its ID, and only an approval locks one for good (BIL-07, amended
  2026-10-23).
- *Expired* (`billing-expired`): "No payment arrived within 24 hours, so the request lapsed. Nothing was charged."
  Pay again.
- *Awaiting payment* (`billing-awaiting`): the marigold banner with the hours left and **Finish paying**, which
  reopens the payment step for the same request (the wallet step until Phase 5, the payment page after, §7.19), and
  **Cancel this payment**, which closes it at once (decided 2026-10-23; nothing was sent, so nothing is charged) with
  the toast "Payment cancelled. Nothing was charged." (`billing-cancelled-now`).
- *Cancelled* (`billing-cancelled`): the neutral chip and grey lead; "You cancelled this payment, or started a new one
  in its place. Nothing was charged."; the facts For and Requested; Pay again; in What happened, "Cancelled by you ·
  No payment submitted" over Requested.

A transaction ID goes only on an open request (BIL-15, amended 2026-10-23). Sent for one that expired, was cancelled
or was replaced, it is refused with the way on: start the payment again, or add money already sent to the balance with
Top up; when Top up cannot take it (under its lowest amount, or a read-only, locked or archived shop), Contact support,
who credits the balance (ADM-04).

**Elsewhere.** A rejected or lapsed payment is a red row at the top of Home's queue, "৳449 payment rejected · see
why" (`home-rejected`), and a red banner on Plan (`plan-rejected`) or Balance (`balance-rejected`) quoting the
note, with Details; the "being checked" banners of §7.11 and §7.12 read the same list, so they hold across reloads
and phones. "See billing" replaces "See invoices" on the plan card. Staff with `payments:read` see the list;
`payments:manage` pays a plan again and `balance:manage` a top-up; a staff member with `balance:read` alone still
sees a top-up's state on Balance.

**States.** Day one: "Your payments to Lytro and their invoices appear here. The first comes with a plan or a
top-up." (`billing` with the shop switch on day one). A lapsed shop keeps the list, as it kept its invoices
(BIL-13). **Content.** `GET /billing/payments` (§10), one route: its rows carry everything the payment screen
shows; the invoice from `GET /billing/invoices/:id`; `POST /billing/payments/:id/cancel`, and
`POST /balance/top-up/:id/cancel` for a top-up. BIL-19 is in `SRS-detailed.md`; Slice 11.5 builds the screen.

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

*Slice 11.6* (Part 11): the editor lists the permissions of the sections that exist today -- products, stock, API keys,
staff, balance, payments, activity, settings, thirteen in all -- as plain sentences, with "Spends the balance" under
paying for the plan, add-ons and packs; the role list says in words what each role may do, never its permission codes;
the drawn second role is Billing staff, made of today's permissions. *Add staff* with every seat in use opens the
seat-full dialog at once, its ways out (a seat, the next plan) from the server's refusal; staff who may not pay are told
to deactivate someone, and that the owner can buy a seat or change the plan. *Edit staff* renames the member (a server
addition of the slice). First passwords are random: two groups of four letters and digits without look-alikes
(`k7m4-p9qx`), never the shop's name and four digits.

*Making and renaming a role* (Part 12, STF-07): the editor names the role in a field, so a role is renamed where its
permissions are changed. *Create a role* opens the editor empty, with Create the role and Cancel (`roles-new`); a shop
with no roles yet opens Roles with it ready and says so in the list (`roles-empty`). *Add staff* with no roles yet says
so and offers New role (`sh-staff-no-roles`); New role is a step of the sheet, with a way back, naming the role and
picking what it may do (`sh-staff-role-new`); Create and choose returns to Add staff with the role ticked and the
phone and name kept (`sh-staff-role-back`). A role has no description of its own: wherever a role is listed, its line
says what it lets someone do from its permissions, in the editor's words, leaving out "see" where the role may also
change the same thing.

### 7.15 Activity (`/activity`)

A timeline grouped by day; one sentence per entry with the detail line; the result chip only on failure;
"Lytro support" or "System" for platform actors (AUD-08); filters by actor and action group; the retention
line (AUD-06). Built.

*Slice 11.6* (Part 11): the chips filter on the server -- the action groups and Failed -- so Failed never shows an empty
page while older failures exist; nothing yet, and nothing under a filter with Show all, have their own states; the
retention line reads the plan's own retention from the server.

### 7.16 Settings (`/settings`)

Rows into pages: **Shop details** (name, logo uploaded as §7.23 does with the monogram until then
(`PUT /shop-settings/logo`), business type with "existing products do not change" (PST-01, 03,
`PUT /business-type`), contact phone, email and street address (TEN-30)); **Delivery** (§7.10); **Brand
identity** (§7.28); **API keys** (§7.26); **Facebook and Meta** (§7.27); **Data export** (LIF-16: request, the
list with preparing, download and failed states, "lasts 24 hours", owner only). Under "Coming later", greyed with
their phase: payment methods (Phase 5), couriers (Phase 6), listener phone (Phase 5), SMS (Phase 7),
notifications (Phase 7), storefront (Slices 12 to 13).

*Slice 12a* (Part 25): **Storefront** (§7.29) is a row, after Brand identity, no longer under "Coming later"; its line
is "Your shop's link, and switching it on or off". It shows to those who may manage settings.

*Slice 11.6* (Part 11): the shop's name is editable in Shop details (TEN-19: the dashboard, the tab title and new installs
follow within a minute; the address never changes); Brand identity opens a short page until the brand editor (Slice
11.12), with the add-on on sale; Data export shows to the owner alone; API keys' request count shows to those who may
read usage.

### 7.17 Account (`/account`)

The identities as rows with the provider's mark and the action per row (AUTH-26, AUTH-27), the language
toggle (I18N-02), Sign out. *Change password* (AUTH-20, `sh-password`): the current one with "send a code to the
phone" when forgotten, the new one with its rules, and the line that every other device is signed out. *Add an
email* (AUTH-26): the address, the six-digit code, the toast. *Connect* Facebook or Google, with the toast.
*Remove* asks first and says nothing in the shop changes; removing the only way in is refused with "add another
first". Built.

*Slice 11.6* (Part 11): a sign-in made on the staff page, with the password the shop set (AUTH-31), shows the phone and
its password only, never the person's own sign-in methods, and says how to reach them: sign in with your own phone. The
server refuses that sign-in any change to the person's own account (TEN-31, KNOWN-GAPS §96). Its Change password asks
the current password and, when it is forgotten, points to the owner, who resets it (STF-13).

### 7.18 Menu (`/menu`)

The shop card (name, address, the person's role); Team with the seats, Activity, Settings; Account; Language,
which switches at once; Help with the WhatsApp hours; Sign out; "Powered by Lytro". On a phone browser that can
install, an **Install** card heads the page: "Install Megh Fashion on this phone · an icon on the home screen,
opens full screen, with your logo" (TEN-17, `menu-install`); the installed app takes the shop's name and logo,
scoped to `/<shop>/`, from a per-shop manifest (a Slice 11 addition, §10). Notices joins in Phase 7.

*Slice 11.6* (Part 11): the shop card names a staff member's roles; the rows follow the person's permissions (a billing
role sees Activity, not Team or Settings), and so do the Menu hub's section chips. On an iPhone, which offers no install
button, the card says to tap Share, then Add to Home Screen, and that the icon stays as installed. Help shows only when
the support WhatsApp number is configured.

### 7.19 Paying the platform through the hosted page

Every payment to Lytro (a plan at checkout, a renewal, an upgrade, a top-up) goes through the hosted
payment page of `PAYMENT-PAGE-DESIGN.md` with Lytro as the payee, the platform's wallet numbers, the exact
amount and the reference (PAY-21, BIL-03, BAL-03); every attempt, whatever its end, is a row in Billing
(§7.13). From then on the dashboard never shows a wallet number or
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
| `archived` | The Renew page, "Shop is archived", with the deletion date (`deletesAt` on `/me`, §10) and export (`renew-archived`) | LIF-12, 18 |
| suspended | `/unavailable` with support, See balance and Sign out; the owner's Balance and Top up still reachable | LIF-24 |
| support view | The ink-and-marigold bar on every screen, never dismissable | ADM-05 |

The two pages without a shell, Renew and Unavailable, end with Sign out (added 2026-10-26): with no shell there is
otherwise no way out of them.

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

*Agreed in the 11.10 read, 2026-10-28 (Part 21):*
- **Open** holds what is on order, ordered and partly received; drafts only under their own counted Drafts. **Coming**
  names every unit ("70 pcs · 12.5 kg in 3 purchases") and hides when nothing is coming (`purchases-21`).
- Add stock's arrivals are ordinary received purchases under All, "No supplier" where none was given
  (`purchases-all-21`). The supplier is optional throughout.
- **The supplier is typed**: matches offered as you type, or "as a new supplier"; the server finds it (ignoring case)
  or makes it, the rule Add stock already uses (`sh-po-supplier`).
- **Add item** picks a product, found by name, then ticks several of its variants at once, each a row with quantity,
  cost and remove (`sh-po-add-item`, `sh-po-add-sizes`).
- **A placed purchase** changes its supplier and items until its first delivery, then its expected date and notes only
  (`purchase-edit-placed`).
- **It arrived**, per item: accepted (filled with what is outstanding), rejected with its reason once above 0, the unit
  cost (cleared is unknown), a batch's code and expiry on a batch-kept product, IMEIs on a serial-numbered one (Part
  16's entry, the rest addable later); an item left at nothing is not sent (`sh-receive-full`).
- **Cancel** while nothing was delivered; **Close short** once any delivery was recorded, even one rejected in full
  (`purchase-rejected-only`). A delivery's row opens its items: accepted, rejected and why, batch, cost (`sh-delivery`).
- Received and cancelled purchases (`purchase-received`, `purchase-cancelled`); a confirm before deleting a draft
  (`sh-delete-draft`); someone who may only look sees no costs, totals or actions (`purchases-staff`, `purchase-staff`);
  no purchase yet (`purchases-empty`).
- **Suppliers**: Show archived lists the archived, each with Bring back; never deleted (`suppliers-archived`); none yet
  (`suppliers-empty`). A supplier's own purchases wait for later.
- **A variant's purchases** (PUR-09): its Stock row's sheet gains Purchases, opening which purchases brought it in, from
  whom, when, accepted and rejected, at what cost (`stock-row-sheet-purchases`, `sh-purchase-history`).
- Purchases are numbered "PO-0007"; entry is Shop › Purchases only.

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
up to [50] photos and one video with its length, size and poster, Replace; the storage line (used of the limit,
and this product's share); the line that deleting frees storage and that past orders show a placeholder where it
was (MED-09). **Upload states** (also in §7.4a): uploading with its progress, preparing with how long it takes (a
photo about 30 s, a video about 5 min), refused with the reason ("6 MB · limit 5 MB"). **Storage full**: the
banner with what was refused and the ways out, Buy 1 GB (the add-on, §7.25) or the next plan (`sh-media-full`).
**Removing** (Part 13, agreed 2026-10-27): a photo's × and the video's Remove, beside Replace, take it off the product
when it is saved, and delete it when nothing else shows it, so storage frees (PRD-11); a copy that shares it keeps it
(PRD-18). What was uploaded and then left unsaved is deleted too. The limits under the upload are the operator's, from
`GET /media/usage` (a video may be 150 MB, STO-05).

**Content.** `POST /media/uploads` (answers a signed upload address the browser sends the file to),
`POST /media/:id/finish`, `GET /media/:id` while it prepares, `PUT /products/:id/images` and `…/video`,
`DELETE /media/:id`, `GET /media/usage`. The same upload serves the shop logo, category images, swatches and
size-chart images.

### 7.24 Usage (`/usage`)

**Job.** See how close the shop is to each limit, and get room before anything stops (LIM-01, LIM-02).

**Layout.** The cycle's dates. One card per metric: products, seats and storage (totals), bandwidth, API requests
and free SMS (each cycle), each "used / limit" with its bar (amber from 80%, red from 95%). For bandwidth and
requests, when the cycle's pace would use the allowance before the cycle ends, the date it runs out ("at this pace,
runs out 22 Oct"): the server's figure, the same one the email gives. From 80%, "To raise it:" names that metric's
add-on or pack, taken from the server's suggestion, and the suggested plan (free SMS has no add-on, so the plan
alone; talking to Lytro when no plan fits); each opens its sheet or the upgrade. **Auto-buy**: the two switches,
bandwidth and requests, with what auto-buy did this cycle -- could not buy because the balance was short, or has
bought its 3 packs (BND-04, RTE-11). Bandwidth and requests a day as bar charts (BND-08).

**The banner** is one, for the metric nearest its stop -- past the grace, then 100%, 95% and 80%; a tie goes to the
card order -- worded by metric and level (prototype Part 10):
- at 80% or 95% of a total, the room left (`usage`); of bandwidth or requests, the run-out date or that the allowance
  lasts the cycle, with Turn on auto-buy at 80% (`usage-80`) and the one-tap pack at 95% (`usage-warning`,
  `usage-requests-95`);
- bandwidth or requests at 100%, how far it keeps serving and that the extra is never charged, with the pack
  (`usage-100`); past the grace, what has stopped (`usage-stopped`);
- a full total, what is blocked, with its add-on (`usage-seats-full`, `usage-storage-full`); the free SMS used up,
  what further essential SMS cost from the balance (`usage-sms-used`);
- auto-buy that could not pay, with Top up (`usage-autobuy-failed`), or at its cap (`usage-autobuy-capped`).
"An email went too" only when the owner has an email address; "a free SMS" only for bandwidth and requests at 100%
and at the stop, the notices that go by SMS (LIM-01). Read-only staff see the banner without its link. A refusal at a
limit (products, seats, storage) is the banner of §7.3; the 30 days after a downgrade sit on Plan (§7.12).

**Content.** `GET /usage` (each metric with its allowance, packs left, stop and run-out date; the daily bandwidth and
requests; the suggestions, each add-on in them with its metric; the packs on offer and auto-buy),
`PATCH /addons/auto-buy`, `POST /addons/packs`.

### 7.25 Add-ons and packs (`/addons`)

**Job.** Raise one limit, top up bandwidth or requests, or switch on the brand, without changing plans (PLN-13 to
PLN-15, BRN-05).

**Layout.** The line "3 add-ons active · renew with the plan on 9 Nov for ৳347": the add-ons that renew with the plan
and what their renewal adds; on pay-as-you-go, "each renews from the balance at its own end". Groups: **Raise a
limit** (products, a seat, storage), **Packs** (bandwidth, requests: "adds once and carries over until used", with
what is left), **Features** (brand identity, with Set up). Each row: its price a month or per pack, then Active with
its end and how it renews, or Buy. How an add-on renews: with the plan; from the balance, every 30 days, on
pay-as-you-go or a plan with no end (`addons-payg`); "balance too short to renew"; renewal off, with its end. One that
is no longer sold, or not needed on the plan the shop moved to, ends without renewing and has no switch
(`addons-ending`). An active add-on's row keeps its switch; more of it comes from Usage's "To raise it". The
**auto-buy** switches with "at most 3 packs a cycle by themselves; with no balance it stops".

**Sheets.** *Buy* (`POST /addons/quote`, then `POST /addons/purchase`): how many (up to [10], a feature once), the
limit before and after, due now for the days left -- the server's own amount for that quantity, since the price is
rounded once on the total -- and then the price with the plan (on pay-as-you-go, from the balance every 30 days,
`sh-addon-buy-payg`); from the balance (active at once) or by bKash or Nagad, whose wallet step opens in the sheet
(active when confirmed, `sh-addon-wallet`) until Phase 5's page; the renewal switch, sent with the request. A short
balance greys the balance and names the shortfall with Top up (`sh-addon-buy-low`). When the amount worked out as
the seller commits differs from the one shown, the sheet says the new amount and asks again, nothing charged
(`sh-addon-buy-changed`, BIL-09). *Buy a pack* (`POST /addons/packs`, with the amount shown): the two packs, from the
balance only, with the auto-buy switches; a short balance says so with Top up and the button greys
(`sh-pack-buy-low`); a price changed since it was shown is said as above (`sh-pack-buy-changed`). *Turn renewal off*
(`PATCH /addons/mine/:id`): when it ends and what happens to what is over the limit, by kind (LIM-03;
`sh-addon-renew-off`, `sh-addon-renew-off-seat`, `sh-addon-renew-off-brand`).

**Banners and toasts:** an add-on ending in 7 days with renewal off, with Turn renewal on, saying what happens by
kind (`addons-lapsing`, `addons-lapsing-storage`, `addons-lapsing-brand`); one set to renew from a balance too short
for it, with Top up (`addons-payg`); an add-on paid by wallet being checked, or rejected with support's note and
Details (`addons-checking`, `addons-rejected`), read from the payments list as Plan's banners are; the toast after a
purchase with the new limit and the invoice, or after a wallet payment is sent (`addons-sent`). **States:** on the
trial every row reads "Needs a plan", and the brand can be designed but not switched on; in grace every Buy reads
"Renew first" and what the shop has keeps working until the grace ends (`addons-grace`). Read-only staff see the
rows without Buy or the switches.

**Links.** `/addons?buy=<key>` opens the Buy sheet and `/addons?pack=bandwidth|requests` the pack sheet; Usage, Plan
and the pay-as-you-go page link there now, and Team, the media sheet and the brand editor will when they are built.
Brand identity's Set up opens the brand editor once it exists (Slice 11.12).

**Content.** `GET /addons` (each item with why it cannot be bought now, the amount due for each quantity, the days
left and the renewal price), `GET /addons/mine`, and the routes above.

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

*Slice 12a* (Part 25): the key Lytro keeps for the shop's storefront (`purpose: storefront`) is the first row: named
"Lytro storefront" in the dashboard's words, a globe where the others have a key, the chip **Lytro's**, its start,
the shop's own address as its website, last used; no Revoke, and tapping it opens nothing. A line under the list
says it is not one of the 20 and cannot be changed or revoked, and that its requests count with the rest (SFT-15).
The server refuses a change or revoke of it (`ApiKeyManagedByLytro`).

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
default. Logos on light (the shop's own logo), on dark, and the square icon, at least 512 px (uploaded as §7.23
does). Colours: main, accent and background, with the three pairs checked as ratios with ✓ or ✗ (text on main, text
on accent buttons, text on background); the text colours are derived, and the check also holds the main colour
against the background and keeps the status colours readable on it. Fonts: one for headings and one for body text,
each a curated pair of a Bangla face and its Latin face (agreed 2026-10-22), as below. Corners: square, soft,
round. Spacing: compact, comfortable, airy. The line on what never changes (BRN-04). The preview, with Storefront,
Landing and Dashboard tabs, changing as the settings change (BRN-06), its headings and body text set in the chosen
fonts. **Apply**, and Save without switching on.

*The fonts* (Part 17, for Slice 11.12a, 2026-10-28; `brand`, `brand-font-heading`, `brand-font-body`,
`brand-font-display`): two rows, **Headings** and **Body text**, each showing what it is set in now -- a line of Bangla
and a line of English in those faces, the pair's two names under it ("Tiro Bangla + Lora"), and **Change**. Change
opens a sheet of the pairs, each sample in its own faces with a radio, and Done: seven for headings, Lytro's own
(Noto Sans Bengali + Inter) first and marked as the default, Galada + Playfair Display marked "Headings only"; six for
body text, which leaves that pair out and says why under the list. The samples read the same in both languages, since
the point is to see both faces; their digits are Western. Each script takes its own face: the Latin face is named
first in the font stack and the Bangla face second, so Bangla letters fall through to it. Headings are set at 700, and
a face with one weight (Tiro Bangla, Galada) stays regular -- the browser never bolds a face itself
(`font-synthesis: none`). The brand fonts load from Google Fonts on this screen and for a shop whose identity is on;
Lytro's own fonts are served with the app (11.3).

**States.** A failing pair names the pair and its ratio, Apply stays off until every pair passes, and the nearest
passing shade is offered (BRN-03, `brand-contrast`). On the trial: design and preview, with "Buy the add-on to
switch on" (`brand-trial`). After the add-on lapses: the default shows, the settings are kept and Buy again
restores them (`brand-lapsed`).

*As Slice 11.12a builds it* (Part 23, v3.12, 2026-10-29, agreed in its read; `brand-off`, `brand-in-plan`,
`brand-no-addon`, `brand-contrast-status`, `brand-square-airy`, `brand-colour-main`, `-accent`, `-bg`, `brand-colour-fail`,
`brand-logos`, `brand-logo-dark`, `brand-icon`, `brand-uploading`, `brand-icon-refused`, `brand-leave` and the toasts; the
earlier brand screens redrawn on the same page):

- **The buttons follow the switch.** On: one **Save**, and the change shows within a minute. Off: **Apply** (save and
  switch on) and **Save without switching on**. Turning the switch on is Apply; turning it off happens at once, keeps the
  identity and leaves the page's unsaved changes on the page. On the trial or without the add-on, only Save without
  switching on, with the banner and Buy the add-on. With the plan's feature, the line says "included in your plan". After
  a lapse the banner names no date (the shop's add-ons list keeps only running ones) and its link says Buy again alone,
  since a price beside the sentence squeezed it on a phone; the page's Buy again, with the price, and Save remain. The
  switch's line wraps on a phone, so the add-on's end is never cut off.
- **The contrast check as the server makes it.** The text on each colour is ink or white, whichever reads better, so the
  three pairs drawn rarely fail. Two more checks show as rows only when they fail: the main colour on the background
  (3:1) and the status colours on the background (4.5:1). A failing row says what it needs and offers **Use #a08a47**, the
  nearest shade that passes; a pale yellow main colour is the drawn case (`brand-contrast`), a kraft-paper background
  the other (`brand-contrast-status`). Ratios are rounded down to one decimal. Failing colours may be saved while off;
  Apply, and Save while on, stay off until every pair passes.
- **A colour's sheet:** what the colour is for, the colour and its code, colours that work well (each passes with
  Lytro's default colours), Other colour from the browser's picker, the checks that colour answers for, with Use when one
  fails, and Done. Nothing is saved until Save or Apply.
- **Logos.** The logo on light is the shop logo; its tile's Change opens Shop details, and a line under the logos says so.
  The dark logo and the square icon upload as the shop logo does and show their progress on the tile; once set, Change
  opens a sheet with Replace and Remove, and a removal takes effect on Save. The icon is checked before it is sent: square,
  at least 512 × 512 px.
- **Leaving with changes unsaved** asks first, as the product editor does. Each button's toast says what it did.
- **Corners and spacing:** every preset is drawn (`brand-square-airy`); the preview takes the chosen colours, fonts,
  corners and spacing, and its header shows the dark logo once set.
- **Copy:** Apply reads অ্যাপ্লাই করুন, and the requirement ids leave the page's sentences.
- **The way in** is Settings, Brand identity. The add-on row's Set up and the trial banner's line are not built in this
  slice (decided in the read).

**The dashboard themed.** With the identity on, the dashboard takes its colours, fonts, corners and spacing through
the same tokens as the storefront (BRN-07); the status colours, "Powered by Lytro" and the layout never change.

*As Slice 11.12b builds it* (Part 24, v3.13, 2026-10-29, agreed in its read; `themed-home`, `themed-products`,
`themed-zone-sheet`, `themed-billing`, `themed-brand` in a maroon identity, round and airy, with a dark logo;
`themed-b-home`, `themed-b-stock`, `themed-b-zone-delete` in an indigo one, square and compact, without):

- **Where.** Every screen inside a shop, the brand editor included. The screens outside a shop (sign-in, create shop,
  choose a shop, the onboarding frame with "Powered by Lytro") stay Lytro's. The bKash and Nagad panels keep the
  wallets' own colours.
- **The main colour** makes the primary scale. Buttons, the active tab, links, selected chips and the focus ring take it;
  its tints make the soft fills; text in it is its nearest shade that reads at 4.5:1 on the background and on the two
  palest tints words sit on, a selected item and an avatar (a little more than `mainText`, which reads on the
  background alone); text, ticks and counts on it are ink or white, whichever reads better (`onMain`). As built, the
  tints are 94, 88, 75, 55 and 30% of the way to white, and the hover a fifth of the way to black.
- **The desktop rail** is the main colour taken down to the depth of Lytro's own rail, or left as it is when it is
  already deeper, so white reads on it at about 12:1. The active hub is that shade lifted a tenth of the way to white;
  the other hubs' words are 82% of the way. The logo for dark backgrounds takes the shop mark's place at the rail's
  foot once set, up to 56 by 32 px; until then the mark stays.
- **The accent** makes the accent scale: the counts on the rail, and the one accent a screen carries. Text in it is its
  nearest shade that reads at 4.5:1 on white; text on it is ink or white (`onAccent`).
- **The background** colours only the page behind the cards. Cards, sheets, dialogs, fields and the phone's top bar stay
  white. It is always light: the status colours must read on it at 4.5:1.
- **Fonts.** Headings in the heading pair, all other text in the body pair, each with the Latin face first and the
  Bangla face second. Figures (money, counts) stay in Inter, whose digits are all one width.
- **Corners**, for fields / buttons and small tiles / cards / sheet tops and dialogs: Square 2, 3, 4, 8 px; Soft 6,
  8, 10, 16 px (Lytro's); Round 10, 12, 16, 24 px. Pills and circles stay as they are.
- **Spacing** changes only the gaps and a card's padding, by a quarter. Gaps between sections and inside a column:
  Compact 12, Comfortable 16, Airy 20 px. Between the desktop's two columns: 18, 24, 30. Between stat tiles: 9, 12, 15.
  A card's padding: 12, 16, 20. Rows, the insides of stat tiles, buttons and fields keep their size.
- **Never changes** (BRN-04): the status colours (success, warning, danger) and the info colour that "Being checked"
  wears, danger buttons, "Powered by Lytro", and the layout.
- **The browser** (not drawn): while the identity shows, the tab's icon is the square icon once set and the phone
  browser's bar takes the main colour; switched off, both are Lytro's again.
- **When it changes.** The tab that saves, applies or switches it changes at once. Other open dashboards change at their
  next read of the account: on coming back to the tab or the app, or a reload.

Named in the sketch, beyond the read:
- the buttons-and-small-tiles step (8 px today) between fields and cards;
- the stat tiles' gap scales while their insides do not;
- the dark logo sits at the rail's foot, where the shop mark is, not at its top.

Found while building it, and fixed in the sketch: the brand fonts' loader (Part 17) left out Hind Siliguri, so the
prototype drew that pair's Bangla in a fallback face; the wide page's gap follows the columns' scale (it is 24 px from
640 px, not 16); banners, notices and a warning bar keep their status colours. Named deviation: the brand editor in a
shop's identity shows that identity's own colours and logos in its form, where `themed-brand` kept Part 23's sample.

**Content.** The identity's storage, the contrast check, the font list and the switch are Slice 11's brand backend
(§10); whether the shop may switch it on comes from `GET /addons/mine` (`brandIdentity`).

### 7.29 Storefront (`/settings/storefront`)

**Job.** Give the seller the shop's link to share, and let a shop with its own website switch the shared storefront
off without losing anything (SFT-02, SFT-16).

*As Slice 12a builds it* (Part 25, v3.14, 2026-10-29, agreed in its read; `sf25`, `sh-sf25-off`, `sf25-off`,
`sf25-offed`, `sf25-oned`, `sf25-copied`, and `settings` and `api-keys` as above):

- **The link.** "Your storefront": the shop's address (`megh.lytro.app`) in the key box, with **Copy** (toast "Link
  copied"), **Share** (the phone's own share sheet; left out where the browser has none) and **Open** (a new tab). The
  line under it: customers see all the products at this link, and each product also has its own landing page, for ads.
- **The switch.** "Storefront on", on for every shop at first. On: anyone with the link sees the shop. Off: the link
  shows "Nothing here" (the storefront's own not-found page, which names no shop) and every product's landing page
  keeps working (LND-02), so ads still run. Under it: a shop with its own website can keep it off; products, orders and
  customers all stay. When off, the link's card carries the chip **Off**.
- **Turning off asks first** (`sh-sf25-off`): "Turn the storefront off?", that opening the address shows "Nothing
  here" at once, that landing pages keep working, and that it can be turned on again any time; **Cancel** and **Turn
  off** (the danger button, since the shop's public page goes). Turning it on is at once. Each ends with a toast.
- **Who.** Those who may manage settings; the row is hidden from anyone else (STF-11). The switch is saved by itself,
  with no Save button, and recorded in the activity log with the shop's other settings.
- **Later.** The home page's banner slides drawn for Slice 12 (§8, `storefront`) join this page below the switch in
  Slice 12b; a custom domain's line joins with Slice 13.

**Content.** `GET`, `PATCH /shop-settings` (`storefrontEnabled`, `settings:manage`); the address is the shop's own
host, from the session's shop.

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
- **Payments** (Phase 5), the shop's incoming payments (its own payments to Lytro are Billing, §7.13): To verify
  first (PAY-14) with the mismatch line, Approve and Reject, proof image;
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
| A per-shop app manifest and its icons, scoped to `/<shop>/` | shop app | installing the dashboard as the shop's own app (TEN-17, KNOWN-GAPS §88) | built (11.1b) |
| The units by stock unit, and the split by top-level category, on `GET /inventory/figures`, and each loss reason's units | inventory | §7.22 | built (11.1a) |
| The units and outstanding units of each purchase in the list, and the "coming" total | purchasing | §7.21 (PUR-05) | built (11.1a) |
| A supplier's last purchase | purchasing | §7.21 | built (11.1a) |
| The brand identity: its storage, the approved fonts, the contrast check shared with the editor, the switch held to the add-on or the plan, and the tokens the dashboard and the storefront read | brand | §7.28 (BRN-02, 03, 07) | built (11.2) |
| `hasDeletedShop` on `/me` | identity | create-shop's carry-over note (LIF-21) | built (11.4a) |
| `GET /usage`, media upload, add-ons and packs, API keys, purchases and suppliers, Meta | | §7.21 to §7.27 | built |
| `GET /billing/payments`, one route: every payment the shop made to the platform (purchase, renewal, upgrade, add-on, top-up) with kind, amount, method, transaction ID, state, the requested, submitted and decided times, support's note and the invoice it produced, newest first and pageable; open in every lifecycle state, as the invoices are | billing | §7.13 (BIL-19) and the Plan and Balance banners | built (#213) |
| The payment needing the seller (rejected or lapsed, not yet paid again) on `GET /home` | billing | the Home queue row (§7.1) | built (#213) |
| `GET /billing/prices?billingTermId=`: each plan's move and amount for the shop now, exactly as its request would make it, with no payment made; the amount the seller saw sent with each request, refused when it differs; Cancel; one open request per kind | billing | §7.11 to §7.13, §7.18, the Renew page (BIL-09, BIL-19, UPG-08) | built (11.5a.1) |
| The term a paid plan runs on and a lapsed shop's deletion date on `/me`; the pay-as-you-go fees this month on `GET /balance`; each day's API requests on `GET /usage` | identity, balance, usage | §7.12 (the plan card, the pay-as-you-go page), §7.20's Renew page, §7.24's requests chart and run-out date | built (11.5a.2) |
| On `GET /addons`, why an item cannot be bought now, the amount due for each quantity, the days left and the renewal price; the renewal switch on the add-on request; the amount seen on `POST /addons/packs`; on `GET /usage`, the run-out date of bandwidth and requests (the email's own rule) and the metric of each suggested add-on | billing, usage | §7.24, §7.25 (PLN-14, PLN-15, BIL-09, LIM-01) | 11.5c |
| The Products page's segments on the server (`active`, `stock`) with their counts; each product photo's and video's bytes, and the video's length, on the product | catalogue | §7.3, §7.23 (PRD-12, STO-01, STO-09) | built (11.7a) |
| Archived products listed (`archived=true`, with their count) and restored (`POST /products/:id/restore`); the shop's product limit on the list (`productLimit`); the largest image and video on `GET /media/usage` | catalogue, media | §7.3, §7.4, §7.23 (PRD-13, STO-04, STO-05) | built (11.7a) |
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
| Libraries | The bandwidth and request charts drawn as plain SVG; IMEI scanning with the browser's BarcodeDetector, and `@zxing/browser` loaded only where it is missing; the prototype's own line icons (Lucide in shape), carried as drawn in `components/icon.tsx`, so every icon matches the sketch; Lytro's fonts served with the app, Google Fonts only for a shop's brand fonts. |
| Tests | Playwright in `apps/dashboard`: every screen's states (empty, loading, error, read-only, no permission) against a mocked API, on phone and desktop, in Bangla and English; the slice's walkthrough (clothing, cosmetics and grocery: a product, stock added, a stock check, a purchase) against a real server and database in CI. Each pull request shows its screens beside the prototype's. |
| Security | The dashboard's Content Security Policy (KNOWN-GAPS §65) in `deploy/Caddyfile`, its media and upload origins from the environment, checked as the console's was. |
| Order | This document; the backend reads (§10); the brand backend; the foundation and the shell; onboarding and Home; Money; Menu; products and media; categories and attributes; stock; purchasing; delivery; the brand editor and the themed dashboard; last, the policy and the walkthrough. |

---

## 12. Open questions

1. Answered 2026-10-23 (Slice 11.3): five hubs, with **+** in the app bar, as the prototype draws them, so the
   destinations stay stable as phases arrive.
2. Whether Customers earns its own hub once Phase 4 ships and the list is used daily.
3. Answered 2026-10-22: the rail keeps its icons and labels at every desktop width, and the side column shows
   from 1280 px, the section chips below it.
4. The order of the Home queue once real volumes are seen; the order here puts money before parcels because
   a payment to verify blocks an order from being booked (CRR-09).
5. Answered 2026-10-23: Billing (বিলিং), over "Payments", which Phase 5 needs for the shop's incoming payments, and
   over "Invoices", which a rejected payment is not (§3).
6. Answered 2026-10-23: yes. A request nothing was sent for may be cancelled by the shop (§7.13), and a new request of
   the same kind closes the open one by itself.
