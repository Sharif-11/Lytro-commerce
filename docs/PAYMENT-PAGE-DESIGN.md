# Hosted payment page: manual payments by Send Money

Status: v2, 2026-10-20. The design of `pay.lytro.app/<session>`, the page a shopper lands on to pay a
shop by bKash, Nagad, Rocket or Upay when the payment is verified manually or by the SMS listener. The
same page takes the platform's own payments (a plan or a top-up, PAY-21). It is built in Phase 5
(`IMPLEMENTATION-PLAN.md`, `DEPLOYMENT.md` §7); nothing of it exists in code yet, and this document is the
spec for that work. The interactive prototype is `docs/brand/lytro-payment-page.html` (320 px, 390 px and
the 1280 px desktop; Bangla with the EN toggle; every wallet and every session state).

**Decision, 2026-10-20.** The owner chose to match a reference layout exactly: the manual-payment page of
ZiniPay (`secure.zinipay.com/demo/payment`, screenshots taken 2026-10-20 at 1920 px and at 320 px). The
page below reproduces that layout element for element, with the spacing values its markup uses
(Tailwind: `m-2 p-2 rounded-xl` top bar, `p-6 rounded-xl` coloured card, `text-xs sm:text-sm font-light`
list, fixed bottom button with `pt-7 pb-[max(14px,env(safe-area-inset-bottom))]`, `sm:max-w-2xl
sm:rounded-lg sm:shadow-xl` card from 640 px). Where the SRS requires something the reference does not
have (the PIN notice, "Secured by Lytro", "Report this page", the session states after Verify), it is
added in the same visual language, as one small line under the card and as white status cards.

Requirements covered: `SRS-detailed.md` §19.1 (WAL-01 to WAL-06, WAL-18), §19.2 (PAY-01 to PAY-23), §19.3
(VER-01, VER-02, VER-07), §19.4 (TVR-02, TVR-03), §20.1 (I18N), TEN-16, TEN-18, BRN-04.

---

## 1. The page

Two screens and a set of end states, all inside one frame.

### 1.1 Frame

- **Page**: background sky-50 (`#f0f9ff`). Below 640 px the content is full-bleed with 16 px side
  padding and the page is at least the viewport height. From 640 px the content sits in a white card, 672
  px wide, 8 px corners, large shadow, centred horizontally and vertically when shorter than the viewport.
- **Top bar** (inside the card): a frosted strip (white at 65 %, 1 px sky-100 border, 12 px corners,
  soft blue shadow, 8 px margin and padding below 640 px, 12 px from 640 px) with a bold **back arrow**
  on the left and a bold **close** on the right. Back returns to the picker from a wallet screen; close
  goes to the cancel address (PAY-01). Icons 28 px, 2.5 px stroke, near-black.
- **Fixed bottom bar**: on every wallet screen a full-width **VERIFY TRANSACTION** button (52 px, 12 px
  corners, bold uppercase white text, the wallet's colour, large shadow) fixed to the bottom of the viewport
  inside the same 672 px column, with a 28 px fade above it and a 14 px (or the safe-area) gap below. The
  content gets 96 px of bottom padding below 640 px so nothing hides under it.

### 1.2 Screen 1: the picker (`pick`)

Top to bottom, centred:

1. **Brand row** (24 px below the bar): the shop's logo in a 56 px circle, or its monogram on a teal tile
   (TEN-16; the Lytro mark on a teal-900 tile for a platform payment), the shop name bold 18 px, and a
   **View Details** pill (28 px, rounded, 1 px grey border) that opens the order summary (reference,
   amount, items).
2. **Contact buttons** (32 px below): three 48 px white squares with 12 px corners and a hairline: support
   chat (blue), WhatsApp (green), call (blue). They use the shop's support phone and email (TEN-30); a
   button whose contact is not set is left out.
3. **Mobile Banking** bar (24 px below, 16 px inset): blue (`#1e8fe0`), 8 px corners, white bold 18 px,
   centred.
4. **Logo tiles** (32 px below, 20 px inset): white tiles 70 px tall with 12 px corners and a soft shadow,
   four across from 640 px and two across below it, each holding one wallet's official mark centred:
   bKash, Nagad, Rocket, Upay. Only the manual methods the shop has enabled with an active account appear
   (WAL-05, WAL-06). A wallet whose gateway the shop selected never appears here; such a shopper went
   straight to the wallet's checkout (PAY-06).
5. **Pay bar** (16 px below, 16 px inset): sky-100 with sky-900 bold 20 px text, "Pay 250 BDT".

### 1.3 Screen 2: a wallet (`bkash`, `nagad`, `rocket`, `upay`)

1. **Header card** (12 px below the bar): white, 16 px corners, hairline, soft shadow, 12 px padding; the
   wallet's mark in a 96 × 56 grey box on the left; on the right a 1 px divider and the amount **250 ৳**
   bold 24 px.
2. **Note** (16 px below): a faded strip (yellow-50, yellow-100 border, 4 px corners, grey light text at 12
   px below 640 px and 14 px above, 50 % opacity): "**নোট:** টাকা পাঠানোর ৫-১০ সেকেন্ড পর ভেরিফাই করবেন।"
3. **Coloured card** (8 px below): the wallet's colour, 12 px corners, 24 px padding, white text, medium
   shadow.
   - Title, centred, 16 px medium at 95 %: "ট্রান্সজেকশন আইডি দিন".
   - The **transaction-ID box**: white, 44 px, 8 px corners, placeholder centred in grey; it is the only
     input on the page (sender number and proof image, VER-02 and PAY-18, are not in the reference and
     are left out; §4 says how to add them without changing the layout).
   - **INSTRUCTIONS** (16 px below): bold uppercase 14 px with letter spacing, a 1 px line in black at 15 %
     under it.
   - The **list**: one row per step, 8 px vertical padding, a 1 px black-at-15 % line between rows, a 6 px
     white dot as the bullet, light text at 12 px (14 px from 640 px); the key words in **bold yellow**
     (`#fde047`) at 16 px (18 px from 640 px): the USSD code, the wallet's name, "Send Money", the number,
     the amount, SUBMIT, Transaction ID, VERIFY. The recipient number carries a **Copy** button: black
     (`#111827`), 30 px, 8 px corners, copy icon and "Copy" in white.
4. **Legal line** (4 px below, grey 12 px, centred): "🔒 Secured by Lytro · এই পেজ কখনো PIN বা OTP চায় না
   · রিপোর্ট করুন" (TEN-18, PAY-05, TVR-02). Report opens a sheet with four reasons and a note.

### 1.4 The steps, per wallet

As the reference words them, with the shop's number and the session's amount substituted. The account type
changes the verb (personal: Send Money; agent: Cash Out; merchant: Payment, PAY-05) and the third step's
lead ("প্রাপক নম্বর", "এজেন্ট নম্বর", "মার্চেন্ট নম্বর").

| Wallet | Steps |
| --- | --- |
| bKash | `*247#` ডায়াল করে আপনার `BKASH` মোবাইল মেনুতে যান অথবা `BKASH` অ্যাপে যান। · `"Send Money"` -এ ক্লিক করুন। · প্রাপক নম্বর হিসেবে এই নম্বরটি লিখুন: `01712345678` [Copy] · পরিমাণ: `250` টাকা দিয়ে `SUBMIT` করুন। · এখন উপরের বক্সে আপনার `Transaction ID` দিন এবং `VERIFY` করুন। |
| Nagad | `*167#` ডায়াল করে আপনার `NAGAD` মোবাইল মেনুতে যান অথবা অ্যাপে যান। · `"Send Money"` এ ক্লিক করুন। · প্রাপক নম্বর: `01812345678` [Copy] · পরিমাণ: `250` টাকা দিয়ে `SUBMIT` করুন। · `Transaction ID` দিয়ে `VERIFY` করুন। |
| Rocket | `*322#` অথবা `ROCKET` অ্যাপে যান। · `"Send Money"` নির্বাচন করুন। · প্রাপক নম্বর: `017123456789` [Copy] · পরিমাণ: `250` টাকা দিয়ে `SUBMIT` করুন। · `Transaction ID` দিয়ে `VERIFY` করুন। |
| Upay | `*268#` অথবা `UPAY` অ্যাপে যান। · `"Send Money"` সিলেক্ট করুন। · প্রাপক নম্বর: `01712345678` [Copy] · পরিমাণ: `250` টাকা দিয়ে `SUBMIT` করুন। · `Transaction ID` দিয়ে `VERIFY` করুন। |

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
Siliguri (300 to 700), the family the reference renders both scripts in; the brand's Inter and Noto Sans
Bengali are not used on this page.

---

## 2. After Verify: the session states

Tapping Verify sends the transaction ID (PAY-07) and the coloured card is replaced by a white status card
in the same frame (16 px corners, centred icon, title, one line, a grey detail box); the fixed button
changes with the state. The page polls the session every 3 seconds (PAY-17).

| State | Card | Fixed button |
| --- | --- | --- |
| `checking`, listener online (VER-02) | 30-second ring at the elapsed seconds, "SMS মেলানো হচ্ছে…", "সাধারণত ১০ সেকেন্ড লাগে। এই পেজে থাকুন।", amount · method · ID | CHANGE TRANSACTION ID |
| `checking`, past 30 s (PAY-17) | clock, "আমরা শিগগিরই কনফার্ম করব", "এই পেজ বন্ধ করলেও হবে। কনফার্ম হলে SMS পাবেন, আর দোকান জানবে।" | BACK TO SHOP (keeps polling until expiry) |
| `checking`, no listener in 30 min (VER-07) | person, "দোকান চেক করে কনফার্ম করবে", "সাধারণত কিছুক্ষণের মধ্যে।" | BACK TO SHOP |
| `verified` | green tick drawn once, "পেমেন্ট হয়েছে", "৫ সেকেন্ডে দোকানে ফিরছেন।", amount · method · ID · time | BACK TO SHOP, then the redirect with session ID and status (PAY-08) |
| `needs_review` (PAY-14) | magnifier, "টাকা মিলছে না", the server's reason (amount or sender differs), "দোকান দেখে জানাবে" | BACK TO SHOP |
| `failed`, rejected with a reason (PAY-14) | cross, "পেমেন্ট কনফার্ম হয়নি", the staff's reason verbatim | TRY AGAIN (reopens the wallet screen in the same session, PAY-08) |
| `expired` (PAY-03) | clock, "সময় শেষ হয়ে গেছে", what to do either way | BACK TO SHOP (cancel address) |
| already `verified` on reopen (PAY-03) | tick, "এই পেমেন্ট আগেই হয়েছে", amount · method · time | BACK TO SHOP |
| `cancelled` (PAY-12) | cross, "এই পেমেন্ট ক্যানসেল করা হয়েছে" | BACK TO SHOP |
| page suspended (TVR-03) | lock, "এই পেমেন্ট পেজ এখন বন্ধ আছে" | none |

Errors on the box stay inline, inside the coloured card: a wrong shape ("৬ থেকে ২০টি অক্ষর বা সংখ্যা"), an
ID already used in the exact words of PAY-16 ("এই ট্রান্সেকশন আইডি ইতিমধ্যে ব্যবহৃত হয়েছে"), shown in yellow
under the box with a yellow ring on it.

---

## 3. Widths checked

320 × 616 (the reference's small view), 390 × 844 and the 1280 px desktop, in Bangla and English, for the
picker, each wallet, the duplicate-ID error, the copied toast, the report sheet, the platform payment and
every state above. No horizontal overflow at any width; the fixed button never covers the last step.

---

## 4. What the SRS asks for that the reference lacks, and where it goes

| Need | Where it sits | SRS |
| --- | --- | --- |
| PIN/OTP notice, "Secured by Lytro", report | the legal line under the card, and the report sheet | PAY-05, TEN-18, TVR-02 |
| The 30-minute countdown | a small "29:40" chip at the right end of the INSTRUCTIONS line | PAY-03, PAY-05 |
| Sender number (optional, for matching) | a second white box under the transaction-ID box, "যে নম্বর থেকে পাঠালেন (ঐচ্ছিক)" | VER-02, PAY-05 |
| Proof screenshot (optional) | a small dashed "স্ক্রিনশট দিন" row under the boxes | PAY-18 |
| Bank transfer | a second section bar "Bank Transfer" under the wallet tiles with one tile; its screen uses the same header, a neutral (teal-700) card listing bank, account name, number, branch, routing and SWIFT each with Copy, and a reference box | WAL-14, WAL-16 |
| The shop's note | one more faded strip under the yellow note | PAY-05 |
| English | the EN toggle in the prototype's toolbar; on the page a small "EN" link in the legal line | PAY-22 |

Each is drawn in the prototype only where it does not change the reference layout (the legal line, the
report sheet, the states); the rest are listed here so the build adds them in the stated place.

---

## 5. What the server must provide

| Need | Why |
| --- | --- |
| `GET /pay/:sessionId` renders the page: shop name and logo or monogram, amount, reference, expiry, enabled manual methods with their active account (number, name, type, note), the chosen method if any, the shop's support phone and email, listener-online flag, return and cancel addresses, language | §1 (PAY-05, TEN-30, VER-07) |
| `POST /api/v1/payment-sessions/:id/submit` with `transactionId` (and optional `senderNumber`, `proofUploadId`), answering the new state or the PAY-16 error | §1.3, §2 |
| A same-origin status read for polling (or server-sent events) | PAY-17 |
| A signed upload for the proof image, private media | PAY-18 |
| `POST /pay/:id/report` with a reason, limited per IP | TVR-02 |
| A retry that reopens the wallet screen after `failed` in the same session | PAY-08 |
| Upay as a wallet type (the SRS names bKash, Nagad and Rocket; WAL-18 adds a type without page changes) | §1.2 |
| The platform's own wallet accounts on a plan or top-up session | PAY-21 |

---

## 6. Where it lives in the code (Phase 5, not built here)

A server-rendered page in `apps/server` (templates, one stylesheet, two small scripts for the poll and the
copy buttons) satisfies PAY-23's policy without a second origin. The wallet colours, marks, USSD codes and
step sentences are data keyed by method type and account type, so a new type is a row, not a page change.
