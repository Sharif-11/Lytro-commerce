# Landing page design (apps/website)

Status: v2, mobile first, approved 2026-11-13 and built the same day. The prototype is `docs/brand/lytro-landing-v2.html`, which supersedes `docs/brand/lytro-landing.html` (v1) for the landing page; v1 stays for its history. v1 history: designed 2026-10-17; built 2026-10-19. A working prototype is `docs/brand/lytro-landing.html` (open it in a browser; it needs internet access for Google Fonts), also published at https://claude.ai/artifact/MwvopjMr9UqhFzf4hZMdoK. This document is the spec behind it and the map onto `apps/website`. The brand rules it follows are in `BRAND-IDENTITY.md`. `apps/website` was rebuilt from scratch to this spec on 2026-10-19 (§6 is the map).

**Scheduled 2026-10-18** as a parallel track to Phase 3 (`PHASE-3-PLAN.md`): step A now, step B (the inventory and statistics spotlights, the storefront showcase) once those features are live.

---

## 1. What the page has to do

One job: turn a Bangladeshi seller who arrived from a Facebook group, a referral or a search into a sign-up, in Bangla, on a phone. Secondary job: make the "I run my own shop on this platform" proof line (MARKETING-PLAN.md §3) believable without inventing numbers.

Audience and message hierarchy come from `MARKETING-PLAN.md` §2 and §3: pain first (fake orders, courier hours, "where is my order", payment matching, fear of a monthly fee), then the offer (pay-as-you-go, 30-day trial), then proof. The page never claims a feature that is not live, and it never shows a counter, rating or testimonial that is not real.

---

## 2. What was learned from the competitors

Three sites were studied on 2026-10-17: Bonik AI (bonikai.app), BonikLabs (boniklabs.com) and BonikBiz (bonikbiz.com).

**Borrowed**

- **Claim-your-shop input in the hero** (BonikLabs). A name field with a fixed suffix is a stronger first interaction than a button, and it matches the real sign-up flow (AUTH-12 phone verify, AUTH-28 shop name and link).
- **Problem cards that point at the feature that fixes them** (Bonik AI). Our problem section is a before/after pair list; each "after" line matches a feature card below.
- **Product mockups instead of stock photos** (all three). Hero phone, storefront and tracking page are drawn from the real UI, in Bangla.
- **Payment and courier strip right under the hero** (BonikLabs, Bonik AI). Only live integrations appear: bKash, Nagad, Steadfast, Pathao, plus "more coming".
- **Risk-reversal strip before the FAQ** (Bonik AI): no card, cancel any time, data stays yours, trial never locks you out. Every line is true per the SRS.
- **Highlighted plan with real prices and a billing-term toggle** (Bonik AI). Prices are the SRS plan sheet: 449, 699, 999 monthly; 4,741, 7,381, 10,549 yearly.

**Avoided**

- Animated stat counters that render as zeros (BonikLabs, Bonik AI). None on our page until real numbers exist.
- Testimonials with invented names and metrics. The proof section carries the operator-as-tenant story (TEN-20) and a visibly empty quote card that says it will be filled after the first ten shops.
- Pricing cards without prices (BonikLabs) and a plan count that does not match the cards (Bonik AI says seven, shows five).
- Emoji as icons (Bonik AI). Lucide-style line icons only, matching the mark's stroke.
- Eighteen sections and English-only copy (BonikBiz). Our page is eleven sections, Bangla first with a real English toggle.
- A Google Play badge before the native app exists.

---

## 3. Page structure, top to bottom

| # | Section | Purpose | Notes |
| --- | --- | --- | --- |
| 1 | Nav (a floating capsule) | Orientation and the one CTA | Wordmark, a short marigold "শুরু করুন" and the burger on a phone; the বাং/EN pill from 640 px; five links and the long label "ফ্রি দোকান খুলুন" from 900 px; লগইন from 1100 px. Dark glass over the hero, white glass once the hero has scrolled past. On the other pages it sits in the flow, white from the start. Under 900 px the burger opens a full-screen dark sheet: language, seven links, the accent button, log in, the trial line and the service logos. |
| 2 | Hero | The promise and the first action | Eyebrow, H1 "আপনার দোকান," with "আপনার হাতে।" in marigold over a swash, one-sentence lead, claim-your-shop input, three micro-trust ticks, "see a shop" link. Then ONE phone screen, readable at its real size: today's figures, a bKash payment matched on its own, today's orders with their actions. Words over the phone on a phone and a tablet; words left and the phone tilted right from 900 px. A curved white hand-off to the strip. |
| 3 | Integration strip | Reduce "will it work with what I use" | Official logos from `docs/brand/third-party/`, each in its own colours on a white tile (wallets decided 2026-10-18, `BRAND-IDENTITY.md` §8.7); only live services appear. The tiles wrap onto a second row on a phone; nothing scrolls or moves. |
| 4 | Problems, before/after | Lead with the pain | The five pains from the marketing plan, each paired with its answer. |
| 5 | Features | What you actually get | Two spotlight cards first, each with its own mockup: stock and inventory (INV-01 to INV-24, PUR-01 to PUR-10: low-stock alerts, one-step add stock, barcode and IMEI scan, batches and expiry, stock check) and business statistics (STA-01 to STA-04, INV-18: sales by week to year, hot-selling products, trend, inventory value and cost of goods). Then six cards with small vignettes: fake-order check, one-tap courier, payment matching, storefront, staff roles, variants and stock. |
| 5b | Why Lytro | The advantages, the way Bonik AI states its benefits | Six cards, each a product rule: money goes straight to the seller's wallet (no platform custody), free manual payment verification, with small percentage fees only when the seller turns on automatic verification (listener or wallet checkout), the seller's own courier account, Bangla everywhere and phone first, nightly encrypted backups with per-shop isolation (DAT-8), and the public API for sellers with their own site. |
| 6 | Showcase | What the customer sees | Storefront in a tenant's own colour (plum, deliberately not Lytro's) and the tracking page opened from an SMS. |
| 7 | How it works | Remove sign-up anxiety | Three steps matching the real flow. |
| 8 | Pricing | The decision | The term toggle sits under the heading. On a phone the cards are a swipe row with the next card peeking in and dots under it (they follow the swipe; a tap brings that card in; nothing advances on its own); two columns from 640 px, four from 1100 px. Pay-as-you-go at ৳0, then each plan for sale by rank. Every card comes from the plan as the operator set it, by one set of rules (small fixes 14 and 15, 2026-11-13): the plan the operator marked as suggested (PLN-21) is the dark card with the "সাজেস্টেড প্ল্যান" badge and the accent button, the others white with an outline button, none highlighted when no plan is marked. Each card's main list: pay-as-you-go's fees first (order fee when booked or shipped, products free while that rate is 0), then the three lines every plan shares (storefront, orders, courier booking and fake-order check; bKash-Nagad payment matching; a balance top-up for SMS and paid features), products, orders handled (a line for each of the month, day and in-all caps the plan sets; unlimited when none), seats (they count the owner: "১টি সিট: শুধু আপনি", "২টি সিট: আপনি + ১ জন স্টাফ"), free SMS (a month and in all; unlimited when neither), then every feature flag with words that any card shown carries (custom domain, same-day support), ticked where the plan has it and crossed out where it doesn't. Below a dashed line, a quieter list: storage, bandwidth and API requests a month, payment listeners, the activity log's days when set, and the brand identity flag the same way. An unset limit reads as LIMIT_WHEN_UNSET says, an unlimited one says আনলিমিটেড, a limit of 0 is the thing crossed out. Monthly/yearly toggle. Note that limits are the launch proposal. Show that verification fees apply on every plan: listener [0.10]% and wallet checkout [1.00]% of each payment, manual verification free (the live rates, `GET /rates`). |
| 9 | About (proof) | Trust without inventing | Anchor target for the About link. Operator-as-tenant story plus an honest placeholder quote card. A separate About page can replace the anchor later. |
| 10 | Zero risk | Objection handling | Four cards. |
| 11 | FAQ | The questions sellers ask in DMs | Six items, first one open by default so answers are visibly present. |
| 12 | Contact | A person, not a bot | WhatsApp, phone and email cards. WhatsApp, the phone and the hours are the help line's (`GET /help-line`, D8-69); a number not set is not shown, and with neither the hours go too. The email is the site's `SUPPORT_EMAIL`. With none of the three, one card leads to the contact page's form. The FAQ's WhatsApp line and button follow the same rule. |
| 13 | Final CTA | One more chance | Dark band, the mark drawing itself in, accent button plus a ghost "see pricing". The about page closes with the same band. |
| 14 | Footer | Trust and legal | Wordmark, the line about Lytro, Bangla lockup, three link columns, "Lytro by Lytronix", "Made in Dhaka". Only pages that exist are linked (see site-footer.tsx's own rule). |
| 15 | Start bar (phones) | The action within reach | A dark capsule at the bottom, "ফ্রি দোকান খুলুন" with "শুরু করুন", sliding in once the hero has scrolled away and out again at the final band. Gone from 900 px. |

Navbar from 900 px: Features, Why Lytro, Pricing, FAQ (anchors) and Contact (the `/contact` page), then the language pill, log in (from 1100 px) and the one accent button. The phone sheet has Features, Why Lytro, How it works, Pricing, FAQ, About (the `/about` page) and Contact.

---

## 4. UX decisions

- **Bangla by default, English by toggle.** The toggle swaps every string in place and remembers the choice on the device. Western digits are used for money, order numbers and phone numbers in both languages; Bangla digits are used only in running Bangla prose (counts like ৩০ দিন).
- **One accent per screen.** The marigold button appears once in the nav, once in the hero, once on the highlighted plan and once in the final CTA. Everything else is teal or outline.
- **The claim input normalises as you submit.** Lowercase, letters, digits and hyphens only, which is what the shop link accepts. The suffix is `.lytro.app`, the platform domain.
- **Mobile first** (v2, 2026-11-13). Base styles are written for a 360 px phone; breakpoints at 640, 900 and 1100 px only add columns, the tilted phone, the desktop nav and hover states. On a phone: the hero's picture is ONE phone screen at its real size, under the words; the integration strip wraps and never scrolls; pricing is a snap-scrolling swipe row with the next card peeking and dots that follow it; the menu is a full-screen sheet; the start bar appears once the hero scrolls away and hides at the final band. Every link and button is at least 44 × 44 px; text is 14 px or larger everywhere except the labels inside the hero's phone picture, which are drawn at a real phone's size; secondary text is neutral-700 or darker; the page never scrolls sideways. Checked at 360 and 390 px.
- **The claim row stacks when it is narrow.** The input and its button sit side by side only while the input keeps room to type a shop name next to the button ("অনলাইন স্টোর তৈরি করুন", the user's words, 2026-11-13): the row's own width decides (at least 570 px), not the screen's. So it stacks on a phone and, in the desktop's narrower text column, from 900 to about 1180 px; it sits side by side at 640–899 px and from about 1180 px.
- **No motion except the mark drawing in once**, the nav's colour change, the FAQ toggle and the start bar sliding. Reduced-motion is respected.
- **Nav height 58 px on a phone, 64 px from 900 px**, a capsule 8 px from the top with backdrop blur; the CTA stays visible at every width.
- **Every CTA goes to `app.lytro.app/sign-in`** (AUTH-12 makes it the single entry point; the dashboard host is separate from the marketing site, D3-11). Plan buttons carry `?planId=&termId=` as pricing.tsx already does; after create-shop the checkout opens with that plan, and the seller can continue without paying (AUTH-29). The nav's লগইন is for a seller coming back, so it opens the same page on the password form (`?mode=password`, decided 2026-10-30): a code to an existing shop uses the shop's free SMS (AUTH-21), and the form still offers a code to a seller who never set a password.

---

## 5. Copy sources

- Hero, problems, how-it-works and FAQ reuse and tighten the copy already in `apps/website/src/components`.
- Plan limits and prices come from `SRS.md` §Plan sheet. Items marked † there are proposals, which the page says in its note under pricing.
- The proof story is TEN-20 and MARKETING-PLAN.md §3 item 5.
- Vocabulary follows BRAND-IDENTITY.md §7.

---

## 6. Mapping onto apps/website

Built 2026-10-19 as a fresh Next.js app (`apps/website`, the old code removed); rebuilt to the v2 sketch 2026-11-13. Every string is a Bangla/English pair kept next to the component that shows it; the visitor's language is a per-device cookie read on the server, so the first paint is already in the chosen language. The look is `app/site.css`, the sketch's CSS ported with its class names (kept out of Prettier, like the storefront's port); the landing's components use those classes rather than Tailwind utilities. The about, contact and listener pages keep their Tailwind styles and share the nav, footer and final band.

| Prototype section | Built as | Notes |
| --- | --- | --- |
| Nav | `components/layout/site-nav.tsx` (server), `nav-shell.tsx` (client: scroll state, sheet), `language-toggle.tsx` | `overHero` on the landing page only. The wordmark takes its colours from CSS (`Wordmark tone="css"`), so it follows the capsule's dark and white states. Sheet logos from `lib/services.ts`. |
| Hero | `components/landing/hero.tsx`, `claim-box.tsx`, `components/mockups/phone-dashboard.tsx` | Claim input normalises with the shared `SLUG_PATTERN` and goes to `app.lytro.app/sign-in?shop=`. The one phone screen drawn in JSX. "See a shop" link only when the showcase is live. |
| Strip | `components/landing/integrations.tsx`, `lib/services.ts` | Official logos in `public/third-party/` (bKash, Nagad, Pathao, Steadfast) plus "more coming"; one list for the strip and the sheet. |
| Problems | `components/landing/problems.tsx` | Before/after pairs. |
| Features | `components/landing/features.tsx`, `mockups/inventory-card.tsx`, `mockups/stats-card.tsx` | Six cards always; the inventory and statistics spotlights render only when `LIVE_FEATURES` lists `inventory` / `statistics`. |
| Why Lytro | `components/landing/why-lytro.tsx` | Six rules; the fee rule follows WAL-20 (manual verification free, a percentage only for automatic verification). |
| Showcase | `components/landing/showcase.tsx`, `mockups/storefront-frame.tsx`, `mockups/tracking-frame.tsx` | Rendered only when `LIVE_FEATURES` lists `showcase`. |
| How it works | `components/landing/how-it-works.tsx` | Three steps. |
| Pricing | `components/landing/pricing.tsx` (server: the lines, `PricingViewBuilder`) + `pricing-cards.tsx` (client: toggle, swipe row, dots; the highlighted card is the one with `hot`, styled by site.css `.plan.hot` and `.plan .badge`), `lib/pricing/pricing-model.ts`, `lib/api/plans-api.ts` | Live `/plans`, `/billing-terms`, `/plans/:id/prices` read server-side with the edge secret, cached 60 s. Term toggle, saving badge, swipe row with dots on phones. Plan buttons carry `planId` and `termId`. Lines are `{ text, on }`, rendered ticked or crossed out (site.css `.plan li.no`, `.plan.hot li.no`), a crossed-out line read as "not included". The flags with words are `featureLines` (main list) and `moreFeatureLines` (brand identity) in pricing.tsx; a new flag needs its words there before it appears. The highlighted card is `suggested` from `/plans` or `/plans/pay-as-you-go`. Backend unreachable: pay-as-you-go card plus an honest note, no invented prices. |
| About (proof) | `components/landing/proof.tsx` | Operator story, empty testimonial list, link to `/about`. |
| Zero risk | `components/landing/zero-risk.tsx` | Four cards. |
| FAQ | `components/landing/faq.tsx` | Native `<details>` with a shared `name`, first open. WhatsApp line and button only when the help line has a number. |
| Contact | `components/landing/contact.tsx`, `lib/contact/channel-words.ts` | The help line's numbers and hours, the site's email; channel names and lines shared with the `/contact` page. |
| Final CTA | `components/landing/final-cta.tsx` | Dark band, accent and ghost buttons; also the about page's close. |
| Footer | `components/layout/site-footer.tsx` | Columns list only routes that exist; Terms, Privacy and Notices join when those pages ship. |
| Sticky CTA | `components/layout/sticky-cta.tsx` | Phone-only start bar between the hero and the final band. |
| Fonts, tokens, metadata | `app/layout.tsx`, `app/globals.css`, `app/site.css`, `app/opengraph-image.tsx`, `app/icon.svg` | next/font (Plus Jakarta Sans, Inter, Noto Sans Bengali); `@theme` from `docs/brand/tailwind-theme.css`; Bangla title and a generated link preview. |
| Settings | `lib/env.ts`, `.env.example` | `SERVER_URL`, `TRUSTED_EDGE_SECRET`, `APP_URL`, `SITE_URL`, `LIVE_FEATURES`, `CONTACT_WEBHOOK_URL`, `SUPPORT_*`. |

---

## 7. Open items

- The integration strip and the sign-in buttons use the official logos in `docs/brand/third-party/` (sources and rules in its README). bKash, Nagad and Rocket use their official logos (decided 2026-10-18, `BRAND-IDENTITY.md` §8.7); permission from Steadfast and Pathao for paid advertising that shows their marks is still to be confirmed.
- The testimonial slot is filled only from Stage 1 case studies (MARKETING-PLAN.md §5, weeks 6 to 8).
- A Google Play badge is added to the hero and final CTA only once the native dashboard app is listed.
- The pay-as-you-go card prices its fees from the live rates (`GET /rates`); only when the rates can't be read does it describe them in words.
- The inventory and statistics spotlights describe Phase 3 scope. They are designed now so the page is complete, and go live with those features, not before.
- The contact numbers and hours are the help line's and the email is `SUPPORT_EMAIL`; until the operator sets them, the contact section shows only what exists.
