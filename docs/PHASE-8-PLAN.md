# Phase 8 plan: the operator's tooling

Status: agreed 2026-11-07. D8-1 to D8-6 were settled with the owner that day. D8-7 to D8-20 follow from them or from
existing requirements, and are raised with this plan, so the owner can overrule any of them. Builds on
`IMPLEMENTATION-PLAN.md` Phase 8, with these changes:

- **This release builds the operator's tooling only** (D8-1). The shop API for developers (secret keys, scopes, IP
  allow-lists, webhooks out, the published OpenAPI description, bulk orders), support tickets, the help centre and the
  status page move to the next release, with the requirements earlier phases sent here for them (§3.3).
- **View-as-tenant moves to the next release** (D8-2). The operator reads a shop's figures on its console page instead.
- **A shop's errors are recorded**, and every response carries a request ID (D8-3), so a seller can read one out over
  WhatsApp, which is how shops reach Lytro at launch (D8-4).
- **Server first, screens last**, and **beside Phase 7** (D8-6).

Requirement IDs refer to `SRS-detailed.md` §23 (ADM, SUP), §21 (API-27), §13 (MED-12), §19 (WAL-18) and §20 (SMS-18).
Schema refers to `DATABASE-SCHEMA.md` §2, §3 and §11, which each slice brings in line with §4 of this plan.

Reopening a decision in §2 needs an explicit change to its row, not a silent deviation during a slice. The points §2.1
leaves to a slice's read are settled there, each with its own answer.

---

## 1. Goal and exit criteria

**Goal.** The operator can find any shop, see what's wrong with it and what it's worth, act on it with a reason that
stays on record, take a payment made outside the normal flow, and read the business's revenue and its heaviest users.

**What already exists** (the survey, 2026-11-07, `main` at 60507e8c): the console's frame and sign-in, the shop list
by name or address, a shop's plan and period, suspend and restore (the shop and its payment page), balance adjustments,
limit overrides, the payment queue (ADM-06), Lytro's wallets (ADM-10's wallets), platform settings (ADM-11), page
reports (ADM-12), plans, terms, rates, add-ons, shop types, couriers and Lytro's listener phones: 79 operator routes.
The platform audit log is written but never listed. The break-glass 2FA reset (ADM-18) is a command-line script.

**Phase 8 is complete when all of these hold:**

1. Every requirement in §3.1 has a passing automated test, or, for `MAN` requirements, a recorded manual check.
2. **A manual entry is the automatic path, not a copy of it:** a plan purchase, renewal, upgrade or top-up recorded by the
   operator gives the same ledger entries, plan snapshot and invoice as the queue's approval (ADM-14); a transaction ID
   is used once platform-wide; a mistake is corrected only by a reversing entry (ADM-15).
3. **The golden path** passes as one test: a seller pays Lytro outside the flow → the operator records it with evidence
   and a reason → the plan is active, the invoice issued, the shop's activity log shows it and its owner is told → it
   appears in the operator's list of entries and in that month's revenue report.
4. **Nothing crosses shops:** the shop page reads one shop inside its own row-level security; reports read Lytro's own
   tables and figures recorded per shop; no database role that skips row-level security is added (D8-9).
5. **Every operator action carries a reason and an audit entry**, and the audit log can only be read, never changed
   (ADM-04, ADM-08).
6. **A shop's deleted data is gone and its account and billing records stay** (ADM-13), after a typed confirmation.
7. **An error a seller hits can be found:** its request ID is on the response, and the same ID is on the shop's page.
8. CI is green on `main`, and the pull-request flow has been used for every slice.

---

## 2. Decisions

**D8-1 to D8-6 agreed 2026-11-07** (the Phase 8 read).

| # | Decision | Decided | Affects |
|---|---|---|---|
| D8-1 | **Scope.** `IMPLEMENTATION-PLAN.md` gives Phase 8 the console, support and the shop API. | **The operator's tooling only:** ADM-02 to ADM-04, ADM-08, ADM-09, ADM-13 to ADM-17, MED-12, WAL-18's retiring of a type and SMS-18. Out, for the next release: the shop API, support tickets (SUP-02, SUP-04 to SUP-06), the help centre (SUP-03) and the status page (SUP-07). §3.3 lists them. | the whole phase |
| D8-2 | **View-as-tenant** (ADM-05). It needs a third kind of session and the shop's approval by banner, push and SMS. | **Next release.** The operator reads the shop's figures on its console page (D8-8), which needs no approval. | Slice 8.2 |
| D8-3 | **A shop's errors** (ADM-03). The server keeps no record of errors per shop. | Each server error a shop's request hits is kept for **7 days**: the route, the error code and a request ID. Every response carries `X-Request-Id` (API-27), and the shop page counts the last 24 hours' errors and lists the latest. | Slices 8.1, 8.2 |
| D8-4 | **How a shop reaches Lytro at launch**, with tickets out. | The dashboard's help menu shows Lytro's **WhatsApp and phone**, which the operator sets in Settings. The WhatsApp message opens already holding the shop's address, so the operator knows who's writing. | Slices 8.7, 8.8 |
| D8-5 | **Resetting an owner's sign-in** (ADM-04), for an owner who lost their phone or password. | Signs the owner out on every device and sends a reset code by SMS to the phone the owner gives the operator, after the operator has checked it's them. A changed phone is recorded with a reason. The operator never sees or sets a password. Audited in both logs. | Slice 8.3 |
| D8-6 | **When.** Phase 7's 7.3, 7.4 and 7.7 are being built in other sessions. | Phase 8 is built now, beside them, in its own session, one slice at a time; this plan first, as a docs PR. Slices that tell someone (8.5's notice and digest, 8.6's alert) need Slice 7.3, merged the same day (#323). The console's screens are sketched and built in one pass at the end (8.8). | the whole phase |

**D8-7 to D8-20 follow from those or from existing requirements.** They weren't asked in the read, so the owner can
overrule any of them when reviewing this plan.

| # | Decision | Decided | Affects |
|---|---|---|---|
| D8-7 | **Finding a shop** (ADM-02). Today the list searches name and address only, newest first. | Search by shop name, address or the owner's phone (in any written form). Filter by state and plan. Sort newest, by name or by period end. Pages stay keyset pages, as today, one per sort. | Slice 8.2 |
| D8-8 | **The shop page** (ADM-03). | Adds the balance and its frozen flag, usage against every limit, errors (D8-3), failed SMS (the shop's own log and Lytro's own SMS to it), failed courier calls, the last sign-in, payments awaiting review, and the business summary: the same delivered-only sales figures the seller sees (STA-01, Saturday weeks) and order counts by status. Read inside that one shop's row-level security. The failed-webhooks and open-tickets rows come with the next release (D8-1). | Slice 8.2 |
| D8-9 | **Figures across shops** (ADM-09's top consumers, WAL-20's fees). Shop tables sit behind row-level security, and no role skips it (TEN-24). | No such role is added. A nightly job records each shop's day (storage, SMS units, verification fees, orders and sales) in a Lytro table, read by the reports. Revenue comes straight from Lytro's own payments and invoices. | Slice 8.4 |
| D8-10 | **Reports** (ADM-09). | Shops by state and by plan. Revenue by week (Saturday weeks, Asia/Dhaka, as STA-01), month, quarter or year: plan purchases, renewals, upgrades, add-ons, top-ups and WAL-20's verification fees, with manual entries shown apart. Top consumers of storage, bandwidth and SMS. Each as a CSV. ADM-16's monthly reconciliation is this report's month. | Slice 8.4 |
| D8-11 | **The platform audit log** (ADM-08). Written since Phase 2, never listed. | A list with filters (shop, actor, action, date), newest first, in keyset pages, with no route that edits or deletes. The console's "recent changes" stays a short view of it. | Slice 8.4 |
| D8-12 | **Extending a plan** (ADM-04). Only "assign a plan", which restarts the period, exists. | Adds whole days to the current period's end, with a reason, audited in both logs. Whether a trial can be extended this way is settled in the slice's read. | Slice 8.3 |
| D8-13 | **Deleting a shop's data on request** (ADM-13). LIF-19's deletion runs only on day 60 of an archive. | The operator types the shop's address to confirm and gives a reason; LIF-19's same steps then run for that shop as a job, and the account and billing records stay. It can't be undone, and the confirmation says so. | Slice 8.3 |
| D8-14 | **Manual entries** (ADM-14, ADM-15). | One path: an entry activates through the same code as the queue's approval, never a second copy. The evidence (a screenshot or a statement line) is kept privately, for the operator only. The transaction ID is checked against every one Lytro has used. Over 10,000 TK, or past 10 entries in a day, the amount is typed again. Entries are never changed; a reversing entry with a reason corrects one. The shop sees each in its activity log and is told (after Slice 7.3). | Slice 8.5 |
| D8-15 | **A shop's "I have paid" claim** (ADM-17). The seller's submission (transaction ID, sender, amount) already enters the queue. | It gains the screenshot, kept as D8-14's evidence is, and still credits nothing by itself. | Slice 8.5 |
| D8-16 | **The daily digest** (ADM-16). | Overruled by D8-53: no digest and no email. | Slice 8.5 |
| D8-17 | **Media costs** (MED-12, KNOWN-GAPS §101). Worker requests and bytes are counted; R2's own operations aren't. | Each month's R2 operations, Worker requests and the shops that use most, against a monthly budget the operator sets, with an email to the operators at 80%. Where R2's operation counts come from (Lytro's own calls or Cloudflare's analytics) is settled in the slice's read. | Slice 8.6 |
| D8-18 | **Retiring a wallet type** (WAL-18, moved here by Phase 5). The types are a list in the code. | The couriers' pattern (CRR-23, CRR-24): retiring hides a type from new setup while shops using it keep it, undoing is allowed, and removing needs no shop to use it. | Slice 8.7 |
| D8-19 | **The shop-ready SMS** (SMS-18). It goes out today in English ("Your shop is ready: …"). | Worded in Bangla to the owner's style guide in the slice's read, still Lytro's cost (D7-23), and proven through the real SMS path. | Slice 8.7 |
| D8-20 | **A gateway for Lytro's own payments** (ADM-10's other half). Phase 5 left it for later (D5-3). | Still later. Lytro's own payments come by its wallets and its listener phones. **Overtaken 2026-11-09** by the owner's decision on Lytro's own payment methods (#336, #337): Lytro's payment page takes bKash's gateway, with keys the operator manages (ADM-10, amended). | none |
| D8-21 | **The request ID's form** (Slice 8.1's read, 2026-11-07). A seller may read one out over WhatsApp. | Eight characters in two halves, like `K7MQ-4XR2`, from letters and digits that can't be mistaken for each other (no 0 or O, no 1, I or L), made by Lytro for every request; one a client sends is never used. The dashboard's error message shows it (Slice 8.8). | Slices 8.1, 8.8 |
| D8-22 | **Which errors are kept** (the read). | Server faults only: an unexpected fault (500) and a 503 when something Lytro depends on is down. A refusal (a bad field, a limit, a missing permission) is an answer the seller already sees explained, and isn't kept. A fault before the shop is known (signing in) is logged, not kept. | Slice 8.1 |
| D8-23 | **What a kept error holds** (the read). A database's own text can hold a customer's phone or address. | The route's pattern (`/api/v1/orders/:id`), the method, the status, the error's kind (its class, with the database's own code when it has one, or a 503's message key) and the request ID. The message and stack go only to the server log, under the same ID. | Slice 8.1 |
| D8-24 | **The owner's phone in the search** (Slice 8.2's read, 2026-11-08). An operator is often given part of a number, or one written with +880 and spaces. | A search typed as a Bangladeshi mobile number in any written form (+880, 880, spaces, dashes) matches that number; 6 to 10 digits match the end of one, so a few shops can match, and all of them are listed. It is the owner's sign-in phone, which each row shows. | Slice 8.2 |
| D8-25 | **What the shop page loads** (the read). | It opens with each row's figure, and the lists behind them load when their card is opened. The errors count covers 24 hours (ADM-03); the failed SMS and failed courier calls cover 7 days, as long as errors are kept; each list reaches as far back as its own log does. | Slices 8.2, 8.8 |
| D8-26 | **A failed courier call** (from D8-8 and MON-05). | A call in the shop's courier key log (SEC-11) that failed or that the courier refused, counted the moment it is logged. A call the courier's open circuit stops is never made, so it isn't counted (KNOWN-GAPS §133). | Slice 8.2 |
| D8-27 | **The last sign-in** (the read). | The owner and each active staff member, with when each last opened a session in the shop, or never. Read from the sessions, which are revoked and never deleted, and matched by account, since a staff member's sign-in by code names no staff user on its session. | Slice 8.2 |
| D8-28 | **Payments awaiting review** (the read). | The seller's payments to Lytro waiting in the operator's queue, counted with their total and listed as the queue lists them; and a count of the shop's customers' payments waiting for the seller, never their amounts or senders. | Slice 8.2 |
| D8-29 | **The business summary** (from D8-8 and ADM-03). | The seller's own sales figures (STA-01) for any period the seller could choose, read by the same code, with revenue and counts and never cost or profit; and the orders counted by the status the seller's list shows them in. | Slice 8.2 |
| D8-30 | **SMS that didn't go** (from D8-8). Lytro's outbox recorded no shop, and the shop's own log holds its customers' phones and the words sent them. | The shop's own SMS that failed or were blocked, each with its kind, outcome, reason, order number and time, never the customer's phone or the words. Lytro's own messages that failed for good: those naming the shop (shop ready, a lifecycle notice, a shopper's code), which now record it (migration 0121), and the sign-in codes sent to its team's phones, since a code names a person and is sent before any shop is chosen. Messages from before this slice name no shop, so only their codes are found. | Slice 8.2 |
| D8-31 | **Usage on the shop page** (from D8-8). | Each limit's use as the seller's usage page reads it, by the same code, without the shop's suggestions or pack offers. | Slice 8.2 |
| D8-32 | **The most days at once** (Slice 8.3's read, 2026-11-08). | 30. More needs a second extension with its own reason; the cap guards against a typo. | Slice 8.3 |
| D8-33 | **Which shops can be extended** (the read). D8-12 left trials open. | A shop on a plan, and a trial, which stays a trial. A lapsed shop (grace, read-only, locked or archived) comes back to active with its balance unfrozen, as a payment brings it back (LIF-15); one the operator also suspended stays frozen until it is restored (LIF-24). A shop with no period end, pay-as-you-go or a no-expiry plan, is refused, as are days that would still end in the past, where the operator assigns a plan instead. | Slice 8.3 |
| D8-34 | **Add-ons that end with the plan** (the read). | They move with it, free like the days, so the shop keeps what it had. An add-on with its own end keeps it, and one already lapsed stays lapsed. | Slice 8.3 |
| D8-35 | **A change scheduled for the period's end** (from D8-12). A downgrade or a switch to pay-as-you-go is stored with its date. | It moves to the new end, since it was asked for at the end of the period. | Slice 8.3 |
| D8-36 | **The owner's new phone** (the read). | Once the operator has checked it's them, the phone they gave replaces the account's at once, so a lost one can't sign in again, and every session of the account ends, wherever it signed in. The same phone just signs out and sends a code. A phone on another Lytro account is refused. The platform's log keeps both numbers; the shop's activity log shows only the new one's last digits. | Slice 8.3 |
| D8-37 | **Deleting a shop's data on request** (the read). D8-13 left a suspension open. | No suspension first: the typed address and the reason are the guard. The shop goes offline at once, as archived, which LIF-19's erasing rules need, and a job runs the same steps as the day-60 deletion. Until the job runs, an extension can bring the shop back, and the job then leaves it alone. | Slice 8.3 |
| D8-38 | **What the reset code costs** (from D8-5). | Lytro's own cost, as an owner's reset always is, and not counted against the operator's address. | Slice 8.3 |
| D8-39 | **LIF-19's Phase 7 tables** (found by Slice 8.3's survey). The deletion had no step for the SMS log and settings, fraud checks and rule, or reads of pasted delivery details, and the app's role could not delete them. | The deletion now takes them, for the day-60 job and on request alike. A guard lets a row go only with its shop, named as being erased and archived or deleted, so the append-only logs stay append-only otherwise. | Slice 8.3 |
| D8-40 | **What "revenue" means** (Slice 8.4's read, 2026-11-08, the owner's pick). Money reaches Lytro by its wallets or is spent later from a shop's balance, so counting top-ups and spending together would count a taka twice. | **What was earned:** plans and add-ons paid to Lytro's wallets (verified, with a transaction ID), plus what shops spent from their balances by kind (plans and add-ons paid from it, SMS, verification fees, order and product fees, reads, fraud checks), less reversals. A top-up isn't earned until it's spent. It won't match the wallets' statements; that's accepted. Amends D8-10 and ADM-09. | Slice 8.4 |
| D8-41 | **Shop counts** (the read). | Today's by state and by plan, pay-as-you-go as its own line (ADM-09, PYG-13), and for each period the shops opened, those that first paid for a plan, and those that moved into a lapsed state. The movements into a lapsed state read the nightly record, so they start the day this ships. | Slice 8.4 |
| D8-42 | **The top consumers' phones** (the owner's pick). | Each shop in the list and its CSV carries its owner's phone, so the operator can call a heavy user. | Slice 8.4 |
| D8-43 | **The night's run** (settles §2.1). | At 02:30 Dhaka it records every shop's days up to yesterday that are missing, up to 7 back, never before the shop opened. A state, plan or storage filled in for a missed night is the one found then. One shop's failure never stops the others. | Slice 8.4 |
| D8-44 | **What a shop's day holds** (narrows D8-9). | State, plan, storage, SMS units, spending by kind and what was given back. Orders and sales are left out, since no report reads them and the shop page reads them live. | Slice 8.4 |
| D8-45 | **How far back the reports reach** (settles §2.1). | Payments and shops opened reach as far as they exist. Balance spending, SMS, storage and lapses reach to the first recorded day, which the revenue report names (`recordedSince`). An operator's adjustment and a deleted shop's carried-over balance aren't earnings. | Slice 8.4 |
| D8-46 | **The CSVs** (settles §2.1). | A `.../export` route beside each report, the same figures, one row a period (or shop) and a total, marked UTF-8 for spreadsheets, named `lytro-revenue-2026-11-01-to-2026-11-30-month.csv`. The top consumers list 20 shops. | Slice 8.4 |
| D8-47 | **Where evidence is kept** (settles §2.1; the owner's pick over keeping it for good). | A private R2 bucket (`MEDIA_EVIDENCE_BUCKET`) the public Worker has no access to. Only JPG, PNG, WebP or PDF up to 5 MB, judged by the file's own bytes. The operator opens one by a link lasting five minutes. A nightly job at 04:10 Dhaka removes files after 2 years; the row stays, and says so. | Slice 8.5 |
| D8-48 | **What reversing a plan entry undoes** (settles §2.1). | The shop goes back as it stood: plan, period, state, lapse schedule, a frozen balance, and a scheduled downgrade the entry cancelled. My call: refused once the shop's plan or period has changed since, which covers a later payment, a plan extension and a downgrade alike. | Slice 8.5 |
| D8-49 | **The invoice of a reversed entry.** | A numbered credit note with a negative amount names the original, which is not touched. An upgrade's credit no longer counts the time that invoice paid for. | Slice 8.5 |
| D8-50 | **Reversing a top-up already spent.** | It comes back in full, the balance going below zero if need be, and from a frozen balance too: the money never arrived. | Slice 8.5 |
| D8-51 | **The amount.** | A plan or upgrade is at the price the server works out that day, refused if the operator was shown another. If the money differs, it is recorded as a top-up and the plan paid from the balance. A top-up is what arrived: the seller's minimum and maximum don't apply (my call), but a lapsed shop's frozen balance still refuses it. | Slice 8.5 |
| D8-52 | **Add-ons on a recorded renewal.** | Carried as a seller's renewal carries them, in the amount shown first (`POST .../preview`); reversing the entry ends them. | Slice 8.5 |
| D8-53 | **No daily digest** (ADM-16; the owner: no email). | No job and no email. The list of entries by day, operator and shop (D8-55) and the audit log stand in its place, and the month's revenue report shows entries apart. Overrules D8-16. | Slice 8.5 |
| D8-54 | **A seller's screenshot is optional** (ADM-17). | Most wallet payments now match a receipt by themselves, so no one is stopped on a phone for one. The operator sees it in the queue when there is one. | Slice 8.5 |
| D8-55 | **The list of entries.** | `GET /operator/manual-entries`: every entry and reversal, newest first, by shop, operator and day, with what reversed it. | Slice 8.5 |
| D8-56 | **A transaction ID after a reversal.** | Another manual entry may use it, so a payment recorded against the wrong shop can be recorded properly. A seller's "I have paid" or an incoming receipt still finds it used. | Slice 8.5 |
| D8-57 | **Where R2's figures come from** (MED-12; the owner's pick, 2026-11-10). | Cloudflare's own analytics, read each hour through its GraphQL API with the token the media edge already uses (Account Analytics: Read): the period's days not yet recorded and the last three again, each bucket a UTC day, kept in `control.media_cost_days` because Cloudflare keeps about 31 days. Never counted from Lytro's own calls. | Slice 8.6 |
| D8-58 | **The budget** (the owner's pick). | $10 a month by default, in whole US dollars because Cloudflare bills in them, the alert at 80%: both platform settings the operator changes. | Slice 8.6 |
| D8-59 | **What the budget covers** (the owner's pick). | The whole R2 bill: every bucket on the account, shown bucket by bucket, so payment screenshots (D8-47) have their own line and the total can be held against the invoice. | Slice 8.6 |
| D8-60 | **Cloudflare's prices.** | One platform setting with R2's and Workers' prices and monthly allowances, defaults checked against Cloudflare's pricing pages on 2026-11-10. Usage rounds up to the next whole unit before the allowance comes off (1,000,001 writes bill as one million past the free one); a GB-month is each day's peak storage over 30; a GB is 10^9 bytes. | Slice 8.6 |
| D8-61 | **Where the alert goes, and the billing period** (the address is the owner's pick). | One platform setting holds the alert's address, which may be an inbox that isn't an operator login; until it's set the alert is only logged. Operator accounts get no owner flag. The period starts on a billing day setting, 1 to 28, default 1, since Cloudflare's invoice follows the account's billing date. | Slice 8.6 |
| D8-62 | **Price classes.** | Cloudflare's own lists of Class A, Class B and free operations; one it doesn't list counts as Class A, the dearer, so the estimate never runs low for it. | Slice 8.6 |
| D8-63 | **The alert, once a period.** | After each hour's read, when the period's estimate reaches the alert's percent of the budget: one email in English through the mail outbox, recorded in `control.media_cost_alerts` so it never goes twice. | Slice 8.6 |
| D8-64 | **The Workers line and the top shops.** | The media Worker's requests the server already counts per shop (`control.media_bandwidth_daily`, Dhaka days) plus Workers' monthly charge; the ten shops with the most requests, with their bytes. Workers' CPU time, KV and Analytics Engine aren't counted. | Slice 8.6 |
| D8-65 | **What retiring a wallet type hides** (WAL-18, D8-18; Slice 8.7's read, 2026-11-10). | `control.payment_method_types` holds each type ever retired, in the couriers' states (one `RetireState` for both). Retiring hides the type from every shop that never set it up, which can't start it. A shop that set it up (switched it on, or saved an account for it) keeps it whole: checkout, its accounts, switching it on and off, and its way; the dashboard marks it retiring. Lytro's own payment page is left as the operator set it. | Slice 8.7 |
| D8-66 | **Who is told, and how.** | Each shop that set it up gets a line in its activity log and a notice to the owner, in the bell and by push, in Lytro's own Bangla and English. It can't be switched off, since payment accounts are the owner's (WAL-07). Undoing tells the same shops it is back. The operator's reason goes to the platform audit log only. Removal sends no notice: the retiring one says removal takes the accounts. | Slice 8.7 |
| D8-67 | **Removing a wallet type.** | Only a retiring type, and only once no shop has it on, no shopper's payment is open on it (awaiting payment with it chosen, checking, or waiting for a person) and Lytro's own page doesn't take it. A refusal gives the three. The type's row is held while the check runs, and every switch-on, a shop's or Lytro's own, reads it shared, so none slips past. Then every shop's accounts, switch and way for it go, with a line in its activity log; past payments keep what they were paid into (PAY-05). Removed is for good: no undo, gone from Lytro's own page too, and its code goes in a later change. Asked again, it finishes any shop left. | Slice 8.7 |
| D8-68 | **The help line's settings** (D8-4; the owner's answers, 2026-11-10). | Four platform settings: `help_whatsapp` and `help_phone`, each a mobile number in its local form and shown nowhere until set, and `help_opens_hour` and `help_closes_hour`, 0 to 23 in Dhaka, defaults 9 and 22, every day with no days of the week. `GET /help-line` gives them to anyone, with no session, cached five minutes. The help row shows to everyone on the shop's team. | Slice 8.7 |
| D8-69 | **One number everywhere** (the owner's answer). | Lytro's payment page reads the settings, WhatsApp from `help_whatsapp` and call from `help_phone`, either standing in for the other, and the server's `LYTRO_SUPPORT_PHONE` goes. The dashboard's `VITE_SUPPORT_WHATSAPP` and the website's `SUPPORT_WHATSAPP` and `SUPPORT_PHONE` go when Slice 8.8 moves their pages onto the route, each writing the hours in its own words, and the dashboard's WhatsApp message holding the shop's address (D8-4). | Slices 8.7, 8.8 |
| D8-70 | **The shop-ready SMS's words** (D8-19; the owner's pick). | "আপনার শপ {name} এখন লাইভ: {url}", with the name as typed and the full address. On a lytro.app address the words take 38 of a unit's 67 characters, so a name and its address of up to 29 together (a 14-letter name) go as one SMS (৳0.55), longer as two (৳1.10). Lytro's cost either way, outside the trial's allowance (AUTH-21). | Slice 8.7 |
| D8-71 | **The owner's six fixes to the running dashboard** (2026-11-10; Slice 8.8's read). | Built first, on their own, before this slice's sketch: every address, note and reason a box of several lines in the dashboard and the storefront; a long form's Save at its end too on a desktop; the money hub "ওয়ালেট"; a new attribute splitting the product unless it can't; "লো-স্টক অ্যালার্ট"; "সারা বাংলাদেশ" only when the shop's zones cover the country. A multi-line address reaches the courier with its lines joined by commas. The sketch draws the prototype to match. | PR #341 |
| D8-72 | **Categories by dragging** (the owner's proposal; agreed to sketch). | On a desktop, a category dropped on a row goes under it and one dropped between rows goes there, with a line showing where; a drop the rules refuse (past 4 levels, into itself or its own child) says why; the keyboard does the same. A phone keeps Move up and down and gains "Move to…". One server call moves a category and renumbers both its old and new siblings in one transaction. | Slice 8.8 |
| D8-73 | **The contact page's hours** (the owner's answer). | One line, every day, from the help line's two hours, with open now or closed now. The Friday line and the promise of WhatsApp at any hour for an urgent fault go. | Slice 8.8 |
| D8-74 | **The listener app's help number** (the owner's answer). | The app reads `GET /help-line` when it opens and keeps the number it was built with for when that fails. Phones get it with the next APK. | Slice 8.8 |
| D8-75 | **A bank transfer recorded by hand** (ADM-14; the owner's answer to the sketch, 2026-11-10). | A manual entry names one of Lytro's bank accounts instead of a wallet number, with the transfer's reference in place of a TrxID and no sender. A reference is used once, as a TrxID is. | Slice 8.8 |
| D8-76 | **Clearing a help number** (the owner's answer). | `help_whatsapp` and `help_phone` take an empty value, meaning not set, with a reason like any change; that button then goes from the dashboard, the website and Lytro's payment page. | Slice 8.8 |
| D8-77 | **The help line's hours** (the owner's answer). | The closing hour must be after the opening hour, every day: each hour is checked against the other's stored value, so hours never run past midnight. | Slice 8.8 |
| D8-78 | **The word for a retiring payment method** (the owner's answer). | "রিটায়ার হচ্ছে" everywhere: the chip, the activity log, the switches and the owner's notice, whose title becomes "{name} রিটায়ার হচ্ছে". | Slice 8.8 |
| D8-79 | **A sent screenshot after a reload** (the owner's answer to the build, 2026-11-11). | Billing shows its type and size, "Screenshot · JPG, 1.2 MB"; the file's own name shows only in the session that sent it and isn't kept, so no migration. | Slice 8.8 |
| D8-80 | **The listener app's help number once cleared** (the owner's answer). | A number cleared in the console hides the app's support row too, as on the dashboard and the website; the number the app was built with stands in only until the server answers and while it can't be reached. | Slice 8.8 |
| D8-81 | **Where an error ID shows** (the owner's answer). | As drawn: Record a payment's error above its button, and Products' "didn't load" card with Try again. Every other sheet keeps its error at its top and every other list its banner, each with the error ID, Copy and Send on WhatsApp, until a sketch draws more. | Slice 8.8 |
| D8-82 | **A product save the server refuses** (the owner's answer). | It keeps naming the refused part under the title (Slice 11.7a's per-part message), not the drawing's bare sentence above it (`p88-err-refused`). | Slice 8.8 |
| D8-83 | **A bank reference's one form** (the close-out, review A F1). The operator typed a statement's dashes and spaces; Lytro's payment page takes letters and digits only; "used once" matched letter for letter, so one transfer could pay twice. | A reference is kept and matched as its letters and digits, in capitals, however it was typed (`BRAC-FT-55190327` is `BRACFT55190327`). The close-out's call. | Close-out |
| D8-84 | **Approving a seller's claim** (ADM-17; the owner's answer, 2026-11-11). Its pass line said approval follows a manual entry's guards. | It activates as the queue always has, with its transaction ID used once platform-wide. It asks for no reason and no amount typed again: those are a manual entry's guards. ADM-17's pass line is amended. | Close-out |
| D8-85 | **A cleared help number on Lytro's payment page** (the owner's answer). D8-69 let either number stand in for the other there; D8-76 said a cleared one's button goes. | D8-76 wins: a number not set, or cleared, takes its button away on every page, and neither stands in for the other. | Close-out |
| D8-86 | **A reason on every operator action** (criterion 5; the owner's answer). Restoring a shop or its payment page, the new-shop cap and removing a limit override took none. | Each takes one, required by the validator and kept in the platform audit log and the shop's activity log. The console's four dialogs draw it (OPERATOR-CONSOLE-DESIGN v7.1). | Close-out |
| D8-87 | **A lost phone that was also the shop's listener** (the owner's answer). A paired listener phone doesn't record its number, so a reset can't tell which one was lost. | The reset leaves the shop's listener phones paired. Once signed in again, the owner unpairs the lost one on the listener page, where each shows its name and model; the operator reminds them (RUNBOOKS §6). | Close-out |
| D8-88 | **When a deletion can no longer be undone** (refines D8-37; review B F1). | From its job's first step. The job begins under the shop's row lock and marks the shop as being deleted; from then an extension is refused, a manual entry is refused, and a plan payment approved for it is kept as its balance, never bringing it back. A deletion that stopped part way is finished by the next lifecycle tick. The close-out's call. | Close-out |
| D8-89 | **The lifecycle tick moves a shop one way** (review B F5). | Forward along active, grace, read-only, locked and archived, never back: only a payment or the operator brings a shop back. A shop archived by a request to delete its data stays archived until its job runs. The tick changes a shop only as it read it, under its row lock, so an extension or a payment made meanwhile stands. The close-out's call. | Close-out |
| D8-90 | **Reversing an entry while an upgrade or renewal is open** (refines D8-48; review A F3). An upgrade's credit and a renewal's start were worked out from the entry's plan. | Refused until that payment is decided or runs out (one never submitted runs out after 24 hours, BIL-15). The close-out's call. | Close-out |

### 2.1 Points left to each slice's read

Each is settled in its slice's read, before code, and recorded there.

| Slice | To settle |
|---|---|
| 8.1 | Where the error rows live (a Lytro table keyed by shop, since the error filter runs outside the shop's transaction), what an error row may hold (never a body, a phone or a token), and which errors count: server faults only, or refusals too. **Settled in Slice 8.1's read (2026-11-07):** D8-21 to D8-23. |
| 8.2 | What the owner's phone search matches (any written form, the last digits), and what the shop page loads at once against what it loads when opened. **Settled in Slice 8.2's read (2026-11-08):** D8-24 to D8-31. |
| 8.3 | Whether a trial can be extended (D8-12), the most days at once, how the owner's new phone is checked before the code goes, and whether deleting a shop's data needs it suspended first. **Settled in Slice 8.3's read (2026-11-08):** D8-32 to D8-39. |
| 8.4 | The nightly job's time and what it records, how far back the reports reach, and how a CSV is named. **Settled in Slice 8.4's read (2026-11-08):** D8-40 to D8-46. |
| 8.5 | Where evidence is kept and for how long, what a reversal of a plan purchase undoes, and the digest's time. **Settled in Slice 8.5's read (2026-11-09):** D8-47 to D8-56; D8-53 drops the digest. |
| 8.6 | R2's operation counts (D8-17), the budget's default and currency, and who the alert goes to. **Settled in Slice 8.6's read (2026-11-10):** D8-57 to D8-64. |
| 8.7 | The shop-ready SMS's words (D8-19), and whether the help menu's number shows to staff as well as the owner. **Settled in Slice 8.7's read (2026-11-10):** D8-65 to D8-70; the help row shows to everyone on the team. |
| 8.8 | Settled by its sketch: see that slice. **Read (2026-11-10):** D8-71 to D8-74; the sketch's four open points settled as D8-75 to D8-78, and the build's four as D8-79 to D8-82. |

---

## 3. Requirement coverage

### 3.1 Completed by this phase

| Area | Requirements |
|---|---|
| Console | ADM-02, ADM-04, ADM-08, ADM-09, ADM-13 to ADM-17 |
| Payment methods | WAL-18 (retiring a type) |
| SMS | SMS-18 |
| API | API-27 |
| Others | AUD-01 (manual entries, plan extensions and owner resets in the shop's activity log) |

### 3.2 Partially completed by this phase

| Requirement | Built here | Left | Where |
|---|---|---|---|
| ADM-03 | every row but two | failed webhooks, open tickets | next release, with webhooks and tickets (D8-1) |
| ADM-10 | Lytro's wallets (Phase 5), and its bKash gateway with keys the operator manages (#337) | a real payment through Lytro's own bKash merchant account | before launch (KNOWN-GAPS §137) |
| MED-12 | each month's R2 operations, Worker requests and top shops, the budget and its alert (Slice 8.6) | its pass is a recorded manual check against a real Cloudflare invoice (`MAN`), not yet made | the first invoice after launch (KNOWN-GAPS §138) |
| API-28 | Caddy redirects plain HTTP to HTTPS on every host | the recorded manual check | Phase 9 |

### 3.3 Listed for Phase 8 but not built here (next release)

| Requirements | Why |
|---|---|
| API-01's secret keys, scopes and IP allow-list; API-06, API-09, API-12, API-13, API-15, API-18 to API-20, API-22, API-25; API-24 for secret keys | The shop API moves out (D8-1). Public keys (Phase 3) are unchanged. |
| PAY-09 to PAY-12 (Phase 5, D5-8), ORD-02's secret key (Phase 4), NTC-20 (Phase 7), RTE-01's secret-key limit (Phase 3), API-12's `courier.status_changed` (Phase 6) | Each waits for secret keys or webhooks, which move out with the shop API. |
| ADM-05 | View-as-tenant (D8-2). |
| SUP-02 to SUP-07, and NTC-14's status-page part | Tickets, the help centre and the status page (D8-1). Shops use the help line (D8-4). |

### 3.4 Dependencies between requirements

- ADM-03's rows read what earlier phases built: the balance (BAL-*), usage (LIM-*), the SMS log (Slice 7.1), courier
  calls (CRR-26), the payment queue (ADM-06) and the seller's sales figures (STA-01). Slice 8.2 reads each through its
  own module, never with a second query of its own.
- ADM-14 and ADM-17 end in ADM-06's approval: a manual entry activates as an approved payment does, and a claim is a
  queue item.
- ADM-15's notice to the shop needs Slice 7.3's notifications.
- ADM-13 runs LIF-19's steps, so a step added to LIF-19 later is deleted on request too.
- ADM-09's top consumers read D8-9's nightly figures, which Slice 8.4 starts recording; its earlier months are empty.

### 3.5 Rework of code and documents built before this phase

| What | Today | Becomes | Slice |
|---|---|---|---|
| The error filter | logs a server fault | also records it for the shop, with the request ID (D8-3) | 8.1 |
| `GET /operator/tenants` | name or address, newest first | D8-7's search, filters and sorts | 8.2 |
| `OperatorShops` | plan, period, suspensions | D8-8's rows | 8.2 |
| `LifecycleService`'s deletion | private, day 60 only | callable for one shop (D8-13) | 8.3 |
| The payment-method types | a list in the code | the courier pattern's table with retiring (D8-18) | 8.7 |
| The shop-ready SMS | English | Bangla (D8-19) | 8.7 |
| Earlier plans' "Phase 8" rows for the shop API | Phase 8 | next release (§3.3); this plan is where that's recorded | 8.0 |

### 3.6 Architecture for this phase

- **Operator reads go through each module's own services**, as the console's existing reads do; a module that has no
  operator read gains one. The console never queries another module's tables.
- **One shop's figures are read inside that shop's own row-level security** (`run(tenantId, …)`). Figures across
  shops come from Lytro's own tables, or from D8-9's nightly figures. No role that skips row-level security.
- **Every operator action is one transaction** with its audit entry, platform and shop, written in it; a reason is
  required by the validator, never only by the screen.
- **Money moves only by the paths that already move it**: the queue's activation, the ledger's credit and its reversal.

---

## 4. Database work

Migrations take the next free number when each slice's PR opens (`main` reached 0116 with Slice 7.3). Each slice
brings `DATABASE-SCHEMA.md` in line with what it builds.

| Table | Holds | Slice |
|---|---|---|
| a Lytro table of request errors | each server error a shop's request hit, for 7 days: shop, route, code, request ID, time (D8-3) | 8.1 |
| a Lytro table of each shop's day | storage, SMS units, verification fees, orders and sales, one row a shop a day (D8-9) | 8.4 |
| `control.manual_payment_entries` (drafted in `DATABASE-SCHEMA.md` §11) | each entry and its reversal: kind, plan and term or amount, wallet, transaction ID, sender, payment time, evidence, reason and operator; append-only (D8-14) | 8.5 |
| evidence on a seller's claim | the screenshot of an "I have paid" (D8-15) | 8.5 |
| a month's media costs and the budget setting | R2 operations, Worker requests, the top shops (D8-17) | 8.6 |
| `control.payment_method_types` | each wallet type and when it was retired (D8-18) | 8.7 |
| the help line's settings | Lytro's WhatsApp and phone, and its hours (D8-4, D8-68) | 8.7 |

---

## 5. API surface for this phase

| Who | Route | Notes |
|---|---|---|
| Every response | `X-Request-Id` | API-27, D8-3 |
| Operator | `GET /api/v1/operator/tenants` (search, filters, sort); `GET /api/v1/operator/tenants/:id` and its rows | ADM-02, ADM-03 |
| Operator | `POST /api/v1/operator/tenants/:id/extend`, `/owner-reset`, `/delete-data` | ADM-04, ADM-13 |
| Operator | `GET /api/v1/operator/audit`; `GET /api/v1/operator/reports/shops`, `/revenue`, `/consumers`, each as JSON or CSV | ADM-08, ADM-09 |
| Operator | `GET`, `POST /api/v1/operator/manual-entries`; `POST /api/v1/operator/manual-entries/:id/reverse` | ADM-14, ADM-15 |
| Operator | `GET /api/v1/operator/media-costs` | MED-12 |
| Operator | `GET /api/v1/operator/payment-method-types`; `POST …/:key/retire`, `/undo-retire`, `/remove` | WAL-18 |
| Team, the seller's own payments | the "I have paid" submission gains its screenshot | ADM-17 |
| Anyone | `GET /api/v1/help-line`, no session, read by the dashboard and the website | D8-4, D8-68 |

Each slice's read settles its routes' exact shapes; `API-CONTRACT.md` records them as built.

---

## 6. Slices

### Slice 8.0: the plan
- **Delivers:** this document, and `IMPLEMENTATION-PLAN.md`'s Phase 8 section brought in line with it.

### Slice 8.1: request IDs and a shop's errors
- **Depends on:** 8.0.
- **Delivers:** `X-Request-Id` on every response and in every log line of the request (API-27); each server error a
  shop's request hits recorded for 7 days (D8-3), with a job that clears older rows.
- **Built** (read agreed 2026-11-07, D8-21 to D8-23): the ID is made before anything else runs, so a 404, a 413 and
  the public API's hosts carry one too, and the server's logger writes it after each line's context. A 500 or 503
  for a known shop is kept in `control.request_errors` (migration 0118) after the answer is decided, so a failure to
  keep it never changes the answer; a nightly job clears what's past 7 days. The shop page's reads come with 8.2.

### Slice 8.2: finding and reading a shop
- **Depends on:** 8.1.
- **Delivers:** the shop list's search, filters and sorts (ADM-02, D8-7); the shop page's rows (ADM-03, D8-8), each read
  through its own module.
- **Built** (read agreed 2026-11-08, D8-24 to D8-31): `GET /operator/tenants` takes `query`, `state`, `planId` and
  `sort` (newest, name, period end), each sort paging on its own keyset, and each row carries the owner's phone. The
  shop page opens with `GET /operator/tenants/:id/figures`; behind it, `errors`, `failed-sms`, `payments-waiting`,
  `sales` and the courier key log's `failed=true`. Every figure is read by the module that owns it, with the shop's
  own id: the shop's own tables inside its row-level security, as the seller's reads are, and Lytro's tables by that
  id. Lytro's outbox gains the shop a message is for (migration 0121). What it leaves is in KNOWN-GAPS §133.

### Slice 8.3: acting on a shop
- **Depends on:** 8.0.
- **Delivers:** extending a plan by days (D8-12); resetting an owner's sign-in (D8-5); deleting a shop's data on
  request (ADM-13, D8-13). Each with its reason and both audit entries.
- **Built** (read agreed 2026-11-08, D8-32 to D8-39): `POST /operator/tenants/:id/extend`, `/owner-reset` and
  `/delete-data`, each with its reason and an entry in both logs, written in one transaction. Deleting queues one job
  per request. The day-60 deletion gained the five Phase 7 tables it had been leaving behind, with the guard D8-39
  describes. What it leaves is in KNOWN-GAPS §135.

### Slice 8.4: the audit log and reports
- **Depends on:** 8.0.
- **Delivers:** the audit log's list (ADM-08, D8-11); the nightly figures (D8-9); the reports and their CSVs (ADM-09,
  D8-10).
- **Built** (read agreed 2026-11-08, D8-40 to D8-46): `control.shop_days` holds each shop's day, written by a 02:30 job
  that reads each shop inside its own row-level security. `GET /operator/reports/revenue`, `/shops` and `/consumers`,
  each with `/export`, read it and Lytro's own tables, split by the same weeks, months, quarters and years as the
  seller's sales figures. `GET /operator/audit` lists the platform audit log by shop, operator, action and day.

### Slice 8.5: manual entries and claims
- **Depends on:** 7.3 (the shop's notice), and 8.4 (the revenue report shows entries apart).
- **Delivers:** manual entries through the queue's activation, with evidence and their guards (ADM-14, ADM-15, D8-14);
  reversals; the claim's screenshot (ADM-17, D8-15); the list of entries (ADM-16, D8-53, D8-55).
- **Built** (read agreed 2026-11-09, D8-47 to D8-56): `POST /operator/manual-entries` records a plan, renewal, upgrade or
  top-up through `PaymentQueueService.verifyWithin`, and `POST .../:id/reverse` undoes one with its own row, a credit note
  and the shop put back. Screenshots go through `PaymentEvidence` into a private bucket and are removed after two years.
  A seller's "I have paid" may carry one. The revenue report shows entries apart.

### Slice 8.6: media costs
- **Depends on:** 7.3 (the operators' email).
- **Delivers:** each month's R2 operations and Worker requests, the top shops, the budget and its 80% email (MED-12,
  D8-17).
- **Built** (read agreed 2026-11-10, D8-57 to D8-64): `MediaCosts` reads R2's days each hour from Cloudflare's GraphQL
  analytics into `control.media_cost_days` and works out the period's bill from the price sheet;
  `GET /operator/media-costs` shows it by bucket with the media Worker's requests and the top shops, and the alert goes
  once a period to the address setting. The page waits for Slice 8.8.

### Slice 8.7: wallet types, the help line and the shop-ready SMS
- **Depends on:** 8.0.
- **Delivers:** retiring, undoing and removing a wallet type (WAL-18, D8-18); the help line's settings and route
  (D8-4); the shop-ready SMS in Bangla through the real path (SMS-18, D8-19).
- **Built** (read agreed 2026-11-10, D8-65 to D8-70): `PaymentMethodRetiring` behind
  `GET /operator/payment-method-types` and `POST …/:method/retire`, `/undo-retire` and `/remove`, with each type's state in
  `control.payment_method_types`; the shop's payment methods and Lytro's own read it. `HelpLine` reads four settings for
  `GET /help-line` and Lytro's payment page. The shop-ready SMS is in the owner's words with the shop's name. The pages wait
  for Slice 8.8.

### Slice 8.8: the screens
- **Depends on:** 8.1 to 8.7, and Slice 7.7, which also changes the console.
- **Sketch first** (`sketch-every-screen-before-building`), design doc and HTML mock: the console's shop list with its
  search and filters; the shop page's new rows; extend, owner reset and delete, each with its reason and confirmation;
  the audit log; the reports with their periods and CSVs; manual entries with evidence, the second confirmation and
  reversal; the media costs page; wallet types with retiring. The dashboard's help menu with the help line, and the
  claim's screenshot on the seller's payment screen.
- **Moves onto the help line** (D8-69): the dashboard's help row and the website's contact page read `GET /help-line`,
  and `VITE_SUPPORT_WHATSAPP`, `SUPPORT_WHATSAPP` and `SUPPORT_PHONE` go. The console's settings page lists the help line's
  four settings and Slice 8.6's five.
- **Builds** them, pixel perfect to the approved sketch, in Bangla and English to the owner's style guide.
- **Read agreed 2026-11-10** (D8-71 to D8-74): the owner's six fixes went first, on their own (PR #341); categories by
  dragging are drawn here; the contact page keeps one line of hours; the listener app reads the help line. Two PRs build
  it once the sketch is approved: the console, then the dashboard, the website and the listener app.
- **Sketched** (`OPERATOR-CONSOLE-DESIGN.md` v7, `TENANT-DASHBOARD-DESIGN.md` v3.39 §7.41, `SITE-PAGES-DESIGN.md` §2,
  `LISTENER-APP-DESIGN.md`; the prototypes' "Phase 8 · Slice 8.8" groups). The drawing found what the build adds to the
  server: rows for Slice 8.6's and 8.7's nine settings, which the settings list shows only once stored; the operator's
  id on `GET /auth/operator/me`; a screenshot route the payment screens can reach (8.5 put it only on routes no screen
  calls since #337); one call that moves a category; the request ID read from `X-Request-Id` in the client.
- **Built, the console (2026-11-11, PR 1 of 2):** every console screen the sketch draws: the shop list's filters and
  phone, a shop's figures and their lists, extend, owner reset and delete; manual entries with bank transfers (D8-75),
  the second confirmation, screenshots and reversal, and the queue's screenshot; wallet types; reports, the audit log and
  media costs in a Records group; Today's platform figures; the settings' help line (D8-76, D8-77) and media costs. The
  server half: migration 0128 (the nine settings' rows, `download` and `staging` reserved, a manual entry's
  `bank_account_id`), the operator's id on `me`, the retiring notice's words (D8-78), and Lytro's numbers and bank
  accounts kept while an entry names them. The console's policy lets screenshots reach the storage (`(operator_csp)`).
  KNOWN-GAPS §140 (two of three fixed) and §142. The dashboard, the website and the listener app follow in PR 2.
- **Built, the dashboard, the website and the listener app (2026-11-11, PR 2 of 2):** the Menu's Help and Lytro support
  sheet from the help line; a server fault's error ID with Copy and Send on WhatsApp, in every screen's error banner and
  where §7.41 draws it (D8-81, D8-82); a retiring payment method's mark, its bell rows and switches in রিটায়ার's words;
  a payment's screenshot sent from Billing while Lytro checks it (D8-79), with Plan's and Balance's banners leading there;
  categories by dragging, the keyboard and Move to…, each move one request. The website's contact page, footer and
  listener page read the help line (D8-73), and the listener app reads it on the API host (D8-74, D8-80).
  `VITE_SUPPORT_WHATSAPP`, `SUPPORT_WHATSAPP` and `SUPPORT_PHONE` are gone. The server half: `GET /v1/listener/help-line`,
  `POST /billing/payments/:id/evidence` and `POST /balance/top-up/:id/evidence` with each row's screenshot fields, and
  `POST /categories/:id/move`; no migration. KNOWN-GAPS §140 fixed; §143.

---

## 7. Slice dependencies and order

```
8.0 plan ──► 8.1 request IDs, errors ──► 8.2 finding and reading a shop
        ├──► 8.3 acting on a shop
        ├──► 8.4 audit log, reports ──► 8.5 manual entries, claims (with 7.3)
        ├──► 8.6 media costs (with 7.3)
        └──► 8.7 wallet types, help line, shop-ready SMS
                          all server slices, and 7.7 ──► 8.8 the screens
```

**Order, one slice at a time (D8-6):** 8.1 → 8.2 → 8.3 → 8.4 → 8.5 → 8.6 → 8.7 → 8.8. Slice 7.3 merged before this
plan did, so 8.5 and 8.6 wait for nothing outside Phase 8.

**What the owner provides, when its slice starts.** Each secret goes in a local file outside every repo, which I name
when it's needed and never open or print.

| Slice | Needs |
|---|---|
| 8.6 | Nothing new: the media edge's `CLOUDFLARE_API_TOKEN` already has Account Analytics: Read (RUNBOOKS), which Cloudflare's docs name for its GraphQL analytics; set the alert's address in the console |
| 8.7 | Lytro's WhatsApp and phone number for the help line, entered by the owner in the console (`PATCH /operator/settings/:key` until 8.8's page) |

---

## 8. Non-functional requirements for this phase

- **Money exactly once:** a manual entry or an approval activates once, however often it's sent (ADM-06's "approving
  twice has no second effect"); a reversal reverses once.
- **Privacy:** an error row keeps the route, code and request ID, never a body, a phone or a token; evidence is never
  public; a CSV leaves out owners' phones and emails unless the operator asks for them in the slice's read.
- **Isolation:** every new route is in the isolation registry, and the operator's routes refuse every seller session.
- **Audit:** every operator action writes the platform audit log, and the shop's activity log where it touches a
  shop (ADM-04).
- **Irreversible actions** (ADM-13) need a typed confirmation and a reason, checked by the server.

---

## 9. Risks

| Risk | Response |
|---|---|
| A manual entry used to give a plan away | ADM-15's guards: unique transaction IDs, evidence, a second confirmation over 10,000 TK or past 10 a day, and the list of entries with the audit log (D8-14, D8-53) |
| Reports need figures from every shop | the nightly figures (D8-9), never a role that skips row-level security |
| Deleting the wrong shop's data | the shop's address typed to confirm, a reason, and a job that runs LIF-19's tested steps (D8-13) |
| Error rows grow without end | 7 days, cleared by a job (D8-3) |
| Phase 7's console screens (7.7) and Phase 8's (8.8) change the same app | 8.8 starts after 7.7 merges |
| The shop API is still missing at launch | it is the next release's first piece; public keys serve the storefront and landing pages until then |

---

## 10. Definition of done (per slice)

Same as Phase 7:
- its own branch and PR
- every listed requirement proven by a test written against its pass criteria
- a sabotage-confirm-restore pass on the slice's central rule, and on every rule about money it adds
- `typecheck`, `lint`, `build` and every package's tests clean, the full server suite where shared foundations change,
  and a real boot of the built server
- the isolation registry updated for any new route
- `KNOWN-GAPS.md` updated if anything listed here turns out not to hold
- this plan's slice entry marked shipped with its PR number
