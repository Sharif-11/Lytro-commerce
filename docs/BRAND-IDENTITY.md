# Lytro brand identity

Status: v1 proposal, 2026-10-17. This is the brand identity brief that `MARKETING-PLAN.md` refers to. It covers the product brand only. Assets and tokens live in `docs/brand/`. A visual version of this document is `docs/brand/lytro-brand-guide.html` (open it in a browser; it needs internet access for Google Fonts), also published at https://claude.ai/artifact/12ENmC8KEcoVrLu538y59F.

Decision recorded here: the product is called **Lytro**, made by **Lytronix**. The earlier green and gold palette in `apps/admin` and `apps/website` was adopted from Lytronix's battery business; this brief replaces it with a palette of Lytro's own so the two businesses stay visually separate, which `MARKETING-PLAN.md` already requires. Nothing in the apps has been changed yet; section 11 lists the code follow-ups.

---

## 1. Brand platform

| | |
| --- | --- |
| Name | Lytro. Written "Lytro" in prose, "lytro" only inside the wordmark. Never "Lytro Commerce" in customer-facing text. |
| Bangla | লাইট্রো (already used in the dashboard sign-in). Pronounced LY-tro. |
| Company | Lytronix. Appears as the endorser ("Lytro by Lytronix") on the landing page footer, legal pages, invoices and app store listings. Nowhere else. |
| Audience | A small Bangladeshi online seller, usually a Facebook page, 50 to 500 orders a month, running the business from a phone. |
| Positioning | The fastest, simplest way for a Bangladeshi seller to run a real online shop, with orders, payments, couriers and fraud checks already connected, in Bangla, with no monthly fee to start. |
| Promise | Your shop, in your hand. |
| Brand line (Bangla) | আপনার দোকান, আপনার হাতে। |
| Offer line | Sell today. Pay when you sell. / আজই বিক্রি শুরু করুন। বিক্রি হলে তবেই ফি। |

**Personality.** Four traits, each with a boundary.

| We are | We are not |
| --- | --- |
| Dependable. Things happen when the seller taps. | Flashy. No promises the product cannot keep. |
| Plain-spoken. Short sentences, seller's own words. | Corporate. No "solutions", no "empower". |
| Quick. The product and the copy both move fast. | Rushed. Never skip the detail a seller needs to trust a number. |
| Local. Bangla first, Dhaka couriers, bKash and Nagad by name. | Folksy. No village-fair illustration, no cliché. |

**Brand idea.** The seller already does everything with one hand on a phone. Lytro's job is to make that one hand enough. The mark, the copy and the layouts all follow from that: one stroke, one sentence, one tap.

---

## 2. Brand architecture

One product brand, five surfaces. Surfaces are named by what they are for, never with invented sub-brands.

| Surface | Name in UI | Lytro visibility |
| --- | --- | --- |
| Marketing site (`apps/website`) | Lytro | Full brand. |
| Tenant dashboard, PWA and native (`apps/dashboard`, today `apps/admin`) | Lytro (app name); the tenant's shop name in the navigation | Chrome colours and components are Lytro's; the identity shown is the tenant's (TEN-8). A "Powered by Lytro" mark stays. |
| Shopper storefront PWA (`apps/storefront`) | The tenant's shop name | Lytro supplies neutral defaults only. "Powered by Lytro" in the footer and "Secured by Lytro" on the hosted payment page. |
| Operator console (`apps/operator`, `admin.lytro.app`) | Lytro Operator | Full brand, inverted chrome, so it can never be mistaken for a tenant dashboard. |
| Android SMS listener | Lytro Listener | Full brand, utility treatment. |

Attribution wording changes from "Powered by Lytronix" to "Powered by Lytro". This touches TEN-8 in the SRS and the `common.poweredBy` strings; see section 11.

---

## 3. Logo

**The mark.** A single stroke draws an L whose foot rises into a tick. It reads as the initial, as a check mark (order confirmed, payment matched, courier booked) and as an upward line. One stroke, round caps and joins, no fill.

- Geometry: viewBox 0 0 64 64, path `M15 15V49H31L49 29`, stroke width 10, round linecap and linejoin. The path is the only thing that must never change.
- Clear space: one stroke width (10 units of 64) on every side.
- Minimum size: mark 16 px, wordmark 72 px wide, "Powered by" lockup 16 px tall.
- Colour: teal-700 on light, teal-400 on dark, white on teal or ink tiles, marigold only on the operator icon. Monochrome version uses `currentColor`.

**The wordmark.** The mark is the first letter. The L-tick stands in for the L, followed by "ytro" in Plus Jakarta Sans ExtraBold, tracking -0.03 em, ink on light and white on dark. The mark sits on the baseline and rises to ascender height, with the tick almost touching the y. Never write a separate lowercase l after the mark; that was the first draft and it read as L, l (changed 2026-10-18). The Bangla lockup uses লাইট্রো in Noto Sans Bengali Bold at the same height and is used where the Latin word would be the only Latin on screen (SMS templates, printed labels, notices).

The SVG wordmarks in `docs/brand/` are set in live text. Before any production use they must be outlined to paths in Figma so they render without the font installed. The mark is final geometry and needs no outlining.

**Misuse.** Do not rotate, add gradients, outline the stroke, change the stroke weight, place the mark inside a circle, pair it with a lightning bolt or battery, use the Lytronix green, set the wordmark in title case, or add a lowercase l between the mark and "ytro".

**Files.** `lytro-mark.svg`, `lytro-mark-mono.svg`, `lytro-wordmark.svg`, `lytro-wordmark-dark.svg`, `lytro-lockup-bn.svg`, `powered-by-lytro.svg`, `icon-dashboard.svg`, `icon-operator.svg`, `icon-listener.svg`, `icon-listener-notification.svg`.

---

## 4. Colour

**Why teal and marigold.** The Bangladeshi commerce screen is already pink (bKash), orange (Nagad, Daraz) and red (Pathao). Teal is calm, reads as trustworthy and is unclaimed in this market. Marigold, the gada phool, brings warmth and is the one colour a seller's eye goes to first, so it is reserved for the single most important action on a screen.

**Teal (brand).** 50 `#effaf8`, 100 `#ddf5f2`, 200 `#b9ece6`, 300 `#7fdcd3`, 400 `#3ec4b9`, 500 `#17a89e`, 600 `#107f78`, 700 `#0e6b66`, 800 `#0a4f4b`, 900 `#063b38`.

**Marigold (accent).** 100 `#fdf0d1`, 300 `#f8cf6e`, 500 `#f2a516`, 700 `#9a6004`.

**Neutrals.** Ink `#10201f`, 700 `#2c3f3e`, 500 `#5b6e6d`, 400 `#7e8f8e`, 300 `#a9b9b8`, 200 `#d5dfde`, 100 `#eaf0ef`, 50 `#f6f9f8`, white.

**Status.** Success `#1b7a43`, warning `#9a6004`, danger `#c8323b`, info `#0e6b66`, each with a soft tint (see `tokens.css`). Status colours mean one thing each and are never used as decoration. Marigold on a button is an accent, not a warning.

**Roles.**

| Role | Light | Dark |
| --- | --- | --- |
| Primary (buttons, links, active nav) | teal-700, white text | teal-400, ink text |
| Accent (one CTA per screen, highlights) | marigold-500, ink text | marigold-300, ink text |
| Accent as text | marigold-700 | marigold-300 |
| Chrome (sidebar, hero, operator shell) | teal-900 | `#061211` |
| Background / sunken | white / neutral-50 | `#0c1a19` / `#091413` |
| Text / secondary | ink / neutral-700 | neutral-100 / neutral-200 |
| Subtle (Latin captions at 13 px or larger only) | neutral-500 | neutral-300 |

**Contrast, checked.** White on teal-700 6.3:1. White on teal-600 4.9:1 (the floor). Ink on marigold-500 8.2:1. Marigold-700 on white 5.2:1. Marigold-500 on teal-900 6.0:1. Teal-400 on ink 7.9:1. Neutral-700 on white 10.6:1 is the floor for any secondary text, because Noto Sans Bengali strokes are thin and neutral-500 reads lighter than its 5.4:1 suggests. Neutral-500 is allowed only for Latin captions at 13 px or larger, and neutral-400 is never used for text.

**Third-party logos and colours.** bKash, Nagad, Steadfast, Pathao, RedX, Google and Facebook appear only as their own official logos, in their own colours, from `docs/brand/third-party/` (sources and rules in its README). On the hosted payment page the wallets' colours also appear inside the selected method's own panel (§8.7). Their colours are never used as Lytro UI colour.

---

## 5. Typography

| Role | Face | Weights | Notes |
| --- | --- | --- | --- |
| Display and wordmark | Plus Jakarta Sans | 700, 800 | Headlines on the landing page and empty states only. Tracking -0.02 em above 28 px. |
| UI, Latin and digits | Inter | 400, 500, 600 | Already in use. Tabular numerals wherever digits line up. |
| Bangla, all roles | Noto Sans Bengali | 400, 600, 700 | Already in use. Headlines in 700. Line height 1.6, never below 1.5. |

Scale: 12, 14, 16, 18, 22, 28, 36, 48 px. UI line height 1.45, display 1.1, Bangla 1.6. Body text 16 px on phones, never 14. Uppercase labels get 0.06 em letter spacing and are used for eyebrows only.

**Numbers and money.** Western digits everywhere, including Bangla UI, because order numbers, phone numbers and amounts are read aloud and typed back. Taka is written `৳1,250` with the sign first and no space; paisa shown only when non-zero. Three-digit grouping, matching bKash and Nagad statements. Dates in Bangla UI follow `১৭ অক্টোবর` for display and `17 Oct 2026` in tables; times are 12-hour with Bangla period words (সকাল, দুপুর, বিকাল, রাত).

---

## 6. Shape, space, icons, imagery, motion

- **Radius.** Controls 6 px, cards 10 px, sheets and dialogs 16 px, pills full. App icons use a 22% corner. Not everything is rounded; tables, dividers and the sidebar are square.
- **Spacing.** 4 px base. Component padding 12 or 16, section gaps 24 or 32, page sections 48 or 64.
- **Elevation.** One card shadow. Borders do most of the separating.
- **Icons.** Lucide, 1.75 px stroke, round caps, which matches the mark's construction. Never filled icons next to outline icons.
- **Imagery.** Real sellers, real phones, real parcels and real screenshots with Bangla UI. No stock handshakes, no isometric illustration, no 3D blobs. Screenshots get a marigold ring when a detail is being pointed at.
- **Motion.** 150 ms for state changes, 250 ms for sheets, standard ease-out. One moment of delight: when an order is confirmed, the mark's tick draws in once (400 ms). Respect reduced-motion.

---

## 7. Voice and tone

**Principles.**

1. Bangla first. Every string ships in Bangla; English is a toggle, not a fallback.
2. Say what happens. "অর্ডার কনফার্ম হয়েছে", never "সফলভাবে সম্পন্ন হয়েছে".
3. One sentence per message. If a second is needed, it is the next action.
4. Numbers carry the trust. Show the fee, the count, the time.
5. Never blame the seller. Errors say what went wrong and what to do.

**Bangla register.** Commerce vernacular, transliterated the way sellers speak, which is also how the dashboard already reads: অর্ডার, কুরিয়ার, ডেলিভারি চার্জ, স্টক, ব্যালেন্স, টপ-আপ, পেমেন্ট, রিটার্ন, ইনভয়েস, সেভ করুন, ক্যানসেল, এডিট. Formal Bangla (সংরক্ষণ, বাতিল করুন, সম্পাদনা) only in legal and policy text. Shoppers are addressed with আপনি; the seller's own customers are "কাস্টমার".

**Vocabulary.** The one list both apps and templates use.

| English | Bangla UI |
| --- | --- |
| Order / Pending / Confirmed / Shipped / Delivered / Returned / Cancelled | অর্ডার / পেন্ডিং / কনফার্মড / পাঠানো হয়েছে / ডেলিভারড / রিটার্ন / ক্যানসেলড |
| Fake order check | ফেক অর্ডার চেক |
| Courier, book courier | কুরিয়ার, কুরিয়ার বুক করুন |
| Delivery charge | ডেলিভারি চার্জ |
| Product, variant, stock | প্রোডাক্ট, ভ্যারিয়েন্ট, স্টক |
| Payment, paid, due, cash on delivery | পেমেন্ট, পেইড, বাকি, ক্যাশ অন ডেলিভারি |
| Balance, top up | ব্যালেন্স, টপ-আপ |
| Trial, subscription, plan | ট্রায়াল, সাবস্ক্রিপশন, প্ল্যান |
| Staff, owner, customer | স্টাফ, মালিক, কাস্টমার |
| Settings, notice | সেটিংস, নোটিশ |

**Tone by surface.**

| Surface | Tone | Example |
| --- | --- | --- |
| Landing page | Confident, concrete, pain first | "শিপ করার আগেই ফেক অর্ডার ধরুন।" |
| Tenant dashboard | Quiet, instructional, one tap | "৩টি অর্ডার কনফার্ম করার অপেক্ষায়।" |
| Storefront | The tenant's voice; Lytro only adds reassurance | "পেমেন্ট নিরাপদ। Secured by Lytro." |
| Operator console | Precise, English-leaning, never cute | "Tenant locked. Reason required." |
| Listener | Status only, always visible | "Lytro Listener চালু আছে। পেমেন্ট SMS মিলছে।" |
| SMS to shoppers | Shortest possible, tenant name first | "Rahim Gadgets: অর্ডার #1042 পাঠানো হয়েছে। ট্র্যাক: lytro.app/t/8f2k" |

**Patterns.** Success: what happened, then the next step. Error: what went wrong, what to do, no apology. Empty state: what will appear here and the one button that starts it. Destructive confirmation: name the thing being deleted and the consequence in the button label ("অর্ডার ডিলিট করুন"), never "OK".

---

## 8. Surfaces

### 8.1 Landing page (`apps/website`)
Full brand. Hero on teal-900 chrome: wordmark top left, language toggle and a marigold "শুরু করুন" button top right, Bangla headline in Noto Sans Bengali 700 at 36 to 48 px, a real dashboard screenshot on a phone. Below the fold the page runs on white with neutral-50 bands. One marigold CTA per section. Trust strip shows bKash, Nagad, Steadfast and Pathao in their own logos on a neutral band. Footer carries "Lytro by Lytronix" and the Bangla lockup. Metadata title stays "Lytro — আপনার অনলাইন দোকান চালান এক জায়গা থেকে".

### 8.2 Tenant dashboard, PWA and native (`apps/dashboard`, today `apps/admin`)
Chrome: sidebar on teal-900 with teal-800 active state and white text; content on neutral-50 with white cards. The navigation header shows the tenant's shop name and uploaded logo, not Lytro's (TEN-8). "Powered by Lytro" sits at the bottom of the sidebar at 16 px, monochrome, non-removable. Primary buttons teal-700; the single accent button per screen (confirm order, book courier) marigold with ink text. Status chips use the status colours only.

PWA manifest: name "Lytro", theme colour teal-800 `#0a4f4b`, background neutral-50, icon `icon-dashboard.svg`. When a tenant uploads a logo, the installed app's icon, name and splash take the tenant's identity and the Lytro icon is the fallback. Native wrapper: status bar teal-900, adaptive icon with the mark as foreground on a teal-700 background, splash on teal-900 with the white mark centred at 96 dp.

**Support view** (ADM-05): a full-width banner on every screen, in the operator console's ink and marigold so it can never pass for the shop's own interface, naming the operator and the time left.

**With the shop's brand identity on** (BRN-02, a paid add-on on every plan): the chrome, primary buttons, fonts, corner shape and spacing take the shop's identity. Status colours, the layout and "Powered by Lytro" stay Lytro's.

### 8.3 Shopper storefront PWA (`apps/storefront`)
The tenant's brand owns this surface. Lytro provides the defaults a new shop starts with: ink text on white, teal-700 as the accent until the tenant picks one, Inter and Noto Sans Bengali, the same radius scale. Lytro appears twice: "Powered by Lytro" in the footer and "Secured by Lytro" with the mark beside the pay button on the hosted payment page. The storefront's manifest uses the tenant's name and logo.

**Free and paid.** Every shop shows its own name and logo, or a monogram, on Lytro's defaults (TEN-16). The shop's own colours, fonts, shape and spacing need the brand identity add-on (BRN-02, BRN-05).

### 8.4 Operator console (`apps/operator`, `admin.lytro.app`)
Inverted so an operator never confuses it with a tenant's dashboard: chrome `#061211`, surfaces `#132725`, text neutral-100, primary teal-400 with ink text, accent marigold-300. An "OPERATOR" eyebrow in marigold sits above the wordmark in the sidebar. Favicon and icon use `icon-operator.svg` (ink tile, marigold mark). Copy is English-leaning and exact.

### 8.5 Android listener
App name "Lytro Listener". Launcher icon `icon-listener.svg` (ink tile, white mark, marigold signal arcs). Status bar notification icon is the white-only mark on the 24 dp grid. Screens are dark: background `#0c1a19`, pairing code boxes in marigold-300 with ink digits, a single status line in Bangla at the top ("চালু আছে" in teal-400, "পেয়ার করা নেই" in marigold-300, "সাবস্ক্রিপশন ইনঅ্যাক্টিভ" in danger). Persistent notification text: "Lytro Listener চালু আছে। পেমেন্ট SMS মিলছে।"

### 8.6 App icon system
One mark, four tiles. The tile tells the surfaces apart at a glance.

| App | Tile | Mark | File |
| --- | --- | --- | --- |
| Tenant dashboard | teal-700 | white | `icon-dashboard.svg` |
| Operator console | teal-900 | marigold | `icon-operator.svg` |
| Listener | teal-900 | white, plus marigold arcs | `icon-listener.svg` |
| Storefront | tenant logo; Lytro dashboard icon as fallback | | |

### 8.7 Hosted payment page (`pay.lytro.app`)
Used for manual payments only. A wallet whose gateway the seller has connected sends the shopper straight to that wallet's own checkout page, which carries the wallet's own design (PAY-06).

- **Frame:** neutral and Lytro's. The header shows the shop's name and logo, or its monogram, and nothing else from the shop's brand (PAY-05, BRN-04). The footer carries "Secured by Lytro", "Report this page" and the line "This page never asks for your PIN or OTP".
- **Method panels:** each manual method sits in its own panel in that wallet's official logo and colour scheme, with step-by-step instructions written the way the wallet's own app words them for the account type (Send Money, Cash Out, Payment), in Bangla by default. Bank transfer uses a neutral panel with the full account details.
- **Decision, 2026-10-18:** the owner decided to use the wallets' official logos and colour schemes without written brand-use approval, because shoppers trust them and bKash and Nagad have raised no complaint about this common practice. Revisit at once if a provider objects; the panels can fall back to text names and neutral colours by a setting, with no redesign.

---

## 9. Tokens

`docs/brand/tokens.css` is the source of truth with light and dark roles. In code, `packages/ui` carries them: `styles/base.css` for the scales, type and shape, and `styles/light.css` (dashboard) and `styles/console.css` (operator console) for the roles the shared components use. `tailwind-theme.css` is the `@theme` block to paste into both Tailwind apps; it keeps the `brand-*` and `accent-*` names so existing classes keep working. `tokens.json` is for native code and design tools. `android-colors.xml` is for the listener and the native wrapper.

---

## 10. Assets index (`docs/brand/`)

| File | Use |
| --- | --- |
| `lytro-mark.svg` | The mark in teal-700. Favicon source, in-app logo. |
| `lytro-mark-mono.svg` | `currentColor` mark for footers, print and notification contexts. |
| `lytro-wordmark.svg` / `lytro-wordmark-dark.svg` | Mark plus wordmark, light and dark. Outline before shipping. |
| `lytro-lockup-bn.svg` | Mark plus লাইট্রো. Outline before shipping. |
| `powered-by-lytro.svg` | Attribution lockup for tenant surfaces. |
| `icon-dashboard.svg`, `icon-operator.svg`, `icon-listener.svg` | 512 px app icons, maskable-safe. |
| `icon-listener-notification.svg` | 24 dp white notification glyph. |
| `facebook-profile.svg`, `facebook-cover.svg`, `og-image.svg` | Facebook page avatar and cover, Open Graph share image (section 13). Outline or export to PNG before upload. |
| `tokens.css`, `tailwind-theme.css`, `tokens.json`, `android-colors.xml` | Tokens. |
| `lytro-brand-guide.html`, `lytro-landing.html` | The visual brand guide and the landing-page prototype, self-contained HTML. |
| `lytro-onboarding.html`, `lytro-site-pages.html`, `lytro-support-legal.html` | The first onboarding flow (its screens are superseded by `lytro-dashboard.html`; its flow and decisions stay in ONBOARDING-FLOW-DESIGN.md), the site pages and the support and legal pages, self-contained prototypes (SITE-PAGES-DESIGN.md, SUPPORT-LEGAL-PAGES-DESIGN.md). |
| `lytro-dashboard.html` | The whole seller journey as of Phase 3 Slice 3: sign-in and onboarding, every hub and sheet of the dashboard, the lifecycle states, and the later-phase designs under their own group; phone, tablet and desktop; self-contained prototype (TENANT-DASHBOARD-DESIGN.md). Supersedes `lytro-dashboard-sections.html` and the screens of `lytro-onboarding.html`. |
| `lytro-payment-page.html` | The hosted manual-payment page (`pay.lytro.app`): a panel per wallet in its official colours, every account type and session state, self-contained prototype (PAYMENT-PAGE-DESIGN.md). |
| `lytro-dashboard-sections.html`, `lytro-operator.html` | The earlier Phase 1–2 dashboard sections (superseded, kept for history) and the operator console, self-contained prototypes (DASHBOARD-SECTIONS-DESIGN.md, OPERATOR-CONSOLE-DESIGN.md). |

---

## 11. Applying it to the code (follow-ups, not done)

1. Replace the `@theme` blocks in `apps/admin/src/index.css` and `apps/website/src/app/globals.css` with `docs/brand/tailwind-theme.css`. Delete the comment that credits the Lytronix palette.
2. Add Plus Jakarta Sans 700 and 800 to the font links in `apps/admin/index.html` and to `next/font/google` in `apps/website/src/app/layout.tsx`.
3. Replace `apps/admin/public/logo.svg` with `icon-dashboard.svg` and re-run `npx pwa-assets-generator`.
4. In `apps/admin/vite.config.ts` and `index.html`, set `theme_color` to `#0a4f4b` and `background_color` to `#f6f9f8`. The current `#0d9488` matches nothing.
5. Change `common.poweredBy` in `bn.json` and `en.json` to "Powered by Lytro" once TEN-8's wording is amended in `SRS.md` to name Lytro rather than Lytronix.
6. Give the operator shell its inverted chrome and the operator favicon.
7. Set the storefront's metadata title to the tenant's name and add the footer attribution and payment-page "Secured by Lytro" mark.
8. Outline the three text-based SVGs to paths in Figma and replace them.
9. File the trademark at the Department of Patents, Designs and Trademarks (classes 9, 35, 42), and secure the lytro.app domain (chosen 2026-10-18), lytro.com.bd as a defensive registration, and social handles.

---

## 12. Open questions

- Whether SMS tracking links need a shorter domain than `lytro.app/t/…` (section 7 uses `lytro.app`; a short domain such as `lyt.ro` is not owned).
- Whether the native dashboard app ships on iOS as well as Android at launch; the icon set covers both.
- Whether marigold should also mark "trial" state in the dashboard or stay reserved for actions only. Recommendation: actions only.

---

## 13. Brand applications

Where the identity meets the world outside the product. All sizes are export sizes; the SVG sources are in `docs/brand/`.

| Application | Composition | Source |
| --- | --- | --- |
| Website navbar, light | The wordmark at 36 px tall (mark as the L in teal-700, "ytro" in ink), left-aligned. Links Inter 500 15 px neutral-700. Language toggle pill. "লগইন" as text link. One marigold button "ফ্রি দোকান খুলুন". Height 64 px, white at 92% with blur, hairline border. | `lytro-wordmark.svg`; layout in `LANDING-PAGE-DESIGN.md` |
| Website navbar, on dark hero | Same, mark in teal-400 and wordmark in white, on teal-900. | `lytro-wordmark-dark.svg` |
| Favicon | Mark alone in teal-700 at 16 and 32 px (no tile, it would be a blurred square). SVG favicon plus 32 px PNG and 180 px Apple touch icon using the dashboard tile. | `lytro-mark.svg`, `icon-dashboard.svg` |
| App icons | One mark, four tiles (section 8.6). 512 px, 22% corner, maskable-safe. Android adaptive: foreground is the mark at 60% of the canvas, background the tile colour. | `icon-*.svg` |
| Facebook page profile picture | Teal-700 square, white mark inside the central 70% so the circular crop keeps it whole. 1024 px PNG. Never the wordmark. | `facebook-profile.svg` |
| Facebook page cover | Teal-900, wordmark top-left, Bangla promise line, marigold CTA pill. The wordmark is the only logo on it; no watermark mark. 1640 × 624, content inside the central 1200 px for phone crops. | `facebook-cover.svg` |
| Google Play feature graphic | Same composition as the cover at 1024 × 500. | `facebook-cover.svg` recomposed |
| Open Graph / share image | Teal-900, wordmark, Bangla promise in two lines, descriptor, CTA pill, "lytro.app · by Lytronix". 1200 × 630. | `og-image.svg` |
| Facebook post template | Teal-900 or white background, one Bangla sentence in Noto Sans Bengali 700 at 72 px on a 1080 square, mark bottom-right at 64 px, marigold only for one highlighted word or the CTA. No emoji, no gradients. | to be made in Figma from the tokens |
| Email signature | Name (Inter 600), role, "Lytro by Lytronix", phone and WhatsApp number, mark at 20 px in teal-700. No banner image. | text only |
| SMS sender name | "Lytro" where the gateway allows an alphanumeric sender; shopper SMS always starts with the tenant's shop name, never ours. | SRS SMS-2 |
| Printed courier label and invoice | Tenant's name and logo lead. "Powered by Lytro" monochrome at the bottom at 16 px, never larger than the tenant's own mark. | `powered-by-lytro.svg` |
| Operator favicon | Marigold mark on teal-900 so the operator tab is distinguishable from a tenant tab. | `icon-operator.svg` |

The three text-based SVGs (`facebook-cover.svg`, `og-image.svg`, the wordmarks) must be outlined or exported to PNG from Figma with the fonts installed before any upload.

---

## 14. Font styling

The type roles from section 5, resolved to the elements people actually build. Sizes in px; line height as a ratio; Bangla uses Noto Sans Bengali at the same size with line height raised to the Bangla value.

| Element | Face and weight | Size / line height | Tracking and case | Colour |
| --- | --- | --- | --- | --- |
| Wordmark | Plus Jakarta Sans 800, lowercase | by context | −0.04 em | ink / white |
| Landing H1 | Noto Sans Bengali 700; English Plus Jakarta Sans 800 | 32 to 52 / 1.25 (bn), 1.08 (en) | en −0.02 em | white on chrome |
| Section H2 | Noto Sans Bengali 700; English Plus Jakarta Sans 700 | 24 to 34 / 1.3 (bn), 1.15 (en) | en −0.02 em | ink |
| Card and feature H3 | Noto Sans Bengali 700; English Inter 600 | 17 / 1.4 | none | ink |
| Eyebrow | Inter 600 uppercase (en); Noto Sans Bengali 600 (bn, no uppercase) | 12 (en) 14 (bn) / 1.4 | en 0.08 em | marigold-700 on light, marigold-300 on dark |
| Body and lead | Inter 400; Noto Sans Bengali 400 | 16 to 18 / 1.5 (en), 1.6 (bn) | none | ink; lead in neutral-500 |
| Nav link | Inter 500; Noto Sans Bengali 500 | 15 / 1.2 | none | neutral-700, ink on hover |
| Button | Inter 600; Noto Sans Bengali 600 | 15 / 1.2, padding 12 × 20, radius 8 | none | ink on marigold, white on teal-700 |
| Caption, helper, table header | Inter 400 / 600 | 13 to 14 / 1.45 | header 0.02 em | neutral-500 |
| Dashboard page title | Noto Sans Bengali 700; English Inter 600 | 22 / 1.3 | none | ink |
| Dashboard body and table cells | Inter 400; Noto Sans Bengali 400 | 14 on desktop, 16 on phone / 1.45 | none | ink |
| Money and counts | Inter 600 tabular | 16 inline, 28 to 32 in stat tiles / 1.1 | none | ink |
| Status chip | Inter 600; Noto Sans Bengali 600 | 12 / 1.2, padding 2 × 8, pill | none | status colour on its soft tint |
| Form label | Inter 500; Noto Sans Bengali 500 | 14 / 1.4 | none | neutral-700 |
| Input text | Inter 400 | 16 / 1.4 | none | ink; placeholder neutral-400 |
| Error text | Inter 500; Noto Sans Bengali 500 | 13 / 1.4 | none | danger |
| Legal and footer meta | Inter 400 | 13 / 1.5 | none | neutral-400 |

Rules that apply everywhere: never set Bangla in Plus Jakarta Sans (it has no Bengali glyphs and will fall back silently); never go below 16 px for body text on a phone; never uppercase Bangla, it has no case; use `font-variant-numeric: tabular-nums` wherever two numbers sit on different lines; bold at most a few words in a sentence, never the whole sentence.
