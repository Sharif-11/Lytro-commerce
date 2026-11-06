# Phase 7 plan: SMS, notifications, the notice board, fraud checks and reading orders

Status: agreed 2026-11-06. D7-1 to D7-12, D7-21 and D7-22 were settled with the owner that day. D7-13 to D7-20 follow from them or
from existing requirements, and are raised with this plan, so the owner can overrule any of them. Builds on
`IMPLEMENTATION-PLAN.md` Phase 7, with these changes:

- **This release leaves chat out** (D7-1): no chat between shoppers and shops in Lytro, no AI that replies in chat and no
  Messenger inbox. Shoppers and shops talk over WhatsApp, Messenger and the like, outside Lytro. `CHT-*` and `AI-*` move
  to the next release.
- **AI reads orders from pasted text, and nothing else** (D7-1, D7-4).
- **Fraud checks use courier feedback only** (D7-5, D7-6): the courier's record of the phone through the shop's own key,
  and the shop's own past orders. No paid aggregator, and no counts shared across shops, in this release.
- **Fraud checks are free at launch** (D7-7): the charge is built, at a rate of zero.
- **Server first, screens last** (D7-9), and **beside Phase 6** (D7-10).

Requirement IDs refer to `SRS-detailed.md` §20 (SMS, NTF, I18N-03), §23.1 (NTC), §18 (FRD), §15.1 (ORD-30 to ORD-34)
and `PLN-20`. Schema refers to `DATABASE-SCHEMA.md` §5, §7 and §10, which each slice brings in line with §4 of this plan.
What the providers' own pages say is in Appendix A, with where each fact came from. None of it has been tried yet.

Reopening a decision in §2 needs an explicit change to its row, not a silent deviation during a slice. The points §2.1
leaves to a slice's read are settled there, each with its own answer.

---

## 1. Goal and exit criteria

**Goal.** A shopper gets the SMS the shop has switched on, in the shop's own words, and the shop pays only for what was
sent. Owners and staff hear about what needs them in the dashboard and on their phone or computer, and by email for the
warnings that matter. The operator can tell every shop, or some of them, about a change, and see who read it. Staff
check a phone number before shipping a cash-on-delivery order, and paste a customer's message to get a draft order.

**Phase 7 is complete when all of these hold:**

1. Every requirement in §3.1 has a passing automated test, or, for `MAN` requirements, a recorded manual check.
2. **An SMS is charged once, and never for nothing:** a sent SMS charges the balance at the SMS rate exactly once, or
   takes it from the allowance (SMS-04, SMS-05); a failed one charges nothing and uses no allowance (SMS-08); a blocked
   one is logged with its reason (SMS-07); essential SMS stop at −5 TK and optional SMS stop at zero (SMS-06). Charging
   and the allowance count the same units (SMS-09, D7-13).
3. **The golden path** passes as one test against the fakes: a shopper's order → "order placed" SMS in the shop's Bangla
   template with the shop's name first → the owner's bell and push show the new order → payment verified → the SMS → the
   courier's news ships it → the shipped SMS with its tracking link → delivered. At every step the SMS log, the ledger
   and the notifications agree.
4. **Notifications reach the right people only:** a user without the permission never gets the notice (NTF-01), a type
   switched off stops for that user only (NTF-04), and warnings never go by an SMS charged to the shop (NTF-05).
5. **Notices reach their audience:** a shop that moves into a notice's audience sees it, one outside never does
   (NTC-02), and acknowledgments and read state never cross shops (NTC-18).
6. **A fraud check never blocks an order** (FRD-06), uses whichever sources answer (FRD-11), and makes no outside call for
   a phone checked in the last 3 days (FRD-04).
7. **Reading an order saves nothing by itself** (ORD-30), and a failed or malformed read charges nothing (ORD-33).
8. **Every outside call sits behind the circuit breaker**, and a provider that's down never stops an order, a payment or
   a sign-in. Only the SMS or check is late or refused, and it says so.
9. **The milestone:** one real SMS to a real phone through BulkSMSBD, one real email through Resend, one real web push to
   a phone, and one real read of a pasted Bangla order through Gemini, each recorded.
10. CI is green on `main`, and the pull-request flow has been used for every slice.

---

## 2. Decisions

**D7-1 to D7-12 agreed 2026-11-06** (the Phase 7 read).

| # | Decision | Decided | Affects |
|---|---|---|---|
| D7-1 | **Scope.** About 95 requirements, more than Phase 6. | In: SMS, notifications, the notice board, fraud checks, reading orders from text, and `PLN-20`'s allowances. Out, for the next release: chat between shoppers and shops (`CHT-*`, Messenger `CHT-08` included) and AI replies (`AI-*`). Shoppers and shops use WhatsApp and Messenger outside Lytro. | the whole phase |
| D7-2 | **SMS provider.** Only a stand-in that writes to the log exists. | **BulkSMSBD**, where the owner already has an account, behind one adapter so another can replace it. Always over **HTTPS** (the owner's call, 2026-11-06), never `http://`. | Slice 7.1 |
| D7-3 | **Email provider.** Only a stand-in exists. | **Resend**, behind one adapter. | Slice 7.3 |
| D7-4 | **AI provider for reading orders.** | **Google Gemini**, behind one adapter, with the provider and model a setting (AI-10's rule, applied to reading orders). | Slice 7.6 |
| D7-5 | **Fraud sources.** FRD-02 names three: courier history, a paid aggregator, and Lytro's shared counts. | **Courier feedback only.** No paid aggregator in this release (OD-47 stays open); its adapter can come later. | Slice 7.5 |
| D7-6 | **What courier feedback covers.** | The courier's own record of the phone through the shop's key (Steadfast's score; Pathao's and RedX's to check in Slice 7.5), and the shop's own past orders with that phone: delivered, returned and cancelled. The second needs no outside call. | Slice 7.5 |
| D7-7 | **Price of a check.** With courier feedback only, a check costs Lytro nothing. | The charge (FRD-03) is built, but the fraud-check rate is **zero at launch**, raisable from Rates without a release. Allowances for fraud checks (PLN-20) wait until the check has a price. | Slices 7.5, 7.6 |
| D7-8 | **Shared counts across shops** (FRD-09, FRD-10, FRD-12, FRD-13). | **Next release.** They need many shops to say anything, and a line in the terms about sharing. | Slice 7.5 |
| D7-9 | **How it's built.** | Server slices first, then one sketch-and-screens pass for the dashboard and the console, sketched before it's built. | Slice 7.7 |
| D7-10 | **When.** Phase 6 goes one slice at a time in another session. | Phase 7 is built beside it, in its own session, also one slice at a time. The two touch different code. | the whole phase |
| D7-11 | **Push.** | In-app notifications and **web push** to a subscribed phone or computer (NTF-01 to NTF-04). Email for warnings and notices (NTF-05, NTF-06, NTC-06). | Slices 7.3, 7.4 |
| D7-12 | **Credentials.** | Each provider's key goes in a local file outside every repository, which the slice names and never opens or prints. The BulkSMSBD key pasted in the read must be replaced with a new one first. | every provider slice |
| D7-21 | **When an SMS really goes out** (the owner's call, 2026-11-06). Every SMS costs money. | By the server's mode. **Test:** never sent, only recorded, whatever any setting says. **Development:** the stand-in writes it to the log, unless `SMS_FORCE_REAL=true` is set and BulkSMSBD's login is there, and then it really goes out. **Production, staging included:** always sent for real, and a server missing BulkSMSBD's login refuses to start rather than quietly logging. | Slice 7.1 |

**D7-13 to D7-20 follow from those or from existing requirements.** They weren't asked in the read, so the owner can
overrule any of them when reviewing this plan.

| # | Decision | Decided | Affects |
|---|---|---|---|
| D7-13 | **One way to count an SMS.** The shopper sign-up code charges by SMS-09's units (characters ÷ the unit size), but the essential allowance counts the phone network's parts, so the two disagree (KNOWN-GAPS §118). | SMS-09's units, for charging and for the allowance alike, as SMS-09 says. The allowance is enforced, not only counted. | Slice 7.1 |
| D7-14 | **Who hears what, and how.** Today seven notifiers only write to the log, and low balance only emails. | Each becomes a notification: in-app and push to the users with the matching permission (NTF-03). Email only for NTF-05's warnings and for notices (NTC-06). SMS only for SMS-01's events. | Slices 7.2, 7.3 |
| D7-15 | **Delivery reports** (SMS-17). BulkSMSBD's page shows no delivery-report call. | The log shows sent and failed from the provider's answer, and blocked for an SMS refused before it went (SMS-07). **Settled in Slice 7.1's read (2026-11-06): sent and failed only**, no delivered. | Slice 7.1 |
| D7-16 | **A rate for reading orders.** ORD-34 charges an extraction rate, and none exists. | A new rate, `ai_extraction`, set by the operator before launch. The chat-reply rate (`ai_reply`) isn't shown to shops or the operator while chat is out, so no screen offers what doesn't exist. | Slice 7.6 |
| D7-17 | **Allowances.** | Allowances for reading orders are built in this release, and allowance becomes a kind a shop can buy. Allowances for fraud checks follow D7-7. | Slice 7.6 |
| D7-18 | **The pasted message.** | It goes to Gemini, on a paid tier that doesn't train on it, and Lytro keeps only the draft and the count, never the message (as `order_extractions` already says). | Slice 7.6 |
| D7-19 | **Notices from the console.** The console's Rates page shows "Offer a rate-change notice" as coming soon. | The notice board's operator routes come in Slice 7.4, and the console's screens for them in Slice 7.7, which also makes the rate-change offer real (NTC-13). | Slices 7.4, 7.7 |
| D7-20 | **What the screens stopped promising.** The console and storefront dropped "the owner is told by SMS" and "no SMS is promised" while nothing was sent. | Slice 7.7 brings back each sentence once its message really goes out, checked against the code, not the sketch. | Slice 7.7 |
| D7-22 | **The same rule for every provider that costs money or reaches a real person** (the owner's call, 2026-11-06). | Email (Resend), web push and Gemini follow D7-21: recorded in test, the stand-in in development unless its own force flag (`EMAIL_FORCE_REAL`, `PUSH_FORCE_REAL`, `AI_FORCE_REAL`) is set, real in production and staging. | Slices 7.3, 7.6 |
| D7-23 | **What a shop's own SMS costs** (the owner's call, Slice 7.1's read, 2026-11-06). | Every essential SMS is free up to the shop's allowance, then charged from its balance; with no balance it isn't sent. The floor is **0 TK, not −5 TK** (SMS-06 amended). The shop's own use (the owner's pick) is a sign-in code to an existing shop, its owner's or a staff member's, and a staff member's reset code; sign-up codes, the owner's own reset code, the shop-ready SMS and notices to a lapsed shop stay Lytro's cost (AUTH-21 amended). SMS a shop sends its shoppers, and Slice 7.2's order SMS to the shop, are always charged. | Slices 7.1, 7.2 |
| D7-24 | **A code the shop can't pay for** (the owner's call, 2026-11-06). | The sign-in refusal says why: "Your shop's balance can't pay for this code. Sign in with your password or top up." It shows that the phone has a shop, the one exception to AUTH-13 (amended). A staff reset keeps AUTH-17's same reply. | Slice 7.1 |
| D7-25 | **The unit and the rate** (Slice 7.1's read). BulkSMSBD charges 0.35 TK a part, Bangla or English. | **67 characters a unit, at 0.55 TK**, whatever the language: 67 is one Bangla part once a message needs two, so no SMS costs Lytro more than it earns. SMS-09 and RAT-13's default moves from 75 (the seeded rate too, unless an operator has changed it). | Slice 7.1 |
| D7-26 | **The codes' words** (the owner's, 2026-11-06), in BulkSMSBD's OTP shape. | Sign-in: "Lytro-এ লগইনের জন্য OTP হচ্ছে {code}। কারো সাথে শেয়ার করবেন না।" Reset: "Lytro-এ পাসওয়ার্ড রিসেটের জন্য OTP হচ্ছে {code}। …" A shopper's: "{shop}-এ সাইন আপের জন্য OTP হচ্ছে {code}। …", or in English "Your {shop} OTP is {code}. Do not share it with anyone." (SMS-16 amended.) | Slice 7.1 |
| D7-27 | **SMS-11's per-IP limit**, left for later in Phase 1 (D16). With real SMS, codes asked for made-up numbers from one address would cost Lytro money. | At most **20 code SMS an hour from one address** in production, across every phone, a setting (`CODE_SMS_PER_IP_PER_HOUR`); an address the server can't trust isn't counted (D14), as SUP-08's isn't. To revisit against measured traffic, since many phones can share one carrier address. | Slice 7.1 |
| D7-28 | **Slice 7.2's words** (the owner's pick of the drafts, 2026-11-06). | Placed: "অর্ডার {order_number} পেয়েছি, মোট ৳{amount}। ধন্যবাদ!" Verified: "অর্ডার {order_number}-এর ৳{amount} পেমেন্ট পেয়েছি।" Shipped: "অর্ডার {order_number} পাঠানো হয়েছে: {tracking_link}" Delivered: "অর্ডার {order_number} ডেলিভারি হয়েছে। ধন্যবাদ!" Cancelled: "অর্ডার {order_number} ক্যানসেল করা হয়েছে।" New order: "নতুন অর্ডার {order_number}, মোট ৳{amount}।" To verify: "অর্ডার {order_number}-এর ৳{amount} পেমেন্ট ভেরিফাই করুন।" Six fit one unit with a typical shop name; shipped is two, its link making it so whatever link it is. | Slice 7.2 |
| D7-29 | **The tracking link** (Slice 7.2's read). Only Steadfast gives a courier link. | The order's tracking page on the shop's storefront, at its own domain when it has one; with the storefront off, the courier's link, else its tracking code. | Slice 7.2 |
| D7-30 | **Who gets what** (Slice 7.2's read). | The new-order alert and payment needs verification go to the owner's own phone only; staff get them as notifications (Slice 7.3). The shopper's five go for delivery orders from any source, takeaway and dine-in getting none; the new-order alert only for an order from outside the shop. | Slice 7.2 |
| D7-31 | **The rest of Slice 7.2's read**, all the recommended answers. | The estimate counts the last 30 days' orders, a new shop seeing the cost per order (SMS-12). The three essential SMS keep the platform's words, listed as always on (SMS-19). An optional shorter SMS name every SMS starts with (SMS-16). No spend cap until the owner sets one, warned at 80% by email (SMS-13). | Slice 7.2 |

### 2.1 Points left to each slice's read

Each is settled in its slice's read, before code, and recorded there.

| Slice | To settle |
|---|---|
| 7.1 | **A real SMS to the owner's phone first, over HTTPS** (D7-2), sent from development with `SMS_FORCE_REAL` (D7-21). Staging sends for real, as production does. Whether BulkSMSBD has delivery reports (D7-15), the server addresses it must allow (its code 1032), its OTP format ("Your {Brand} OTP is XXXX") against the codes Lytro sends today, and Bangla's cost in parts. |
| 7.2 | The ten events' Bangla defaults, worded to the owner's style guide. Which events need a tracking link, and which link. What "estimated monthly cost" (SMS-12) counts from for a new shop. |
| 7.3 | Resend's sending domain and its DNS records, the bounce message (NTF-06), and how long a notification is kept. Which events a user can switch off (NTF-04): essential ones like "payment to verify" may stay on. |
| 7.4 | How a notice's Bangla and English bodies are written in the console (bold, links and lists, NTC-01) and kept safe (NTC-16). Whether the status page (NTC-14) is in this release. |
| 7.5 | **What each courier's check returns, tried with a real key:** Steadfast's score, Pathao's success-rate call (Appendix A), RedX's if it has one, once Slice 6.4 lands. How the level (low, medium, high, unknown) is worked out from the counts. Whether checks stay refused in trial (FRD-08) now that they're free. |
| 7.6 | **Real pasted messages read by Gemini first**, in Bangla, English and the two mixed, to choose the model and set the rate. How thanas are matched (ORD-31), and the confidence shown. |
| 7.7 | Settled by its sketch: see that slice. |

---

## 3. Requirement coverage

### 3.1 Completed by this phase

| Area | Requirements |
|---|---|
| SMS | SMS-01 to SMS-16, SMS-18, SMS-19 |
| Notifications | NTF-01 to NTF-07 |
| Localization | I18N-03 |
| Notice board | NTC-01 to NTC-19 |
| Fraud checks | FRD-01, FRD-03 to FRD-08, FRD-11 |
| Reading orders | ORD-30 to ORD-34 |
| Others | BIL-14 (push joins email), LIF-10 and LIF-18 (still never charged), AUTH-21 and TRL-05 (counted in SMS-09 units), SUP-01 (the SMS events item), API-11 (fraud checks and SMS sends accept the key), RAT-09 and NTC-13 (a rate change records its notice) |

### 3.2 Partially completed by this phase

| Requirement | Built here | Left | Where |
|---|---|---|---|
| SMS-17 | sent and failed, from the provider's answer | delivered, if BulkSMSBD offers no reports (D7-15) | Slice 7.1's read |
| FRD-02 | courier history and the shop's own orders | the paid aggregator and the platform's shared counts | next release (D7-5, D7-8) |
| PLN-20 | allowances for reading orders | allowances for fraud checks | once checks have a price (D7-7) |
| NTC-20 | the routes | secret keys with `notices:read` | Phase 8, with secret keys |

### 3.3 Listed for Phase 7 but not built here (next release)

| Requirements | Why |
|---|---|
| CHT-01 to CHT-10 | No chat in Lytro in this release (D7-1). |
| AI-01 to AI-11 | No AI replies in chat (D7-1). AI-10's rule applies to reading orders. |
| FRD-09, FRD-10, FRD-12, FRD-13 | Shared counts across shops (D7-8). |
| FRD-14 | No paid aggregator, so no aggregator credential (D7-5). |
| API-07's chat endpoints | Nothing behind them (D7-1). |

### 3.4 Dependencies between requirements

- SMS-01's events come from what Phases 4 to 6 built: an order placed (ORD-20), a payment verified (VER-01), the
  courier's news (CRR-12) and a cancellation. Slice 7.2 adds the SMS where each happens, never in a second path.
- NTF-03's events are the eight notifiers already in place, seven of them stand-ins (D7-14). Slice 7.3 replaces each stand-in, changing nothing
  that calls it.
- NTC-06 sends through Slice 7.3's in-app, push and email, so the notice board follows it.
- FRD-05's automatic check needs an order created; it runs after creation and never holds it up (FRD-06).
- ORD-31's thana match uses the same location list as the order form (CUS-08). A courier's own area is suggested only
  where Slice 6.4 gave that courier areas.

### 3.5 Rework of code and documents built before this phase

| What | Today | Becomes | Slice |
|---|---|---|---|
| `ConsoleSmsProvider` | the only SMS provider | the test and local stand-in, beside BulkSMSBD's adapter | 7.1 |
| `ConsoleMailProvider` | the only email provider | the stand-in, beside Resend's | 7.3 |
| The essential SMS allowance | counts the network's parts, never enforced | counts SMS-09 units and is enforced (D7-13) | 7.1 |
| Seven `Console*Notifier` stand-ins | write to the log | notifications, in-app and push (D7-14) | 7.3 |
| The dashboard's greyed "Read an order from a pasted message (Phase 7)" and the bell's place | placeholders | the real thing | 7.7 |
| The console's Notices page and the Rates notice offer | drawn as later | the real thing (D7-19) | 7.7 |
| `ai_reply` on the Rates pages | shown | hidden while chat is out (D7-16) | 7.6, 7.7 |
| `BUYABLE_ADDON_KINDS` | limit and feature | adds allowance (D7-17) | 7.6 |

### 3.6 Architecture for this phase

- **One adapter per provider**, the courier pattern: a port, a real adapter, a fake for tests and a contract suite each
  adapter passes. A refusal is an answer; no answer is thrown. Every call goes through `CircuitBreaker`, keyed by the
  provider, and never logs a credential.
- **Messages leave through the outbox**, as SMS and email do today: written in the same transaction as what caused them,
  sent by the worker, retried on failure. A charge is written with the send, and reversed if the provider refuses it, as
  the shopper sign-up code already does.
- **Notifications are rows**, written with the event, and push is sent from them by a worker. The dashboard reads the
  rows; push is never the only copy.
- **A fraud check and a read are requests**, answered while the user waits, with a time limit. A courier that doesn't
  answer in time is noted as unavailable (FRD-11).

---

## 4. Database work

Migrations follow Phase 6's, numbered in the order slices merge (Slice 7.1 is 0110). Each slice brings `DATABASE-SCHEMA.md` in line with what it builds.

| Table | Holds | Slice |
|---|---|---|
| `tenant.sms_log` | every SMS a shop sends or is refused: event, phone, units, cost, essential or not, status, reason, the provider's ID | 7.1 |
| `tenant.sms_settings` | each event's switch and template, the spend cap (SMS-02, SMS-13, SMS-19) | 7.2 |
| `tenant.notifications`, `tenant.notification_preferences` | each notice for its users, read state, and what each user has switched off (NTF-01, NTF-04) | 7.3 |
| `tenant.push_subscriptions` | each subscribed device (NTF-02) | 7.3 |
| a bounce flag on the owner's email | NTF-06 | 7.3 |
| `control.notices`, `control.notice_versions`, `control.notice_reads`, `control.notice_acknowledgments` | notices, their earlier versions (NTC-08), reads and acknowledgments | 7.4 |
| `tenant.fraud_checks`, `tenant.fraud_rules` | each check and its result (FRD-01, FRD-04), and the automatic rule (FRD-05). No shared-counts column in this release | 7.5 |
| `tenant.order_extractions` | each read, without the message (D7-18) | 7.6 |
| the `ai_extraction` rate, an allowance's uses on an add-on purchase | D7-16, D7-17 | 7.6 |

---

## 5. API surface for this phase

| Who | Route | Notes |
|---|---|---|
| Team, `sms:read`, `sms:manage` | `GET`, `PUT /api/v1/sms/settings`; `POST /api/v1/sms/templates/:event/reset`; `GET /api/v1/sms/log`; `GET /api/v1/sms/report` | SMS-02, SMS-10, SMS-14, SMS-19 |
| Team | `GET /api/v1/notifications`, `POST /api/v1/notifications/read`; `GET`, `PUT /api/v1/notifications/preferences`; `POST`, `DELETE /api/v1/push/subscriptions`; `POST /api/v1/push/test` | NTF-01, NTF-02, NTF-04 |
| Team, `notices:read` | `GET /api/v1/notices`, `POST /api/v1/notices/:id/read`, `POST /api/v1/notices/:id/acknowledge` | NTC-03, NTC-05, NTC-09 |
| Operator | `GET`, `POST`, `PATCH /api/v1/operator/notices`, `POST /api/v1/operator/notices/:id/withdraw`, `GET /api/v1/operator/notices/:id/acknowledgments` | NTC-01, NTC-05, NTC-08 |
| Team, `fraud:check` | `POST /api/v1/fraud-checks`, `GET /api/v1/fraud-checks?phone=`; `GET`, `PUT /api/v1/fraud-checks/rule` | FRD-01, FRD-05, FRD-07 |
| Team, `orders:manage` | `POST /api/v1/orders/read-from-text` | ORD-30 to ORD-34 |
| Providers | `POST /api/v1/webhooks/email/resend` | bounces (NTF-06), signed |

The permission names already exist (`SmsRead`, `SmsManage`, `NoticesRead`, `FraudRead`, `FraudManage`). Slice 7.5's read
checks whether FRD-01's `fraud:check` is `fraud:read` or needs its own name.

---

## 6. Slices

### Slice 7.0: the plan
- **Delivers:** this document, and `IMPLEMENTATION-PLAN.md`'s Phase 7 section brought in line with it.

### Slice 7.1: SMS that really goes out
- **Depends on:** 7.0.
- **Delivers:** BulkSMSBD's adapter and fake, with its contract suite; the circuit breaker around it; `tenant.sms_log`;
  one way to count units for charging and the allowance, the allowance enforced (D7-13); no SMS below zero (SMS-06,
  D7-23); a failed SMS charged nothing (SMS-08); blocked SMS logged (SMS-07); sign-in and reset limits checked against
  SMS-11, with its per-IP limit built (D7-27); the three modes and the force flag (D7-21). Today's codes, in the owner's
  words (D7-26), and notices move onto the real provider.
- **Done when:** one real SMS has reached the owner's phone and the contract suite passes.

### Slice 7.2: the shop's SMS events and templates
- **Depends on:** 7.1.
- **Delivers:** the ten events (SMS-01) with their switches and defaults (SMS-02, SMS-03); Bangla templates with
  variables, the shop name put first, reset to default (SMS-10, SMS-16, SMS-19, I18N-03); each sent where its event
  happens (§3.4); the spend cap and its 80% warning (SMS-13); the estimated cost (SMS-12); the per-event report
  (SMS-14); optional SMS in trial (SMS-15).
- **Built** (read agreed 2026-11-06, D7-28 to D7-31): each event is queued in the transaction where its order changes,
  at the single place it changes, then worded, refused at the cap, charged at the SMS rate (never below zero) and sent
  from its own job, which gives the charge back when the send fails and tries again. `tenant.sms_settings` keeps only
  what the owner changed. The routes are `/sms/settings` (with its estimates), `/sms/report` and `/sms/log`.

### Slice 7.3: email, the bell and push
- **Depends on:** 7.0.
- **Delivers:** Resend's adapter and fake; the bounce message (NTF-06); `tenant.notifications` and preferences; web push
  with its keys and subscriptions, and a test notice (NTF-02); every stand-in notifier replaced (D7-14); renewal,
  balance and limit warnings by in-app, push and email (NTF-05, BIL-14); the dashboard's update prompt checked
  (NTF-07).

### Slice 7.4: the notice board
- **Depends on:** 7.3.
- **Delivers:** notices, their audiences, versions, reads and acknowledgments (NTC-01 to NTC-11, NTC-15 to NTC-19);
  publishing at its time and expiring at its end (NTC-11); templates (NTC-12); a rate change linked to its notice
  (NTC-13); the operator's routes; sending by in-app, push and email (NTC-06).

### Slice 7.5: fraud checks
- **Depends on:** 7.0, and Slice 6.4 for RedX's check.
- **Delivers:** a fraud-source port with an adapter per courier that has a check (D7-6), and the shop's own orders as a
  source; the level and counts (FRD-01); the sources named (FRD-02); a 3-day cache (FRD-04); the automatic rule
  (FRD-05); never blocking (FRD-06); the per-minute limit (FRD-07); refusals in trial and lapsed states (FRD-08); a
  failing source skipped (FRD-11); the charge at a zero rate (D7-7).

### Slice 7.6: reading an order from a message
- **Depends on:** 7.0.
- **Delivers:** Gemini's adapter and fake, the provider and model a setting; the draft with its confidence (ORD-30);
  thanas matched to Lytro's list (ORD-31); images, empty and long input refused (ORD-32, ORD-33); the `ai_extraction`
  rate and the charge, or a use from an allowance (ORD-34, D7-16); allowances a shop can buy (D7-17); `ai_reply`
  hidden.
- **Done when:** a set of real pasted messages, in Bangla, English and the two mixed, reads well enough to fill the
  form, and the rate is set from what it costs.

### Slice 7.7: the screens
- **Depends on:** 7.1 to 7.6.
- **Sketch first** (`sketch-every-screen-before-building`), design doc and HTML mock: the dashboard's SMS settings with
  each event's switch, template, unit count and estimated cost; the SMS log and report; the bell, its list and
  preferences, and turning on push; the notice board, its urgent banner and important prompt; the fraud check on an
  order and a customer, and the automatic rule; "read an order from a message" on the order form; allowances in the
  add-on shop. The console's notice editor, audience, acknowledgments and read counts; the rate-change notice offer;
  allowances in the add-on catalogue.
- **Builds** them, pixel perfect to the approved sketch, in Bangla and English to the owner's style guide, and brings
  back the sentences the screens dropped while nothing was sent (D7-20).

---

## 7. Slice dependencies and order

```
7.0 plan ──► 7.1 SMS goes out ──► 7.2 events and templates ◄── checkpoint 7A
        │
        ├──► 7.3 email, bell, push ──► 7.4 notice board
        ├──► 7.5 fraud checks (RedX's after 6.4)
        └──► 7.6 reading orders
                          all server slices ──► 7.7 the screens
```

**Order, one slice at a time (D7-10):** 7.1 → 7.2 (checkpoint 7A: a real order's SMS on a real phone) → 7.3 → 7.4 →
7.5 → 7.6 → 7.7.

**What the owner provides, when its slice starts.** Each goes in a local file outside every repo, which I name when it's
needed and never open or print.

| Slice | Needs |
|---|---|
| 7.1 | `C:\Users\Dell\lytro-worktrees\bulksmsbd.env`, filled in: a **new** BulkSMSBD key (the one pasted in the read replaced), the sender ID and a test phone; and the server addresses allowed in BulkSMSBD's panel |
| 7.3 | A Resend account, and DNS records for the sending domain at Cloudflare |
| 7.5 | A Steadfast and a Pathao production key that may be used for checks, since Pathao's sandbox has no real history |
| 7.6 | A Gemini API key on a paid tier (D7-18), and a set of real customer messages with the names and numbers changed |

---

## 8. Non-functional requirements for this phase

- **Exactly once:** an SMS is sent and charged once for one event, even if the event's step is retried; a charge and
  its reversal are written in the transaction that caused them.
- **Never block:** a provider that's down delays or refuses only its own message or check (exit criterion 8).
- **Privacy:** an SMS log keeps the phone and the units, not the body of a code (as the outbox does today); a read keeps
  no message (D7-18); a fraud check keeps the level and counts only (FRD-04).
- **Isolation:** every new tenant table is in the isolation registry; notices' read state and acknowledgments never
  cross shops (NTC-18).
- **Limits:** SMS-11's sign-in limits, FRD-07's 30 checks a minute, and a per-shop limit on reads.

---

## 9. Risks

| Risk | Response |
|---|---|
| BulkSMSBD answers only on HTTP | Lytro calls it over HTTPS only (D7-2); if HTTPS fails, Slice 7.1 stops and the owner chooses another provider rather than sending the key unencrypted |
| BulkSMSBD has no delivery reports | the log shows sent and failed only (D7-15) |
| A key pasted in the read | the owner replaces it before Slice 7.1 (D7-12) |
| Bangla SMS cost more parts on the network than SMS-09's units suggest | the per-unit rate is set to cover it (SMS-09); Slice 7.1 measures a real Bangla message |
| Gemini reads Bangla orders poorly | Slice 7.6 tries real messages before the rate is set; the provider is a setting (D7-4) |
| A courier's check needs a production key and returns nothing in sandbox | Slice 7.5 tries it on a real key the owner provides |
| Phase size (eight slices) | checkpoint 7A after Slice 7.2; the notice board and reading orders can move to a later phase without re-planning |

---

## 10. Definition of done (per slice)

Same as Phase 6:
- its own branch and PR
- every listed requirement proven by a test written against its pass criteria
- a sabotage-confirm-restore pass on the slice's central rule, and on every rule about money it adds
- `typecheck`, `lint`, `build` and every package's tests clean, the full server suite where shared foundations change,
  and a real boot of the built server
- the isolation registry updated for any new route
- `KNOWN-GAPS.md` updated if anything listed here turns out not to hold
- this plan's slice entry marked shipped with its PR number

---

## Appendix A: what the providers' pages say

Nothing here has been tried. Each slice's read tries it before building on it.

### BulkSMSBD (SMS)
From the owner's account page, pasted in the read (its key isn't copied here):
- **Send:** `bulksmsbd.net/api/smsapi`, `GET` or `POST`, with `api_key`, `type=text`, `senderid` (an approved sender ID;
  the account's is a number, not a name), `number` (`88017…`, comma-separated for several) and `message`, URL-encoded.
  A second form sends a different message to each number (`messages`).
- **Balance:** `bulksmsbd.net/api/getBalanceApi?api_key=…`.
- **Answers:** 202 submitted; 1001 invalid number; 1002 sender ID wrong or disabled; 1007 balance insufficient; 1012
  "masking SMS must be sent in Bengali"; 1031 account not verified; 1032 IP not whitelisted; and others for account and
  price set-up.
- **OTP format:** "Your {Brand/Company Name} OTP is XXXX".
- **Not on the page:** HTTPS (the page shows `http://`; Lytro uses `https://` only, D7-2) and delivery reports. A third-party package shows only the
  submission answer, with a message ID ([rihabrahman/bulksmsbd-laravel](https://packagist.org/packages/rihabrahman/bulksmsbd-laravel)).
- **Tried in Slice 7.1's read (2026-11-06), from development:** the balance call and the send both answer over
  `https://`. Three real SMS reached the owner's phone, Bangla among them. Each part cost 0.35 TK, Bangla or English.
  There was no 1032 from the development machine; the server's own address is checked when it's deployed.

### Resend (email)
Chosen on third-party comparisons from 2026, which put its free tier at a few thousand emails a month, with low-priced
plans after that ([SendX](https://www.sendx.io/blog/transactional-email-api-comparison-for-developers-2026),
[Courier](https://www.courier.com/integrations/compare/amazon-ses-vs-resend)). The price and limits are to confirm on
Resend's own page in Slice 7.3.

### Gemini (reading orders)
Third-party trackers put Gemini 2.5 Flash-Lite at about $0.10 per million input tokens and $0.40 per million output
tokens ([morphllm](https://www.morphllm.com/gemini-api-pricing)), so a read of a pasted message costs a small fraction
of a taka. Newer Flash-Lite models are listed higher. The model and price are to confirm on Google's own page
(`ai.google.dev/gemini-api/docs/pricing`) in Slice 7.6.

### The couriers' checks
- **Steadfast:** `/fraud_check/score/{phone}`, with the shop's own key (`PHASE-6-PLAN.md` Appendix A).
- **Pathao:** third-party plugins describe `POST /aladdin/api/v1/user/success-rate`, with the phone in the body and the
  merchant's token, on production only: the sandbox returns no real history
  ([fraud-checker-bd-courier](https://packagist.org/packages/azmolla/fraud-checker-bd-courier)). Not in Pathao's own
  document.
- **RedX:** unknown until Slice 6.4 has its document open.
