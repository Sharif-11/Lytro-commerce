# Landing page design (apps/website)

Status: v1 design, 2026-10-17. A working prototype is `docs/brand/lytro-landing.html` (open it in a browser; it needs internet access for Google Fonts), also published at https://claude.ai/artifact/MwvopjMr9UqhFzf4hZMdoK. This document is the spec behind it and the map onto `apps/website`. The brand rules it follows are in `BRAND-IDENTITY.md`. Nothing in `apps/website` has been changed yet.

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
| 1 | Nav (sticky) | Orientation and the one CTA | Wordmark, four anchor links, বাং/EN toggle, লগইন, marigold "ফ্রি দোকান খুলুন". Hamburger under 880 px. |
| 2 | Hero | The promise and the first action | Eyebrow, H1 "আপনার দোকান, আপনার হাতে।", one-sentence lead, claim-your-shop input, three micro-trust ticks, "see a shop" link. Phone mockup of the dashboard with two floating cards (fake-order check, bKash matched). |
| 3 | Integration strip | Reduce "will it work with what I use" | Official logos from `docs/brand/third-party/`, each in its own colours on a white tile (wallets decided 2026-10-18, `BRAND-IDENTITY.md` §8.7); only live services appear. |
| 4 | Problems, before/after | Lead with the pain | The five pains from the marketing plan, each paired with its answer. |
| 5 | Features | What you actually get | Two spotlight cards first, each with its own mockup: stock and inventory (INV-01 to INV-24, PUR-01 to PUR-10: low-stock alerts, one-step add stock, barcode and IMEI scan, batches and expiry, stock check) and business statistics (STA-01 to STA-04, INV-18: sales by week to year, hot-selling products, trend, inventory value and cost of goods). Then six cards with small vignettes: fake-order check, one-tap courier, payment matching, storefront, staff roles, variants and stock. |
| 5b | Why Lytro | The advantages, the way Bonik AI states its benefits | Six cards, each a product rule: money goes straight to the seller's wallet (no platform custody), free manual payment verification, with small percentage fees only when the seller turns on automatic verification (listener or wallet checkout), the seller's own courier account, Bangla everywhere and phone first, nightly encrypted backups with per-shop isolation (DAT-8), and the public API for sellers with their own site. |
| 6 | Showcase | What the customer sees | Storefront in a tenant's own colour (plum, deliberately not Lytro's) and the tracking page opened from an SMS. |
| 7 | How it works | Remove sign-up anxiety | Three steps matching the real flow. |
| 8 | Pricing | The decision | Pay-as-you-go highlighted at ৳0, then Starter, Growth, Pro with the SRS limits. Monthly/yearly toggle. Note that limits are the launch proposal. Show that verification fees apply on every plan: listener [0.10]% and wallet checkout [1.00]% of each payment, manual verification free. |
| 9 | About (proof) | Trust without inventing | Anchor target for the About link. Operator-as-tenant story plus an honest placeholder quote card. A separate About page can replace the anchor later. |
| 10 | Zero risk | Objection handling | Four cards. |
| 11 | FAQ | The questions sellers ask in DMs | Six items, first one open by default so answers are visibly present. |
| 12 | Contact | A person, not a bot | WhatsApp, phone and email cards with hours. The numbers and address shown are placeholders until the support line exists. A separate Contact page can replace the anchor later. |
| 13 | Final CTA | One more chance | Dark band, accent button plus a ghost "see pricing". |
| 14 | Footer | Trust and legal | Wordmark, Bangla lockup, three link columns including About and Contact, "lytro by Lytronix", "Made in Dhaka". Links to pages that do not exist yet must be removed before launch (see footer.tsx's own rule). |

Navbar on desktop: Features, Pricing, FAQ, About, Contact, then the language toggle, log in and the one accent button. The mobile sheet adds Why Lytro and How it works. Bonik AI uses separate About and Contact pages; the prototype uses anchors because neither page exists yet.

---

## 4. UX decisions

- **Bangla by default, English by toggle.** The toggle swaps every string in place and remembers the choice on the device. Western digits are used for money, order numbers and phone numbers in both languages; Bangla digits are used only in running Bangla prose (counts like ৩০ দিন).
- **One accent per screen.** The marigold button appears once in the nav, once in the hero, once on the highlighted plan and once in the final CTA. Everything else is teal or outline.
- **The claim input normalises as you submit.** Lowercase, letters, digits and hyphens only, which is what the shop link accepts. The suffix is `.lytro.app`, the platform domain.
- **Mobile first.** Base styles are written for a 360 px phone; breakpoints at 640, 900 and 1100 px add columns, the tilted phone and hover states. On phones: the hero stacks with the phone mockup centred and the two proof cards inline beneath it; the integration strip scrolls sideways with faded edges; pricing is a swipeable, snap-scrolling row with position dots; the menu is a full-height sheet; a sticky bottom call to action appears once the hero scrolls away and hides near the final band. Every tap target is at least 44 px, body text never drops below 16 px, and the page never scrolls sideways.
- **No motion except the mark drawing in once** and the FAQ chevron. Reduced-motion is respected.
- **Sticky nav height 64 px**, backdrop blur, hairline border; the CTA stays visible on desktop at all times.
- **Every CTA goes to `app.lytro.app/sign-in`** (AUTH-12 makes it the single entry point; the dashboard host is separate from the marketing site, D3-11). Plan buttons carry `?planId=&termId=` as pricing.tsx already does; after create-shop the checkout opens with that plan, and the seller can continue without paying (AUTH-29).

---

## 5. Copy sources

- Hero, problems, how-it-works and FAQ reuse and tighten the copy already in `apps/website/src/components`.
- Plan limits and prices come from `SRS.md` §Plan sheet. Items marked † there are proposals, which the page says in its note under pricing.
- The proof story is TEN-20 and MARKETING-PLAN.md §3 item 5.
- Vocabulary follows BRAND-IDENTITY.md §7.

---

## 6. Mapping onto apps/website

| Prototype section | Component | Change |
| --- | --- | --- |
| Nav | `nav.tsx` | Replace the gradient "L" tile with the mark SVG and wordmark; add anchor links and the language toggle; CTA label "ফ্রি দোকান খুলুন" in marigold. |
| Hero | `hero.tsx` | Dark chrome band, new headline and lead, claim input posting to `app.lytro.app/sign-in?shop=`, phone mockup component (static JSX, no screenshot). |
| Strip | new `integrations.tsx` | Official logos from `docs/brand/third-party/` for the live services (bKash, Nagad, Steadfast, Pathao at launch). |
| Problems | `solutions.tsx` | Keep data, change layout to before/after pairs. |
| Features | new `features.tsx` | Two spotlight cards (inventory, statistics) plus six cards with vignettes. The spotlights ship only when Phase 3 inventory (INV, PUR) and statistics (STA) are live, per the "never claim what is not live" rule. |
| Why Lytro | new `why.tsx` | Six advantage cards. |
| Contact | new `contact.tsx` | Three cards; real WhatsApp, phone and email once the support line exists. |
| Showcase | new `showcase.tsx` | Storefront and tracking mockups. |
| How it works | `how-it-works.tsx` | Copy tightened. |
| Pricing | `pricing.tsx` | Keep live plan fetch; add term toggle (client component) using `/billing-terms`; highlight pay-as-you-go with the badge. |
| Proof | new `proof.tsx` | Operator story; testimonial slot reads from a static list that starts empty. |
| Zero risk | new `risk.tsx` | Four cards. |
| FAQ | `faq.tsx` | Six items, first open. |
| Final CTA | `final-cta.tsx` | Dark band, two buttons. |
| Footer | `footer.tsx` | Columns only for pages that exist. |
| Fonts | `layout.tsx` | Add Plus Jakarta Sans 700/800 via next/font. |
| Tokens | `globals.css` | Replace the @theme block with `docs/brand/tailwind-theme.css`. |
| Metadata | `layout.tsx` | Keep the Bangla title; add `og:image` from `docs/brand/og-image.svg` exported to PNG. |

---

## 7. Open items

- The integration strip and the sign-in buttons use the official logos in `docs/brand/third-party/` (sources and rules in its README). bKash, Nagad and Rocket use their official logos (decided 2026-10-18, `BRAND-IDENTITY.md` §8.7); permission from Steadfast and Pathao for paid advertising that shows their marks is still to be confirmed.
- The testimonial slot is filled only from Stage 1 case studies (MARKETING-PLAN.md §5, weeks 6 to 8).
- A Google Play badge is added to the hero and final CTA only once the native dashboard app is listed.
- The per-order pay-as-you-go fee is described, not priced, because the amount is not yet decided in the SRS.
- The inventory and statistics spotlights describe Phase 3 scope. They are designed now so the page is complete, and go live with those features, not before.
- The contact numbers, email and support hours are placeholders. The hours shown (Saturday to Thursday, 10 am to 8 pm) are a proposal.
