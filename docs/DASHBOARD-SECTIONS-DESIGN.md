# Tenant dashboard: the Phase 1–2 sections

> **Superseded 2026-10-20** by `TENANT-DASHBOARD-DESIGN.md` and `docs/brand/lytro-dashboard.html`, which re-design the whole dashboard. This document is kept for the endpoint notes and the backend additions in §9; its screens are no longer the target.

The screens a seller opens from **More** once the shop exists: Plan, Balance, Invoices, Team, Activity, Shop
settings, Sign-in and security. Designed 2026-10-19 from `SRS-detailed.md` and the endpoints the server
exposes today (`API-CONTRACT.md` §2, 3, 8, 9, 11), the way `ONBOARDING-FLOW-DESIGN.md` was: each screen starts
from the seller's job on it, not from the endpoint list, and nothing the backend cannot return is drawn.
The interactive sketch is `docs/brand/lytro-dashboard-sections.html` (phone first, Bangla with the EN
toggle, every state switchable). The old `apps/admin` screens were not consulted.

Shell, copy rules and responsive rules are those of `ONBOARDING-FLOW-DESIGN.md` §3, §4 and §4a. This
document adds the rules below.

**Three rules that shape every section**

1. **The number first, then the one thing to do.** Balance opens with the amount and Top up; Plan with the
   days left and Renew; Team with seats used and Add staff. Secondary actions sit under a disclosure or in
   the row.
2. **Sheets, not pages, for actions.** Top-up, upgrade, downgrade, add staff, edit role, reject, suspend are
   bottom sheets on phones and a 480 px side panel from 640 px. The list behind them stays in place, so the
   seller never loses where they were.
3. **Say what will happen and when.** Every change that takes effect later names the date ("Moving to
   Starter on 9 Nov"); every charge names the amount before the button ("Pay ৳1,009 from balance").

---

## 1. More (`/<slug>/more`)

A grouped menu, not a flat list: **Billing** (Plan, Balance, Invoices), **Shop** (Shop settings, Team,
Activity), **You** (Sign-in and security, Language, Help, Sign out). Each row carries one line of live
context from `/me`, `/balance`, `/staff` and `/billing/invoices`: the plan and renewal date, the balance, the
seat count, so the seller sees the state without opening anything. Rows a staff member lacks the permission
for are hidden, never disabled (STF-11). "Powered by Lytro" at the foot (TEN-18); no "create another shop"
(TEN-15).

## 2. Balance (`/<slug>/balance`)

**Job:** how much is there, what is eating it, top it up.

- **Hero card** (teal gradient): the amount with paisa small, the free-SMS allowance for the month as a bar
  (`/balance/essential-sms`, AUTH-21), the marigold **Top up** button, a "Current rates" link. Frozen state
  (`frozen: true`, BAL-08): the card turns neutral, a "Frozen" chip, the top-up button disappears, one line
  says why and what reopens it (LIF-15). A top-up awaiting review shows a warning line above the statement.
- **Statement** (`/balance/ledger`, BAL-14): grouped by day; each row has an icon by type, a title, a
  detail line built from `units × rateUsed` and the `reference` (order id for an SMS, TrxID for a top-up,
  the invoice for a plan payment), the signed amount coloured only when positive, and "after ৳…" small
  under it. Filter chips by type (All, Top-ups, SMS, Chat AI, Fees, Plan), a Dates button that opens a
  sheet, CSV download (`/balance/ledger/export`), "Show earlier" for the next cursor page. Paisa is shown
  whenever it is non-zero (BRAND-IDENTITY §5).
- **Current rates** (`/balance/current-rates`, RAT-06): a side card from 900 px, below the statement on
  phones. One row per rate with its unit in words ("per 70-character part"), and the effective-from line.
- **Top-up sheet** (BAL-03/04, BIL-03), three steps with a stepper: amount with quick chips (৳200, ৳500,
  ৳1,000, ৳2,000) and a line of what it buys at today's rates; then the platform's wallet numbers
  (`/platform-wallets`) with sender number and TrxID; then "৳500 is being checked", one sentence on when it
  lands. `POST /balance/top-up/quote` then `/confirm`. Needs `balance:manage`; others see the hero without
  the button.

## 3. Plan (`/<slug>/plan`)

**Job:** what am I on, when does it renew, what do I pay next; change it with the consequences spelled out.

- **Banners first**, one at a time: a scheduled downgrade or pay-as-you-go switch (`/billing/downgrade`,
  DWN-02) with its date and the over-limit count and a "Keep Growth" button; a pending cancellation
  (`/billing/cancellation`) with what follows and Undo; a locked or archived shop with the day count and
  the one sentence that it reopens within a minute of renewal (LIF-15).
- **Your plan card**: name and state chip, the term, three figures: days left (TRL-08), the next payment
  with its date, the headline limit against usage. Then the primary action for the state: Renew for ৳…
  (active, grace, locked), Pick a plan (trial), Take Starter (pay-as-you-go), Keep the plan (cancelled).
  "See invoices" beside it. Under a rule, the **auto-renew** switch with one line naming the date and amount
  (BIL-17).
- **Change plan**: the term chips (`/billing-terms`, TRM-12, "Yearly · 12% off") and a horizontal snap row
  of plan cards on phones, a grid from 900 px (`/plans`, `/plans/:id/prices`). Each card: price, the
  monthly equivalent for longer terms, three limits, and the one action its rank allows: "Upgrade now ·
  ৳1,009 due" (the quote is fetched when the card is opened, UPG-04), "Move down at period end", "You are
  here". The **pay-as-you-go card** is dashed and shows the fee rates from `/balance/current-rates`
  (PYG-01); its action is "Switch at period end" or, from trial, "Choose".
- **Upgrade sheet** (UPG-03/06/16): the new price, the credit line in green with the unused days counted,
  the amount due large, one line on when it starts, then "Pay ৳… from balance" with the available balance
  on the button, or the wallet numbers. The 15-minute validity and the no-refund line are the last text.
- **Downgrade sheet** (DWN-01/03): the effective date in the first sentence, the over-limit list from
  `/billing/downgrade/preview` in marigold rows ("Products 340 / 100"), one sentence per consequence
  (existing products keep selling; the owner picks who stays active, nobody deleted), the new price, "Move
  down on 9 Nov".
- **Stop the subscription** is a disclosure at the foot, never a card: one paragraph on what follows the
  period end and a red "Cancel at period end". A pay-as-you-go owner sees "Close the shop" instead
  (PYG-09, owner only); both confirm in a dialog that names the shop.

## 4. Invoices (`/<slug>/invoices`)

A list (number, plan, date, term, payment method, amount) and, on tap, the invoice: issued and period dates,
plan and version, price, discount, credit, paid by, billed to, and the limits snapshot under a disclosure
(BIL-12, UPG-15, TRM-15). An invoice from a deleted earlier shop carries the "Earlier shop" chip (BIL-13).
From 900 px the detail sits beside the list. Download as PDF is marked "later": no endpoint renders one yet.

## 5. Team (`/<slug>/team`, `/<slug>/team/roles`)

One screen, two segments: **People** and **Roles**. Staff and roles are one job for the owner, so they are
not two entries in More.

- **Seats** card: "3 of 5 seats used, owner included" with a bar (`/staff` seats, STF-02). Full: the bar
  turns marigold and one line offers the two ways out: deactivate someone or upgrade.
- **People**: the owner pinned first with an "Owner" chip and "every permission"; each staff row has the
  initial, name or phone, the phone, role chips; a deactivated person is faded with an "Off" chip and the
  note that the seat is free. Tap opens the sheet. One footer line: nobody is ever deleted (STF-03).
- **Staff sheet**: add mode has the phone with the fixed +880, optional name, and a generated first password
  the owner reads out, with the line that it must be changed at first sign-in (AUTH-19, STF-13); edit mode
  has the active switch with its consequence ("ends her sessions now and frees the seat") and Reset
  password. Both end with the roles as a checklist of cards that show what each role allows, and "Create a
  role".
- **Roles**: cards with name, holder count and permission chips; from 900 px the editor sits beside the
  list, on phones it is a sheet. The editor lists the permissions as plain sentences with a sub-line where
  the consequence matters ("Spends the balance"). Delete is disabled with the holder count while anyone
  holds the role (STF-09). A footer line says changes apply on the next tap (STF-10) and names the
  permissions that arrive with later sections.

## 6. Activity (`/<slug>/activity`)

**Job:** who did what, fast. A timeline grouped by day; each entry is one sentence built from actor, action
and target ("শরিফুল স্টাফ যোগ করেছেন কামাল"), with a detail line from `summary` when it has one, the time
at the right, and a red avatar plus a chip only when `result` is failure. The platform's own actions show
as "Lytro support" or "System" (AUD-08, ActorType). Filters: a scrolling chip row of actors, a chip row of
action groups (Sign-ins, Staff and roles, Money, Failed only), a Dates button. The sub-line names the
retention the plan gives (AUD-06, AUD-07). "Show earlier" pages by cursor.

## 7. Shop settings (`/<slug>/settings`)

Grouped cards, each with its own Save: **Contact** (support phone, email, address, TEN-30: shown in the
storefront footer and contact page), **Delivery** (the two zone charges from set-up shown read-only until
their editor ships, and the extra-per-kg rate, RAT-14, with its one-sentence rule), and a **Shop** card
listing name, address and type with the line that branding arrives with its section. A toast confirms a
save.

## 8. Sign-in and security (`/<slug>/account`)

The identities on the account as rows with the provider's mark (phone, Google, email, Facebook; AUTH-26),
each with its action: Change password on the phone row, Remove on a second identity, Add or Connect on a
missing one. The recovery note (AUTH-27) under the list. The add-email form sits beside the list from
900 px (`/me/identities/code` then `/verify`); Google and Facebook connect through
`/me/identities/oauth/:provider/start`.

---

## 9. Backend additions this design needs

Small, each one a field or a read; none is faked in the UI until it exists.

| Need | Where | Why |
| --- | --- | --- |
| `autoRenewEnabled` on `/me`'s tenant | billing | The auto-renew switch has no read today; it can only write (`POST /billing/auto-renew`). |
| Top-up bounds on `GET /balance` (`topUpMin`, `topUpMax`) | balance | BAL-04's bounds are only revealed by a refused quote. |
| `periodStart` and `periodEnd` on the upgrade quote | billing | UPG-06 asks the quote to show the new dates; `PlanPayment` carries amounts only. |
| `mustSetPassword` on each `/staff` row | staff | The People list should say who has not finished their first sign-in (STF-13). |
| Invoice PDF | billing | BIL-13 says downloadable; the list is JSON only. |
| Pay-as-you-go cost estimate | billing | PYG-12; the card shows rates, not an estimate, until an endpoint exists. |

## 10. Mapping onto `apps/dashboard`

| Screen | Route | View | Hooks |
| --- | --- | --- | --- |
| More | `/$shop/more` | `views/more` | `useMe`, `useBalance`, `useStaffList`, `useInvoices` |
| Balance, Top-up sheet | `/$shop/balance` | `views/balance` (+ `top-up-sheet.tsx`, `statement.tsx`, `rates-card.tsx`) | `api/balance`, `usePlatformWallets` |
| Plan, Upgrade and Downgrade sheets | `/$shop/plan` | `views/plan` (+ `plan-card.tsx`, `upgrade-sheet.tsx`, `downgrade-sheet.tsx`) | `api/billing` |
| Invoices | `/$shop/invoices` | `views/invoices` | `useInvoices` |
| Team | `/$shop/team`, `/$shop/team/roles` | `views/team` (+ `people.tsx`, `staff-sheet.tsx`, `roles.tsx`, `role-editor.tsx`) | `api/staff` |
| Activity | `/$shop/activity` | `views/activity` | `useActivityList` |
| Shop settings | `/$shop/settings` | `views/settings` | `api/shop-settings` |
| Sign-in and security | `/$shop/account` | `views/account` | `api/identities` |

`components/ui/sheet.tsx` is the one bottom-sheet-or-side-panel primitive every action above uses.
