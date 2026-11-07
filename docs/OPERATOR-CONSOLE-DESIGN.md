# Operator console: design (v5)

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

Version 4 (2026-11-06, Phase 6 Slice 6.7's sketch) adds the couriers (§10b): the three couriers with retiring, undoing it
and removing one once nothing waits on it, as Slice 6.6's read agreed; RedX's areas placed in thanas (Slice 6.4); and a
shop's courier key log (§5). They are drawn before Slice 6.6's routes exist; §15 lists what the build needs.

Version 5 (2026-11-07, Phase 7 Slice 7.7's sketch) adds the notices to shops (§10c, NTC-01 to NTC-19) from Slice 7.4's
routes, makes the Rates page's rate-change notice offer real (§8, RAT-09, NTC-13), places Phase 7's five settings and
Phase 6's four courier settings on Settings (§9), lets the add-on catalogue make and edit an allowance (§6a, D7-17,
D7-36), and brings back the sentences D7-20 names wherever the code now sends the message (§4, §5). §15 lists what the
build needs, and two things the allowance's drawing found.

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
wallets, Lytro's phones, Couriers, Notices), *Catalogue* (Shop types, Attribute library, Option sets), *Later*
(Reports, Audit log, Support inbox, Verification, Manual payments, each greyed with "soon"), and the foot with the operator's
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
- **Approve** (panel): the consequence in one sentence, "*Sadia Collection* goes on *Starter* for 1 month. The
  invoice is issued and the owner is told in the dashboard, and by SMS and email where they have them. Approving twice
  has no second effect." (ADM-06). The telling is true again from v5 (D7-20): issuing the invoice sends the owner an SMS
  when they have a phone, and email, the bell and push (`plan-invoicing.service.ts`). The period's end stays out, since
  the server doesn't give it before acting; for a top-up, "*৳500* is credited to the balance, once." A needs-review payment
  says it accepts what arrived against the quote and activates anyway, with the amount that arrived in a field,
  to change only if the statement says otherwise (ADM-06, BIL-06). The button is "Approve ৳448". The toast names
  the shop and the plan.
- **Why it waits** (BIL-06): a needs-review payment's panel opens on the reason in one sentence (the amount, the
  sender, an old receipt, a used TrxID, a closed request), then what was quoted, what the seller says
  they sent and what a receipt says arrived.
- **Put it on the balance** (BIL-06): for a plan, upgrade or add-on, from the payment panel. Nothing is activated,
  the money goes on the balance once, and the add-ons on it are cancelled. Nothing tells the owner (checked for v5: no
  notice is written), so the panel doesn't say so. The amount is needed when no receipt says. A top-up has no such
  action.
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
- **Couriers** card, after the payments cards (v4): the courier key log with its last use, opening
  `/shops/:slug/courier-keys` (SEC-11: when, courier, action, the order, result, never a key; the actions are checked
  the keys, booked a parcel, looked for a parcel by our number, cancelled a parcel, asked where a parcel is, renewed the
  login, read payouts), paged.
- **Listener phones** card (LSN-20): "1 of 1" against the plan's limit, then each phone's name, model, app version,
  last seen, today's count, state and flags, with Revoke (LSN-19) and Block (LSN-21). Block names the installation
  and takes a reason: it pairs with no shop again and every phone on it is revoked. From v5 both panels say the shop is
  told in its dashboard, the owner and the staff who manage its phones, in the bell and by push (D7-20: Lytro revoking a
  shop's phone now writes that notification). Lytro's own phones have no shop to tell, so their panels don't.
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
in both languages, the key (on a new item only: the server fixes it), kind and the limit it raises (fixed once made),
unit size and price, after the sentence that a price change applies from now on and a running add-on keeps its price to
its end. How many a shop may buy at once is one rule for every item (`ADDON_QUANTITY_MAX`), so it isn't in the panel.
Retire is its own dialog, with no way back: no shop can buy it from now, the running ones continue and do not renew, and
their owners see that in their dashboards. A paid add-on waits in the queue like a plan payment.

**Allowances** (v5; D7-17, D7-36, PLN-20): a fourth kind. The first, *Address reads from messages* (`address_reads_200`,
200 reads at ৳20 a month), sits in the table with a grey Allowance chip, "Address reads" as what it covers and 200 as its
unit. Its panel names the service it covers in place of the limit it raises (address reads, the only one; fraud checks
join once they have a price, D7-7), the uses one unit gives and the price, after the consequence that a price change
applies from now on, and that only a shop in a paid period can buy it, its uses taken before the balance until the period
ends. Under the price: at the rate, 200 reads cost ৳20.00, the same price, no discount. Kind and service are fixed once
made; a new allowance's key can be refused as taken. The kind select in the generic panel no longer says "soon", and the
catalogue's rule sentence says what an allowance does in place of "Allowances arrive with Phase 7". It doesn't promise
that an allowance renews with the plan: see §15.

## 7. Billing terms (`/billing-terms`)

A table: the term with its Bangla label, months, the visible switch that saves at once, the pre-fill
discount, how many for-sale plans have a price for it, a "one shop" chip for a single-tenant term
(TRM-14), "retired" with its date, Edit and Retire. Retired terms stay, faded; Delete is offered only for
an unreferenced one (TRM-05). New term and Edit open the same panel: labels in both languages, months,
display order, default discount with its sentence, visible, the single-shop tenant id. Retire is a dialog
that states how many invoices keep the term.

## 8. Rates (`/rates`)

One row per rate: its name, its unit in words, the effective-from date, the value large, Change and History.
Change edits inline in the row with a reason (ADM-11), Save and Cancel (`PATCH /operator/rates/:key`, two decimals,
RAT-08); saving shows the toast "Applies from the next charge" and opens the rate-change notice offer under the row
(v5; RAT-09, NTC-13): "Tell shops about this change?", the title the rate-change template writes from it, that the
history says whether one was published, **Write the notice** (§10c's editor, filled from the change) and **No notice**.
History expands under the row: old → new, date, who, then "notice published", opening it, or "no notice" with **Write
one**, since a template can be filled from any change. Values show the two decimals they are stored with. The nine rates
shown include the listener's and the gateway's verification fees (RAT-15, RAT-16) and, from v5, an address read from a
message (`ai_extraction`, ৳0.10, D7-36); the chat reply's rate isn't shown while chat is out (D7-16). The sketch's figures
follow Phase 7: the fake-order check ৳0.00 at launch (D7-7), the SMS part 67 characters (D7-25).

## 9. Settings (`/settings`)

All 37 values from `/operator/settings` (v5), in thirteen groups with a chip row to jump between them, wrapping from
640 px: *Trial and top-up*;
*Lifecycle after a paid period ends* (LIF-26); *Orders and stock*; *Requests and limits*; *Online payments* (the
new-shop cap, TVR-04); *Listener phones* (offline window, oldest app, the sender list); *Media*; *Catalogue in the
shopper's browser* (CCH-03); *Terms and privacy* (LEG-01); and from v5 *Couriers* (Phase 6's four, which the page had
left off: how old a parcel must be and how long quiet before the night check asks, when a parcel stops being checked, and
how long Sync shows its saved answer; CRR-14, CRR-15), *Reading delivery details* (the AI, Gemini the only choice, with
the sentence that another needs its adapter first; its model, whose change warns that a name Gemini doesn't know makes
every read fail until it is put back, a failed read costing a shop nothing; how many reads a shop may make a minute;
AI-10, ORD-33), *Fraud checks* (how many a shop may run a minute, FRD-07) and *Notifications* (how many days the bell
keeps one, D7-39, whose change says the older ones go in every shop at the next nightly clean-up). Each row shows the server's description, the last change
and who made it, the value large with its unit, and Change, which edits inline with a reason field (ADM-11). The
sender list edits one per line, the order limit is a choice of two, and a terms or privacy version warns that it
changes the same day new text is published. A value the server refuses (not a whole number of 1 or more) says so under
the field, and nothing is saved. The side card "What these numbers do" draws the
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

## 10b. Couriers (`/couriers`, `/couriers/redx-areas`)

**Job:** keep the couriers shops can connect in order, and give RedX the areas its bookings need (CRR-23 to CRR-25,
CUS-10). Two tabs under one navigation item in Platform, as Lytro's phones has.

- **Couriers:** one row per courier: its name and key, state (Active, Retiring, Removed), shops connected, how many have it
  as their default, and parcels on their way; cards on phones. An active courier offers **Retire**; a retiring one shows
  "Retiring since 19 Oct · suggests Pathao" under its name, a warning banner above the table, and **Undo retiring** and
  **Remove**; a removed one is faded with "Removed 18 Nov. Past parcels and orders keep its name.", and no actions.
- **Retire** (panel): "Retire RedX?", how many shops are connected; **Suggest instead**, a select of the other active
  couriers, the one every connected shop is told to connect for new bookings (Slice 6.6 read 1). Two consequence blocks:
  how many shops are told in Lytro's own words (read 7) that it is retiring and which courier is suggested; that it leaves
  the list of couriers to connect, while shops already connected keep booking, tracking and getting its news and can still
  replace their keys, and a shop that disconnects it can't connect it again (read 8); and how many shops have it as their
  default, which moves to the suggested courier where they are connected to it and to their longest-connected other courier
  otherwise, the rest keeping it (reads 2 and 5). A reason for the audit log, which shops never see. A danger button.
- **Undo retiring** (panel): it can be connected again; the shops told it was retiring hear it's back; the defaults that
  moved stay where they are (read 6). A reason.
- **Remove**, while anything waits on it: the panel says it can't be removed yet and how many orders in how many shops wait,
  why removal waits (a parcel on its way with it, or a delivered parcel still waiting for its payout, up to 30 days after the
  parcel last changed; read 3), then a wrapping list of each order's number, shop and reason: "On its way" with the
  courier's status, "Its booking isn't settled", or "Delivered 18 Oct, its payout not in yet · Stops waiting 17 Nov".
  Only Close.
- **Remove**, once nothing waits: "Remove RedX for good?", a danger consequence (it deletes the keys and message addresses
  of the shops still connected and disappears from every list; past parcels and orders keep its name and news; it can't be
  undone; a developer then deletes its code; read 4), a reason and a danger button. The toast says the code can now go.
- **RedX areas:** the sentence on why they matter; "2,866 areas · read 19 Oct, 03:00 · again every Sunday at 03:00" with
  **Refresh now** (the toast gives listed, new, renamed, retired and back, as the refresh answers); chips with counts: All,
  Suggested, No thana, In a thana, Retired by RedX (the live list would load 793 in a thana by their own names, 1,100
  suggested and 973 matching nothing); a name search and a district select. A row: the area's name and code, district, post
  code or a dash, its thana or "Suggested: Banani" in warning tone or "No thana", how it matched (Own name, Placed by you,
  Suggested, No match) and **Place** or **Change**; an area RedX dropped is faded with the date it went and no action.
  Suggested is the tab that opens: rows have checkboxes, "2 selected", **Confirm 2** and Clear, with the note to check
  the brackets ("Duaripara-Pallabi(Mirpur 12)" names Mirpur but is in Pallabi). Paged, 50 to a page.
- **Place** / **Change** (panel): the area and its code, a thana search over the thanas with their districts, and the
  consequence: staff booking an order in that thana see it among the thana's areas, and its district becomes the
  thana's. Change adds **Take it off the thana**.
- **Confirm** (panel): "Confirm 2 suggested areas?", their names, and that each then counts in the thana suggested for it
  and can still be moved later.
- **Lytro's token not set:** a warning banner naming `REDX_AREAS_TOKEN`, saying the list can't be read and RedX can't book
  until it is set and the list has been read once; Refresh now disabled; the empty table says to set the token, then
  refresh.

## 10c. Notices (`/notices`, `/notices/new`, `/notices/:id`, `/notices/:id/acknowledgments`)

**Job:** tell shops what Lytro is changing or what is wrong, and see who heard (NTC-01 to NTC-19). Drawn in v5 from Slice
7.4's routes and its read (D7-53 to D7-59); the dashboard's board, marquee, prompt and countdown are the dashboard
sketch's. One navigation item in Platform, out of Later.

- **List** (`GET /operator/notices`): newest written first; a search over the words and category chips (All, Rate change,
  Maintenance, New feature, Policy, Security, General), both served by the route's query. One row per notice: the title in
  the operator's language, or the other when it has only one, with a pin when pinned; under it the category, "updated 6
  Nov" after a live edit, and "English only" or "Bangla only"; Shows as (Info, Important, Urgent, plain chips); the
  audience in words ("All shops", "Plans: Starter, Growth, Pro", "States: …", "One shop: Dhaka Gadget House"); where it
  stands, read from its times as the server reads it (Draft "not sent", Scheduled "goes live 8 Nov, 10:00", Live "since
  …", Ended "ended …", Withdrawn "withdrawn …"); and sent and read ("212 shops · 147 read", with "41 of 212 said I
  understand" when it asks). A withdrawn row is faded. Empty: write one from blank or a template. Under the table:
  "Newest written first. A shop's board keeps the last 24 months."
- **New notice** (panel, NTC-12): Blank, or a template, each with what it fills: Rate change (pick one of the recent
  changes, each marked "no notice" or not, or type the rate and values), Maintenance (the window's start and end), Outage
  (urgent, since when), Policy update (asks for "I understand"). Continue opens the editor filled by `POST
  /operator/notices/template` with the template's own words in both languages, its gaps written "…" for the operator.
- **Editor** (a page, not a panel: it is long, and a half-written notice mustn't close with a tap outside). Two columns
  on desktop, one on a phone.
  - *Words*: Bangla and English as tabs, each marked whole (a tick), empty, or "!" when refused; the title with a "45 /
    120" counter and the body with "130 / 5,000"; the format line (bold, an https link, "- " for a list, a blank line for a
    paragraph, nothing else; D7-53); that one language whole is enough, or, on an English-only draft, that Bangla readers
    see the English (NTC-15, D7-57).
  - *Preview*: the notice as a shop's board shows it in the tab's language, rendered by the server's own renderer
    (`renderNoticeMarkdown` in validators: escaped, then bold, https links, lists), with its severity and category,
    "updated" once edited live, "From Lytro" and the day. Above it, for important, "Also shown once at each person's next
    sign-in"; for urgent, the scrolling strip "Also on every page, scrolling, until closed". The card's exact look follows
    the dashboard sketch's notice card at build.
  - *What it is*: category; Shows as, three choices, each saying what it does to shops (D7-54, D7-56): Info is on the
    board, in the bell and by push to the owner and the staff who read notices; Important is also a prompt at each person's
    next sign-in until read or closed, and an email to the owner; Urgent also scrolls across the top of every dashboard
    page until each person closes it, and an email to the owner.
  - *Who and when*: the audience (all shops; chosen plans as chips; chosen states; one shop, with a search) and the
    sentence that it is read when a shop looks, only the shops in it at going live are sent it, and an archived shop sees
    urgent ones only (NTC-02, NTC-07, D7-59); goes live: not yet (a draft), now, or at a time, sent within a minute of it,
    Dhaka time (NTC-11); an optional end, when it leaves every board; on a maintenance notice only, the window's start and
    end with the countdown sentence (D7-55); pinned; asks for "I understand", pressed by the owner once for the shop, staff
    getting no button (NTC-05).
  - Buttons: Save draft, then Schedule… or Publish… by the time chosen. No reason field: the API takes none, and the
    audit log records every create, edit and withdrawal (NTC-17).
- **Schedule** or **Publish** (panel): "Within a minute of 8 Nov, 10:00, it goes to the 212 shops in the audience: in the
  bell and by push to each owner and the staff who read notices, and by email to the owners", then, by severity, the
  prompt or the marquee sentence, and for maintenance when the countdown ends; a green block "No SMS is sent and no balance
  moves" (NTC-06); and that until then anything can change, while once live an edit is marked updated and nothing is sent
  again. The button names the time ("Schedule for 8 Nov, 10:00") or says "Publish now". Toasts: "Scheduled for … Nothing
  is sent before then.", "Published. It reaches shops within a minute.", "Saved as a draft. Nothing was sent."
- **A notice** (page): the title, where it stands, severity, category and "updated"; Who said I understand, Edit and
  Withdraw while scheduled or live, nothing once ended or withdrawn. Once it went live, four figures (NTC-09): shops sent
  (the audience at going live), people told (bell and push), read, and said I understand with "171 shops still to",
  flagged in marigold and opening the list, or "Not asked". Both languages as written, or "Not written. Readers of this
  language see the other one." Earlier versions (NTC-08): "Replaced 6 Nov, 09:12 by ops@lytro.app" with Show, which opens
  that version's words in both languages. The facts: audience, went or goes live, ends, the window, pinned, "I
  understand", email (to owners, or none for info), the rate change it tells of (opening the rate's history) and who wrote
  it. A scheduled notice says nothing has been sent and it can change until its time; an ended one that it left every
  board then; a withdrawn one that no shop sees it, it is kept with its versions and counts, and it can't be edited or
  published again.
- **Editing a live notice**: the same editor under a warning: saving marks it "updated" on the board and keeps the version
  it replaces; nothing is sent again. Its go-live time shows fixed (the server refuses a change: `NoticePublishTimeFixed`).
  The toast says it was saved and nothing was sent again.
- **Withdraw** (panel): it disappears from every shop's board at once, with its banner and prompt; it stays here with its
  versions and counts; it can't be edited or published again (`NoticeWithdrawnAlready`); the audit log records who and
  when. A danger button and no reason, as the API takes none. Toast: "Withdrawn. No shop sees it now."
- **Who said I understand** (`GET /operator/notices/:id/acknowledgments`, NTC-05): chips Still to (171) and Said I
  understand (41), a search by shop name or address over the lists the route returns whole, then the shops with their
  address and, on the second, "The owner, 5 Nov, 11:40". The sentence: only the owner can say it, once for the shop; "still
  to" is read now, so a shop that joined the audience after it went live is listed though it wasn't sent it. Empty:
  "Every shop has said it", or "No shop has said it yet", owners seeing the button on the notice in their dashboard.
- **From a rate change** (RAT-09, NTC-13): the rate's offer (§8) opens the editor filled from that change, under the
  banner "From the rate change of 7 Nov: SMS, per part, ৳0.55 → ৳0.65. Publishing links this notice to that change, and the
  rate's history says so." Publishing returns to Rates, the history now saying "notice published", with the toast
  "Published. The rate change now links to it."
- **Refusals**, each under "Nothing was saved. Fix what's marked, then save again.": nothing in either language ("Write a
  title and a body in Bangla, English or both", D7-57); a title over 120 or a body over 5,000 characters, the counter in
  red; a link that isn't https; a language with a title but no body ("The English has a title but no body. Add the body,
  or clear the title."). The server also refuses an end before the go-live time and a window that isn't on a maintenance
  notice or has one end only; those messages sit under their fields.

## 11. Catalogue

**Shop types** (`/catalogue/shop-types`, PST-02 to PST-05): one row per preset: labels in both languages
and the key, stock unit, tracking, batches, serials with the format, the low-stock threshold, how many
suggested categories and attributes, how many up-front fields; Edit. The panel edits the labels, the stock
unit, tracking, the batch and serial defaults, the serial format, the low-stock threshold, the suggested
categories as removable chips, the suggested attributes as chips from the library, and the up-front fields
as a checklist, after the sentence that only products created from now are affected.

**Attribute library** (`/catalogue/attributes`, ATL-01, ATL-05): one row per platform attribute: name with a
"retired" chip when retired, data type, unit kind, the values as chips with swatches; Open. How many shops use one isn't
shown: their attributes sit behind row security, and reading across shops needs a decision (KNOWN-GAPS §116). New
attribute (panel): name, the data type (one option, several options, a number, text, yes/no), and unit kind for a
number, after the sentence that the type never changes afterwards. The attribute panel: Rename and Retire with the
retire sentence (Bring back, once retired), then the platform values with their swatches, each with Rename and Retire,
and "Add a value" (value, optional swatch colour).

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
log (ADM-08), Support inbox (SUP-04, SUP-05), Verification queue (KYC-07, KYC-09), Manual payments and claims (ADM-14 to
ADM-17). Notices left Later in v5 (§10c); only NTC-20's secret keys wait, with Phase 8's shop API. Gateway credentials
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
| Credentials | `tenants/:id/gateway-credential-uses`, `tenants/:id/courier-credential-uses` | §5 | export for a dispute (SEC-11) |
| Couriers | `GET /operator/courier-areas`, `PUT /:id`, `POST confirm`, `POST refresh` | §10b | retiring, undoing and removing, until Slice 6.6 builds them |
| Add-ons | `GET/POST/PATCH /operator/addons`, `retire`; the allowance kind and its service (Slice 7.6) | §6a | |
| Notices | Slice 7.4's `GET`, `POST`, `PATCH /operator/notices`, `POST template`, `GET :id` with its versions, `POST :id/withdraw`, `GET :id/acknowledgments` (on `feat/notice-board`, not yet on main when v5 was drawn) | §10c | NTC-20's secret keys (Phase 8) |
| Plans | `GET/POST/PATCH/DELETE /operator/plans`, `versions`, prices per term | §6 | |
| Billing terms | `GET/POST/PATCH /operator/billing-terms`, `retire`, `DELETE` | §7 | |
| Rates | `GET /operator/rates`, `history` (with each change's `noticeId`), `PATCH` | §8, with the NTC-13 offer from v5 | |
| Settings | `GET /operator/settings`, `PATCH /:key` | §9 | |
| Wallets | `GET/POST/PATCH/DELETE /operator/platform-wallets` | §10 | ADM-10 gateways |
| Catalogue | `GET/PATCH /operator/presets`, attributes and options, option sets | §11 | |
| Reports, audit, inbox, verification | nothing | | §13 |

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

Built with the pricing, platform and catalogue screens, with no migration:

| Need | Route | Why |
| --- | --- | --- |
| Every plan's price at once | `GET /operator/billing-terms/prices` | The matrix and the terms' priced counts, rather than a read per plan. |
| Shops per plan version, and whether a plan can go | `shopsByVersion`, `deletable` on `GET /operator/plans` | "v3 ×131", and Delete says why it can't before it is tried. |
| Invoices per term, and whether a term can go | `invoices`, `deletable` on `GET /operator/billing-terms` | The retire sentence, and Delete. TRM-05 now also counts payments and a shop's current period (KNOWN-GAPS §114). |
| How many of each add-on are running | `running`, `boughtThisMonth` on `GET /operator/addons` | The table and the retire sentence. |
| The sender list as a list | `PATCH /operator/settings/listener_senders` | The route refused the only shape the setting holds (KNOWN-GAPS §115). |

Still to come, with the screens that need them:

| Need | Where | Why |
| --- | --- | --- |
| Shops per attribute | catalogue | "Used by 412 shops"; not built: a shop's attributes sit behind row security (KNOWN-GAPS §116). |
| ADM-03, ADM-08, ADM-09, ADM-14, KYC, SUP | later phases | Placeholders are drawn, nothing more. |

For the couriers (v4), with Slice 6.6 and Slice 6.7's build:

| Need | Route | Why |
| --- | --- | --- |
| Each courier's state, shops connected, defaults and parcels on their way | `GET /operator/couriers` | §10b's table (Slice 6.6). |
| Retire, with the suggested courier and a reason, answering how many were told and whose defaults moved | `POST /operator/couriers/:key/retire` | Slice 6.6 reads 1, 2, 5 and 7. |
| Undo retiring, with a reason | `POST /operator/couriers/:key/undo-retire` | Slice 6.6 read 6. |
| What still waits on a courier: each order's number, shop, why, and until when for a payout | `GET /operator/couriers/:key/blocking` | Remove's first panel (read 3). |
| Remove, with a reason, refused with the same list while anything waits | `POST /operator/couriers/:key/remove` | Read 4. |
| Counts by state, when the list was last read, and whether Lytro's token is set | `GET /operator/courier-areas` | The chips and the header; today it answers only the page and its total. |
| The thanas with their districts, for the place panel | the locations the shops' address forms read | The operator has no route of its own for them yet. |
| The order's number on each courier key log row | `GET /operator/tenants/:id/courier-credential-uses` | It answers the order's id only. |

For Phase 7 (v5), with Slice 7.7's build:

| Need | Route | Why |
| --- | --- | --- |
| How many shops an audience reaches now, before publishing | a count beside `POST /operator/notices`, or on a draft | The publish panel's "212 shops"; the routes count only what was sent. |
| Who wrote a notice and who replaced each version, as an email | `createdByEmail`, `versions[].editedByEmail` on `GET /operator/notices/:id` | They answer an operator's id, as settings and rates once did. |
| The new change's id when a rate is saved | `PATCH /operator/rates/:key` answering the history row's `id` | The offer fills its template from that change (`rateChangeId`); otherwise the console reads the history again. |
| Each recent change's rate-history id | `GET /operator/recent-changes` | The template's change picker in one read across every rate; until then a history read per rate, as Rates does. Its `id` today is the audit entry's. |
| Phase 6's four courier settings and Phase 7's five on the page | `apps/operator` `lib/setting-shapes.ts` | The server serves all 37; the console's list stops at 28. No server change. |
| The rate change's link to its notice | Slice 7.4's publish writing `rate_history.notice_id` | Built on `feat/notice-board`, whose migration grants `UPDATE (notice_id)`. |

Found while drawing the allowance, for the owner to decide (neither is screen data):

- **An allowance doesn't renew with the plan.** `renewalBar` (`addon-renewal.service.ts`) asks whether an add-on's
  `limitKey` is a usage limit the next plan still caps. `address_reads` isn't one, so an allowance always reads as
  "unlimited" and is never carried into the next period, while PLN-20 says allowances renew with the plan. §6a promises
  no renewal until this is settled.
- **"200 reads 20 tk per month" isn't per month on a longer term.** An allowance's uses are its quantity times its unit
  size for the whole purchase, while its price is the monthly price times the term's months (`addonPrice`), so a shop on a
  6-month term would pay ৳120 for 200 reads. Either the uses multiply by the term's months or they start again each month.

## 16. Mapping onto `apps/operator`

| Screen | Route | View |
| --- | --- | --- |
| Sign-in | `/sign-in` | `views/sign-in` (credentials, enroll, backup-codes, verify steps, kept) |
| Today | `/` | `views/today` (+ `also-waiting.tsx`, `recent-changes.tsx`; the figures are the queue's) |
| Payment queue | `/queue`, `/queue/$id` | `views/queue` (+ `queue-figures.tsx`, `payment-panel.tsx`, `approve-panel.tsx`, `credit-panel.tsx`, `reject-panel.tsx`) |
| Page reports | `/page-reports` | `views/page-reports` (its panels within; suspending shares the shop's `suspend-page-panel.tsx`) |
| Shops | `/shops`, `/shops/$id` (the server reads a shop by its id), `/shops/$id/credentials` | `views/shops` (list), `views/shop` (+ `shop-panels.tsx`, `overrides-card.tsx`, `payments-card.tsx`, `suspend-page-panel.tsx`, `phones-card.tsx`, `addons-card.tsx`, `credentials.tsx`) |
| Plans and prices | `/plans` (panels open in place) | `views/plans` (+ `price-matrix.tsx`, `plan-editor.tsx`, `versions-panel.tsx`, `plan-history.ts`) |
| Billing terms | `/billing-terms` | `views/billing-terms` (+ `term-panel.tsx`) |
| Rates | `/rates` | `views/rates` (+ `rate-row.tsx`) |
| Settings | `/settings` | `views/settings` (+ `setting-editor.tsx`, `setting-value.tsx`, `timeline-card.tsx`) |
| Platform wallets | `/wallets` | `views/wallets` (+ `wallet-panel.tsx`) |
| Lytro's phones | `/phones`, `/phones/receipts`, `/phones/unread` | `views/phones` (+ `phones-head.tsx`, `phone-panels.tsx`, `receipts.tsx`, `unread.tsx`; the revoke and block panels are shared with the shop page) |
| Add-ons | `/addons` | `views/addons` (+ `addon-panel.tsx`, with the retire dialog) |
| Shop types | `/catalogue/shop-types` | `views/shop-types` (+ `preset-panel.tsx`) |
| Attribute library | `/catalogue/attributes` | `views/attributes` (+ `attribute-panels.tsx`) |
| Option sets | `/catalogue/option-sets` | `views/option-sets` (+ `set-panel.tsx`) |
| Account | `/account` | `views/account` (+ `codes-panel.tsx`) |
| Notices | `/notices`, `/notices/new`, `/notices/$id`, `/notices/$id/edit`, `/notices/$id/acknowledgments` | `views/notices` (+ `notice-list.tsx`, `start-panel.tsx`, `notice-editor.tsx`, `notice-preview.tsx` on the shared `renderNoticeMarkdown`, `publish-panel.tsx`, `notice-page.tsx`, `withdraw-panel.tsx`, `acknowledgments.tsx`) |
| Later | `/reports`, `/audit`, `/inbox`, `/verification`, `/manual` | one `views/later` page fed by a list of requirement ids |

Three primitives every screen shares, in `components/ui`: `panel.tsx` (bottom sheet under 640 px, right
drawer above, with the consequence block, fields and footer), `data-table.tsx` (table from 640 px, stacked
cards below, driven by one column list, with the empty and error states) and `figures.tsx` (the stat
strip). The shell replaces `console-shell.tsx`: the light theme from `packages/ui`'s dashboard role tokens,
the ink band and sidebar head, the four-tab phone bar and the More sheet.

**Built (Slice 5.8 part 5).** Every screen above. Panels on the pricing, platform and catalogue screens open in place, as a
shop's do, rather than at addresses of their own: nothing needs to link to one. Phase 6's console screens are drawn in v4
(§10b and §5's Couriers card) and built with Slice 6.7's build, after Slice 6.6 adds the routes §15 lists.

**What the queue says and doesn't.** A row's amount, and the approve button's, is what a receipt says arrived, else the quote,
never what the seller typed. Approving sends an amount only if the operator changed the one shown. Putting money on the
balance needs an amount the operator typed, unless a receipt says. From v5, approving a plan, renewal or upgrade says the
owner is told, since issuing the invoice now tells them (D7-20); putting money on the balance and rejecting still send
nothing, so they promise nothing, and no panel gives a period's end date, which the server doesn't say before it acts.

## 17. The prototype

`docs/brand/lytro-operator.html` is self-contained. Its toolbar picks the screen (grouped as the sections
above), the device (phone 390, tablet 820, desktop 1366), the language and the data state (busy, nothing
waiting, server error). Every button that leads somewhere in the design leads there in the sketch, so a
reviewer can walk the sign-in, approve a payment, suspend and restore a shop, edit a plan and set a rate
without the toolbar. It renders 157 screens with no horizontal overflow on any device, in any data state, and no
missing strings in either language; v4's courier screens are the toolbar group "Couriers · Phase 6 Slice 6.7", and v5's
are "Notices · Phase 7 Slice 7.7" and "Pricing and platform · Phase 7 Slice 7.7" (the rates offer, settings, the
allowance and D7-20's three panels).
