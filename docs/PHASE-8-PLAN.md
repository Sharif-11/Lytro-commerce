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
   appears in that day's digest and in that month's revenue report.
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
| D8-16 | **The daily digest** (ADM-16). | Emailed each morning to every operator account, by Slice 7.3's email, listing the day's entries and reversals. A day with none sends nothing. | Slice 8.5 |
| D8-17 | **Media costs** (MED-12, KNOWN-GAPS §101). Worker requests and bytes are counted; R2's own operations aren't. | Each month's R2 operations, Worker requests and the shops that use most, against a monthly budget the operator sets, with an email to the operators at 80%. Where R2's operation counts come from (Lytro's own calls or Cloudflare's analytics) is settled in the slice's read. | Slice 8.6 |
| D8-18 | **Retiring a wallet type** (WAL-18, moved here by Phase 5). The types are a list in the code. | The couriers' pattern (CRR-23, CRR-24): retiring hides a type from new setup while shops using it keep it, undoing is allowed, and removing needs no shop to use it. | Slice 8.7 |
| D8-19 | **The shop-ready SMS** (SMS-18). It goes out today in English ("Your shop is ready: …"). | Worded in Bangla to the owner's style guide in the slice's read, still Lytro's cost (D7-23), and proven through the real SMS path. | Slice 8.7 |
| D8-20 | **A gateway for Lytro's own payments** (ADM-10's other half). Phase 5 left it for later (D5-3). | Still later. Lytro's own payments come by its wallets and its listener phones. | none |
| D8-21 | **The request ID's form** (Slice 8.1's read, 2026-11-07). A seller may read one out over WhatsApp. | Eight characters in two halves, like `K7MQ-4XR2`, from letters and digits that can't be mistaken for each other (no 0 or O, no 1, I or L), made by Lytro for every request; one a client sends is never used. The dashboard's error message shows it (Slice 8.8). | Slices 8.1, 8.8 |
| D8-22 | **Which errors are kept** (the read). | Server faults only: an unexpected fault (500) and a 503 when something Lytro depends on is down. A refusal (a bad field, a limit, a missing permission) is an answer the seller already sees explained, and isn't kept. A fault before the shop is known (signing in) is logged, not kept. | Slice 8.1 |
| D8-23 | **What a kept error holds** (the read). A database's own text can hold a customer's phone or address. | The route's pattern (`/api/v1/orders/:id`), the method, the status, the error's kind (its class, with the database's own code when it has one, or a 503's message key) and the request ID. The message and stack go only to the server log, under the same ID. | Slice 8.1 |

### 2.1 Points left to each slice's read

Each is settled in its slice's read, before code, and recorded there.

| Slice | To settle |
|---|---|
| 8.1 | Where the error rows live (a Lytro table keyed by shop, since the error filter runs outside the shop's transaction), what an error row may hold (never a body, a phone or a token), and which errors count: server faults only, or refusals too. **Settled in Slice 8.1's read (2026-11-07):** D8-21 to D8-23. |
| 8.2 | What the owner's phone search matches (any written form, the last digits), and what the shop page loads at once against what it loads when opened. |
| 8.3 | Whether a trial can be extended (D8-12), the most days at once, how the owner's new phone is checked before the code goes, and whether deleting a shop's data needs it suspended first. |
| 8.4 | The nightly job's time and what it records, how far back the reports reach, and how a CSV is named. |
| 8.5 | Where evidence is kept and for how long, what a reversal of a plan purchase undoes, and the digest's time. |
| 8.6 | R2's operation counts (D8-17), the budget's default and currency, and who the alert goes to. |
| 8.7 | The shop-ready SMS's words (D8-19), and whether the help menu's number shows to staff as well as the owner. |
| 8.8 | Settled by its sketch: see that slice. |

---

## 3. Requirement coverage

### 3.1 Completed by this phase

| Area | Requirements |
|---|---|
| Console | ADM-02, ADM-04, ADM-08, ADM-09, ADM-13 to ADM-17 |
| Media | MED-12 |
| Payment methods | WAL-18 (retiring a type) |
| SMS | SMS-18 |
| API | API-27 |
| Others | AUD-01 (manual entries, plan extensions and owner resets in the shop's activity log) |

### 3.2 Partially completed by this phase

| Requirement | Built here | Left | Where |
|---|---|---|---|
| ADM-03 | every row but two | failed webhooks, open tickets | next release, with webhooks and tickets (D8-1) |
| ADM-10 | Lytro's wallets (Phase 5) | a gateway for Lytro's own payments | later (D8-20) |
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
- ADM-16's digest and ADM-15's notice to the shop need Slice 7.3's email and notifications.
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
| the help line's settings | Lytro's WhatsApp and phone (D8-4) | 8.7 |

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
| Team | the help line, with the dashboard's shell | D8-4 |

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

### Slice 8.3: acting on a shop
- **Depends on:** 8.0.
- **Delivers:** extending a plan by days (D8-12); resetting an owner's sign-in (D8-5); deleting a shop's data on
  request (ADM-13, D8-13). Each with its reason and both audit entries.

### Slice 8.4: the audit log and reports
- **Depends on:** 8.0.
- **Delivers:** the audit log's list (ADM-08, D8-11); the nightly figures (D8-9); the reports and their CSVs (ADM-09,
  D8-10).

### Slice 8.5: manual entries and claims
- **Depends on:** 7.3 (the shop's notice and the digest's email), and 8.4 (the revenue report shows entries apart).
- **Delivers:** manual entries through the queue's activation, with evidence and their guards (ADM-14, ADM-15, D8-14);
  reversals; the claim's screenshot (ADM-17, D8-15); the daily digest (ADM-16, D8-16).

### Slice 8.6: media costs
- **Depends on:** 7.3 (the operators' email).
- **Delivers:** each month's R2 operations and Worker requests, the top shops, the budget and its 80% email (MED-12,
  D8-17).

### Slice 8.7: wallet types, the help line and the shop-ready SMS
- **Depends on:** 8.0.
- **Delivers:** retiring, undoing and removing a wallet type (WAL-18, D8-18); the help line's settings and route
  (D8-4); the shop-ready SMS in Bangla through the real path (SMS-18, D8-19).

### Slice 8.8: the screens
- **Depends on:** 8.1 to 8.7, and Slice 7.7, which also changes the console.
- **Sketch first** (`sketch-every-screen-before-building`), design doc and HTML mock: the console's shop list with its
  search and filters; the shop page's new rows; extend, owner reset and delete, each with its reason and confirmation;
  the audit log; the reports with their periods and CSVs; manual entries with evidence, the second confirmation and
  reversal; the media costs page; wallet types with retiring. The dashboard's help menu with the help line, and the
  claim's screenshot on the seller's payment screen.
- **Builds** them, pixel perfect to the approved sketch, in Bangla and English to the owner's style guide.

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
| 8.6 | If R2's operations come from Cloudflare's analytics (D8-17), a read-only analytics token for the account |
| 8.7 | Lytro's WhatsApp and phone number for the help line, entered by the owner in the console |

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
| A manual entry used to give a plan away | ADM-15's guards: unique transaction IDs, evidence, a second confirmation over 10,000 TK or past 10 a day, and the daily digest to every operator (D8-14, D8-16) |
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
