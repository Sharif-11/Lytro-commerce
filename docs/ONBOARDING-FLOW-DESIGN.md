# Tenant onboarding: flow and first-run dashboard design

Status: v1 design, 2026-10-18, written against `SRS-detailed.md` as of commit 3da3e56 (AUTH-28 amended with the terms line, chosen plan and staff page; AUTH-29, AUTH-30, AUTH-31 added; TEN-15 one shop per person; TEN-31 one dashboard address) and `DEPLOYMENT.md` as of the same commit (`/api` only on the two app hosts). A working prototype of every screen is `docs/brand/lytro-onboarding.html` (open in a browser; needs internet for Google Fonts). Brand rules are in `BRAND-IDENTITY.md`; the landing page is in `LANDING-PAGE-DESIGN.md`.

Scope: from the landing page to the first order being shipped. The full orders, products and settings screens are Phase 3 Slice 11 and Phase 4 work and are not designed here beyond their first-run states.

---

## 1. Where each step lives

| Host | Serves | Reaches the backend | Steps here |
| --- | --- | --- | --- |
| `lytro.app` | marketing site (`apps/website`) | server-side only, no `/api` on this host | claim box, pricing page's plan pick |
| `app.lytro.app` | the dashboard app (`apps/dashboard`), static, one SPA | same-origin `/api/v1/...` through Caddy, host-only session cookie (TEN-29) | sign-in, code, OAuth callback, create-shop, checkout, set-password, set-up, staff sign-in, shop picker, every dashboard at `/<shop slug>/...`, renewal and unavailable screens |
| `<slug>.lytro.app` | the shop's public pages (`apps/storefront`) | server-side; shopper browser code uses `api.lytro.app` with a public key | the storefront link the owner shares; never the dashboard |
| `pay.lytro.app` | hosted payment page (Phase 5) | | the checkout's manual payment step |
| `admin.lytro.app` | operator console (`apps/operator`) | | not part of onboarding |

The claim box posts to `app.lytro.app/sign-in?shop=<slug>`. A plan picked on the pricing page adds `&plan=<id>&term=<id>`. Both survive every identity path, Google and Facebook included (AUTH-28, AUTH-29).

---

## 2. The flow, step by step

```
lytro.app                     app.lytro.app                                              result
─────────                     ─────────────                                              ──────
claim box ──?shop=megh──►  1  /sign-in  phone | Google | Facebook          (AUTH-01, 12, 28, LEG-01 line, AUTH-31 link)
pricing pick ─&plan=&term=►    │
                               ├─ phone ──► 1b /verify-code  6 digits, 5 min, resend 60 s   (AUTH-05..07, 13, 14)
                               └─ Google/Facebook ──► provider ──► /auth/oauth/:p/callback  (AUTH-24)
                               │
                        server answers `next`:
                               ├─ create-shop ──► 2  /create-shop  name, link (live check), owner, address   (AUTH-10, 11, 28; TEN-26)
                               │                    ├─ refused: limit per identity or connection ──► plain message, keep text (AUTH-09, 30)
                               │                    └─ created ──► shop-ready SMS with the storefront URL (SMS-18, platform cost)
                               │                         ├─ plan was picked ──► 2b /checkout  plan+term, price, saving, no refund, pay or continue without paying (AUTH-29, BIL-01, 18)
                               │                         └─────────────────► 3  /set-password  optional, skip; Facebook-only accounts told their recovery path (AUTH-20, 27)
                               │                                               └──► 4  /set-up  shop type (PST-01) · home area (DLV-01), both skippable
                               │                                                     └──► /megh  dashboard home, trial started, checklist (AUTH-10, SUP-01, TRL-08)
                               ├─ dashboard ──► /megh (one shop) · /shops picker when the person belongs to several (TEN-31)
                               ├─ set-password (must) ──► /set-password, blocks everything else (AUTH-19)
                               ├─ renewal ──► /megh/renew  owner of a locked or archived shop (AUTH-22, LIF-11, 12)
                               ├─ create-shop after deletion ──► 2 again, new empty shop, old invoices and balance follow (LIF-21, AUTH-23)
                               └─ unavailable ──► /unavailable  suspended shop, support button, no reason (LIF-24)

staff ──► /staff-sign-in  phone + owner-set password ──► new password required ──► /megh   (AUTH-31, 19; STF-13)
```

### Step 1, identity (`/sign-in`)
- Phone field with a fixed +880 prefix; Continue with Google; Continue with Facebook. One door for new and returning people (AUTH-12).
- Under the buttons, in this order: the terms line ("By continuing you accept the Terms and the Privacy policy", both linked; the versions and time are recorded on the account, LEG-01); the staff link ("Staff? Sign in here", AUTH-31).
- If the visitor came from the claim box, a chip shows the claimed address ("megh.lytro.app is being held for you"); if from pricing, a second chip shows the plan and term. Both are display only here and carried to steps 2 and 2b.
- Signing in by code to an existing shop uses that shop's free SMS; the screen says so and offers password sign-in as the free alternative (AUTH-21). A new sign-up's code is platform cost and the line is not shown.

### Step 1b, code (`/verify-code`)
- Six boxes, auto-advance, backspace, paste of a full code; "valid for 5 minutes"; resend disabled for 60 seconds then at most 5 per hour (AUTH-05..07); wrong-code message with tries left and the 15-minute lock after five (AUTH-06, 14); "use a password instead" for accounts that have one.

### Step 2, create shop (`/create-shop`)
- Shop name (required, up to 60 characters, any script). Shop link pre-filled from the claimed address, else from the Latin letters of the name, else empty for the owner to type (AUTH-11). The suffix shows `.lytro.app`, and under the field two previews: the customer address `<slug>.lytro.app` and the owner's dashboard address `app.lytro.app/<slug>` (TEN-31).
- Availability is checked live as the slug is typed, limited per IP (RTE-06): checking, available, taken with the next free suggestion offered as a one-tap chip (`megh-2`), reserved (`admin`, `lytro`, the dashboard host's top-level paths, TEN-26) with the same suggestion. The exact address is shown once more above the button, because it is set once and never changes (TEN-19).
- Owner name (required) and address (optional). No logo, contact details or anything else (TEN-30 stays in settings).
- Refusal (AUTH-30): when the per-identity or per-connection limit blocks a new shop, the step shows one plain message, "A shop was already opened from this account or internet connection recently", keeps everything typed, creates nothing and offers no other way to open a shop. Sign-in is never limited.
- Success creates the owner user, the trial tenant and the subdomain in one unit of work and sends the shop-ready SMS with the storefront URL (AUTH-10, SMS-18).

### Step 2b, checkout, only when a plan was picked (`/checkout`)
- The plan and term are pre-filled and changeable; price, effective monthly price and saving against the shortest term (TRM-12, BIL-01); the line that a started period is not refunded (BIL-18).
- Payment: the platform's payment page for bKash, Nagad or bank, or a wallet's own checkout; the new shop's balance is empty so it is not offered (BIL-02, 03).
- "Continue without paying" keeps the shop on its trial and steps 3 and 4 follow. A verified payment activates the plan with the trial's data kept (TRL-06, BIL-05); the owner is told in-app, by email where set, and by an SMS that is platform cost. A failed or expired payment changes nothing and the checkout stays reachable from the dashboard home (BIL-15).

### Step 3, password (`/set-password`)
- Optional, shown once; three live rules (8 to 20 characters, has a number, not the phone number); Skip for now; Save. Google- and Facebook-created accounts see the recovery note: a Facebook-only account with no email is told that Facebook sign-in is its only way back in (AUTH-27).
- The same screen, without Skip, is the must-set-password gate for staff first sign-in and password reset (AUTH-19).

### Step 4, set up your shop (`/set-up`)
- Two questions on one screen, each skippable and changeable later. What the shop mainly sells: the PST-01 list as chips (clothing, shoes and bags, cosmetics, electronics, mobiles and gadgets, grocery, food and bakery, books and stationery, pharmacy, home and décor, other). Where it delivers from: a city, a district or its own thanas, defaulting to Dhaka city; the two default zones preview as the owner picks ("Inside Dhaka city 70 TK · Outside Dhaka city 130 TK", DLV-01), so the shop sells with no further setup.
- Skipping keeps the default shop type and Dhaka city.

### Landing in the dashboard (`/<slug>`)
- The trial starts at create-shop, not at sign-up. The home screen shows the trial countdown and what happens at day 30 (pay-as-you-go, nothing lost, TRL-07, TRL-08), the setup checklist, and the empty states below.

---

## 3. The first-run dashboard

### Shell (every screen under `/<slug>`)
- Header: the shop's monogram (first letter on a neutral tile) or uploaded logo, the shop name, the language toggle (per device, I18N-02), the notification bell. The browser tab reads "<shop name> · Lytro" (TEN-16).
- Navigation: a sidebar from 900 px, bottom tabs on phones: Orders, Products, Customers, Balance, More (settings, staff, notices, activity, usage). The notice badge sits on More.
- A persistent "Powered by Lytro" mark in the sidebar foot and in the More sheet (TEN-18). Nothing anywhere offers "create another shop" (TEN-15).
- The address bar reads `app.lytro.app/<slug>`; a PWA install from here scopes to `/<slug>/` with the shop's own name and icon (TEN-17).

### Home, day one
1. **Trial banner**: "30 days left in your trial. At day 30 you continue on pay-as-you-go, nothing is lost." with "See plans". A shop that paid at checkout and is awaiting confirmation shows "Starter · payment being checked" instead; a confirmed plan shows the plan and renewal date.
2. **Setup checklist** (SUP-01), two groups, each item detected automatically, a progress bar, each item a link:
   - Get your shop ready: shop created (done); delivery charges (done, showing the two values from the home area); add the first product; upload your logo; add a wallet number for payments; share the shop link (done once a shop or product link is copied or shared).
   - Later, when you need them: connect a courier; choose SMS events; pair a listener phone; create an API key.
   - The checklist folds away once the first group is complete and reopens from settings. Help text per item is operator-editable (SUP-02).
3. **Shop link card**: `<slug>.lytro.app` with Copy, Share on Facebook, Share on WhatsApp (ticks the checklist item).
4. **Today**: orders, sales and to-confirm figures, all zero, with the empty state "Your first order will appear here" and two actions: share the link, or enter an order by hand (ORD-01).
5. **Notices**: an urgent notice shows as a banner above everything until dismissed; an important one prompts once at sign-in (NTC-04).

### Empty states and guided screens
- **Products, empty**: "No products yet" with "Add your first product". The form follows the shop type: for mobiles and gadgets, name, price, photo and stock up front, the "Track each unit's IMEI or serial" switch and "Condition" visible, everything else under "More settings" (PST-05); for clothing, the size chart is up front instead. Saving a product makes its landing page live at once and shows the product link with Copy, Facebook and WhatsApp (LND-01, LND-06).
- **Payments, no wallet**: "Customers cannot pay online until you add a number" with the add-wallet form: provider (bKash, Nagad, Rocket, bank), number, account name, type (personal, agent, merchant), note. Nothing activates by itself; the owner activates one account per provider (WAL-01..04). Only a verified phone enables the payment page (TVR-01).
- **Listener, not paired**: why it exists in one line, "Pair a phone" producing a single-use code valid 10 minutes with a QR, the device list with name, last seen, uploads today, revoke (LSN-01, 02, 20). The trial allows one device (LSN-08).
- **Couriers, none connected**: Steadfast and Pathao cards with the credential fields each needs, a test call before saving, and "default courier" after the first connection (CRR-01, 02, 05). Entering a tracking link by hand is always possible without a courier (CRR-16).
- **Customers, empty**: appears after the first order; the empty state says so and links to the shop link card.
- **Balance, 0**: top up is available on the trial for SMS, order extraction and payment verification fees (TRL-04, BAL-06); the current-rates link (RAT-06).

### Shop picker (`/shops`)
Shown only to a person who belongs to more than one shop, for example a staff member who also owns a shop (TEN-31). A list of shops with role and address; tapping opens `app.lytro.app/<slug>`. An owner never sees a "new shop" button here (TEN-15).

### Lifecycle exits
- **Locked or archived, owner** (`/<slug>/renew`): the renewal screen with the plan picker, pay-as-you-go as the no-payment choice (LIF-15), export, and the deletion date for an archived shop (LIF-18). Staff are refused with `tenant_offline`.
- **Suspended** (`/unavailable`): "Your shop is not available right now. Contact support for help." with a support button and no reason; the owner can still see the balance and top up (LIF-24).
- **Deleted**: sign-in lands on create-shop for a new, empty shop; the old invoices and the remaining balance follow it (LIF-21, AUTH-23).

### After the first order
Home switches to a working state: the three figures, the order list preview with the Confirm and Book courier actions, the fake-order chip where a number has history, and the checklist folded to one line with its remaining "later" items. The first shopper-placed order also arrives as a push and in-app notification (ORD-20).

---

## 4. Copy rules on these screens
Bangla first, English by toggle (I18N-01); the dashboard's existing vernacular (`apps/admin/src/i18n/locales/bn.json`: লাইট্রোতে স্বাগতম, এগিয়ে যান, ভেরিফাই করুন, স্টাফ? এখানে লগইন করুন); one sentence per message; never blame the seller; the AUTH-30 refusal, the AUTH-27 recovery note and the AUTH-21 free-SMS line are the three places where a second sentence explains what to do.

---

## 5. Mapping onto `apps/dashboard` (today `apps/admin`)

| Screen | Route | Exists today | Change |
| --- | --- | --- | --- |
| Sign-in | `/sign-in` | yes (`views/sign-in`) | keep `?shop=`, `?plan=`, `?term=` through every path; terms line; staff link; claimed-address and plan chips |
| Code | `/verify-code` | yes | OTP boxes, tries-left message, free-SMS line for existing shops |
| OAuth return | `/auth/oauth/:provider/callback` | yes | route on `next` as sign-in does; keep the query context |
| Create shop | `/create-shop` | yes (`views/create-shop`) | live availability with suggestion chips, two-address preview, AUTH-30 refusal state |
| Checkout | `/checkout` | no | new; uses `billing/quote` and `billing/purchase`; "continue without paying" |
| Set password | `/set-password` | yes | optional variant with Skip; recovery note for provider accounts |
| Set up | `/set-up` | no | new; PST-01 chips and the DLV-01 home-area picker with zone preview |
| Shop picker | `/shops` | no | new; only when the session belongs to several shops |
| Dashboard home | `/$shop/` | yes (`views/dashboard`, placeholder) | trial banner, checklist, shop link card, today card, empty states |
| Staff sign-in | `/staff-sign-in` | yes (`staff-sign-in.tsx`, on the shop host) | move to the app host; must-set-password gate |
| Renewal | `/$shop/renew` | partly (`billing.tsx`) | the lifecycle exits above |
| Unavailable | `/unavailable` | yes | keep; add the balance and top-up carve-out |

Routes move under `/$shop` in Slice 0; the screens above are Slice 0 and Slice 11 work per `PHASE-3-PLAN.md`.

---

## 6. Open items
- The hosted payment page in the checkout is Phase 5; until then the checkout's wallet step is the Phase 2 operator-confirmed stand-in (AUTH-29 partial).
- Google and Facebook buttons must follow each provider's sign-in branding rules in the build.
- The home-area picker's city and district list comes from CUS-08; the prototype shows a short sample.
- The checklist's "choose SMS events" and "create an API key" items depend on Phase 3 Slice 8 and the SMS module; they appear when those ship (SUP-01 partial).
