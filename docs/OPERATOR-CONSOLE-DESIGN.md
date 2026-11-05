# Operator console: design (v3)

The console at `admin.lytro.app` (`apps/operator`, D3-12), redesigned from scratch on 2026-10-21. Version 1
(2026-10-19, inverted dark chrome) is retired; nothing from it or from the old `apps/admin` console was
carried over. The interactive sketch is `docs/brand/lytro-operator.html`: every screen the backend serves
today, from Phase 0 sign-in to Phase 5's payments, on phone, tablet and desktop, in English and Bangla, with
the later work drawn under its own group and marked "soon". The spec below is what the sketch shows.

Version 3 (2026-11-04, Slice 5.8 part 5) adds what Phases 3 to 5 built after v2 was drawn: page reports, the
queue's review facts, a shop's payment page, cap, phones and credential log, Lytro's own phones with their
receipts and unreadable messages, every platform setting, and the sign-in limit. Phase 6's screens (courier
areas, retiring a courier) are added once its routes exist. `apps/operator` is rebuilt to this document, in the
order `PHASE-5-PLAN.md` Slice 5.8 records.

**Who and where.** One or two people, mostly at a laptop, several times a day: matching wallet payments
against the bKash and Nagad statements, answering sellers, and occasionally changing a price or a limit.
The same person approves a payment from a phone on the road. So the console is desktop-first and dense,
and every screen folds to a phone without losing an action.

**Thesis: decide, act, move on.** The operator's day is a sequence of small decisions with money attached.
Each screen shows one decision, the evidence for it and one action. Every action names its consequence for
the seller and takes its reason in the same panel.

**Rules**

1. **The queue is the first thing after sign-in.** Today opens on what needs a person, with the queue's
   count on the navigation item and on the phone tab, and the open page reports' count on theirs.
2. **Evidence before action.** Amount, sender, TrxID, quote and age sit together on one row; Approve and
   Reject are the only buttons on it.
3. **Consequence, reason, one button.** Suspend, restore, adjust, assign, override, reject, retire, delete:
   the panel's first block says what will happen to the seller, then the reason field the SRS requires,
   then one button named for the action. Nothing destructive happens from a row.
4. **One identity cue, not a dark theme.** The console is light, like the seller's dashboard, so tables and
   forms read the same way everywhere. What tells it apart is the ink band at the top with the marigold
   OPERATOR eyebrow, the ink sidebar head on desktop and the marigold count badges. BRAND-IDENTITY §8.4 is
   amended to this.
5. **Tables on desktop, cards on phone, from one column list.** A column list drives both; cells carry their
   own labels on phone, and the actions become a row of buttons.
6. **Money and ids in tabular monospace.** Amounts in the display face, TrxIDs and numbers in JetBrains Mono,
   dates absolute with the relative age beside them.
7. **Search is one key away.** `/` focuses the shop search from any screen; it finds by name or address.
8. **Later work is drawn as what it will be,** labelled with its requirement id, never as a working screen.
   The sidebar reserves its place under "Later" so the information architecture does not shift when it
   lands.

**Look.** Lytro tokens unchanged: ink text on white and neutral-50, teal-700 primary, marigold for the one
accent and the operator eyebrow, status colours with one meaning each. The brand lockup is the real one
from `docs/brand`: the operator icon tile (`icon-operator.svg`, teal-900 tile with the marigold mark) beside
the OPERATOR eyebrow over the wordmark (`lytro-wordmark-dark.svg` on the band and sidebar head, where the
mark is the first letter in teal-400 and "ytro" is white; `lytro-wordmark.svg` on the sign-in page). Inter and Noto Sans Bengali for text,
Plus Jakarta Sans for figures and titles, JetBrains Mono for ids. English by default with the Bangla toggle
in the top bar; Bangla copy uses the commerce vernacular the dashboard uses.

---

## 1. Shell

**Desktop (1024 px and up).** A 248 px sidebar: the ink head with the eyebrow and wordmark, then the
destinations in groups by how often they are opened: *Daily* (Today, Payment queue with its count, Page reports with
its count, Shops), *Pricing* (Plans and prices, Billing terms, Rates, Add-ons), *Platform* (Settings, Platform
wallets, Lytro's phones), *Catalogue* (Shop types, Attribute library, Option sets), *Later* (Reports, Audit log,
Support inbox, Notices, Verification, Manual payments, each greyed with "soon"), and the foot with the operator's
email, Account and Sign out. The top bar holds the shop search with the `/` hint, the environment chip and
the language toggle. Content is at most 1120 px wide.

**Phone and tablet (under 1024 px).** The ink band carries the eyebrow and the section title, a search
icon and the menu; a page inside a section shows a back arrow instead. Under 640 px, four tabs: Today, Payment queue
with its badge, Shops, More. More, which the band's menu also opens, is a sheet listing every destination, Account,
the language and Sign out. Panels open as bottom sheets under 640 px and as the drawer from there up.

**Search.** Sending a search opens Shops with the word; focus alone doesn't, so tabbing past the field leaves the screen
alone. Under 1024 px the band's icon opens Shops.

**Panels.** Every action opens a panel: a 460 px right-hand drawer on desktop, a bottom sheet on phone,
with the title, the consequence block, the fields and the buttons in a footer. Closing it returns to the
screen underneath unchanged. Toasts confirm what happened in one sentence that names the shop.

**Data states.** Every list has a busy state, an empty state with one sentence on what fills it, and a
server-error state that says nothing was changed and offers a retry. The sketch's toolbar switches them.

## 2. Sign-in (`/sign-in`)

ADM-01 in one container: email and password, then either verification (one field that takes a 6-digit
code or a backup code; a wrong code shows the attempts left before the 15-minute wait) or, for a first
sign-in, enrolment: the QR drawn in the browser from the otpauth URI, the key for manual entry, one code to
confirm, then the ten backup codes shown once with Copy all and Download. Three progress bars show where the
person is. No "forgot password": the ADM-18 sentence sits under the form. The code field at verification keeps a full
keyboard on a phone, since a backup code has letters; enrolment and new codes, which ask for the authenticator's, keep
the numeric one.

**The limit (ADM-01, amended with the build).** The sellers' rule from AUTH-14: five failures in 15 minutes on
one account lock it, wrong passwords and wrong codes counted together, and during the lock a right password or
code is refused too. A wrong password says only that the email or password isn't right. Attempts left are shown
only at the code step, once the password has been proven. A locked account sees the wait and a disabled button, at
whichever step it locked; the button returns when the server would answer again, or for another address.

## 3. Today (`/`)

**Job:** what needs a person, then what changed.

- Four figures from the queue itself: needs review (BIL-06, the amount differs, with the first case in
  words), pending (with the wallets involved), taka waiting, oldest waiting (with the shop). The first
  figure is flagged in marigold when it is above zero.
- *Also waiting*: open page reports with the newest reason, Lytro's phones online with the one that is not,
  unclaimed receipts, and today's unreadable messages. The first two are flagged in marigold when something is
  wrong. Each opens its screen.
- *Recent changes*: the last rate and setting changes from the rate histories and the settings' updated
  stamps, and the last suspension, each a row that opens its screen.
- *Platform figures*: a dashed card for ADM-09's counts and revenue, not built.
- Two buttons: Find a shop, Open the queue.

## 4. Payment queue (`/queue`)

**Job:** match wallet payments against the statements and release them.

- The four figures, then filter chips by kind with counts and "Needs review only".
- One row per payment, needs-review first: shop and address; kind with the plan and term, or "Credits ৳…
  to the balance" for a top-up; the amount large, with the quoted amount beneath when it differs; sender
  number with TrxID in monospace, and the wallet once a receipt has seen the money (a seller names no wallet when paying Lytro); waiting time; the status chip; Approve and Reject. The row opens
  the payment panel with the same facts and the sentence "Match this against the wallet statement before
  approving."
- **Approve** (panel): the consequence in one sentence, "*Sadia Collection* goes on *Starter* for 1 month,
  active until *19 Nov 2026*. The invoice is issued and the owner is told by SMS. Approving twice has no
  second effect." (ADM-06); for a top-up, "*৳500* is credited to the balance, once." A needs-review payment
  says it accepts what arrived against the quote and activates anyway, with the amount that arrived in a field,
  to change only if the statement says otherwise (ADM-06, BIL-06). The button is "Approve ৳448". The toast names
  the shop and the plan.
- **Why it waits** (BIL-06): a needs-review payment's panel opens on the reason in one sentence (the amount, the
  sender, an old receipt, a used TrxID, a closed request), then what was quoted, what the seller says
  they sent and what a receipt says arrived.
- **Put it on the balance** (BIL-06): for a plan, upgrade or add-on, from the payment panel. Nothing is activated,
  the money goes on the balance once, the add-ons on it are cancelled and the owner is told. The amount is needed
  when no receipt says. A top-up has no such action.
- **Reject** (panel): nothing is credited, the seller reads the note on the plan page and can submit again;
  the note field; "Reject with note".
- Empty: "Nothing waiting. New wallet payments appear here when a seller submits a TrxID. Ones a Lytro phone
  matches clear by themselves."

## 4a. Page reports (`/page-reports`)

**Job:** decide about a payment page a shopper says looks wrong (ADM-12, TVR-02).

- Chips: Open with its count, Dismissed, Acted on. Open is what the page shows first.
- One row per report: shop and address, the reason in words with the shopper's note under it, how long ago, the
  status, and three buttons: Open the page (first, because looking comes before deciding), Suspend the page,
  Dismiss. The row opens a panel with the same facts and the address it came from.
- **Suspend the page** (panel, TVR-03): within a minute new payments are refused and open pages show
  "unavailable"; the rest of the shop stays open; this shop's open reports are marked acted on. Reason required.
- **Dismiss** (dialog): nothing is done to the shop, and it goes on the audit log.
- Empty: "No open reports. A report appears here the moment a shopper sends one."

## 5. Shops (`/shops`, `/shops/:slug`)

- **List**: the search, a table of shop and address, state chip, plan with its version, period end with the
  signed day count, a Suspended chip or the override count, Open. Cards on phones. "Load 20 more" on the
  cursor (ADM-02's filters by state and plan are drawn disabled with the note that they arrive with the
  full search).
- **Shop page**: the crumb, the name, the state chip, the Suspended chip, the address as a link, the tenant
  id with Copy; four actions as buttons: Suspend for cause or Restore, Adjust balance, Assign a plan, Add
  override. A suspended shop shows the red banner with the date, the operator, the reason and what it
  means. Four facts: plan and version, period end with the day count, suspension date or "Not suspended",
  override count.
- **Payments** card, first after the facts: the payment page's state with Suspend or Restore and, when
  suspended, its date and reason (TVR-03); the new-shop cap, on or off and whether that is the shop's kind or set
  for this shop, with Change (TVR-04: as its kind says, on, or off); and the credential log with its last use,
  opening `/shops/:slug/credentials` (SEC-11: when, wallet, action, payment, result, never a key).
- **Listener phones** card (LSN-20): "1 of 1" against the plan's limit, then each phone's name, model, app version,
  last seen, today's count, state and flags, with Revoke (LSN-19) and Block (LSN-21). Block names the installation
  and takes a reason: it pairs with no shop again and every phone on it is revoked.
- **Add-ons** and **Effective limits** cards (PLN-13): what is running, how it was paid and whether it renews; what
  is left of the packs and whether auto-buy is on; each limit as its plan's value, or the override that replaces it
  (PLN-11), plus add-ons.
- **Limit overrides** card: each override with its value, the plan's own value beside it, the reason, who
  and when, and Remove; the empty sentence otherwise (PLN-11).
- **Later** on the same page, as dashed cards: *Shop detail* (ADM-03: balance and frozen flag, usage
  against every limit, errors in 24 h, failed SMS and bookings, last sign-in, open tickets, business
  summary), *Operator actions on this shop* (ADM-08), *View as this shop* (ADM-05), *Request identity
  verification* (KYC-01).
- **Panels**: *Suspend* (LIF-24: the storefront and landing pages go offline at once; the owner keeps the
  dashboard, can read orders and top up, and sees the reason; the lifecycle state is untouched; the reason
  the seller will see; "Suspend"), *Restore* (back within a minute; the suspension stays on the audit log),
  *Adjust balance* (BAL-17: a correction, not a refund; negative takes money off; amount with the ৳ prefix,
  reason; the toast states the new balance), *Assign a plan* (PLN-17: plan select with version and
  "not for sale" marked, optional expiry with the sentence on what no expiry means, reason), *Add a limit
  override* (limit select showing the plan's own value for each key, value or Unlimited, reason).

## 6. Plans and prices (`/plans`)

A matrix: a row per plan with its name, version, for-sale or not-for-sale chip and rank, the two headline
limits, then a column per live billing term with a price cell that saves on Enter (`PUT
/operator/plans/:id/prices/:termId`, TRM-03). A cleared cell means "not offered for this term" (TRM-13).
Not-for-sale plans are faded with their cells disabled. The footer states the rank and delete rules (PLN-08,
PLN-16). "New plan" opens the editor.

**Plan editor** (panel): name and rank, description, the for-sale switch, every limit as a row with a value
and an Unlimited tick (PLN-19; retention has no tick; the two API limits from Slice 8 are in the list), the
feature flags as chips with strike-through for off, the version sentence ("v3 recorded 29 Sept 2026. Saving
records v4; shops already on v3 keep it until they renew", PLN-02), a link to the version history, Delete
disabled with the reference count. The button is "Save as v4", or "Create plan".

**Version history** (panel): each version with its date and what changed, the current one marked, and how
many shops sit on each. **Delete refused** (dialog): the count that blocks it and PLN-08.

## 6a. Add-ons (`/addons`)

The catalogue a shop buys from (PLN-13): a table of item, kind (limit, pack, feature), what it raises, the unit,
the price per month, how many are running and whether it is for sale, with Edit. New and Edit open one panel: names
in both languages, kind, the limit it raises, unit size, price, the most a shop may buy at once, and For sale, after
the sentence that a price change applies from now on and a running add-on keeps its price to its end. Retire is a
dialog: no shop can buy it from now, the running ones continue and do not renew. A paid add-on waits in the queue
like a plan payment.

## 7. Billing terms (`/billing-terms`)

A table: the term with its Bangla label, months, the visible switch that saves at once, the pre-fill
discount, how many for-sale plans have a price for it, a "one shop" chip for a single-tenant term
(TRM-14), "retired" with its date, Edit and Retire. Retired terms stay, faded; Delete is offered only for
an unreferenced one (TRM-05). New term and Edit open the same panel: labels in both languages, months,
display order, default discount with its sentence, visible, the single-shop tenant id. Retire is a dialog
that states how many invoices keep the term.

## 8. Rates (`/rates`)

One row per rate: its name, its unit in words, the effective-from date, the value large, Change and History.
Change edits inline in the row with Save and Cancel (`PATCH /operator/rates/:key`, two decimals, RAT-08);
saving shows the toast "Applies from the next charge" and opens the rate-change notice offer under the row,
marked "soon" until NTC-13. History expands under the row: old → new, date, who, notice or none. The nine rates
include the listener's and the gateway's verification fees (RAT-15, RAT-16).

## 9. Settings (`/settings`)

All 28 values from `/operator/settings`, in nine groups with a chip row to jump between them: *Trial and top-up*;
*Lifecycle after a paid period ends* (LIF-26); *Orders and stock*; *Requests and limits*; *Online payments* (the
new-shop cap, TVR-04); *Listener phones* (offline window, oldest app, the sender list); *Media*; *Catalogue in the
shopper's browser* (CCH-03); *Terms and privacy* (LEG-01). Each row shows the server's description, the last change
and who made it, the value large with its unit, and Change, which edits inline with a reason field (ADM-11). The
sender list edits one per line, the order limit is a choice of two, and a terms or privacy version warns that it
changes the same day new text is published. The side card "What these numbers do" draws the
timeline the current values produce, from the period end through grace, read-only, locked and archived to
the deletion day, so a change is checked against its effect before it is saved.

## 10. Platform wallets (`/wallets`)

A table: provider with its colour dot, number in monospace, label, the Shown switch (BIL-02), order, Edit
and Remove, with the sentence that sellers see these rows exactly as listed. The panel takes provider,
number, label, order and Shown. Remove is a dialog: sellers stop seeing it at once; matched payments keep it
on their invoices. A dashed card holds the place for gateway credentials (ADM-10).

## 10a. Lytro's phones (`/phones`, `/phones/receipts`, `/phones/unread`)

**Job:** keep the phones that read Lytro's own wallets working, and see what they could not place (PAY-21). Three
tabs under one navigation item, with Pair a phone always at the top.

- **Phones:** a banner when one is offline, saying its wallet's payments wait in the queue until it reports again.
  One row per phone: name and model, app version, last seen, state, today's count, Revoke and Block. Empty says
  every seller's wallet payment waits in the queue until one is paired.
- **Pair a phone** (panel): the two steps, the eight-character code large, that it works once, when it runs out
  (10 minutes, LSN-01) and New code.
- **Receipts:** newest first, a search by the start of a TrxID, a sender number or an amount, chips by status with
  counts (Unclaimed, With you, Used, Duplicate, Ignored). A row shows amount, TrxID, sender, phone, age and status
  with the review reason. Its panel shows the message's text until it is removed (LSN-17) and opens the payment.
- **Unreadable messages** (VER-06): the masked wording with numbers, people and notes removed, the day and the
  count, a chip where a day reached the 20 that told the operator, and 7, 30 and 90 days.

## 11. Catalogue

**Shop types** (`/catalogue/shop-types`, PST-02 to PST-05): one row per preset: labels in both languages
and the key, stock unit, tracking, batches, serials with the format, the low-stock threshold, how many
suggested categories and attributes, how many up-front fields; Edit. The panel edits the labels, the stock
unit, tracking, the batch and serial defaults, the serial format, the low-stock threshold, the suggested
categories as removable chips, the suggested attributes as chips from the library, and the up-front fields
as a checklist, after the sentence that only products created from now are affected.

**Attribute library** (`/catalogue/attributes`, ATL-01, ATL-05): one row per platform attribute: name with a
"retired" chip when retired, data type, unit kind, the values as chips with swatches, how many shops use
it; Open. New attribute (panel): name, data type, unit kind, after the sentence that the type never changes
afterwards. The attribute panel: Rename and Retire with the retire sentence, then the platform values with
their swatches, each with Rename and Retire, and "Add a value" (value, optional swatch colour).

**Option sets** (`/catalogue/option-sets`, ATR-16): a table of set, values as chips, "offered first to"
the shop type or every shop; Edit and Delete. The panel: name, values one per line, the shop type; editing
changes only what is offered next. Delete is a dialog: values shops already inserted stay theirs.

## 12. Account (`/account`)

Backup codes: how many of ten are unused, and "Generate new codes" (panel: the sentence that the current
codes stop working, password, a fresh authenticator code; the new codes then show once with Copy all and
Download). This session: signed-in time and browser, Sign out, the language. The ADM-18 sentence closes
the page. A mistyped password or code in the panel says so under its field and leaves the operator signed in. The new
codes stay on screen through Escape or a tap outside, since nothing can show them again.

## 13. Later (design only)

Drawn under their own sidebar group, each as a page with the "Not built yet" banner, the requirement id
and the sentence on what it will hold, over a dashed sketch of its table or form: Reports (ADM-09), Audit
log (ADM-08), Support inbox (SUP-04, SUP-05), Notices (NTC-01 to NTC-20), Verification queue (KYC-07,
KYC-09), Manual payments and claims (ADM-14 to ADM-17). Gateway credentials
(ADM-10), view-as (ADM-05), the shop detail facts (ADM-03) and the identity request (KYC-01) are dashed
cards on the screens they belong to.

---

## 14. What the console shows against what the backend serves

| Area | Served today | Shown as current | Drawn as later |
| --- | --- | --- | --- |
| Sign-in | `POST /auth/operator/signin`, `enroll`, `verify`, `backup-codes/regenerate`, `signout` | §2, §12 | break-glass recovery stays a database action (ADM-18) |
| Shops | `GET /operator/tenants` (search, cursor), `suspend`, `restore`, `balance-adjust`, limit overrides, `plans/:id/assign` | §5 | ADM-02 filters, ADM-03 detail, ADM-05 view-as, ADM-08 actions, KYC-01 request |
| Payments | `GET /operator/payment-queue`, `approve`, `credit`, `reject` | §3, §4 | ADM-14 to ADM-17 |
| Page reports | `GET /operator/payment-page-reports`, `dismiss`; `tenants/:id/payment-page/suspend`, `restore`; `tenants/:id/new-shop-cap` | §4a, §5 | |
| Phones | `tenants/:id/listener-devices`, `listener-devices/:id/revoke`, `listener-installations/block`; `lytro-listener/pairing-codes`, `devices`, `receipts`; `listener-unread` | §5, §10a | |
| Credentials | `tenants/:id/gateway-credential-uses` | §5 | export for a dispute (SEC-11) |
| Add-ons | `GET/POST/PATCH /operator/addons`, `retire` | §6a | |
| Plans | `GET/POST/PATCH/DELETE /operator/plans`, `versions`, prices per term | §6 | |
| Billing terms | `GET/POST/PATCH /operator/billing-terms`, `retire`, `DELETE` | §7 | |
| Rates | `GET /operator/rates`, `history`, `PATCH` | §8 | NTC-13 notice offer |
| Settings | `GET /operator/settings`, `PATCH /:key` | §9 | |
| Wallets | `GET/POST/PATCH/DELETE /operator/platform-wallets` | §10 | ADM-10 gateways |
| Catalogue | `GET/PATCH /operator/presets`, attributes and options, option sets | §11 | |
| Reports, audit, inbox, notices, verification | nothing | | §13 |

## 15. Backend additions this design needs

Built with the server PR of Slice 5.8 part 5:

| Need | Route | Why |
| --- | --- | --- |
| The sign-in limit | `/auth/operator/signin`, `enroll`, `verify`, `backup-codes/regenerate` | §2. Amends ADM-01. |
| Shop name, slug and wallet on payment-queue rows | `GET /operator/payment-queue` | An operator matches by shop name. The wallet is the one a receipt names: null until one of Lytro's phones has seen the money. |
| One shop | `GET /operator/tenants/:id` | The shop page: plan version, who suspended it and why, the payment page, the new-shop cap. |
| Plan version and override count on a search's rows | `GET /operator/tenants` | The list's columns. |
| A shop's add-ons and each limit's parts | `GET /operator/tenants/:id/addons` | The shop page's two cards. |
| Who is signed in | `GET /auth/operator/me` | The sidebar's foot and the account page ("7 of 10 unused"). |
| An email rather than a uuid for who changed something | `updatedByEmail`, `changedByEmail`, `setByEmail` | The rows keep an operator's id; the screens show who. |
| A reason on a setting or rate change | `PATCH /operator/settings/:key`, `/operator/rates/:key` | ADM-11 puts the reason on the audit log. |
| Today's recent changes | `GET /operator/recent-changes` | One read, rather than a history call per rate. |
| The installation on a phone's operator view | `tenants/:id/listener-devices`, `lytro-listener/devices` | Blocking needs `installationId`. |

Still to come, with the screens that need them:

| Need | Where | Why |
| --- | --- | --- |
| Price count per term | billing terms | "3 of 3 plans priced"; derivable client-side from every plan's prices meanwhile. |
| Shops per attribute and per plan version | catalogue, plans | "Used by 412 shops", "v3 ×131"; derivable from counts the stores can add cheaply. |
| ADM-03, ADM-08, ADM-09, ADM-14, NTC, KYC, SUP | later phases | Placeholders are drawn, nothing more. |

## 16. Mapping onto `apps/operator`

| Screen | Route | View |
| --- | --- | --- |
| Sign-in | `/sign-in` | `views/sign-in` (credentials, enroll, backup-codes, verify steps, kept) |
| Today | `/` | `views/today` (+ `queue-figures.tsx`, `recent-changes.tsx`) |
| Payment queue | `/queue`, `/queue/$id` | `views/queue` (+ `queue-figures.tsx`, `payment-row.tsx`, `payment-panel.tsx`, `approve-panel.tsx`, `credit-panel.tsx`, `reject-panel.tsx`) |
| Page reports | `/page-reports` | `views/page-reports` (+ `report-panel.tsx`, `suspend-page-panel.tsx`, `dismiss-dialog.tsx`) |
| Shops | `/shops`, `/shops/$slug` | `views/shops` (list), `views/shop` (+ `suspend-panel.tsx`, `restore-panel.tsx`, `adjust-panel.tsx`, `assign-panel.tsx`, `override-panel.tsx`, `overrides-card.tsx`, `payments-card.tsx`, `cap-panel.tsx`, `phones-card.tsx`, `addons-card.tsx`), `/shops/$slug/credentials` |
| Plans and prices | `/plans`, `/plans/$slug`, `/plans/$slug/versions` | `views/plans` (+ `price-matrix.tsx`, `plan-editor.tsx`, `versions-panel.tsx`) |
| Billing terms | `/billing-terms` | `views/billing-terms` (+ `term-panel.tsx`) |
| Rates | `/rates` | `views/rates` (+ `rate-row.tsx`) |
| Settings | `/settings` | `views/settings` (+ `timeline-card.tsx`) |
| Platform wallets | `/wallets` | `views/wallets` (+ `wallet-panel.tsx`) |
| Lytro's phones | `/phones`, `/phones/receipts`, `/phones/unread` | `views/phones` (+ `pair-panel.tsx`, `revoke-panel.tsx`, `block-panel.tsx`, `receipts.tsx`, `receipt-panel.tsx`, `unread.tsx`; the revoke and block panels are shared with the shop page) |
| Add-ons | `/addons` | `views/addons` (+ `addon-panel.tsx`, `retire-dialog.tsx`) |
| Shop types | `/catalogue/shop-types` | `views/shop-types` (+ `preset-panel.tsx`) |
| Attribute library | `/catalogue/attributes` | `views/attributes` (+ `attribute-panel.tsx`, `value-panel.tsx`) |
| Option sets | `/catalogue/option-sets` | `views/option-sets` (+ `set-panel.tsx`) |
| Account | `/account` | `views/account` (+ `codes-panel.tsx`) |
| Later | `/reports`, `/audit`, `/inbox`, `/notices`, `/verification`, `/manual` | one `views/later` page fed by a list of requirement ids |

Three primitives every screen shares, in `components/ui`: `panel.tsx` (bottom sheet under 640 px, right
drawer above, with the consequence block, fields and footer), `data-table.tsx` (table from 640 px, stacked
cards below, driven by one column list, with the empty and error states) and `figures.tsx` (the stat
strip). The shell replaces `console-shell.tsx`: the light theme from `packages/ui`'s dashboard role tokens,
the ink band and sidebar head, the four-tab phone bar and the More sheet.

**Built so far (Slice 5.8 part 5).** The frame, sign-in, account and the later pages. Until their own pull requests, the
screens not rebuilt yet sit in the new frame and theme at their old paths (`/payment-queue`, `/tenants`), and Today, Page
reports, Add-ons, Lytro's phones and the catalogue hold their places with a page that says the screen is coming.

## 17. The prototype

`docs/brand/lytro-operator.html` is self-contained. Its toolbar picks the screen (grouped as the sections
above), the device (phone 390, tablet 820, desktop 1366), the language and the data state (busy, nothing
waiting, server error). Every button that leads somewhere in the design leads there in the sketch, so a
reviewer can walk the sign-in, approve a payment, suspend and restore a shop, edit a plan and set a rate
without the toolbar. It renders 90 screens with no horizontal overflow on any device, in any data state, and no
missing strings in either language.
