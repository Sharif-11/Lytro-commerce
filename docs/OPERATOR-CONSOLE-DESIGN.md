# Operator console: design

The console at `admin.lytro.app` (`apps/operator`, D3-12). Designed 2026-10-19 from `SRS-detailed.md`
(ADM, PLN, TRM, RAT, LIF-24/26, BAL-04/17, BIL-06) and the operator endpoints the server exposes today
(`API-CONTRACT.md` §18); nothing beyond them is drawn, and the places later requirements will fill are
marked "later" on the sketch. The interactive sketch is `docs/brand/lytro-operator.html`. The old
`apps/admin` console was not consulted.

**Who and where.** One or two people at a desk, several times a day, matching wallet statements and
answering sellers. So the console is desktop-first and dense: tables with inline edits, a side drawer for
every action, keyboard focus on the search. Phones get the same screens with rows stacked into cards, for
the "approve this from the road" case. Look: BRAND-IDENTITY §8.4, chrome `#061211`, surfaces `#132725`,
teal-400 primary with ink text, marigold eyebrow and accents. Tone: precise, English by default with the
Bangla toggle, never cute.

**Three rules**

1. **The queue is home.** Signing in lands on the payment queue, the one thing that needs a human every day.
   Its count sits on the sidebar item.
2. **Every action states its consequence and asks for its reason in the same drawer.** Suspend, adjust,
   assign, override, reject: the drawer's first paragraph says what will happen to the seller, then the
   reason field the SRS requires, then one button named for the action.
3. **One grid for prices.** Plans and billing terms meet in a matrix; a price is a cell. There is no separate
   "prices" screen.

---

## 1. Shell

Sidebar from 1024 px with the OPERATOR eyebrow over the wordmark, the destinations in order of daily use
(Payment queue, Tenants, Plans and prices, Billing terms, Rates, Settings, Platform wallets, Account), the
signed-in email and Sign out at the foot. A top bar holds the global shop search (`/operator/tenants?query=`),
reachable with `/`. Below 1024 px: top bar with a menu button opening the same list as a sheet.

## 2. Sign-in (`/sign-in`)

ADM-01 in one container: credentials, then either enrolment (QR drawn in the browser from the otpauth URI,
the key for manual entry, one code to confirm) followed by the ten backup codes shown once with Copy all and
Download, or verification (one field that takes a TOTP code or a backup code). The remaining-attempts line
appears on a wrong code. No "forgot": recovery is a logged break-glass action (ADM-18), said so on the
account page.

## 3. Payment queue (`/queue`)

**Job:** match wallet payments against the bKash and Nagad statements and release them.

- Four figures from the list itself: needs review (BIL-06, amount differs), pending, taka in the queue,
  oldest waiting.
- Filter chips by kind with counts, and "Needs review only".
- One card per payment, needs-review first: the amount large, status and kind chips, the reason it needs
  review in marigold ("Quoted ৳699, seller says ৳698 sent"), then shop, plan and term, sender number and
  TrxID in monospace, the age. Actions: **Approve ৳…** (`POST …/approve`, ADM-06: activates the plan or
  credits the balance once), **Reject with a note** (a drawer with the note the seller will read,
  `POST …/reject`), **Open shop**.

## 4. Tenants (`/tenants`, `/tenants/:slug`)

- **List**: search by name or address (ADM-02), a table of shop and slug, state chip plus "Suspended",
  plan, period end with the day count signed, Open. Cards on phones. "Load 20 more" on the cursor. State
  and plan filters are drawn disabled until ADM-02's full search exists.
- **Detail**: the header card with name, state, slug, tenant id (copy), four facts (plan and version, period
  end, suspended, override count) and the four actions as buttons: **Suspend for cause** (LIF-24; the
  drawer says the storefront goes offline, the owner keeps the dashboard and can top up, and asks the
  reason), **Adjust balance** (BAL-17: "a correction, not a refund", amount and reason), **Assign a plan**
  (PLN-17/18: plan, optional expiry, reason, with the sentence on what no expiry means), **Add limit
  override** (PLN-11: limit, value or unlimited, reason, the plan's own value shown beside). A suspended
  shop shows the red note with the date, the operator and the reason, and Restore.
- **Limit overrides** card: each override with its value, the plan's value, the reason and who set it when;
  Remove per row.
- **Later, with ADM-03**: a dashed card holding the place for balance and frozen flag, usage against every
  limit, errors, failed SMS and bookings, last sign-in, tickets, payments awaiting review. **Recent operator
  actions** likewise waits for ADM-08's read endpoint.

## 5. Plans and prices (`/plans`)

A matrix: a row per plan (name, version, for-sale flag, two headline limits), a column per live billing term
(hidden terms marked), each cell a price input that saves on blur or Enter (`PUT
/operator/plans/:id/prices/:termId`, TRM-03; a cleared cell deletes the price, meaning "not offered for this
term", TRM-13). Not-for-sale plans are faded with their cells disabled. The footer states the rank rule
(PLN-16) and the delete rule (PLN-08).

**Plan editor** (drawer, `/plans/:slug`): name and rank, description, the for-sale switch, the ten limits as
rows with a value and an "unlimited" tick (PLN-19; retention has no tick), feature flags as chips with
strike-through for off, the version line ("v3 recorded 29 Sept · products 800 → 1,000"), and "Save as v4"
with the sentence that existing shops keep their version (PLN-02/06). Delete is disabled with the reference
count while any shop references the plan.

## 6. Billing terms (`/billing-terms`)

A table: term with its Bangla label, months, a visible switch that saves at once (`PATCH`), the pre-fill
discount, how many plans have a price for it, Edit and Retire. A single-tenant term carries a "one shop"
chip (TRM-14). Retired terms stay, faded, with the date and how many invoices keep them; delete is offered
only for an unreferenced term (TRM-05). New term and Edit open a drawer with the same fields.

## 7. Rates (`/rates`)

One row per rate with its name, unit in words, effective-from, the value large in monospace, Change and
History. Change edits inline in the row (`PATCH /operator/rates/:key`, two decimals, RAT-08); the row then
offers the rate-change notice (RAT-09), marked "later" until notices exist. History expands under the row
from `/operator/rates/:key/history`: old → new, when, who, notice or none.

## 8. Settings (`/settings`)

Two groups from `/operator/settings`: **Trial and top-up** (trial days, top-up minimum and maximum, BAL-04)
and **Lifecycle after a period ends** (grace, read-only, locked, archived days, LIF-26), each row with its
description from the server, the last change, and inline Change. A side card draws the timeline the current
values produce, so a change is checked against its effect before saving.

## 9. Platform wallets (`/wallets`)

A table of provider, number, label, a shown switch (`enabled`, BIL-02), order, Edit, Remove; one note that
sellers see these rows exactly as listed. Gateway credentials wait for the hosted payment page.

## 10. Account (`/account`)

Backup-code regeneration with password and a fresh code (`POST /auth/operator/backup-codes/regenerate`),
the session row with Sign out, and the ADM-18 sentence.

---

## 11. Backend additions this design needs

| Need | Where | Why |
| --- | --- | --- |
| `shopName` and `slug` on payment-queue rows | payments | The queue shows tenant ids only today; an operator matches by shop name. |
| `GET /operator/tenants/:id` | tenancy | The detail page reloads by id; `findSummary` exists in the store but has no route. |
| Unused backup-code count | operator auth | The account page states "7 of 10 unused". |
| Price count per term | billing terms | "3 of 4 plans priced" on the terms table; derivable client-side from every plan's prices meanwhile. |
| ADM-03 detail, ADM-08 platform audit read, notices (RAT-09) | later phases | Placeholders are drawn, nothing more. |

## 12. Mapping onto `apps/operator`

| Screen | Route | View |
| --- | --- | --- |
| Sign-in | `/sign-in` | `views/sign-in` (credentials, enroll, backup-codes, verify steps) |
| Payment queue | `/queue` | `views/queue` (+ `summary.tsx`, `payment-card.tsx`, `reject-drawer.tsx`) |
| Tenants | `/tenants`, `/tenants/$slug` | `views/tenants` (list), `views/tenant` (+ `suspend-drawer.tsx`, `adjust-drawer.tsx`, `assign-drawer.tsx`, `override-drawer.tsx`, `overrides-card.tsx`) |
| Plans and prices | `/plans`, `/plans/$slug` | `views/plans` (+ `price-matrix.tsx`, `plan-editor.tsx`) |
| Billing terms | `/billing-terms` | `views/billing-terms` (+ `term-drawer.tsx`) |
| Rates | `/rates` | `views/rates` (+ `rate-row.tsx`) |
| Settings | `/settings` | `views/settings` (+ `timeline-card.tsx`) |
| Platform wallets | `/wallets` | `views/wallets` (+ `wallet-drawer.tsx`) |
| Account | `/account` | `views/account` |

`components/ui/drawer.tsx` (bottom sheet under 640 px, side panel above) and `components/ui/table.tsx`
(table above 640 px, stacked cards below, driven by one column list) are the two primitives every screen
shares.
