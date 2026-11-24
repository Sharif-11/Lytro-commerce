# Seller app plan: the dashboard as an Android app

**Status:** draft, 2026-11-23. SA-1 to SA-5, SA-27, SA-29 to SA-32 and SA-34 are the owner's answers from that day. SA-6 to SA-26, SA-28 and
SA-33 to SA-37 are my calls, listed so the owner can overrule any of them. The owner answered all three questions in §4 the same day.
The sketch covers every wave, 0 to 4 (§6); the owner approved Waves 0 to 2. No code until the pre-pilot checklist is done (SA-3).

**What it is:** one Android app on the Play Store, named just "Lytro" (SA-27), for the owner and staff of every shop. Wave by wave,
it does everything the seller dashboard at app.lytro.app does. It also does what only a phone does well: an alert the
moment an order comes in, tap to call a customer, product photos from the camera, and courier labels printed on a small
Bluetooth printer.

**Requirements it meets:**
- TEN-23: one shared native Android app with one listing.
- TEN-23a: the same dashboard API, the same sign-in and permission rules, and parity tracked rather than assumed.
- TEN-23b: push through Android's own service, under the same notification switches.

OD-52 chose React Native on 2026-09-27, and SA-1 confirms it with Expo.

**Sketch (next):** `docs/brand/lytro-seller-app.html`, Wave 0 and Wave 1 first (§6). Screens are built pixel-perfect to
it, as every surface is.

Reopening a decision below needs an explicit change to its row, not a quiet deviation during a slice.

---

## 1. The owner's answers (2026-11-23)

| # | Question | Answer |
| --- | --- | --- |
| SA-1 | Which tool | **React Native with Expo, Android first.** Chosen over a Capacitor wrapper of the web dashboard, which is cheaper but gives the same web screens (and TEN-23 rules out a wrapped PWA). Also chosen over Kotlin, which would mean writing every rule in `validators` a second time. |
| SA-2 | What it covers | **Everything the seller dashboard does**, delivered in waves (§3), with the priority list agreed first. |
| SA-3 | When | **Plan and sketches now, no code.** Building starts once the pre-pilot checklist is done. |
| SA-4 | The order | **The waves in §3, with sign-up moved into Wave 1**, so someone who finds the app on Play can sign up in it. |
| SA-5 | Label printers | **Bluetooth label printing is in**, in Wave 1 right after courier booking. |
| SA-27 | The app's name | **"Lytro"**, not "Lytro Seller" ("just Lytro, not Lytro Seller"). It is the name on the phone, on Play and in Android's own prompts. |
| SA-29 | Order cards | **Each order in the list shows the photo of what was ordered** (the owner's idea: "what if we add the selected image in order card"). It is the photo the first item was ordered with (a design's own photo, as the order page already shows), with +N on it when there are more items, and a plain tile when an item has no photo. On the card, the order number shares a line with its status and the name shares a line with the total, so the area gets the full width on a 320 px phone. The server's order list gains that first line's photo, a small addition to the shared API (§5, SA.1). |
| SA-30 | The web's order list too | **Yes** (2026-11-23): the web dashboard's order list shows the same photo, from the same server field. It is a change to a built screen, so it is sketched in `lytro-dashboard.html` first and ships as its own PR after the server's (§5). It does not wait for the app. |
| SA-31 | A photo in the new-order alert | **Yes** (2026-11-23): the app's new-order alert shows the photo of what was ordered beside its words, as Android draws a notification's picture (`sa-push`). The server's push message gains an optional photo, and Firebase carries it. |
| SA-32 | A photo in the web's alerts too | **Yes** (2026-11-23): the web dashboard's browser alerts carry the same photo from the same push message, where the browser shows one. |
| SA-34 | The order page | **As the web builds it** (the owner: "look at the web dashboard app first for order detail screen"). The app's order page has the web page's cards, in its order and with its words (`order-page.tsx`): the customer with Call, their note and the fake order check; customer tracking; calls; items with photo and chips; pricing; payment; courier; timeline. The next step sits in the bar, and a short balance greys it with the reason above it. The rest sits behind ⋮. Only the order number and ⋮ move into the app bar (SA-25). The same holds for every app screen: the rest of Waves 0 and 1 were redrawn from the built web the same day (sign-in, Home, the order list, new order, booking, payments and approving, the bell, Account). |

## 2. My calls (overrule any)

| # | Call | Why |
| --- | --- | --- |
| SA-6 | **Sign-in uses the dashboard's own session, unchanged.** The app signs in through the same routes. It keeps the session cookie in its own cookie store and the CSRF token from the sign-in answer in Android's encrypted storage, and sends both as the dashboard does. A request from the app carries no Origin header, which the server already accepts (`originAllowed`, TEN-29), while the CSRF token is still required. | TEN-23a: no app-only endpoints and the same sign-in rules. The frame slice proves this on its first day. If React Native's cookie store won't carry the `__Host-` cookie, I stop and bring the choice back: a bearer token would be a server change and an exception to TEN-23a. |
| SA-7 | **Sessions last 7 days, as on the web.** After that the app asks the seller to sign in again (straight to the code screen). A longer "stay signed in" for phones is its own decision, later. | The same sign-in rules (TEN-23a). A session left on a phone carries the same risk as one left in a browser. |
| SA-8 | **Push goes through Firebase Cloud Messaging directly**, as a second `PushProvider` beside web push. The phone registers its token through the existing push subscriptions route, as a new kind of subscription. Every notice kind, switch and language rule from Slice 7.3 applies unchanged. Signing out removes the phone's subscription. | TEN-23b. Going direct rather than through Expo's push service means one fewer company sees order alerts, and the server's push port already fits. FCM is free. |
| SA-9 | **The listener stays its own app**, downloaded from download.lytro.app. The seller app's Settings > Listener shows the same pairing as the dashboard. | Play lets an app read SMS only if it is the phone's SMS app or gets an exception. A Play-listed seller app that reads bKash messages would likely be refused. |
| SA-10 | **One app for owners and staff.** Each person sees only the sections their permissions allow, as on the web (STF-11). Someone with several shops gets the same shop picker. | One listing (TEN-23) and the same rules. |
| SA-11 | **The same five tabs and words as the dashboard's phone layout** (Home, Orders, Shop, Money, Menu), drawn natively: pull to refresh, the phone's back button, the share sheet, tap to call, and swipe on list rows where the sketch shows it. | A seller moving between the web and the app finds everything in the same place. Each screen is still sketched afresh for the app (§6), not copied. |
| SA-12 | **Bluetooth printing draws the label as a picture and sends it as one**, so Bangla prints (thermal printers have no Bangla font). The label is the Steadfast-style one from #395. Its rules (`label-facts`) move into a shared package, so the web and the app print the same label. Both printer languages are covered: TSPL (label printers) and ESC/POS (receipt-roll printers), over Bluetooth Classic and BLE. Android only, because iPhones block Bluetooth Classic. A seller without a printer shares the label as a PDF instead. | One definition of the label. Sending a picture avoids printer fonts and code pages. |
| SA-13 | **Our own small native printing module** (Kotlin, as an Expo module): find the printer, pair it, remember it, send bytes. Not an npm package. | None of the React Native printer packages is clearly maintained. The job is small (connect and write), and the listener already gives us the Kotlin set-up and its tests. |
| SA-14 | **Code:** `apps/seller-app` (`@lytronix/seller-app`), app ID `app.lytro.seller`, shown on the phone as **"Lytro"** (SA-27). The ID is never shown to sellers, can't change after the first upload, and keeps the app apart from `app.lytro.listener`. It shares `validators`, `shared-types` and `api-client`; `api-client` gains a way to keep its cookie and token on a phone. `packages/ui` is browser-only, so the app has its own components built on the same colour, type and spacing tokens. It has its own words file, using the dashboard's words wherever a screen does the same job. | One definition per concept. |
| SA-15 | **Builds and updates through Expo's services (EAS).** Builds are made in the cloud, not on this PC. Fixes to screens and words reach phones without a Play review (EAS Update); a change to native code or permissions needs a new Play release. There are two channels: staging and production. The staging app's ID ends in `.staging`, so both can be installed side by side. | Fast fixes for sellers, and no emulator filling this PC's C: drive (it once ran it down to 0.37 GB). |
| SA-16 | **A too-old app sees one Update screen.** The server names the lowest app version it still serves, as a field on a read the app already makes at start (no new route). | A release that changes native code can't leave old phones half-working. |
| SA-17 | **Offline works as on the dashboard.** The app needs the internet to change anything. It shows the dashboard's offline bar and keeps the lists it last loaded readable. Taking orders offline is not included. | The same behaviour as the web. Offline changes need their own design. |
| SA-18 | **Sign-in and sign-up are the web's one way in.** The phone number with the terms box (ticked as it opens), then the code, or a password instead. A new number goes on to create the shop, set a password and answer the one set-up question; there is no plan checkout (SA-28). Google and Facebook come later, as their own item. | Social sign-in needs each provider's own Android set-up, and staging has it switched off today. |
| SA-19 | **Android 7 (API 24) and up**, like the listener, if Expo's SDK at build time still allows it; otherwise the lowest it allows. | Many sellers use cheap phones. |
| SA-20 | **Tests:** unit tests for the shared rules and the app's own logic; Maestro flows on the Android emulator in CI (sign in, take an order, book a courier, print to a fake printer); and screenshots of every screen in Bangla and English, set beside the sketch. | Pixel-perfect to the sketch, as every surface is. |
| SA-21 | **Any printer a seller brings** (SA-Q3). Setting up a printer means picking it from the phone's Bluetooth list, then choosing **Sticker labels** or **Paper roll** (drawn, not named by printer language) and the size, then making a test print. If nothing comes out, the app tries the other printer language once before asking the seller to check the printer. Sizes: the two label sizes #395 draws (3×3 and 2×3 inch), and the 58 mm and 80 mm roll widths, where the label is redrawn narrow and as long as it needs to be. Any other sticker size gets the nearest of these, scaled to fit. Each phone remembers its own printer. | Lytro can't choose the printers. Sellers know whether they bought stickers or a roll, but not whether their printer speaks TSPL or ESC/POS. |
| SA-22 | **Register the app IDs for Android developer verification** under the owner's Play Console account, for both `app.lytro.seller` and `app.lytro.listener`. Google plans to require this worldwide in 2027 (four countries since 30 September 2026). Without it, an app installed from a download needs Android's slow advanced flow. | The listener is only ever a download, and so is this app if SA-Q2 is yes. Registering is free once the account exists. |
| SA-23 | **The sign-in code fills itself in** through Android's SMS User Consent: Android shows the arriving SMS and asks once, and the code is entered on Allow. The app holds no SMS permission, and Lytro's SMS stays as it is. | One tap instead of typing six digits, without the SMS permission SA-9 keeps out of this app. |
| SA-24 | **After a call, the call sheet opens by itself** when the seller comes back to the app from the phone's dialer, with the web's outcomes and words. | The call gets logged while it is fresh; on the web it waits for a click. |
| SA-25 | **A screen opened from a list covers the five tabs** (an order, Account), and Back returns to the list. The tabs show on each hub's own screens. | Android's usual pattern, and it leaves room for the order's action bar. |
| SA-26 | **Native touches drawn in the sketch** (everything else is the web's, SA-34): New order as a floating button over the orders list; a hub's sections (Orders, Customers, Sales) as tabs under the title; an order number sits on its own line above the customer's name, so neither is cut off on a small phone. | The same content as the web, laid out for a thumb and a 360 px screen. |
| SA-28 | **Sign-up in the app never asks for a plan.** The web shows its checkout only when the seller arrived having picked a plan on lytro.app's pricing page; the app has no such page, so a new shop starts on its trial and plans are bought later from Wallet (Wave 2, item 19). The steps are the web's otherwise: phone and code, create shop, password, the one set-up question. | One fewer screen on a phone, and the same rule the web already follows. |
| SA-33 | **The downloaded copy (SA-Q2) is the Play-signed one.** It is the universal APK that Play Console makes from the release, signed with Play's own key, published at download.lytro.app with the listener's install guide. A seller who later installs from Play keeps the app and its sign-in, because the signature matches. Its Update screen (SA-16) opens wherever the copy came from: Play for a Play install, download.lytro.app for a download. | An APK signed with our own upload key would not match Play's, so moving to Play would mean uninstalling and signing in again. |
| SA-35 | **Add photo opens the phone's own camera, again after each photo until Done**, or several photos from the gallery, or a video. Each photo uploads while the next is taken, and becomes a design as on the web. | A clothing seller photographs one design after another; the web's file picker does one at a time. |
| SA-36 | **Top-up's payment page opens in a browser tab inside the app** and comes back to the balance when it's done, as SA-18's checkout would. | The payment page is the web's own (pay.lytro.app); nothing to rebuild, and the seller never leaves the app. |
| SA-37 | **IMEI and serial scanning uses the phone's camera live inside the sheet** (the web's Scan, Paste a list and Type), each barcode read once and checked at once. | Faster than the browser's camera, and works on cheap phones. |
| SA-38 | **The bot check before a code is texted is the web's own Cloudflare Turnstile, in a small web view** (SA-Q4, the owner 2026-11-24: "yes"). It runs out of sight while the phone is typed, and shows Cloudflare's box in place only when Cloudflare wants a tap, as `use-human-check.tsx` does on the web. The token goes with the request, so the server and its API stay the same (TEN-23a). Drawn as `sa-human-check`. | The same check as the web, and no app-only endpoint. Play Integrity would need a second server path. |
| SA-39 | **A banner's action sits under its text in the app** (SA-Q5, the owner 2026-11-24: "the best one"). On the web it sits to the right; at 320-360 px a long Bangla line squeezed into a narrow column beside it. One style rule moves every banner's link under the text, lined up with it. The web stays as built unless the owner asks. | Full-width text reads better on a phone. |
| SA-40 | **The product page's ⋮ holds Duplicate, Archive and Delete for good** (SA-Q6, the owner 2026-11-24: "yes"), the same three that sit at the foot of More settings on the web, which stay there too. Drawn as `sa-product-menu`. | Faster to reach on a phone than scrolling to More settings. |

## 3. The waves (priority order, agreed 2026-11-23)

This list is also the parity list TEN-23a asks for: each row is marked "in the app" when it ships. Every route in
`apps/dashboard/src/routes` on `main` at b9a730ed belongs to one row below.

**Wave 0: foundation (nothing for sellers yet)**
1. Server: Firebase push (SA-8) and the lowest app version (SA-16). Sign-in needs no server change (SA-6).
2. App frame: sign-in for owners and staff, forgot password, the shop picker, the five tabs by permission, Account
   (name, password, language, sign out), Bangla and English, and the Update screen.
3. Release set-up: the Play Console listing, privacy policy link, data safety form and a reviewer's account; EAS builds
   and updates; the staging and production channels.

**Wave 1: sign up and run orders from the phone**
4. Sign-up and create shop (SA-18).
5. New-order push and Home (today's tiles and the job queue).
6. The orders list (each order with the photo of what was ordered, SA-29) and order page: confirm, tap to call with the
   call log, cancel with a reason, the fraud check.
7. New order and edit order, for an order taken in a Messenger chat.
8. Courier booking from an order, and the parcel's status.
9. Bluetooth label printing (SA-12, SA-13), with Share as PDF.
10. Payments: incoming bKash and Nagad payments, and verifying manual ones.
11. Notifications (the bell).
12. Blocked shop: when balance or plan stops an action, the app says why and links to the web to pay.

**Wave 2: run the catalogue**
13. Add a product with the camera: photos, sizes and designs, price.
14. The products list and product page: price, stock, hide and archive.
15. Stock: add or adjust it, and scan barcodes and serials with the camera.
16. Offers.
17. Customers: the list and each customer's page, with their orders and tap to call.
18. Search across orders, products and customers.
19. Balance top-up, plan and renew in the app (replacing item 12's web link).

**Wave 3: check the business**
20. Sales figures.
21. Billing, invoices, usage and add-ons.
22. The notice board and activity log.
23. Purchases and suppliers; stock checks, expiring stock and stock value.

**Wave 4: set-up and settings**
24. Categories, attributes and option sets, and delivery zones.
25. Team and roles.
26. Settings: shop, couriers, payment methods, SMS, notifications, fraud checks, tax, listener, Meta, export and API
    keys.
27. Storefront settings and own domain.
28. The storefront design editor (themes, brand, products).

## 4. Questions for the owner

| # | Question | What hangs on it | Answer (2026-11-23) |
| --- | --- | --- | --- |
| SA-Q1 | **Play Console account: personal or organization?** | A personal account made after 13 November 2023 must run a closed test with at least 12 testers, opted in for 14 days in a row, before the app can go public. Pilot sellers could be those testers. An organization account skips this but needs the company's D-U-N-S number. | **Personal.** The closed test with pilot sellers comes before the public listing (§5, step 7). |
| SA-Q2 | **During that wait, also offer the app as a download** at download.lytro.app, as the listener is? | Pilot sellers could start straight away. EAS Update reaches downloaded copies too. | **Yes.** The download is Play's own signed copy (SA-33). |
| SA-Q3 | **Which printers do your sellers use?** | Label printers (3×3 and 2×3 inch labels) speak TSPL; receipt-roll printers (58 and 80 mm) speak ESC/POS. | **Either kind, and Lytro can't choose:** "seller may use label printers or receipt roll printers. i don't have any control". So the app works with both (SA-21). |
| SA-Q4 | **The bot check before a code is texted.** The web runs Cloudflare Turnstile on sign-in and forgot password. In the app: Turnstile in a small web view, Google's Play Integrity, or none? | The build only; the screens look the same. | **Yes: the same Cloudflare check, in a web view** (SA-38). |
| SA-Q5 | **Banners on small phones.** The web puts a banner's button (Renew, See plans, Fix email) to the right of its text. At 320 px a long Bangla line squeezes into a narrow column. Keep that, or put the button under the text in the app? | Every banner screen. | **"The best one": under the text, in the app** (SA-39). |
| SA-Q6 | **The product page's ⋮.** The web keeps Duplicate, Archive and Delete for good inside More settings, and the sketch draws them there. Should the app's ⋮ in the top bar also hold those three, or come off? | `sa-product`, `sa-product-more`. | **Yes: the ⋮ holds the three** (SA-40). |

## 5. Build plan

Each slice gets its read as usual, and each is one PR. The server and shared pieces go first, and the app's screens
follow the sketch.

1. **SA.1 Server:** the Firebase push provider, the phone subscription kind, removal on sign-out, the lowest app
   version, the first item's photo on each order in the order list (SA-29), and an optional photo on a push
   message (SA-31). The order-list photo can go first, on its own, so the web's list (SA-30) need not wait for the rest. The owner creates a Firebase project and saves its service-account key in a file that is never opened or
   printed, as with `resend.env`.
2. **SA.2 Shared label:** the label's rules move from `apps/dashboard` into a shared package. Nothing changes on screen,
   and the dashboard's compare pairs prove it.
3. **SA.3 App frame (Wave 0, items 2 and 3):** `apps/seller-app`, its CI (types, lint, unit tests, an Android build),
   EAS, and a first internal build on the owner's phone. SA-6's cookie check comes first.
4. **SA.4 Wave 1, part 1:** sign-up, Home and push, orders, new and edit order.
5. **SA.5 Wave 1, part 2:** courier booking, payments, the bell, blocked shop.
6. **SA.6 Bluetooth printing:** the native module, finding and remembering a printer (SA-21), and the print screen.
   It needs real printers to test (§7), because the emulator has no Bluetooth printer.
7. **Closed test, then public:** at least 12 pilot sellers opted in for 14 days in a row (SA-Q1), then the production
   listing. Meanwhile any pilot seller can install the download (SA-Q2, SA-33). The app IDs are registered for developer verification (SA-22) when the account is made.

Waves 2 to 4 are planned once Wave 1 ships, each with its own sketch round.

**Wave 1 is done when** a pilot seller, on production, installs the app, signs up, gets a push for a storefront
order, confirms it, books Steadfast, prints the label on a Bluetooth printer, and sees the payment come in.

## 6. The sketch

`docs/brand/lytro-seller-app.html`: Android phone frames (320, 360 and 412 px) in Bangla and English, each screen named
`sa-*`, built on the dashboard's own tokens, components and words. A design section for each screen (its purpose,
states and words) goes in `docs/SELLER-APP-DESIGN.md`, as with every surface.

**Part 1, drawn 2026-11-23 (15 screens; the owner: "nice"):**
- **Wave 0:** `sa-welcome`, `sa-sign-in` and `sa-sign-in-pw` (the web's one way in, SA-18), `sa-code`, `sa-code-fill` (SA-23), `sa-shops`, `sa-alerts` and
  `sa-alerts-ask` (turning on alerts, then Android's own question), `sa-account`, `sa-update`.
- **Wave 1:** `sa-home`, `sa-push` (alerts in the notification shade), `sa-orders`, `sa-order` (New), `sa-call`
  (SA-24), `sa-cancel`; redrawn from the web page the same day (SA-34), with `sa-order-confirmed` (Book courier next),
  `sa-order-booked` (the courier card) and `sa-order-menu` (⋮) added.

**Part 2, drawn 2026-11-23 (15 screens; the owner: "agreed"):**
- **Sign-up:** a new number's code leads to `sa-create-shop`, `sa-password`, `sa-set-up`. There is no `sa-checkout`
  (SA-28) and no separate sign-up screen (SA-18).
- **New order, courier and printing:** `sa-new-order`, `sa-book`, `sa-blocked` (the balance can't pay the fee: the step greyed, the reason above it, as on the web),
  `sa-printer-find`, `sa-printer-kind` (sticker or roll, and the size), `sa-test-print`, `sa-print` (a 3 × 3 sticker),
  `sa-print-roll` (58 mm).
- **Payments and the bell:** `sa-payments`, `sa-verify`, `sa-bell`.

**Wave 2, drawn 2026-11-23 (16 screens), each from its built web screen (SA-34):**
- **Products:** `sa-products`, `sa-product-new` (the camera, SA-35), `sa-photo-pick`, `sa-photos` (the web's Photos and video
  sheet), `sa-product`.
- **Stock:** `sa-stock`, `sa-stock-add`, `sa-serials` (SA-37).
- **Offers:** `sa-offers`, `sa-offer-new`.
- **Customers and search:** `sa-customers`, `sa-customer`, `sa-search`.
- **Balance and plan:** `sa-balance`, `sa-topup` (SA-36), `sa-plan`: the plan page as built now (`ux-plan`), with production's plans
  and their card lines from the shared builder.

**Wave 3, drawn 2026-11-23 (15 screens), each from its built web screen (SA-34):**
- **Sales:** `sa-sales`.
- **Billing, usage and add-ons:** `sa-billing`, `sa-bill` (a payment with its tax invoice), `sa-usage`, `sa-addons`.
- **Notices and activity:** `sa-notices`, `sa-notice`, `sa-activity` (the Menu tab now opens on Activity until Team is drawn).
- **Purchases and stock checks:** `sa-purchases`, `sa-purchase`, `sa-suppliers`, `sa-stock-checks`, `sa-stock-check`, `sa-expiring`,
  `sa-stock-value`.

**Wave 4, drawn 2026-11-23 (22 screens), each from its built web screen (SA-34):**
- **Menu and team:** `sa-menu` (the Menu tab's own page), `sa-team`, `sa-roles`.
- **Settings:** `sa-settings`, `sa-shop-details`, `sa-courier`, `sa-payment-methods`, `sa-sms`, `sa-notif-prefs` (with this
  phone's push), `sa-fraud`, `sa-tax`, `sa-listener`, `sa-api-keys`, `sa-meta`, `sa-export`.
- **Catalogue set-up:** `sa-categories`, `sa-attributes`, `sa-delivery`.
- **Storefront:** `sa-storefront` (the page as built now: link, switch, design, domain), `sa-domain`, `sa-design` (the editor),
  `sa-themes`.

Every wave is now sketched.

**Settings in full, drawn 2026-11-23 (48 screens),** after the owner asked to check Settings further: every page's tabs, sheets and
dialogs from the built code (`views/couriers`, `payment-methods`, `sms`, `listener`, `notifications`, `brand`, `delivery`, `team`,
`account`, `settings`) and the design editor's pages and section sheets:
- **Couriers and payment methods:** `sa-couriers`, `sa-courier-pathao`, `sa-courier-connect`, `sa-courier-paste`, `sa-store`, `sa-store-new`,
  `sa-courier-disconnect`, `sa-pm-account`, `sa-pm-bank`, `sa-pm-gateway`, `sa-pm-delete`, `sa-pm-verify`.
- **SMS, listener, alerts:** `sa-sms-log`, `sa-sms-report`, `sa-sms-template`, `sa-sms-name`, `sa-sms-cap`, `sa-lp-pair`, `sa-lp-phone`; the sound
  card and Send a test on `sa-notif-prefs`.
- **Brand and the design editor:** `sa-brand`, `sa-brand-colour`, `sa-brand-font`, `sa-ed-logo`, `sa-ed-list`, `sa-ed-hero`, `sa-ed-slide`,
  `sa-ed-row`, `sa-ed-cats`, `sa-ed-banners`, `sa-ed-announce`, `sa-ed-quotes`, `sa-ed-about`, `sa-ed-add`, `sa-ed-publish`.
- **Delivery, tax, keys, domain, team, account:** `sa-dl-homearea`, `sa-dl-zone`, `sa-tax-class`, `sa-key-new`, `sa-key-created`,
  `sa-key-revoke`, `sa-domain-wait`, `sa-sf-off`, `sa-staff-add`, `sa-staff-edit`, `sa-staff-password`, `sa-seat-full`, `sa-change-pw`,
  `sa-add-email`.

**Every screen, drawn 2026-11-24 (176 more screens, 310 in all),** after the owner asked for every screen the fully featured app would
have. Every dashboard route (83) maps to a screen or is a redirect, and every sheet, dialog, tab and picker in `views/` and
`components/` (144) is drawn; banners and prompts the name check can't see were swept by hand:
- **Wave 0, forgot password and staff sign-in:** `sa-forgot`, `sa-forgot-code`, `sa-forgot-pw`, `sa-staff-sign-in`, `sa-staff-new-pw`.
- **Wave 1, order sheets:** `sa-order-ship` (by hand), `sa-order-deliver`, `sa-order-handover`, `sa-order-handover-serial`, `sa-order-return`,
  `sa-order-return-serial`, `sa-order-pay`, `sa-order-link`, `sa-order-link-ready`, `sa-order-void`, `sa-order-refund`, `sa-order-delete`,
  `sa-order-later`, `sa-order-dates`, `sa-order-settle`, `sa-order-cancel-booking`, `sa-order-picture`, `sa-book-redx`.
- **Wave 1, items and editing:** `sa-order-add`, `sa-order-add-variant`, `sa-order-add-choices`, `sa-order-line-details`, `sa-order-line-price`,
  `sa-order-edit`, `sa-order-edit-booked`.
- **Wave 1, payments in full:** `sa-pay-all`, `sa-pay-detail`, `sa-pay-filter`, `sa-pay-reject`, `sa-pay-reject-other`, `sa-pay-receipts`,
  `sa-pay-receipt`, `sa-payouts`, `sa-payout`, `sa-pay-new`. One change from the web: a row's status sits on the amount's line, because at
  320 px its own column cut off the TrxID.
- **Wave 1, select to print, prompts and the phone line:** `sa-orders-select`, `sa-order-booked-menu`, `sa-pay-phone-off`, `sa-pay-no-phone`,
  `sa-notice-prompt`, `sa-update-ready` (an over-the-air update already downloaded).
- **Wave 1, the whole app's states:** `sa-home-new` (a new shop's Home with its set-up checklist), `sa-banner-trial`, `sa-banner-grace`,
  `sa-banner-readonly`, `sa-banner-lytro`, `sa-banner-email`, `sa-unavailable` (a suspended shop), `sa-splash`, `sa-loading`, `sa-offline`,
  `sa-online-back`, `sa-offline-page`, `sa-offline-save`, `sa-offline-tap`, `sa-error-load`, `sa-error-save`, `sa-toast`, `sa-help`.
- **Wave 2, the product page:** `sa-product-more`, `sa-pr-group`, `sa-pr-attr`, `sa-pr-attr-new`, `sa-pr-options`, `sa-pr-swatch`, `sa-pr-value`,
  `sa-pr-fill`, `sa-pr-variant`, `sa-pr-category`, `sa-pr-category-new`, `sa-pr-zones`, `sa-pr-policy`, `sa-pr-sizechart`, `sa-pr-link`,
  `sa-pr-remove`, `sa-pr-in-combos`, `sa-pr-history`, `sa-product-batch`, `sa-pr-opening-batch`, `sa-product-combo`, `sa-pr-part`,
  `sa-pr-part-tick`, `sa-pr-filter`. New product now opens with the web's Product / Combo pack choice.
- **Wave 2, stock:** `sa-st-pick`, `sa-st-variant-pick`, `sa-st-row`, `sa-st-row-serial`, `sa-st-edit`, `sa-st-edit-serial`, `sa-st-cost`,
  `sa-st-purchases`, `sa-st-batches`, `sa-st-held-serials`, `sa-st-serial-fix`, `sa-st-serials-missing`, `sa-st-check-new`, `sa-st-check-pick`,
  `sa-st-check-count`, `sa-st-check-missing`, `sa-exp-writeoff`.
- **Wave 2, limits and a type's defaults:** `sa-product-limit`, `sa-photos-full`, `sa-product-type`.
- **Wave 2, offers and customers:** `sa-offer`, `sa-offer-change`, `sa-offer-end`, `sa-offer-ended`, `sa-offer-delete`, `sa-offer-pick`,
  `sa-customer-password`, `sa-customer-delete`, `sa-customer-cant-delete`.
- **Wave 3, sales and purchases:** `sa-sales-period`, `sa-sales-product`, `sa-po-new`, `sa-po-add-item`, `sa-po-receive`, `sa-po-cancel`,
  `sa-po-partial`, `sa-po-delivery`, `sa-po-close-short`, `sa-po-draft`, `sa-po-delete-draft`, `sa-supplier-new`, `sa-supplier`.
- **Wave 3, plan, billing and add-ons:** `sa-plan-pay`, `sa-plan-upgrade`, `sa-plan-downgrade`, `sa-plan-stop`, `sa-plan-payg-switch`,
  `sa-plan-payg`, `sa-plan-close-shop`, `sa-renew`, `sa-renew-archived`, `sa-bill-awaiting`, `sa-bill-finish`, `sa-bill-rejected`,
  `sa-bill-again`, `sa-addon-buy`, `sa-addon-pack`; and the states `sa-plan-stopping`, `sa-plan-scheduled`, `sa-plan-checklist`,
  `sa-plan-checking`, `sa-plan-rejected`, `sa-balance-checking`, `sa-bill-checking` (with the payment's screenshot), `sa-bill-shot-sent`.
- **Wave 4, catalogue set-up and settings:** `sa-cat-menu`, `sa-cat-edit`, `sa-cat-new`, `sa-cat-move`, `sa-cat-delete`, `sa-attr-new`,
  `sa-attr-edit`, `sa-option-sets`, `sa-optset-new`, `sa-dl-area`, `sa-dl-rename`, `sa-dl-zone-delete`, `sa-dl-in-use`, `sa-area-search`,
  `sa-courier-steps`, `sa-courier-newaddr`, `sa-couriers-retiring`, `sa-pm-keys-remove`, `sa-brand-image`, `sa-lp-app`, `sa-key-edit`,
  `sa-tax-edit`, `sa-tax-inuse`.

**Pay-as-you-go fair use, drawn 2026-11-24 (13 screens),** from the build in PR #434 (`docs/PAYG-FAIR-USE-PLAN.md`,
`docs/brand/lytro-payg.html`): `sa-push-locked` (the alert with no name), `sa-orders-locked`, `sa-orders-locked-empty`, `sa-order-locked`
(step 0), `sa-order-locked-empty`, `sa-order-phone` (step 1), `sa-order-fair-confirmed`, `sa-book-manual-fee`, `sa-home-activate`,
`sa-home-day25`, `sa-home-day29`, `sa-api-usage`, `sa-api-cap`. The plan cards' pay-as-you-go lines are the fair-use ones. The
pay-as-you-go plan page's "Fee rates" card and the switch sheet still say "৳20 or 1.5%", because #434 leaves them so; they
follow the web once it changes.

**The owner's answers, drawn 2026-11-24 (2 screens, 325 in all):** `sa-human-check` (SA-38) and `sa-product-menu` (SA-40); every
banner's action now sits under its text (SA-39).

Left out on purpose: the web's "being rebuilt" page (every section is drawn, so the app never needs it); category drag-and-drop (the
app moves a category with Move to…); the `invoices` route (it only redirects to Billing). A few near-identical states live in a
screen's caption rather than as their own screen (for example the other payments tabs, which are the same list).

## 7. What the owner pays

- **Google Play:** US$25, once.
- **Firebase Cloud Messaging:** free.
- **EAS:** the free tier's monthly build allowance first; a paid plan only if we outgrow it.
- **Test printers, before SA.6 (not now):** one sticker-label printer and one 58 mm roll printer, cheap models common in
  Bangladesh. I'll name the models at SA.6's read.

## 8. Requirement changes

None are needed, because TEN-23, TEN-23a and TEN-23b cover the app. OD-52's row now names Expo and Android first
(2026-11-23). SA-30 and SA-32 change built web screens, so their requirement rows are written at
that slice's read.
