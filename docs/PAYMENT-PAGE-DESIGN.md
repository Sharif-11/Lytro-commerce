# Hosted payment page: manual payments by Send Money

Status: v3.1, 2026-11-04 (built, §7). v3 of 2026-11-04 (Slice 5.8's part 2 read: where it lives, WhatsApp and call, no SMS promise, no screenshot). v2 of
2026-10-20, amended 2026-11-02 (Slice 5.4b: correcting a typed ID, and what a review tells a shopper). The design of
`pay.lytro.app/<session>`, the page a shopper lands on to pay a shop by bKash, Nagad, Rocket, Upay or bank transfer. A wallet
on automated hands the shopper on to its own checkout from here (PAY-06). The platform's own payments stay in the dashboard's
wallet step (amended 2026-11-03, D5-3). It is built in Slice 5.8's part 2, and this document is the spec for that work. The
interactive prototype is `docs/brand/lytro-payment-page.html` (320 px, 390 px and the 1280 px desktop; Bangla with the English
switch; every wallet and every session state).

**Decision, 2026-10-20.** The owner chose to match a reference layout exactly: the manual-payment page of
ZiniPay (`secure.zinipay.com/demo/payment`, screenshots taken 2026-10-20 at 1920 px and at 320 px). The
page below reproduces that layout element for element, with the spacing values its markup uses
(Tailwind: `m-2 p-2 rounded-xl` top bar, `p-6 rounded-xl` coloured card, `text-xs sm:text-sm font-light`
list, fixed bottom button with `pt-7 pb-[max(14px,env(safe-area-inset-bottom))]`, `sm:max-w-2xl
sm:rounded-lg sm:shadow-xl` card from 640 px). Where the SRS requires something the reference does not
have (the PIN notice, "Secured by Lytro", "Report this page", the session states after Verify), it is
added in the same visual language, as one small line under the card and as white status cards.

**Decisions, 2026-11-04 (Slice 5.8's part 2 read).** The server renders the page (§6). WhatsApp and call stay; support chat goes.
Nothing promises an SMS. The screenshot is dropped, and PAY-18 with it. Two deliberate departures from the reference, for the
reasons named: its faded note and light list text are now readable, since Bangla's thin strokes vanish otherwise; and its English
buttons have Bangla labels in Bangla mode, since PAY-22 says the switch changes all visible text. Figures are Western digits, as
everywhere in Lytro's Bangla.

Requirements covered: `SRS-detailed.md` §19.1 (WAL-01 to WAL-06, WAL-18), §19.2 (PAY-01 to PAY-23, PAY-18 withdrawn), §19.3
(VER-01, VER-02, VER-07), §19.4 (TVR-02, TVR-03), §20.1 (I18N), TEN-16, TEN-18, BRN-04.

---

## 1. The page

Two screens and a set of end states, all inside one frame.

### 1.1 Frame

- **Page**: background sky-50 (`#f0f9ff`). Below 640 px the content is full-bleed with 16 px side padding, the page is at least
  the viewport height and the top bar stays at the top. From 640 px the content sits in a white card, 672 px wide, 8 px corners,
  large shadow, centred horizontally and vertically when shorter than the viewport.
- **Top bar** (inside the card): a frosted strip (white at 65 %, 1 px sky-100 border, 12 px corners, soft blue shadow, 8 px margin
  and padding below 640 px, 12 px from 640 px) with a bold **back arrow** on the left and a bold **close** on the right. Back returns
  to the picker from a wallet screen, and is left out where there is nowhere to go back to. Close goes to the cancel address (PAY-01)
  while the session is open, and on an end state does what the fixed button does. A screen with neither has no bar: taking you to
  bKash, suspended, no such page, and verified with no shop to return to. Icons 28 px, 2.5 px stroke, near-black.
- **Fixed bottom bar**: on every wallet screen a full-width button, ভেরিফাই করুন (VERIFY TRANSACTION in English): 52 px, 12 px corners,
  bold white text, uppercase in English, the wallet's colour, large shadow, fixed to the bottom of the viewport inside the same 672 px
  column, with a 28 px fade above it and a 14 px (or the safe-area) gap below. The content gets 96 px of bottom padding below 640 px
  so nothing hides under it.

### 1.2 Screen 1: the picker (`pick`)

Top to bottom, centred:

1. **Test strip**, on a test account's page only (VER-11): "টেস্ট পেমেন্ট: আসল টাকা কাটবে না।", amber, 8 px below the bar.
2. **Brand row** (24 px below the bar): the shop's logo in a 56 px circle, or its monogram on a teal tile (TEN-16), the shop name bold
   18 px, the order number under it (PAY-05), and a **বিস্তারিত** pill (28 px, rounded, 1 px grey border) that opens a sheet with the order
   number, what is being paid for (each item's name and quantity) and the amount.
3. **Contact buttons** (32 px below): two 48 px white squares with 12 px corners and a hairline: WhatsApp (green) and call (blue), both
   from the shop's contact phone (TEN-30), both left out when it isn't set.
4. **Back from an automated wallet** (24 px below), only when `gatewayResult` is set: a yellow-50 card with "bKash-এ পেমেন্ট শেষ হয়নি" or "bKash
   পেমেন্টটি নিতে পারেনি", "আবার চেষ্টা করুন, অথবা নিজে টাকা পাঠিয়ে TrxID দিন।", and two buttons: আবার bKash-এ যান in the wallet's colour, which asks for the
   checkout again, and নিজে টাকা পাঠান, which opens the wallet's screen below.
5. **মোবাইল ব্যাংকিং** bar (24 px below, 16 px inset): blue (`#1e8fe0`), 8 px corners, white bold 18 px, centred.
6. **Logo tiles** (32 px below, 20 px inset): white tiles 70 px tall with 12 px corners and a soft shadow, four across from 640 px and two
   across below it, each holding one wallet's official mark centred: bKash, Nagad, Rocket, Upay. Every wallet the shop takes appears
   (WAL-05, WAL-06). Picking one on automated sends the shopper on to its own checkout, through "bKash-এ নিয়ে যাওয়া হচ্ছে…" (`handing`). If there is
   nowhere to send them, the fee being short or the gateway down, they carry on here as with any wallet (PAY-06).
7. **ব্যাংক ট্রান্সফার** bar and one tile, the same two pieces, only when the shop takes bank transfers (WAL-14).
8. **Pay bar** (16 px below, 16 px inset): sky-100 with sky-900 bold 20 px text, "পেমেন্ট: 250 টাকা" ("Pay 250 BDT").
9. **Time left** (8 px below, 13 px): "সময় বাকি 29:40" (PAY-03, PAY-05), then the legal line.

A session that names the shopper's wallet opens on that wallet's screen rather than here, and its back arrow leads here. With no method
left to offer, the page says "এই দোকান এখন অনলাইনে পেমেন্ট নিচ্ছে না" and shows the contact buttons (`no-methods`).

### 1.3 Screen 2: a wallet (`bkash`, `nagad`, `rocket`, `upay`)

1. **Header card** (12 px below the bar): white, 16 px corners, hairline, soft shadow, 12 px padding; the wallet's mark in a 96 × 56 grey box
   on the left; on the right a 1 px divider and the amount **250 ৳** bold 24 px.
2. **Note** (16 px below): a yellow-50 strip with a yellow-100 border, 4 px corners, grey-700 text at 12 px below 640 px and 14 px above:
   "**নোট:** টাকা পাঠানোর 5-10 সেকেন্ড পর ভেরিফাই করবেন।"
3. **The shop's note** (8 px below), when the account has one (PAY-05): a grey-100 strip of the same shape, "**দোকানের নোট:** …".
4. **Coloured card** (8 px below): the wallet's colour, 12 px corners, 24 px padding, white text, medium shadow.
   - Title, centred, 16 px medium at 95 %: "ট্রান্সজেকশন আইডি দিন".
   - The **transaction-ID box**: white, 44 px, 8 px corners, placeholder centred in grey.
   - The **sender-number box** (8 px below), the same at 13 px: "যে নম্বর থেকে পাঠালেন (ঐচ্ছিক)" (PAY-05, VER-02).
   - **নির্দেশনা** (16 px below): bold 14 px, uppercase with letter spacing in English, a 1 px line in black at 15 % under it, and the **countdown**
     at its right end, a clock and "29:40".
   - The **list**: one row per step, 8 px vertical padding, a 1 px black-at-15 % line between rows, a 6 px white dot as the bullet, text at 12 px
     (14 px from 640 px); the key words in **bold yellow** (`#fde047`) at 16 px (18 px from 640 px): the USSD code, the wallet's name, "Send Money",
     the number, the amount, SUBMIT, Transaction ID, ভেরিফাই. The recipient number carries a **কপি** button: black (`#111827`), 30 px, 8 px corners, copy
     icon and the word in white.
5. **Legal line** (4 px below, grey-700 12 px, centred), on every screen: "🔒 Secured by Lytro · এই পেজ কখনো PIN বা OTP চায় না · রিপোর্ট করুন · English" (TEN-18, PAY-05,
   TVR-02, PAY-22). Report opens a sheet with four reasons (TVR-02), and something else needs a line of note. The English link is the switch.

### 1.3a Bank transfer (`bank`)

The same header and the shop's note, with no yellow note and no sender box. The card is neutral teal-700 (`#0f766e`): "ব্যাংকের রেফারেন্স দিন", one box, the same
INSTRUCTIONS line with its countdown, then rows for the amount to send, the bank, the account name, the account number, the branch, the routing number and
SWIFT, each set value shown and the number, routing and SWIFT with কপি (WAL-14, WAL-16). No phone can read a bank transfer, so verifying goes straight to the
shop's check.

### 1.4 The steps, per wallet

As the reference words them, with the shop's number and the session's amount substituted. The account type
changes the verb (personal: Send Money; agent: Cash Out; merchant: Payment, PAY-05) and the third step's
lead ("প্রাপক নম্বর", "এজেন্ট নম্বর", "মার্চেন্ট নম্বর").

| Wallet | Steps |
| --- | --- |
| bKash | `*247#` ডায়াল করে আপনার `BKASH` মোবাইল মেনুতে যান অথবা `BKASH` অ্যাপে যান। · `"Send Money"` -এ ক্লিক করুন। · প্রাপক নম্বর হিসেবে এই নম্বরটি লিখুন: `01712345678` [Copy] · পরিমাণ: `250` টাকা দিয়ে `SUBMIT` করুন। · এখন উপরের বক্সে আপনার `Transaction ID` দিন এবং `ভেরিফাই` করুন। |
| Nagad | `*167#` ডায়াল করে আপনার `NAGAD` মোবাইল মেনুতে যান অথবা অ্যাপে যান। · `"Send Money"` এ ক্লিক করুন। · প্রাপক নম্বর: `01812345678` [Copy] · পরিমাণ: `250` টাকা দিয়ে `SUBMIT` করুন। · `Transaction ID` দিয়ে `ভেরিফাই` করুন। |
| Rocket | `*322#` অথবা `ROCKET` অ্যাপে যান। · `"Send Money"` নির্বাচন করুন। · প্রাপক নম্বর: `017123456789` [Copy] · পরিমাণ: `250` টাকা দিয়ে `SUBMIT` করুন। · `Transaction ID` দিয়ে `ভেরিফাই` করুন। |
| Upay | `*268#` অথবা `UPAY` অ্যাপে যান। · `"Send Money"` সিলেক্ট করুন। · প্রাপক নম্বর: `01712345678` [Copy] · পরিমাণ: `250` টাকা দিয়ে `SUBMIT` করুন। · `Transaction ID` দিয়ে `ভেরিফাই` করুন। |

Confirm each line against the wallet's current app before the build; the USSD codes and menu names above
are the ones in use on 2026-10-20.

### 1.5 Colours and marks

| Wallet | Card and button | Mark |
| --- | --- | --- |
| bKash | `#CF2772` (from the reference markup) | `third-party/bkash.png` (the Bangla wordmark; swap in the English one when the merchant kit arrives) |
| Nagad | `#D71E22` | `third-party/nagad.png` |
| Rocket | `#892C8C` | to fetch from Dutch-Bangla Bank's kit; the prototype shows "Rocket" in its colour |
| Upay | `#1F4E98` | to fetch from UCB's kit; the prototype shows "উপায়" in its colour |

Nagad, Rocket and Upay values are sampled from the reference screenshots; the build takes the exact values
and files from each merchant kit and records them in `docs/brand/third-party/README.md`. Type is Hind
Siliguri (400 to 700), the family the reference renders both scripts in, served from Lytro's own files, since PAY-23 rules out
Google Fonts; the brand's Inter and Noto Sans Bengali are not used on this page. (The prototype loads it from Google Fonts, which only the
real page's policy forbids.)

---

## 2. After Verify: the session states

Tapping Verify sends the transaction ID (PAY-07) and the coloured card is replaced by a white status card in the same frame (16 px corners, centred
icon, title, one line, a grey detail box); the fixed button changes with the state. The page checks the session every 3 seconds (PAY-17). The shopper
may correct a typed ID up to 3 times until someone decides (PAY-07, agreed 2026-11-02): the button or link shows while `idChangesLeft` is above 0, then
goes. The change screen (`change`) is the wallet's screen with the ID filled in, "সঠিক ট্রান্সজেকশন আইডি দিন" and "আরও 3 বার বদলানো যাবে". Bangla labels in the table have these English
words: দোকানে ফিরুন, BACK TO SHOP; TrxID বদলান, CHANGE TRANSACTION ID.

| State | Card | Fixed button |
| --- | --- | --- |
| `checking`, listener online (VER-02) | 30-second ring at the elapsed seconds, "SMS মেলানো হচ্ছে…", "সাধারণত 10 সেকেন্ড লাগে। এই পেজে থাকুন।", amount · method · ID | TrxID বদলান |
| `checking`, past 30 s (PAY-17) | clock, "আমরা শিগগিরই কনফার্ম করব", "এই পেজ বন্ধ করলেও হবে। কনফার্ম হলে আপনার অর্ডারের পেজে দেখতে পাবেন।", and under it the link "TrxID ভুল দিয়েছেন? বদলান" | দোকানে ফিরুন (keeps checking until expiry) |
| `checking`, the shop checks: no phone in 30 min (VER-07), a wallet no phone reads, by hand, or a bank transfer | person, "দোকান চেক করে কনফার্ম করবে", "সাধারণত কিছুক্ষণের মধ্যে। এই পেজ বন্ধ করলেও হবে; কনফার্ম হলে আপনার অর্ডারের পেজে দেখতে পাবেন।", and the same link | দোকানে ফিরুন |
| `verified` | green tick drawn once, "পেমেন্ট হয়েছে", "5 সেকেন্ডে দোকানে ফিরছেন।", amount · method · ID · time | দোকানে ফিরুন, then the redirect with session ID and status (PAY-08) |
| `verified`, a link with no shop to return to | the same tick, "দোকান জেনে গেছে। আপনার আর কিছু করতে হবে না।", the same rows | none, and no bar |
| `needs_review`, the amount (PAY-14) | magnifier, "টাকা মিলছে না", "যে টাকা এসেছে তা এই পেমেন্টের সাথে মিলছে না। দোকান দেখে জানাবে; আপনার এখন কিছু করতে হবে না।", and the same link | দোকানে ফিরুন |
| `needs_review`, the sender | magnifier, "নম্বর মিলছে না", "আপনার লেখা নম্বর থেকে এই টাকা আসেনি। দোকান দেখে জানাবে; আপনার এখন কিছু করতে হবে না।", and the same link | দোকানে ফিরুন |
| `needs_review`, any other reason (`other`) | magnifier, "দোকান চেক করে জানাবে", "আপনার এখন কিছু করতে হবে না।", since the rest are the shop's own (its balance, an old receipt), and the same link | দোকানে ফিরুন |
| `failed`, rejected (PAY-14) | cross, "পেমেন্ট কনফার্ম হয়নি", the reason in the page's words or the staff's note verbatim ("দোকান বলেছে: …"), then "তাই অর্ডারটি ক্যানসেল হয়েছে।" (or, on a staff link, whose order stays, "নতুন লিংকের জন্য দোকানে যোগাযোগ করুন।"), the rows, "সমস্যা হলে দোকানে যোগাযোগ করুন" and the contact buttons. No way to pay again here: rejecting cancels a checkout's order and frees its stock (D5-4) | দোকানে ফিরুন |
| `expired` (PAY-03) | clock, "সময় শেষ হয়ে গেছে", what to do either way, and the contact buttons | দোকানে ফিরুন (cancel address) |
| already `verified` on reopen (PAY-03) | tick, "এই পেমেন্ট আগেই হয়েছে", amount · method · time | দোকানে ফিরুন |
| `cancelled` (PAY-12) | cross, "এই পেমেন্ট ক্যানসেল করা হয়েছে", "নতুন করে অর্ডার করতে দোকানে ফিরুন।", and the contact buttons | দোকানে ফিরুন |
| page suspended (TVR-03) | lock, "এই পেমেন্ট পেজ এখন বন্ধ আছে", no report link | none |
| no such page (`404`) | magnifier, "এই পেমেন্ট পেজ পাওয়া যায়নি", "লিংকটি ঠিক আছে কি না দেখুন, অথবা দোকানে যোগাযোগ করুন।", no report link | none |

Errors on the box stay inline, inside the coloured card: a wrong shape ("6 থেকে 20টি অক্ষর বা সংখ্যা দিন"), an ID already used in the exact words of PAY-16 ("এই ট্রান্সেকশন আইডি ইতিমধ্যে
ব্যবহৃত হয়েছে"), shown in yellow under the box with a yellow ring on it.

---

## 2a. The real page is a redirect

Checkout and the landing page redirect to this page, and it redirects back (SFT-07, LND-10, PAY-08). It is never framed: its policy says `frame-ancestors 'none'`.
`docs/brand/lytro-storefront.html` carries a copy of this file in a frame only so the hand-over can be walked (STOREFRONT-DESIGN §8a); `docs/brand/lytro-dashboard.html` still
carries an older copy for the platform's own payments, which that prototype draws and the build doesn't use (D5-3). A test account's page says it is one (`test`).

## 3. Widths checked

320 × 616 (the reference's small view), 390 × 844 and the 1280 px desktop, in Bangla and English, for the
picker, each wallet, the duplicate-ID error, the copied toast, the report sheet, the platform payment and
every state above. No horizontal overflow at any width; the fixed button never covers the last step.

---

## 4. What the SRS asks for that the reference lacks, and where it went

All of these are drawn now.

| Need | Where it sits | SRS |
| --- | --- | --- |
| PIN/OTP notice, "Secured by Lytro", report | the legal line under the card, and the report sheet | PAY-05, TEN-18, TVR-02 |
| The 30-minute countdown | under the picker's pay bar, and at the right end of the INSTRUCTIONS line | PAY-03, PAY-05 |
| Sender number (optional, for matching) | a second white box under the transaction-ID box | VER-02, PAY-05 |
| Bank transfer | a second section bar and tile on the picker, and §1.3a | WAL-14, WAL-16 |
| The shop's note | a grey strip under the yellow note | PAY-05 |
| The order number | under the shop's name, and in the details sheet | PAY-05 |
| English | a link at the end of the legal line | PAY-22 |

---

## 5. What the server must provide

| Need | Why | State |
| --- | --- | --- |
| `GET /pay/:ref` renders the page from the session's read | §1, PAY-05, PAY-23 | built (Slice 5.8) |
| The read: shop, order number, amount, state, expiry, methods with each `way`, return and cancel addresses, what was typed, `review`, `rejected`, `listenerOnline`, `idChangesLeft`, `gatewayResult`, `test` | §1, §2 | built (Slices 5.2 to 5.7) |
| The shop's contact phone, and the order's tracking ID, item names, quantities and who opened the session, on the read | §1.2 | built (Slice 5.8) |
| Sending and correcting a transaction ID and sender number | PAY-07, PAY-16 | built |
| A report, limited per IP | TVR-02 | built |
| Asking for a wallet's checkout, and the wallet's return | PAY-06, VER-08, VER-09 | built |
| Where a link with no return address leads: the order's tracking page on the shop's storefront, when it has one | §2, PAY-24 | built (Slice 5.8) |

---

## 6. Where it lives in the code

Decided 2026-11-04 (Slice 5.8's part 2 read): a server-rendered page in `apps/server`, answering on `pay.lytro.app` through its own block in `deploy/Caddyfile`, without which that host would
fall through to the storefront. Templates, one stylesheet, two small scripts (the 3-second check and the copy buttons), and the fonts and wallet marks as Lytro's own files. The
transaction form posts as a plain form, so a phone that fails to run a script can still pay. PAY-23's policy: scripts, styles, fonts and fetches from the page's own origin, images from
it and the media Worker's address for the shop's logo, no framing, no plugin, no `<base>`, and forms only to itself. The wallet colours, marks, USSD codes and step sentences are data keyed by
method type and account type, so a new type is a row, not a page change.

---

## 7. As built (Slice 5.8's part 2)

`apps/server/src/modules/payment-page`: `page/` draws a session's screen as a pure function of its read and its address, every value escaped by one `html` tag; `controllers/payment-page-html.controller.ts`
takes the forms; `services/payment-page-host.ts` turns every address on the host into one of the page's routes, or a page that wasn't found, so nothing else on the server can be reached from it. The
stylesheet, script, fonts and wallet marks are in `apps/server/assets/pay`, read once at start. The page works with no script: forms post, sheets open by the address (`#report`, `#details`), and a
waiting page refreshes itself. The script adds the copy buttons, the running clocks, the 3-second check (`GET /<ref>/status`, the screen the server would draw now) and the timed return.

Where the build differs from the reference or the first sketch, each with its reason, all drawn in the prototype too:

- **A rejected payment offers no Try again.** The first sketch carried it over, but PAY-14 and D5-4 cancel a checkout's order on rejection and free its stock.
- **A deeper blue and a paler yellow.** White on the reference's `#1e8fe0` is 3.4:1, and its yellow `#fde047` on bKash's pink 3.7:1, both short of the 4.5:1 small text needs. The blue is `#0b6cb3` everywhere, the
  highlighted words `#fef9c3`; the error ring keeps the yellow.
- **The time paid** reads "4 Nov, 11:48 am", not the sketch's "today".
- **A page for too many tries** (`busy`, RTE-06), which the sketch doesn't draw, on the same card as a page that wasn't found.
- **Back to shop** returns with `session_id` and `status` (PAY-08). Neither is proof of anything (PAY-11); the shop's order page reads the truth.

`apps/server/test/payment-page-html.e2e.spec.ts` takes it through real orders. `apps/server/test/pay-page-browser` draws every screen from fixtures in a real browser, under its real policy, with accessibility
checks, at 320 px, and beside the prototype; CI keeps those pictures.
