# Operator console: design (v2)

The console at `admin.lytro.app` (`apps/operator`, D3-12), redesigned from scratch on 2026-10-21. Version 1
(2026-10-19, inverted dark chrome) is retired; nothing from it or from the old `apps/admin` console was
carried over. The interactive sketch is `docs/brand/lytro-operator.html`: every screen the backend serves
today, from Phase 0 sign-in to Phase 3 Slice 9, on phone, tablet and desktop, in English and Bangla, with
the later work drawn under its own group and marked "soon". The spec below is what the sketch shows.

**Who and where.** One or two people, mostly at a laptop, several times a day: matching wallet payments
against the bKash and Nagad statements, answering sellers, and occasionally changing a price or a limit.
The same person approves a payment from a phone on the road. So the console is desktop-first and dense,
and every screen folds to a phone without losing an action.

**Thesis: decide, act, move on.** The operator's day is a sequence of small decisions with money attached.
Each screen shows one decision, the evidence for it and one action. Every action names its consequence for
the seller and takes its reason in the same panel.

**Rules**

1. **The queue is the first thing after sign-in.** Today opens on what needs a person, with the queue's
   count on the navigation item and on the phone tab.
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
destinations in groups by how often they are opened: *Daily* (Today, Payment queue with its count, Shops),
*Pricing* (Plans and prices, Billing terms, Rates), *Platform* (Settings, Platform wallets), *Catalogue*
(Shop types, Attribute library, Option sets), *Later* (Reports, Audit log, Support inbox, Notices,
Verification, Manual payments, Page reports, each greyed with "soon"), and the foot with the operator's
email, Account and Sign out. The top bar holds the shop search with the `/` hint, the environment chip and
the language toggle. Content is at most 1120 px wide.

**Phone and tablet (under 1024 px).** The ink band carries the eyebrow and the section title, a search
icon and the menu; a page inside a section shows a back arrow instead. Four tabs: Today, Payment queue
with its badge, Shops, More. More is a sheet listing every other destination, Account, the language and
Sign out. Panels open as bottom sheets.

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
person is. No "forgot password": the ADM-18 sentence sits under the form.

## 3. Today (`/`)

**Job:** what needs a person, then what changed.

- Four figures from the queue itself: needs review (BIL-06, the amount differs, with the first case in
  words), pending (with the wallets involved), taka waiting, oldest waiting (with the shop). The first
  figure is flagged in marigold when it is above zero.
- *Recent changes*: the last rate and setting changes from the rate histories and the settings' updated
  stamps, and the last suspension, each a row that opens its screen.
- *Platform figures*: a dashed card for ADM-09's counts and revenue, not built.
- Two buttons: Find a shop, Open the queue.

## 4. Payment queue (`/queue`)

**Job:** match wallet payments against the statements and release them.

- The four figures, then filter chips by kind with counts and "Needs review only".
- One row per payment, needs-review first: shop and address; kind with the plan and term, or "Credits ৳…
  to the balance" for a top-up; the amount large, with the quoted amount beneath when it differs; sender
  number with TrxID and wallet in monospace; waiting time; the status chip; Approve and Reject. The row opens
  the payment panel with the same facts and the sentence "Match this against the wallet statement before
  approving."
- **Approve** (panel): the consequence in one sentence, "*Sadia Collection* goes on *Starter* for 1 month,
  active until *19 Nov 2026*. The invoice is issued and the owner is told by SMS. Approving twice has no
  second effect." (ADM-06); for a top-up, "*৳500* is credited to the balance, once." A needs-review payment
  adds the warning that what was actually sent is credited and the difference recorded. The button is
  "Approve ৳448". The toast names the shop and the plan.
- **Reject** (panel): nothing is credited, the seller reads the note on the plan page and can submit again;
  the note field; "Reject with note".
- Empty: "Nothing waiting. New wallet payments appear here the moment a seller submits a TrxID."

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
marked "soon" until NTC-13. History expands under the row: old → new, date, who, notice or none.

## 9. Settings (`/settings`)

Two groups from `/operator/settings`: *Trial and top-up* (trial length, top-up minimum and maximum,
BAL-04) and *Lifecycle after a paid period ends* (grace, read-only, locked, archived, LIF-26). Each row
shows the server's description, the last change and who made it, the value large with its unit, and
Change, which edits inline with a reason field (ADM-11). The side card "What these numbers do" draws the
timeline the current values produce, from the period end through grace, read-only, locked and archived to
the deletion day, so a change is checked against its effect before it is saved.

## 10. Platform wallets (`/wallets`)

A table: provider with its colour dot, number in monospace, label, the Shown switch (BIL-02), order, Edit
and Remove, with the sentence that sellers see these rows exactly as listed. The panel takes provider,
number, label, order and Shown. Remove is a dialog: sellers stop seeing it at once; matched payments keep it
on their invoices. A dashed card holds the place for gateway credentials (ADM-10).

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
the page.

## 13. Later (design only)

Drawn under their own sidebar group, each as a page with the "Not built yet" banner, the requirement id
and the sentence on what it will hold, over a dashed sketch of its table or form: Reports (ADM-09), Audit
log (ADM-08), Support inbox (SUP-04, SUP-05), Notices (NTC-01 to NTC-20), Verification queue (KYC-07,
KYC-09), Manual payments and claims (ADM-14 to ADM-17), Page reports (ADM-12). Gateway credentials
(ADM-10), view-as (ADM-05), the shop detail facts (ADM-03) and the identity request (KYC-01) are dashed
cards on the screens they belong to.

---

## 14. What the console shows against what the backend serves

| Area | Served today | Shown as current | Drawn as later |
| --- | --- | --- | --- |
| Sign-in | `POST /auth/operator/signin`, `enroll`, `verify`, `backup-codes/regenerate`, `signout` | §2, §12 | break-glass recovery stays a database action (ADM-18) |
| Shops | `GET /operator/tenants` (search, cursor), `suspend`, `restore`, `balance-adjust`, limit overrides, `plans/:id/assign` | §5 | ADM-02 filters, ADM-03 detail, ADM-05 view-as, ADM-08 actions, KYC-01 request |
| Payments | `GET /operator/payment-queue`, `approve`, `reject` | §3, §4 | ADM-14 to ADM-17 |
| Plans | `GET/POST/PATCH/DELETE /operator/plans`, `versions`, prices per term | §6 | |
| Billing terms | `GET/POST/PATCH /operator/billing-terms`, `retire`, `DELETE` | §7 | |
| Rates | `GET /operator/rates`, `history`, `PATCH` | §8 | NTC-13 notice offer |
| Settings | `GET /operator/settings`, `PATCH /:key` | §9 | |
| Wallets | `GET/POST/PATCH/DELETE /operator/platform-wallets` | §10 | ADM-10 gateways |
| Catalogue | `GET/PATCH /operator/presets`, attributes and options, option sets | §11 | |
| Reports, audit, inbox, notices, verification, page reports | nothing | | §13 |

## 15. Backend additions this design needs

| Need | Where | Why |
| --- | --- | --- |
| `shopName` and `slug` on payment-queue rows | payments | The queue rows show tenant ids only today; an operator matches by shop name. |
| `GET /operator/tenants/:id` | tenancy | The shop page reloads by id; `findSummary` exists in the store but has no route (the contract lists it as not built). |
| `updatedBy` on settings rows | platform settings | Settings show who changed a value; the row carries `updatedBy` already, the sketch assumes it is populated. |
| Unused backup-code count | operator auth | The account page states "7 of 10 unused". |
| Price count per term | billing terms | "3 of 3 plans priced"; derivable client-side from every plan's prices meanwhile. |
| Shops per attribute and per plan version | catalogue, plans | "Used by 412 shops", "v3 ×131"; derivable from counts the stores can add cheaply. |
| ADM-03, ADM-08, ADM-09, ADM-14, NTC, KYC, SUP | later phases | Placeholders are drawn, nothing more. |

## 16. Mapping onto `apps/operator`

| Screen | Route | View |
| --- | --- | --- |
| Sign-in | `/sign-in` | `views/sign-in` (credentials, enroll, backup-codes, verify steps, kept) |
| Today | `/` | `views/today` (+ `queue-figures.tsx`, `recent-changes.tsx`) |
| Payment queue | `/queue`, `/queue/$id` | `views/queue` (+ `queue-figures.tsx`, `payment-row.tsx`, `payment-panel.tsx`, `approve-panel.tsx`, `reject-panel.tsx`) |
| Shops | `/shops`, `/shops/$slug` | `views/shops` (list), `views/shop` (+ `suspend-panel.tsx`, `restore-panel.tsx`, `adjust-panel.tsx`, `assign-panel.tsx`, `override-panel.tsx`, `overrides-card.tsx`) |
| Plans and prices | `/plans`, `/plans/$slug`, `/plans/$slug/versions` | `views/plans` (+ `price-matrix.tsx`, `plan-editor.tsx`, `versions-panel.tsx`) |
| Billing terms | `/billing-terms` | `views/billing-terms` (+ `term-panel.tsx`) |
| Rates | `/rates` | `views/rates` (+ `rate-row.tsx`) |
| Settings | `/settings` | `views/settings` (+ `timeline-card.tsx`) |
| Platform wallets | `/wallets` | `views/wallets` (+ `wallet-panel.tsx`) |
| Shop types | `/catalogue/shop-types` | `views/shop-types` (+ `preset-panel.tsx`) |
| Attribute library | `/catalogue/attributes` | `views/attributes` (+ `attribute-panel.tsx`, `value-panel.tsx`) |
| Option sets | `/catalogue/option-sets` | `views/option-sets` (+ `set-panel.tsx`) |
| Account | `/account` | `views/account` (+ `codes-panel.tsx`) |
| Later | `/reports`, `/audit`, `/inbox`, `/notices`, `/verification`, `/manual`, `/page-reports` | one `views/later` page fed by a list of requirement ids |

Three primitives every screen shares, in `components/ui`: `panel.tsx` (bottom sheet under 640 px, right
drawer above, with the consequence block, fields and footer), `data-table.tsx` (table from 640 px, stacked
cards below, driven by one column list, with the empty and error states) and `figures.tsx` (the stat
strip). The shell replaces `console-shell.tsx`: the light theme from `packages/ui`'s dashboard role tokens,
the ink band and sidebar head, the four-tab phone bar and the More sheet.

## 17. The prototype

`docs/brand/lytro-operator.html` is self-contained. Its toolbar picks the screen (grouped as the sections
above), the device (phone 390, tablet 820, desktop 1366), the language and the data state (busy, nothing
waiting, server error). Every button that leads somewhere in the design leads there in the sketch, so a
reviewer can walk the sign-in, approve a payment, suspend and restore a shop, edit a plan and set a rate
without the toolbar. It renders 64 screens with no horizontal overflow at any width and no missing
strings in either language.
