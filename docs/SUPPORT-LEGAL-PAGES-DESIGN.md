# Support and legal pages design: Help, Notices and status, Terms, Privacy

Status: v1 design, 2026-10-18. A working prototype of all four is `docs/brand/lytro-support-legal.html` (open in a browser; needs internet for Google Fonts). This document is the spec behind it. Together with `LANDING-PAGE-DESIGN.md` and `SITE-PAGES-DESIGN.md` it covers every link in the landing page footer. Terms and Privacy are built (Phase 9 Slice 9.8, 2026-11) from the owner's own Bangla texts; §3 to §6 describe what shipped.

| Footer link | Page | Route | Spec |
| --- | --- | --- | --- |
| ফিচার, কেন Lytro, প্রাইসিং, স্টোরফ্রন্ট | anchors on the landing page | `/#features` and so on | LANDING-PAGE-DESIGN.md |
| প্রশ্নোত্তর | anchor on the landing page | `/#faq` | LANDING-PAGE-DESIGN.md |
| সেটআপে সাহায্য | Help centre | `/help` | this document, §1 |
| WhatsApp সাপোর্ট | not a page: a `wa.me` link to the support number | | SITE-PAGES-DESIGN.md §2 holds the number |
| নোটিশ | Notices and service status | `/notices` | this document, §2 |
| আমাদের সম্পর্কে, যোগাযোগ | About, Contact | `/about`, `/contact` | SITE-PAGES-DESIGN.md |
| টার্মস, প্রাইভেসি | Terms of service, Privacy policy | `/terms`, `/privacy` | this document, §3 and §4 |

All four live in `apps/website`. The Notices page reads the same notices the operator publishes to tenants (ADM-6) plus the public status checks (SUP-4, OBS-2).

---

## 1. Help centre (`/help`)

**Job.** Answer the questions sellers send on WhatsApp, on a phone screen, so support time goes to the hard cases. Every article is a short numbered procedure with one tip, not an essay.

| Element | Design |
| --- | --- |
| Hero | Search field, four quick links to the most-asked articles. |
| Categories | Six cards, four articles each: Getting started; Orders and couriers; Payments; Storefront and domain; Plans and balance; Staff and roles. The titles are the real questions, in the seller's words. |
| Article | Category chip, updated date, reading time, a one-line summary, numbered steps with a bold action and a grey detail, one tip box, a "did this solve it" vote. The prototype shows "Pair the Listener app" built from VER-1 and LSN-3. |
| Sidebar | "Still stuck" with the WhatsApp button (setup help is free), related articles, a live service-status chip linking to Notices. |

**Build notes.** Articles are Markdown files in the repo (`apps/website/content/help/<slug>.bn.md` and `.en.md`) rendered at build time; search is client-side over titles and summaries, which is enough at this scale. The "helpful" vote posts to a tiny route and is the only analytics on the page.

---

## 2. Notices and service status (`/notices`)

**Job.** One public place for rate changes, maintenance windows, new features and incidents, so the same question is not answered a hundred times (SUP-4), and a live status board that answers "is it down or is it me".

| Element | Design |
| --- | --- |
| Overall status | One band: all systems normal, or the worst current state, with the last check time. Checks run every minute from two locations outside Bangladesh (OBS-2). |
| Components | Dashboard (app.lytro.app), storefronts (*.lytro.app), payment page (pay.lytro.app), API (api.lytro.app), SMS sending, courier booking. Each with a status chip. |
| Notices | Filter chips (all, maintenance, new features, rate changes, incidents) and a list of notice cards: category chip, state chip (scheduled, resolved), date, title, body. Urgent and incident notices get a tinted card. |
| Dashboard note | Every notice also appears on the tenant's dashboard notice board with an unread badge; urgent ones show as a banner; never sent by SMS charged to the tenant (ADM-6). |

**Build notes.** Notices come from the same `control.notices` table ADM-6 defines, filtered to audience "all tenants" or marked public. Component status comes from the external check results; an incident is opened by hand and closed with a note. The example notices on the prototype are illustrative and are not claims about shipped features.

---

## 3. Terms of service (`/terms`)

**Job.** State the deal in words a seller can read on a phone, and satisfy LEG-02's checklist: the plan lifecycle, no refund once a period has started, the balance frozen and never refunded, deletion timing, retention, media in Cloudflare R2 with no separate backup, support seeing a dashboard only once the seller approves, orders, payments and invoices kept while the shop is active, and stored logins used only automatically for the shop's own work and never opened by anyone at Lytro. DAT-54 adds the one-server disclosure. LEG-02's hashed cross-tenant fraud data is next release's, so clause 8 says the check uses no other shop's data, and the sharing joins as a new version, with notice, when it ships.

**Text.** Written by the owner in Bangla (2026-11-13); the English is its translation, block for block, and the Bangla prevails. No draft banner: the texts are published without a lawyer's review (D9-6). "We" is Lytro, Chittagong (the header's সেবাদাতা line); disputes go to the courts of Chittagong.

**Structure.** The title in the band; the header lines (version, the day it takes effect, the provider); a sticky section index from 900 px; the preamble; twelve numbered clauses. Most clauses open with a "Plainly" summary box, then subheadings, sub-labels, bullets and numbered points. The lapsed-plan clause lists the stages under bold sub-labels with today's defaults from the platform settings (grace days 0 to 3, read-only 3 to 7, locked 7 to 15, archived 15 to 60, deletion at 60).

| Clause | Source |
| --- | --- |
| 1 আপনার অ্যাকাউন্ট ও অনলাইন দোকান | AUTH-01, AUTH-28, TEN-16, TEN-18 |
| 2 ফ্রি ট্রায়াল, সাবস্ক্রিপশন ও ফি | TRL-07, PYG-02, PLN-07, UPG, DWN-01, BIL-18, LIF-01 |
| 3 ব্যালেন্স, টাকা যোগ করা ও ইনভয়েস | BAL-02, BAL-06, BAL-17, BAL-18; every payment to Lytro has an invoice, top-ups included, with any VAT inside the price (D9-7, the 9.8 read) |
| 4 প্ল্যান শেষ হলে বা দোকান বন্ধ করলে | LIF-02 to LIF-20, PYG-21 |
| 5 আপনার কাস্টমারের পেমেন্ট | PAY-05 |
| 6 ক্রেতার পেমেন্ট ও আর্থিক দায়বদ্ধতা | the owner's own clause: Lytro is software, never a payment intermediary between a shop and its buyers |
| 7 কুরিয়ার, SMS ও অন্যান্য সার্ভিস | couriers, SMS, reading orders; LEG-02's use of stored logins |
| 8 ফেক অর্ডার চেক | Slice 7.5 as built: the shop's own orders, and Steadfast's figures when the shop connected Steadfast |
| 9 Lytro-তে যেসব কাজ করা যাবে না | LIF-24 |
| 10 আপনার ব্যবসার তথ্য ও ডেটা | LIF-16, ORD-50, AUD-06, AUD-07, MED-06, ADM-05 |
| 11 সার্ভিসের নির্ভরযোগ্যতা ও দায়বদ্ধতা | DAT-54 (one server, a 4-hour recovery target, 48 hours' notice of maintenance); liability capped at the fees paid in the 3 months before a claim (the 9.8 read) |
| 12 শর্ত পরিবর্তন, আইন ও যোগাযোগ | 15 days' notice on the notice board and by email, at once for a change that only helps sellers; Bangladesh law, Chittagong's courts, the Bangla prevails; support@lytro.app (the 9.8 read) |

---

## 4. Privacy policy (`/privacy`)

**Job.** Explain to sellers and to sellers' customers what is collected, why, where it lives and how to have it erased, and satisfy LEG-2.

**Text and structure.** Written by the owner in Bangla, translated block for block, the Bangla prevailing; the same band, header lines and sticky index as the terms, and ten numbered sections with "Plainly" boxes, subheadings, bold sub-labels, bullets and one table ("how long we keep it").

| Section | Source |
| --- | --- |
| 1 এই পলিসি কাদের জন্য? | Shoppers are the shop's customers; Lytro processes their data on the shop's behalf; the Bangla prevails |
| 2 আমরা কী কী তথ্য সংগ্রহ করি? | AUTH, TEN, VER (transaction ID and sender number), AUD-01, payment screenshots, shoppers' saved addresses; never PINs or cards (PAY-05) |
| 3 Listener App কীভাবে কাজ করে? | VER-01, LSN-01, LSN-03: uploads only transaction SMS from Lytro's sender list; the text kept 90 days; test mode; revocable at once; Lytro reads its own wallet SMS on its own phone |
| 4 আপনার তথ্য আমরা কী কাজে ব্যবহার করি? | running the shop, the fake-order check as built (no cross-shop data), the account and payments, security, support's approved view; no sale of data |
| 5 কার সঙ্গে আপনার তথ্য শেয়ার করি? | couriers, the SMS gateway, the email service, bKash, Gemini for reading orders, Google and Facebook sign-in, Meta only when the shop connects it, browser push, Cloudflare, error-reporting and uptime services, authorities when required |
| 6 আপনার তথ্য কোথায় সংরক্ষণ করা হয়? | the database in Bangladesh; media, backups and some services outside; row-level security, secure cookies, hashed or sealed secrets |
| 7 কতদিন আপনার তথ্য সংরক্ষণ করি? | orders, payments and invoices while the shop is active; the activity log by plan, money entries 24 months; messages as received 90 days (Slice 9.5); payment screenshots 24 months; server logs 14 days (Slice 9.6); deleted data gone from every backup within 30 days (Slice 9.3, LIF-22) |
| 8 আপনার কী কী অধিকার আছে? | export (LIF-16), shop deletion (LIF-19), a customer's deletion through the shop (CUS-09) or support@lytro.app |
| 9 আমরা কী কী Cookie ব্যবহার করি? | what the code sets: the sign-in cookie, the language cookie, the storefront's delivery-area cookie; cart and recent searches in browser storage; a shop's own Meta pixel on its product landing pages only |
| 10 প্রাইভেসি নিয়ে যোগাযোগ | support@lytro.app or the help line; a reply within 2 working days, a deletion finished within 30 days (the 9.8 read) |

---

## 5. Mapping onto apps/website

| Page | Route | Components | Data |
| --- | --- | --- | --- |
| Help | `/help`, `/help/<slug>` | `help/index.tsx`, `help/article.tsx`, `help/search.tsx` | Markdown in `content/help/` |
| Notices | `/notices` | `notices/status-board.tsx`, `notices/list.tsx` | public notices from `control.notices`; status from the check results |
| Terms | `/terms`, `/terms/<version>` (built, Slice 9.8) | `app/(legal)/terms/`, `components/legal/legal-route.tsx` and `legal-page.tsx`; the look in `app/(legal)/legal.css` | Markdown in `src/content/legal/terms/<version>.bn.md`, `.en.md` |
| Privacy | `/privacy`, `/privacy/<version>` (built, Slice 9.8) | `app/(legal)/privacy/`, the same components | Markdown in `src/content/legal/privacy/<version>.bn.md`, `.en.md` |
| Footer | all | `layout/site-footer.tsx` | Terms and Privacy linked under Company since Slice 9.8; Help and Notices join when their pages exist |

**Terms and privacy as built (Slice 9.8).**
- **Text.** Each version is two Markdown files, the owner's Bangla and its English, in the small subset `lib/legal/legal-markdown.ts` reads (no Markdown package): `#` the title; the header lines `**ভার্সন:** …`, `**কার্যকর হবে:** …`, `**সেবাদাতা:** …`, shown as the version line; `##` numbered sections, which make the index; `###` subheadings; paragraphs with `**bold**`; a wholly bold paragraph as a sub-label; the `**সহজ কথায়:**` / `**Plainly:**` line as the summary box; other `**Label:** value` lines as contact lines (an email becomes a mail link, `lytro.app` the site, the help line the contact page); `- ` bullets; paragraphs numbered "১." or "1."; tables; `---`. The files are built into the pages (next.config.ts imports `.md` as text), so a deployment carries no files beside the build. A test fails when the English's structure differs from the Bangla's (sections, their numbers, summaries and every block's kind and size).
- **Versions.** A version is named by the day it takes effect (`2026-11-20`; the 9.8 read). The published names are `PUBLISHED_TERMS_VERSIONS` and `PUBLISHED_PRIVACY_VERSIONS` in `@lytronix/validators`; the website's library is typed by them, so a version without its text, or text for an unpublished version, fails the typecheck, and a test checks the content folders hold exactly those files and that each file's header names its own version. Every published version stays readable at `/terms/<version>` and `/privacy/<version>`, with a line pointing to the version in force; any other name is a 404.
- **The version in force.** `/terms` and `/privacy` show the version the server names (`GET /legal-versions`, the platform settings `terms_version` and `privacy_version` that sign-up records, LEG-01), kept for a minute. When the server can't be reached, or names a version with no text, they show the newest published version that has taken effect by today in Dhaka, and before the first takes effect, the first.
- **Look.** The prototype's rules scoped to `.legal-page`, with every text at 14 px or more and the index heading in neutral-700; the blocks the final texts add (subheadings, sub-labels, numbered points, the table, contact lines) take the prototype's own type, colours and borders; the sticky index and the section anchors clear the site's sticky navbar. The prototype's two pages still hold the earlier draft wording; they follow this text once the owner approves it.

---

## 6. Open items

- The terms and privacy policy are published without a lawyer's review (D9-6, PHASE-9-PLAN §9). The review, when the business can pay for it, publishes its changes as new versions with the 15 days' notice.
- LEG-02's hashed cross-tenant fraud data joins both texts as a new version, with notice, when that check ships (next release).
- OD-46's legal minimum for order, payment and invoice records is still an accountant's question; the texts promise only what's built (never deleted for age while the shop is active).
- The example notices and the "all systems normal" board on the prototype are illustrative; the live page shows real data only.
