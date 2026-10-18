# Support and legal pages design: Help, Notices and status, Terms, Privacy

Status: v1 design, 2026-10-18. A working prototype of all four is `docs/brand/lytro-support-legal.html` (open in a browser; needs internet for Google Fonts). This document is the spec behind it. Together with `LANDING-PAGE-DESIGN.md` and `SITE-PAGES-DESIGN.md` it covers every link in the landing page footer.

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

**Job.** State the deal in words a seller can read on a phone, and satisfy LEG-1, which requires the terms to state the plan lifecycle, no refund after a period has started, balance freezing, deletion timing, media and data retention, and the use of hashed cross-tenant fraud data.

**Structure.** A draft banner (legal review pending), a sticky section index from 900 px, and eleven clauses. Each clause opens with a "Plainly" summary box, then the bullets. The lapsed-plan clause is a labelled table of the five stages (grace days 0 to 3, read-only 3 to 7, locked 7 to 15, archived 15 to 60, deletion at 60) taken from LIF-05 to LIF-12.

| Clause | Source |
| --- | --- |
| 1 Your account and shop | AUTH-01, AUTH-28, TEN-16, TEN-18 |
| 2 Trial, plans and fees | SRS §free trial, PLN-7a, DWN-1, LIF-1, LIF-5 |
| 3 Balance and top-ups | BAL-2, BAL-3, BAL-4 |
| 4 If a plan lapses | LIF-02 to LIF-12 |
| 5 Your customers' money | SRS §money handling, PAY-05 |
| 6 Couriers and SMS | SRS §couriers, SMS-2 |
| 7 Fraud data | LEG-1 (hashed cross-tenant data) |
| 8 Acceptable use | LSN-1, marketing plan quality rules |
| 9 Your data and deletion | AUD-3, CHT-4, §orders are never deleted, LEG-2 |
| 10 Availability and liability | OBS-2, DAT-7a, DAT-8; liability wording marked for counsel |
| 11 Changes and contact | 15-day notice is a proposal |

---

## 4. Privacy policy (`/privacy`)

**Job.** Explain to sellers and to sellers' customers what is collected, why, where it lives and how to have it erased, and satisfy LEG-2.

**Structure.** Draft banner, sticky index, ten sections with "Plainly" boxes and labelled tables for "what we collect" and "how long we keep it".

| Section | Source |
| --- | --- |
| 1 Who this covers | Shoppers are the tenant's customers; Lytro processes on the tenant's behalf |
| 2 What we collect | AUTH, TEN, VER (transaction ID and sender number), AUD-1; never PINs or cards (PAY-05) |
| 3 The Listener app | VER-1, LSN-1, LSN-3: reads only bKash and Nagad SMS, uploads amount, ID, sender, time; token bound to one tenant and installation; revocable |
| 4 How we use it | fraud check on hashed numbers; essential messages; no sale of data |
| 5 Who we share with | couriers, SMS gateway, payment gateways when connected, hosting and backups, authorities when required |
| 6 Where it lives | DAT-7 (BDIX servers), DAT-8 (encrypted backups, drills), TEN-01, TEN-29, SEC rows |
| 7 How long we keep it | §orders never deleted while active, AUD-3, CHT-4, LIF deletion at day 60; fraud-hash and security-log periods marked for counsel |
| 8 Your rights | export in every state (LIF-06, LIF-11), shop deletion (LIF-19), shopper erasure (LEG-2) |
| 9 Cookies | SEC-7 session cookie, language cookie, tenant-added pixels are the tenant's responsibility |
| 10 Contact | reply and erasure periods marked for confirmation |

---

## 5. Mapping onto apps/website

| Page | Route | Components | Data |
| --- | --- | --- | --- |
| Help | `/help`, `/help/<slug>` | `help/index.tsx`, `help/article.tsx`, `help/search.tsx` | Markdown in `content/help/` |
| Notices | `/notices` | `notices/status-board.tsx`, `notices/list.tsx` | public notices from `control.notices`; status from the check results |
| Terms | `/terms` | `legal/doc.tsx` with a sticky index | Markdown in `content/legal/terms.bn.md`, `.en.md` |
| Privacy | `/privacy` | same `legal/doc.tsx` | Markdown in `content/legal/privacy.bn.md`, `.en.md` |
| Footer | all | `footer.tsx` | replace `#` links with the four routes once the pages exist |

---

## 6. Open items

- Both legal texts are drafts for a lawyer. Clauses marked "[to be settled with counsel]" are: liability cap, fraud-hash retention, security-log retention, erasure response time, and the 15-day change notice.
- Retention periods follow LEG-2: set after an accountant's and a lawyer's advice.
- The example notices and the "all systems normal" board on the prototype are illustrative; the live page shows real data only.
- WhatsApp support needs the real number before the footer link can point at it.
