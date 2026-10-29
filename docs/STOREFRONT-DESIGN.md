# Shopper storefront: design

Status: v1, 2026-10-21. The shared storefront every shop gets at its subdomain or custom domain
(`apps/storefront`, SFT-01, TEN-08), and the product landing pages at `/l/<slug>` (LND-01). Designed from
`SRS-detailed.md` §4 (TEN, BRN), §14.2 (SFT), §14.3 (CCH), §14.12 (LND), §14.13 (DLV), §14.15 (CMB), §15
(ORD), §16 (CUS), §19.2 (PAY), §22 (CHT) and the Phase 3 plan's Slice 12 (the landing pages; the storefront and custom domains moved to
Phase 6B on 2026-10-29, `PHASE-3-PLAN.md` D3-14), against the public catalogue the
API serves today (Slice 9: shop, categories, product lists, product detail, catalogue version). The
interactive sketch is `docs/brand/lytro-storefront.html`: every screen on phone, tablet and desktop, Bangla
with the English toggle, on Lytro's default identity and on a shop's own brand identity, with the flows of
later phases (checkout, the payment hand-over to the hosted page or the wallet's checkout and its return,
tracking, account, combos, chat) drawn in full under their own groups so the whole journey can be walked today.

**Who and where.** A shopper on a phone, arriving from a Facebook post, a Messenger reply or a shared
WhatsApp link, usually to one product, often for the first time, paying cash on delivery. They decide in a
minute: is this the thing, what does it cost delivered, can I trust the shop. The desktop view exists for
the seller checking their own shop and for the minority of shoppers on a laptop.

**Thesis: one product, one price, one tap.** Every page answers the three questions in the first screen:
what it is (the photo and the name), what it costs delivered (the price with the delivery line under it)
and how to pay (cash on delivery, or the advance the product needs). Everything else is one tap down.

**Rules**

1. **Phone first, thumb first.** The buy bar stays at the bottom of the product page; sheets rise from the
   bottom; the cart is a drawer. Nothing a shopper needs sits above the fold out of reach.
2. **The delivery charge is never a surprise.** The product page shows the range before an area is known
   and the exact charge once it is, computed by the same function order creation uses (SFT-20, ORD-06a).
   The cart repeats it; the checkout only confirms it.
3. **Stock is honest and coarse.** In stock, few left, sold out (CCH-08). A sold-out combination stays
   visible in the picker, struck through, and cannot be added (ATR-07).
4. **One layout, the shop's identity.** Every shop shares this layout (SFT-01). On Lytro's defaults the shop
   brings its name and logo or monogram (TEN-16); with the brand identity add-on it brings its colours,
   fonts, corner shape and spacing as tokens only (BRN-02, BRN-07). "Powered by Lytro" stays in the footer
   (TEN-18).
5. **No checkout UI that is not the real one.** Orders go through the public order-creation endpoint with
   an idempotency key (SFT-06); payments go to the hosted page or the wallet's checkout (SFT-07). The
   storefront never collects a payment itself.
6. **Bangla by default, English one tap away** (I18N-01), in the commerce vernacular shoppers already use:
   কার্ট, ডেলিভারি চার্জ, ক্যাশ অন ডেলিভারি, স্টকে আছে.
7. **Offline is a page, not an error.** A lapsed or suspended shop shows "Back soon" with its own name
   (SFT-12); a switched-off storefront is not-found (SFT-16); a gone product is a branded 404 (LND-03).
8. **Installable, and worth installing.** The storefront is a PWA named after the shop, offered after a
   first order rather than on arrival (SFT-14, CCH-10).

**Look.** Lytro's default identity: white, ink text, teal-700 for the one accent, Inter and Noto Sans
Bengali for text, Plus Jakarta Sans for prices and headings, 8 and 12 px corners. The sketch's "Shop's
own" toggle shows the same layout under an example identity: maroon accent on cream, Hind Siliguri with
Fraunces for headings, round corners. Status colours never change (BRN-04). Product photos are the design:
cards at 4:5, the product page gallery edge to edge on phones, no decoration that competes with them.

---

## 1. Shell

**Phone.** A 60 px header: the shop's logo or monogram and name, the search icon, the cart with its count.
Inner pages replace the left side with a back arrow and the page title. Category chips scroll under the
title where they apply. The buy bar is pinned to the bottom of the product page; the cart opens as a full
height drawer; sheets rise from the bottom. There is no bottom tab bar: a storefront has three places,
home, product and cart, and the header reaches all of them.

**Desktop (1024 px and up).** The same header grows: the shop at the left, the first six categories as
text links, the search box in the middle, the cart at the right. Content is at most 1200 px wide. The
product page splits into a sticky gallery with thumbnails and a buy column; the cart is a right-hand
drawer; checkout, the landing page and tracking split into form and summary.

**Landing pages** use a minimal header, the logo and name centred with the language pill, and no
navigation at all (LND-01).

**Footer** (SFT-21): the shop's name and logo, whichever of its contact phone, email and address are set
(TEN-30), links to categories, tracking, the account and the language, and "Powered by Lytro".

## 2. Home (`/`)

A greeting band in the accent colour built from the shop's data only (its name, a seasonal line it writes
in settings later, the "New arrivals" button), the trust strip (cash on delivery, bKash and Nagad, the two
delivery charges, courier nationwide), "Shop by category" as tiles with the category image or its initial,
"New arrivals" as a grid of four, "Bestsellers" as a horizontal rail. The install prompt (`home-pwa`) is a
card at the bottom with the shop's icon and name.

## 3. Category and search

**Category** (`/c/<slug>`): the name and product count, the category chips, a sort chip opening a sheet
(relevance, newest, price low to high, high to low) and "In stock only", the grid, "Show more" on the keyset
cursor (CCH-11). **Search** opens as an overlay: recent searches, then the categories with counts as a way
in; results are the same grid under "Results for"; the empty state offers categories (CCH-12).

## 4. Product (`/p/<slug>`)

The gallery with dots, a video chip when the product has one (STO-09), the heart. Then the category eyebrow,
the name, the price or the range, the stock chip, and a condition chip for used or refurbished goods
(FED-02). Options as rows: sizes as buttons with the size-chart link beside the label (PRD-17, the sheet
shows the table), colours as swatches (ATR-18); a sold-out combination shows struck and a sentence explains
it (`product-unavailable`). Quantity. Three lines with icons: delivery (the range, or the exact charge
after "Set your area", a sheet with district and thana from the canonical list, CUS-08, SFT-20), payment
("Cash on delivery · Pay when it arrives", or "৳200 advance, the rest on delivery" when the product's policy
needs one, PRD-08), and "Delivers to Dhaka city only" when a product is limited (DLV-07). Add to cart and
Buy now. Description exactly as typed, details from the informational attributes (ATR-09), care and
returns from the shop's text. Share: copy, WhatsApp, Facebook. "You may also like".

Variants drawn: a product with one variant and a video (`product-saree`), one with an advance
(`product-advance`), one sold out (`product-out`), one limited to a zone (`product-limited`).

## 5. Cart

A drawer: each line with its thumbnail, name, variant, the advance note when its product needs one, a
quantity stepper, the line total and Remove. The summary shows items, delivery as "Set your area" with the
range beneath until an area is set and the exact charge after, and the total as a range or a figure. The
sentence under it says the charge is the one the order will carry (SFT-20). Nothing is reserved until
checkout (SFT-05). "No delivery to Bandarban" blocks checkout with the shop's phone number (DLV-06). Empty
state with "Keep shopping".

## 6. Landing page (`/l/<slug>`)

The product, exactly as on the product page, then the order form in the same scroll: name, phone,
district, thana, the courier's area when the shop's default courier books by areas (CUS-13), address,
comments (LND-07), and the summary with item total, delivery as a range until the thana is chosen, the
grand total and the payment line, then "Confirm order" with "Tapping twice never creates two orders"
(LND-09). Until Phase 4 the form is laid out and the button disabled, with a sentence saying so (Slice 12).
A `?v=` link opens with that variant selected (LND-06). A gone product is a branded 404 (LND-03). On
phones a pinned bar carries the product's price and "Order now", which scrolls to the form, so a shopper
arriving from an ad never has to hunt for it; on desktop the form sits beside the product and the bar is
not shown. The landing footer keeps the shop's contact, one small "Browse the whole shop" link to the
storefront's home, the tracking link, the language and "Powered by Lytro"; there is no category
navigation on the page itself (LND-01), only that one way out at the bottom.

## 7. Offline, switched off, not found

"Back soon" with the shop's monogram and name (SFT-12, LIF-07); "Nothing here" when the storefront is off
or the host is unknown (SFT-16); the landing 404 above. All three carry "Powered by Lytro" only.

## 8. Later phases, drawn in full

Phase 4, orders: **checkout** as one page in three numbered blocks, contact (with "Sign in with OTP" for
returning shoppers), delivery address (district, thana, courier area, address, "Save this address"),
payment (cash on delivery, bKash, Nagad, bank transfer as the shop enables them, SFT-10), the summary with
the exact delivery charge and, when a line needs an advance, "Advance now" and "Pay on delivery" split and
the button "Place order and pay ৳200" (PRD-08); field errors; the no-delivery and product-limit refusals
(DLV-06, DLV-07). **Order placed** with the order number, the tracking link, what happens next, and the
install prompt. **Tracking** by ID with the timeline from the public tracking endpoint and the courier
line, and "All your orders by phone" for a signed-in shopper (ORD-17, ORD-18, SFT-08). **Account**: OTP
sign-in in two steps, my orders, saved addresses with a default (CUS-03 to CUS-06, SFT-09). **Combo pack**:
the price with "Save ৳170", "What's inside" with a choice part the shopper picks per unit (CMB-06, CMB-09).

Phase 5, payments: the whole path from the method chooser to the return, in §8a.

Phase 7, chat: the bubble with an unread count and the widget on the product page (CHT-01).

### 8a. Paying: from the method chooser to the return

The storefront never collects a payment (SFT-07). It chooses, hands over and receives the result.

**Choosing.** The payment block of the checkout, and of a landing page whose product needs an advance,
lists what the shop has enabled (SFT-10, WAL-05, WAL-15): cash on delivery when the policy allows it,
then each wallet with its official mark from `docs/brand/third-party` in its own colours, never
recoloured (bKash and Nagad today; Rocket and Upay as text in their colours until their marks are
fetched), then bank transfer. The sentence under each wallet says how it pays, because the shop decides
that per wallet (WAL-10): "Pay on bKash's own page; the order confirms the moment it goes through" for a
wallet whose gateway is on, "Send money and enter the TrxID; we match it and confirm" for a manual one.
With an advance the summary splits "Advance now" from "Pay on delivery" and the button reads "Place order
and pay ৳200" (PRD-08, ORD-16).

**Order held.** The order is created and its stock reserved with a 30-minute expiry (LND-10, INV-16). The
page shows the chosen wallet's mark, the route it will take and "change", then one button: "Pay with
bKash" for a gateway wallet, "Go to the payment page" for a manual one, with the lock line naming
pay.lytro.app.

**Handing over.** A manual wallet opens the hosted page (PAYMENT-PAGE-DESIGN.md), the session already on
that wallet's panel rather than the picker, with the shop as payee, the order number as the reference and
the shop's active wallet number (PAY-01, PAY-05). A gateway wallet shows an interstitial, "Taking you to
bKash", with the shop, the order number and the amount, and continues to the wallet's own checkout; the
sketch never redraws the wallet's page (PAY-06). The sketch embeds the hosted page in a frame, exactly as
the tenant sketch does for plan payments, so the hand-over can be walked.

**Returning** (PAY-08, PAY-17). `verified` or `paid`: "Payment received, order confirmed", the advance
received, the cash-on-delivery remainder, the tracking link. `checking` or `review`: "Checking your
payment", the TrxID is matched within minutes and the order stays held. `cancelled` or `expired`: "Payment
not completed" with the minutes left on the hold, "Try the payment again" and "Switch to cash on
delivery". A gateway wallet comes back through pay.lytro.app to the same three states.

| Where the shopper is | Served today | Still needed |
| --- | --- | --- |
| Method chooser | the product's payment policy and advance (public catalogue) | the shop's enabled methods with each wallet's level (Phase 5, WAL-06) |
| Order held, hand-over, return | nothing | order creation with a payment session, the session's address and status, the return address on the shop's allow-list (Phase 4 and 5, ORD-02, PAY-01 to PAY-04) |

---

## 9. What the sketch reads against what the backend serves

| Screen | Served today | Still needed |
| --- | --- | --- |
| Shell, home, category, search, product | `GET /v1/shop` (name, slug, pixel), `/v1/catalogue/categories`, `/v1/catalogue/products` (category, search, sort, cursor), `/v1/catalogue/products/:slug` (images, video, options, attributes, variants with stock state, size chart, payment policy, advance) | the shop's logo, contact phone, email and address (TEN-16, TEN-30) and its brand identity tokens (BRN-07) on the shop endpoint; the storefront on/off flag (SFT-16); a delivery estimate endpoint taking the cart's lines and a thana, with the canonical district and thana list (SFT-20, CUS-08); "delivers to" zones on the product (DLV-07) |
| Cart | client-side only (SFT-05) | the same estimate endpoint |
| Landing page | the product detail; OG tags from it (LND-05) | order creation (Phase 4) |
| Offline and not found | the tenant state from the host (TEN-08, LIF-07) | |
| Checkout, confirmation, tracking, account, combos | nothing | Phase 4's order creation, tracking and OTP endpoints; Phase 5's sessions; combos (CMB) |
| Chat | nothing | Phase 7 |
| PWA | | a per-tenant manifest and icon from the shop's name and logo (SFT-14) |

## 10. Mapping onto `apps/storefront`

Next.js standalone, one deployment resolving the shop from the host (TEN-07a). Routes: `/` home, `/c/[slug]`
category, `/search`, `/p/[slug]` product, `/cart` (the drawer, also a page), `/l/[slug]` landing, `/track/[id]`,
`/sign-in`, `/account`, `/checkout`, `/order/[id]`. Server components for everything cacheable (home,
category, product, landing, with the catalogue version in the request address, CCH-04), client components
for the cart, the area sheet, the pickers and the forms (CCH-07). Shared pieces: `product-card`, `gallery`,
`variant-picker`, `delivery-line`, `area-sheet`, `cart-drawer`, `sheet`, `shop-header`, `shop-footer`, the
`brand-tokens` style that maps the shop's identity to the CSS variables in §Look. The service worker caches
the shell and recently viewed catalogue responses (CCH-10). Copy lives in one dictionary with Bangla first.

## 11. The prototype

`docs/brand/lytro-storefront.html` is self-contained. Its toolbar picks the screen (Browse, Product, Cart,
Landing page, Later phases), the device (phone 390, tablet 820, desktop 1280), the language and the brand
(Lytro default, or the shop's own identity). Every button that leads somewhere in the design leads there in
the sketch. It renders 50 screens with no horizontal overflow at any width and no missing strings in either
language.
