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
   one is logged with its reason (SMS-07); essential and optional SMS both stop at zero (SMS-06, as D7-23 set it). Charging
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
| D7-10 | **When.** Phase 6 goes one slice at a time in another session. | Phase 7 is built beside it, in its own session, also one slice at a time. The two touch different code. Amended 2026-11-06 (the owner's word): Slice 7.6 is built in a second session beside Slice 7.2, since it touches neither SMS nor couriers. Amended again 2026-11-07 (the owner's word): Slice 7.5 is built in a second session beside Slice 7.3, since it touches neither notifications nor the notice board. | the whole phase |
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
| D7-16 | **A rate for reading orders.** ORD-34 charges an extraction rate, and none exists. | A new rate, `ai_extraction`, set by the operator before launch (0.10 TK a read, D7-36). The chat-reply rate (`ai_reply`) isn't shown to shops or the operator while chat is out, so no screen offers what doesn't exist. | Slice 7.6 |
| D7-17 | **Allowances.** | Allowances for reading orders are built in this release, and allowance becomes a kind a shop can buy (the first, D7-36). Allowances for fraud checks follow D7-7. | Slice 7.6 |
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
| D7-32 | **What the AI reads** (the owner's words, Slice 7.6's read, 2026-11-06: "extracting customer delivery address only from customer text"). | The customer's delivery details only: name, phone, zilla, thana, the address line, and a delivery note when the customer writes one. No items, delivery charge, advance or cash on delivery, so no product list goes to Gemini. ORD-30 amended. | Slice 7.6 |
| D7-33 | **Places** (Slice 7.6's read). | Gemini names the zilla and thana in English; Lytro matches them to its own list with the rules the couriers' areas use (one definition, now `PlaceMatcher` in delivery). A thana by its own name is found, a near one is filled in to check, and one off the list is left as written. No courier area is suggested: areas are picked at booking. ORD-31 amended. | Slice 7.6 |
| D7-34 | **What a read costs** (Slice 7.6's read). | Charged only when it finds a name with a phone, or a zilla on the list; anything less costs nothing. An answer that can't be used, or none in time (15 seconds), costs nothing either (ORD-33). ORD-34 amended. A shop's reads are held to 30 a minute, a flood guard and an operator setting. | Slice 7.6 |
| D7-35 | **The model** (the owner's pick after the tries, 2026-11-06). | Gemini 3.5 Flash-Lite. On 21 made-up messages it got 104 of 105 fields right, half its answers came in 1.4 seconds or less and none in more than 2.2 (Appendix A). The AI and its model are operator settings (`address_read_provider`, `address_read_model`), AI-10's rule. | Slice 7.6 |
| D7-36 | **The rate and the allowance** (the owner's picks, 2026-11-06). | 0.10 TK a read, about Lytro's cost (0.04 TK) and a margin. The first allowance: "200 reads 20 tk per month", the same price a read, bought only in a paid period (PLN-20). Both are editable data. | Slice 7.6 |
| D7-37 | **Real messages** (the owner's call, 2026-11-06). The key given for the read is on Google's free tier, where Google may use what it is sent. | Built against a fake now; the free key read only made-up messages. Before launch the owner turns billing on and real messages, names and numbers changed, are tried: the slice's done-when. | Slice 7.6 |
| D7-38 | **Where email comes from, and a bounce** (Slice 7.3's read, 2026-11-07). | Lytro's email comes from `Lytro <no-reply@mail.lytro.app>`, a subdomain as Resend advises; `mail` is already a reserved shop address. When Resend says an address bounced for good, or its reader marked Lytro's email as spam, Lytro stops emailing it, every email but a code its owner asks for, and the dashboard asks the owner to fix it (a banner now, a bell notice with the bell). A code that reaches the address, or a change of the owner's email, ends the stop. A bounce Resend calls temporary changes nothing. NTF-06 amended. | Slice 7.3 |
| D7-39 | **How long a notification is kept** (the owner's pick, 2026-11-07). | **30 days**, then deleted; an operator setting. The orders and payments a notice was about stay. | Slice 7.3 |
| D7-40 | **Which notifications can be switched off** (Slice 7.3's read). | Every type but money and account ones: payment to verify, money for a closed order, a gateway or listener phone needing attention, balance and limit warnings, renewal, plan and lifecycle changes, and a bounced email always stay on. One switch per type covers the bell and push together. NTF-04 amended. | Slice 7.3 |
| D7-41 | **The language of email and push** (Slice 7.3's read). | Each person's own: the server keeps the language they choose in the dashboard, and their email and push are written in it; Bangla until they choose. The bell shows each notice in the reader's current language. A code's email carries both languages, since the person may not have chosen one or have a shop to choose it in. The owner's lifecycle SMS keep their English words (KNOWN-GAPS §127). NTF-03 and I18N-03 amended. | Slice 7.3 |
| D7-42 | **Who hears of the account** (Slice 7.3's read). There is no billing permission; billing is the owner's. | Renewal, plan, limit and lifecycle notices go to the owner only. Low balance also goes to staff with `balance:manage`, who can top up. | Slice 7.3 |
| D7-43 | **Lytro's own notices, and the notice board's look** (Slice 7.3's read). | A notice about Lytro itself, not a shop (a listener phone revoked or sending too much, the day's unreadable wallet messages), is emailed in English to every enrolled operator, the addresses the fast-spend alert already uses. The owner's "marquee" answer is the notice board's: Lytro's announcements scroll as a marquee across the dashboard, settled in Slice 7.4's read and drawn in Slice 7.7. | Slices 7.3, 7.4, 7.7 |
| D7-44 | **The update prompt, and the slice in two** (Slice 7.3's read). | When a new version is deployed the dashboard shows "A new version is ready" with an Update button, kept until tapped, so a half-filled form is never lost; today it updates silently. Drawn and built in Slice 7.7. The slice is one PR (the owner's call, 2026-11-07): email first (Resend, bounces, each person's language, every email in it, operators' alerts), then the bell, push and the switches. | Slices 7.3, 7.7 |
| D7-45 | **Sources** (Slice 7.5's read, 2026-11-07). Only Steadfast publishes a check. The known plugins sign in to Pathao's and RedX's merchant panels with the shop's password, and RedX's sign-in now asks for an OTP. | Steadfast's own check through the shop's own key, and the shop's own orders. Pathao and RedX join only if they publish a check. | Slice 7.5 |
| D7-46 | **A shop without Steadfast** (the read). | Its own orders only, with Steadfast shown as not connected. Lytro's own key is never used for a shop's check. | Slice 7.5 |
| D7-47 | **Trial** (the read). FRD-08 refused checks in trial because they were to cost money. | Allowed while the fraud-check rate is zero; once it is raised, a trial is refused again. A lapsed shop is refused either way (LIF-09). Amends FRD-08. | Slice 7.5 |
| D7-48 | **What a check shows** (the owner's pick, 2026-11-07). Steadfast's own score is switched off, and it gives no counts. | Figures only, with no low, medium or high: Steadfast's delivered, cancelled and returned percentages, the size of its record and merchants' reports, and the shop's own counts. Amends FRD-01. | Slice 7.5 |
| D7-49 | **The shop's own orders** (the read). | Delivered, wholly or in part, count for the customer. Returned counts against them, and so does cancelled, but only for the customer's own reasons: customer cancelled, fake order, unreachable, advance not paid. Out of stock, a duplicate, other and an open order don't count. | Slice 7.5 |
| D7-50 | **The automatic check** (the read). FRD-05 made it an optional rule. | On for every new cash-on-delivery delivery, from any source, run apart from the order. The owner may switch it off or set a smallest amount. Takeaway and dine-in aren't checked. Amends FRD-05. | Slice 7.5 |
| D7-51 | **Permissions** (the read). | `fraud:read` runs a check and reads results; it is FRD-01's `fraud:check`. `fraud:manage` changes the automatic check. | Slice 7.5 |
| D7-52 | **Steadfast's answer, tried with a live key** (2026-11-07: three phones and a malformed number). | Whole percentages, a size band (`none`, `low`, `medium`) with a figure (`8` with medium, `1` with low), merchants' reports, and null counts and score (`scoring_disabled: true`), in 0.3 to 0.7 seconds. A malformed number got someone's figures too, so a number's form is checked before asking. What the figure counts isn't documented (KNOWN-GAPS §128). | Slice 7.5 |
| D7-53 | **How a notice is written** (the owner's pick, Slice 7.4's read, 2026-11-07). NTC-01 asks for bold, links and lists; NTC-16 for safety. | A small Markdown: `**bold**`, `[text](https://...)`, lines starting `- ` for a list, and blank lines between paragraphs, nothing else. A body is kept as typed in each language and turned into HTML by one renderer, which escapes every character first, so no one's markup gets through. Links are https only and open in a new tab without passing the referrer. | Slices 7.4, 7.7 |
| D7-54 | **The marquee** (the owner's pick; D7-43). | An urgent notice is NTC-04's banner, scrolling across every dashboard page until the person closes it. Each person closes their own, and closing isn't reading. An important notice is a prompt at the next sign-in until it is read or closed, and the badge. An info notice is on the board only. NTC-04 amended. | Slices 7.4, 7.7 |
| D7-55 | **Maintenance** (the owner's pick). NTC-14 also asks for the status page. | The dashboard counts down to a maintenance notice's window, from publishing until the window ends, and says when it is under way. The public status page waits for launch, so NTC-14 is partly done this release (KNOWN-GAPS §129). NTC-14 amended. | Slices 7.4, 7.7 |
| D7-56 | **How a notice is sent** (the owner's pick). NTC-06 emails every notice to every owner. | The bell and push for every notice, to the owner and the staff with `notices:read`; email to the owner for an important or urgent notice only; never an SMS, so no balance moves. Lytro's notices can't be switched off in the bell (a locked kind, D7-40). NTC-06 amended. | Slice 7.4 |
| D7-57 | **Each language whole** (my call; the owner may overrule it at the PR). NTC-01 has one title and a body in each language. | A title and a body in each language, at least one language whole, and a language with one has the other. The board shows the reader's language (Accept-Language, as the bell does), or the other when the notice has none in theirs (NTC-15). Titles up to 120 characters and bodies up to 5,000, in each language. NTC-01 amended. | Slice 7.4 |
| D7-58 | **Edits, withdrawals and templates** (my calls). | An edit to a live notice keeps the version it replaces, marks the notice "updated" and sends nothing again; a live notice keeps its publish time. Withdrawing hides it from every shop at once and keeps it, with its versions, for the operator. The templates are rate change, maintenance, outage and policy update (which asks for "I understand"). Given a rate change, the rate-change template fills the rate, its old and new values and the day from the change itself, and publishing the notice writes it onto the change (RAT-09). | Slices 7.4, 7.7 |
| D7-59 | **Who sees what, and when** (my calls). | The audience is read when a shop looks (NTC-02), so a shop that joins it sees a live notice on its board, though only the shops in the audience at publishing were sent it. A minute pass sends each notice once its time comes (NTC-11); past its end time a notice is simply not read, so it expires at once. The board keeps 24 months (NTC-03). NTC-07: the owner reads the board in read-only and locked shops, staff are kept out once it is locked, and an archived shop sees urgent notices only. Reads, acknowledgments and deliveries sit in `control` beside the notices, since the operator counts them across shops; each shop route reads only its own. NTC-20's secret keys come with Phase 8's shop API. One PR, the server only; the console's editor and the dashboard's board, banner, prompt and countdown are Slice 7.7's. | Slices 7.4, 7.7 |
| D7-60 | **The notice board's screens** (Slice 7.7's read, 2026-11-07, the owner's pick). Slice 7.4's server was being built in another session. | Drawn now, from NTC-01 to NTC-19 and Slice 7.4's agreed read (D7-53 to D7-59), and redrawn if 7.4's shapes change before it merges. | Slice 7.7 |
| D7-61 | **What the sketch covers** (the read). | Both apps, everything §6 lists for 7.7, and what earlier slices left for it: the console's settings for fraud checks and reading orders, courier notices in the bell (6.7), each person's language and the bounced email (7.3), and the reads left on the usage page (7.6). | Slice 7.7 |
| D7-62 | **Its PRs** (the read). | One sketch PR for both apps now, docs only, and one build PR for both after Slice 7.4 merges. Phase 8's server slices go on in between. | Slice 7.7 |
| D7-63 | **Where staff see a phone's fake order check** (the read). | On the new-order form once the phone is valid, before the order is made (the latest check, and a button to check it; never on its own while typing); on the order, the automatic check's result with "Check again"; and on the customer. The automatic rule's switch is in Settings. | Slice 7.7 |
| D7-64 | **An allowance over a longer term** (the owner's answers, 2026-11-07; KNOWN-GAPS §131). Its price was monthly times the term's months, but it gave 200 reads for the whole purchase, and it never renewed. | It gives its 200 reads for each month paid for, prorated exactly as its price, in one pool used any time until the purchase ends: a fresh 6-month term, 1,200 reads for ৳120; 20 days left of a month, about 130 for ৳13. It renews with the plan for the new term's reads, and never runs on into a period of its own (pay-as-you-go pays per use). Amends D7-36 and PLN-20. | Slices 7.6, 7.7 |

### 2.1 Points left to each slice's read

Each is settled in its slice's read, before code, and recorded there.

| Slice | To settle |
|---|---|
| 7.1 | **A real SMS to the owner's phone first, over HTTPS** (D7-2), sent from development with `SMS_FORCE_REAL` (D7-21). Staging sends for real, as production does. Whether BulkSMSBD has delivery reports (D7-15), the server addresses it must allow (its code 1032), its OTP format ("Your {Brand} OTP is XXXX") against the codes Lytro sends today, and Bangla's cost in parts. |
| 7.2 | The ten events' Bangla defaults, worded to the owner's style guide. Which events need a tracking link, and which link. What "estimated monthly cost" (SMS-12) counts from for a new shop. |
| 7.3 | Resend's sending domain and its DNS records, the bounce message (NTF-06), and how long a notification is kept. Which events a user can switch off (NTF-04): essential ones like "payment to verify" may stay on. **Settled in Slice 7.3's read (2026-11-07):** D7-38 to D7-44. |
| 7.4 | How a notice's Bangla and English bodies are written in the console (bold, links and lists, NTC-01) and kept safe (NTC-16). Whether the status page (NTC-14) is in this release. **Settled in Slice 7.4's read (2026-11-07):** D7-53 to D7-59. A small Markdown; the countdown now and the status page after launch; email for important and urgent notices only. |
| 7.5 | **What each courier's check returns, tried with a real key:** Steadfast's score, Pathao's success-rate call (Appendix A), RedX's if it has one, once Slice 6.4 lands. How the level (low, medium, high, unknown) is worked out from the counts. Whether checks stay refused in trial (FRD-08) now that they're free. **Settled in Slice 7.5's read (2026-11-07):** D7-45 to D7-52. Pathao and RedX publish no check, there is no level, and trials may check while checks are free. |
| 7.6 | **Real pasted messages read by Gemini first**, in Bangla, English and the two mixed, to choose the model and set the rate. How thanas are matched (ORD-31), and the confidence shown. **Settled in Slice 7.6's read (2026-11-06):** D7-32 to D7-37. Made-up messages chose the model; the real ones wait for a key with billing on (D7-37). |
| 7.7 | Settled by its sketch: see that slice. **Read agreed 2026-11-07:** D7-60 to D7-63. |

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
| PLN-20 | allowances for reading delivery details: bought in a paid period, used before the balance, renewed with the plan | allowances for fraud checks; the uses left on the usage page, with LIM-01's warnings | once checks have a price (D7-7); Slice 7.7, with the usage page |
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
| `control.mail_suppressions` (the addresses Lytro stopped emailing), `tenant.users.language`, the outbox's `provider_message_id` | NTF-06, I18N-01, D7-3 | 7.3 |
| `control.notices`, `control.notice_versions`, `control.notice_reads`, `control.notice_acknowledgments`, `control.notice_deliveries` | notices, their earlier versions (NTC-08), each person's reads and closed banners, each shop's acknowledgment (NTC-05), and each shop a notice was sent to (NTC-06). Built in migration 0119 | 7.4 |
| `tenant.fraud_checks`, `tenant.fraud_rules` | each check's figures by source, what each source did, the check whose Steadfast answer it reused, and its cost (FRD-01 to FRD-04, FRD-11); the automatic rule, a row once the owner changes it (FRD-05). No shared-counts column in this release. Built in migration 0115 | 7.5 |
| `tenant.order_extractions` | each charged read, without the message (D7-18): its length, confidence and cost, and the allowance that paid, if one did; an allowance's uses are its rows | 7.6 |
| the `ai_extraction` rate, the first allowance item, the read's three operator settings | D7-16, D7-17, D7-35, D7-36 | 7.6 |

---

## 5. API surface for this phase

| Who | Route | Notes |
|---|---|---|
| Team, `sms:read`, `sms:manage` | `GET`, `PUT /api/v1/sms/settings`; `POST /api/v1/sms/templates/:event/reset`; `GET /api/v1/sms/log`; `GET /api/v1/sms/report` | SMS-02, SMS-10, SMS-14, SMS-19 |
| Team | `GET /api/v1/notifications`, `POST /api/v1/notifications/read`; `GET`, `PUT /api/v1/notifications/preferences`; `POST`, `DELETE /api/v1/push/subscriptions`; `POST /api/v1/push/test` | NTF-01, NTF-02, NTF-04 |
| Team, `notices:read` | `GET /api/v1/notices`, `GET /api/v1/notices/summary`, `GET /api/v1/notices/:id`; `POST /api/v1/notices/:id/read`, `POST /api/v1/notices/:id/dismiss`; `POST /api/v1/notices/:id/acknowledge` (the owner) | NTC-03 to NTC-05, NTC-09, NTC-14 |
| Operator | `GET`, `POST /api/v1/operator/notices`; `GET`, `PATCH /api/v1/operator/notices/:id`; `POST /api/v1/operator/notices/:id/withdraw`; `GET /api/v1/operator/notices/:id/acknowledgments`; `POST /api/v1/operator/notices/template` | NTC-01, NTC-05, NTC-08, NTC-09, NTC-12 |
| Team, `fraud:read` (FRD-01's `fraud:check`, D7-51); changing the rule `fraud:manage` | `POST /api/v1/fraud-checks`, `GET /api/v1/fraud-checks?phone=`; `GET`, `PUT /api/v1/fraud-checks/rule` | FRD-01, FRD-05, FRD-07 |
| Team, `orders:manage` | `POST /api/v1/orders/read-address` | ORD-30 to ORD-34 (D7-32) |
| Providers | `POST /api/v1/webhooks/email/resend` | bounces (NTF-06), signed |
| Team, the person's own | `PUT /api/v1/me/language`; `GET /api/v1/me`'s `language` and `emailBounced` | I18N-01, NTF-06 (Slice 7.3) |

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
- **Built, email** (read agreed 2026-11-07, D7-38 to D7-44): Resend's adapter, behind D7-22's rule, sends each email with
  the outbox's own key, so a retry is never a second email; a refusal is final and a busy Resend is tried again. A signed
  bounce or complaint stops the address (`control.mail_suppressions`) until a code reaches it or the owner's email
  changes, and `GET /me` says so for the banner. `PUT /me/language` keeps each person's language on their row, and every
  email to an owner is written in it from one definition per notice, Bangla until they choose. An owner who adds or
  removes an email in their account now has their shops' notices follow it; until now the shop kept the email it was
  created with, so an owner who signed up by phone was never emailed. Lytro's own listener notices email its operators.
- **Built, the bell and push:** `tenant.notifications` keeps one row for each person a notice reaches (the owner, and the holders of its kind's permission, less those who switched it off), with its words in both languages and where it leads; the bell reads it in the reader's language and push sends it in the language they chose. Every one of the seven stand-in notifiers is now a notification, nothing that calls them changed, and every notice about the account goes by email, the bell and push at once. Push is Web Push signed with Lytro's VAPID keys, sent from its own job and never tried twice (the bell has it), and a subscription is taken only on a push service's address. Money and account kinds can't be switched off. The nightly clean-up keeps 30 days. One PR, migration `0116_notifications`. The banner, the bell, the switches, the language switch, the service worker that shows a push and the update prompt are Slice 7.7's.

### Slice 7.4: the notice board
- **Depends on:** 7.3.
- **Delivers:** notices, their audiences, versions, reads and acknowledgments (NTC-01 to NTC-11, NTC-15 to NTC-19);
  publishing at its time and expiring at its end (NTC-11); templates (NTC-12); a rate change linked to its notice
  (NTC-13); the operator's routes; sending by in-app, push and email (NTC-06).
- **Built (2026-11-07), to D7-53 to D7-59:** the operator writes a notice (a draft until it has a publish time), edits it,
  withdraws it, sees what came of it (shops told, people, reads, acknowledgments) and who has and hasn't said "I
  understand", and starts one from a template. A minute pass sends each due notice to every shop in its audience, one
  shop at a time with its delivery row, so a pass cut short carries on and never tells a shop twice. The bell and push
  reach the owner and the staff with `notices:read`, and an important or urgent notice also emails the owner. Each shop's
  board reads the notices for it now, in the reader's language, pinned first and then newest, by category or words, with
  each person's unread count. Its summary gives every page the urgent banners, the important prompts, what the owner must
  acknowledge and the next maintenance window. The owner's "I understand" is once per shop, in its activity log and
  Lytro's. Found on the way: the server could never have written a notice onto its rate change, since the app had no
  right to update `control.rate_history`; the migration grants that one column. One PR, migration `0119_notice_board`.

### Slice 7.5: fraud checks
- **Depends on:** 7.0, and Slice 6.4 for RedX's check.
- **Delivers:** a fraud-source port with an adapter per courier that has a check (D7-6), and the shop's own orders as a
  source; the level and counts (FRD-01); the sources named (FRD-02); a 3-day cache (FRD-04); the automatic rule
  (FRD-05); never blocking (FRD-06); the per-minute limit (FRD-07); refusals in trial and lapsed states (FRD-08); a
  failing source skipped (FRD-11); the charge at a zero rate (D7-7).
- **Built (2026-11-07), to D7-45 to D7-52:** Steadfast's check through the shop's own key and the shop's own orders,
  figures only; Steadfast's answer reused for three days; the automatic check on every new cash-on-delivery delivery;
  free at launch; a trial checks while checks are free.

### Slice 7.6: reading an order from a message
- **Depends on:** 7.0.
- **Narrowed by its read (D7-32 to D7-37):** the customer's delivery details only, placed by Lytro's own matcher, charged
  only when something is found.
- **Delivers:** Gemini's adapter and fake, the provider and model a setting; the draft with its confidence (ORD-30);
  thanas matched to Lytro's list (ORD-31); images, empty and long input refused (ORD-32, ORD-33); the `ai_extraction`
  rate and the charge, or a use from an allowance (ORD-34, D7-16); allowances a shop can buy (D7-17); `ai_reply`
  hidden.
- **Done when:** a set of real pasted messages, in Bangla, English and the two mixed, reads well enough to fill the
  form, and the rate is set from what it costs. The real messages wait for a key with billing on (D7-37).

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
- **Built (2026-11-08), to the sketch (#326, D7-60 to D7-63):**
  - **The dashboard:**
    - SMS settings, the log and the report;
    - the bell, its switches, and push on a device, with the worker that shows a push;
    - each person's language, the bounced-email banner and the update prompt;
    - the notice board, a notice, the urgent marquee, the important prompt and the maintenance countdown, and how lapsed
      shops see them;
    - the fake order check on New order, the order and the customer, and its rule;
    - reading an order from a message;
    - allowances in the add-on shop and on Usage;
    - the SMS each action sends (D7-20).
  - **The console:**
    - the notices, from blank or a template, the editor with its preview, the publish panel with the shops it reaches,
      a notice's page with its figures and versions, a live edit, withdrawing, and who said "I understand";
    - the rate-change offer on Rates;
    - the nine settings its page lacked;
    - the reads allowance in the add-on catalogue.
  - **What the screens needed of the server:**
    - an order's automatic check as it stands, with why one didn't run (`tenant.fraud_check_skips`, migration 0120);
    - the always-sent SMS as they read and who pays, from one definition the senders now share;
    - the owner's phone and the spend cap's cycle;
    - the order number on each SMS log row;
    - the reads allowance on Usage and the shop's add-ons;
    - how many shops a notice reaches before publishing;
    - who wrote a notice and each version;
    - a rate change's id when saved and on recent changes.
  - **Where it differs from the sketch:** KNOWN-GAPS §132.
- **Sketched (2026-11-07, D7-60 to D7-63):** the dashboard's Part 37 (128 screens, `TENANT-DASHBOARD-DESIGN.md`
  §7.40) and the console's Notices and Pricing and platform screens (44, `OPERATOR-CONSOLE-DESIGN.md` §10c). The
  build needs a few server additions, listed in each design doc (§10 and §15). Drawing it found two faults in
  Slice 7.6's allowance (KNOWN-GAPS §131).

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
| 7.5 | A Steadfast production key that may be used for checks: given 2026-11-07 in `steadfast-live.env` and used read-only for the try (D7-52). Pathao and RedX have no check to try (D7-45) |
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

## 11. Close-out check (2026-11-09)

Checked after Slice 7.7 merged (#329), against §1's ten criteria. Every slice is built. Three reviews read each of §3's 70 requirements against the tests and the code behind them, looking for the assertion and not for a test that names the ID. What they found was fixed in this check's own pull request, which holds the fixes, the tests, this section and the SRS's amendments.

1. **Every completed requirement has a test or a recorded manual check: holds, with the exceptions below.**
   - **Fixed by this check:**
     - SMS-01, SMS-08: an order's two SMS were one job, so when the second failed for a moment the whole job ran again, and the first went out and was charged again, up to four times. Each event is now its own job.
     - SMS-11, SMS-04: requests for a code arriving together all passed the cooldown and the caps, each sent and charged, and two people could both take a shop's last free SMS. They now wait their turn. Shopper codes likewise.
     - A relay that stopped after handing a job to the queue and before marking it sent would hand it over again. The job's ID now comes from its outbox row, so there is one job. The key `SmsEventQueue` passed did nothing on a standard queue, and is gone.
     - SMS-10: `{ amount }` written with spaces was texted as typed; anything in braces is now checked. The sample's link now uses the shop's own domain, as the SMS does.
     - PRF-05: a call from before a circuit opened could close it again, and failures that overlapped counted as one. Fraud checks shared a courier's circuit with its bookings, so failing checks could stop bookings; they have their own.
     - PRF-05, carried in from Phase 6: an opened courier circuit now emails the operators, once an hour for each courier.
     - NTF-02: a push outage counted against every browser until it was removed; only the push service's own refusal does now. Sign-out now stops that browser's pushes, and the card asks the server whether the browser is subscribed for the person looking, in this shop. Each notification has its own tag, so a second new order no longer silently replaces the first on the phone.
     - NTF-06: a bounced address told the owner again for each report. NTF-07: nothing asked for a new version without a page load; the dashboard now asks every 30 minutes and when the tab comes back.
     - NTC-08: a withdrawn notice stayed in the bell with its words for up to 30 days, and one withdrawn while going out kept going. It now leaves the bell and its badge at once, a push still waiting doesn't go, and the shops not yet reached hear nothing. NTC-07: a locked or suspended shop's staff are no longer told of a notice they can't open.
     - FRD-03, D7-46: a free own-orders check was refused on a short balance, and a shop that disconnected Steadfast went on seeing its last answer for three days. ORD-33: a read refused for money used up the minute's reads.
     - LIF-18: the warning now states the deletion date, and a late run gives the days really left. SUP-01: the setup checklist's SMS item was still greyed as coming in Phase 7; it opens the settings and ticks once events are chosen. TRL-05's banner still told a trial shop the rule from before D7-23.
   - **Amended, the requirement and what was built having parted:** TRL-05 (D7-23), FRD-06 and FRD-11 (their pass lines named levels and an aggregator that D7-48 and D7-5 removed), NTC-14 (the status page is later, D7-55), API-11 (no route sends an SMS on request), and criterion 2's −5 TK (D7-23).
   - **Tested by this check, built but asserted nowhere:** FRD-03's charge for a reused answer, FRD-05 through the real worker, I18N-03 with an edited template, NTC-10's other routes and a person without the permission, NTC-19 at 360 px, NTF-02's card in a browser, NTF-03, NTF-05 and BIL-14's bell, push and unchanged ledger, ORD-30 saving nothing, SMS-04 and LIF-18's unchanged counter, SMS-09's unit size, SMS-10's longer name, SMS-12's 30-day estimate, SMS-15's charge on a trial, SMS-18's one copy, SMS-19's parts and reset, and Resend's and Web Push's circuits.
   - **Not built, open in KNOWN-GAPS:** §136.
2. **An SMS is charged once, and never for nothing: holds, except if a server stops mid-send.** A provider failing can no longer charge twice, and requests together count each other (`sms-events`, `sms-charged-once`, `queue`). What remains needs a server to stop between the charge and the send's answer, at most one SMS's price each time: §124, and §136 for codes. A code that goes out on its retry is free (§122).
3. **The golden path: holds.** `test/phase-7-golden-path.e2e.spec.ts` walks a shopper's order from placed to delivered, and after each step checks the SMS sent against the log, the log against the ledger, the balance against the ledger, and each bell row against its push. Five deliberate breaks were each caught.
4. **Notifications reach the right people only: holds** (`notifications`, `notices`, `lifecycle`), now including sign-out and a shop its staff can't open.
5. **Notices reach their audience: holds** (`notices`).
6. **A fraud check never blocks an order: holds** (`fraud-checks`), now through the real worker, with a disconnected Steadfast saying so.
7. **Reading an order saves nothing by itself: holds** (`address-reads`), now asserted.
8. **Every outside call sits behind the breaker: holds** (`circuit-breaker`, `courier-calls`, `sms-real`, `email`, `notifications`, `address-reads`).
9. **The milestone: waits for the owner's accounts.** The checklists are below.
10. **CI and the pull-request flow: holds.** Every slice went through a pull request; this check's own run is recorded on its pull request.

The fixes were each proven by a deliberate break of what they fixed: 39 in all, each caught and undone.

### Criterion 9: what to do, and what to record

Each needs a real account, so each is the owner's. Keep every key in a file outside every repository. The development server only sends for real with its `*_FORCE_REAL` setting on.

**The development database first.** It is at migration 0103, and these need the tables since. Migrate it once, then the rest can follow in any order.

**One real SMS (checkpoint 7A).**
1. In `apps/server/.env` set `SMS_FORCE_REAL=true`, `BULKSMSBD_API_KEY` and `BULKSMSBD_SENDER_ID`.
2. Start the server and ask for a sign-in code to your own phone. It arrives.
3. On a shop with a balance, place an order with your phone as the customer. The "order placed" SMS arrives in Bangla, the shop's SMS name first.
4. Record: the date, the SMS log's row (sent), and the one charge in the shop's balance history.

**One real email.**
1. In Resend, verify `mail.lytro.app` (the DNS records it lists).
2. Set `EMAIL_FORCE_REAL=true`, `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET`, and point Resend's webhook at `/api/v1/webhooks/email/resend`.
3. Add your email on the Account page, so a code goes out.
4. Record: the date and that it arrived, not in spam.

**One real push.**
1. Run `npx web-push generate-vapid-keys` once, and keep the pair forever: changing it ends every browser's subscription.
2. Set `PUSH_FORCE_REAL=true`, `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. Push needs https, so this is on a deployment or a tunnel.
3. On the phone, open Settings, Notifications, Turn on push, then Send a test. On an iPhone, add Lytro to the Home Screen first.
4. Record: the date, the phone, and that a new order's push opened that order.

**One real read of a pasted Bangla order.**
1. Turn billing on for the Gemini key's Google project (§125; on the free tier Google may read what it's sent).
2. Set `GEMINI_API_KEY`.
3. On New order, paste a real customer's message with the name and number changed.
4. Record: the date and which fields it got right. §125 asks for a set of real messages before launch.

**The update prompt (NTF-07).** After two deployments, with the dashboard left open on the first, the prompt appears without a reload, within 30 minutes or on coming back to the tab. Record the date.

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

- **Google's own pages, read in Slice 7.6 (2026-11-06; `ai.google.dev` now goes to `aistudio.google.com/docs`):**
  stable text models include 3.6 Flash ($0.75 in and $3.75 out per million tokens to 2026-12-31, then $1.50 and
  $7.50), 3.5 Flash-Lite ($0.30 and $2.50) and 3.1 Flash-Lite ($0.25 and $1.50); 2.5 Flash is deprecated and goes to
  3.5 Flash-Lite from 2026-12-01. On the paid tier (billing on), prompts aren't used to improve Google's products and
  are kept a limited time for abuse checks only; on the free tier they are used, and people may read them. The API
  can answer as JSON to a given schema.
- **Tried in Slice 7.6's read (2026-11-06), 21 made-up messages** in Bangla, English and the two mixed, with old
  spellings, landmarks, two phones, and two messages with no address: a read sends about 430 tokens and gets about
  70 back. 3.5 Flash-Lite got 104 of 105 fields right, half its answers in 1.4 seconds or less, the slowest 2.2;
  3.1 Flash-Lite also 104 but some reads took 15 to 30 seconds and one never answered; 3.6 Flash "thinks" first,
  about ten times the cost, and without it wrote "Kotwali" for town thanas. A line on police thanas made "Tongi" read
  as Gazipur Sadar; "Fatullah", written in Bangla, stays off the list for staff to pick. At about 122 TK to the dollar
  a read costs Lytro about 0.04 TK on 3.5 Flash-Lite. Three of those messages went through the built adapter too
  (`gemini-live.spec.ts`).

### The couriers' checks
- **Steadfast:** `GET /fraud_check/score/{phone}` on `portal.packzy.com/api/v1`, with the shop's own `Api-Key` and
  `Secret-Key` (`PHASE-6-PLAN.md` Appendix A). Tried live 2026-11-07: see D7-52. A community document's shape (total and
  delivered counts, a success ratio, a risk level) is not what it answered.
- **Pathao:** no check in its own API document. Plugins sign in to its merchant panel (`merchant.pathao.com/api/v1/login`)
  with the shop's username and password, then post the phone to `/api/v1/user/success`, which answers successful and
  total deliveries ([Fraud-Checker-BD-Courier-Laravel](https://github.com/AbiruzzamanMolla/Fraud-Checker-BD-Courier-Laravel)).
  Lytro keeps no Pathao password (Slice 6.3), so this isn't used (D7-45).
- **RedX:** no check in its OpenAPI document. Plugins sign in to its panel (`api.redx.com.bd/v4/auth/login`) with the
  shop's phone and password and read `customer-success-return-rate`. Its sign-in now asks for an OTP, so it can't be
  automated (D7-45).
