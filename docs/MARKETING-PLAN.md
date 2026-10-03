# Marketing and customer acquisition plan

Status: draft v1. This plan covers the multi-tenant SaaS platform only (working brand name not yet chosen; "the platform" is used throughout). It is separate from the Lytronix battery business. Every number marked *(proposal)* is a starting guess to be replaced by measurement. No market statistics are quoted, because none have been verified.

Related documents: `SRS.md` and `SRS-detailed.md` (what the product does), and the brand identity brief (name, voice, colours, still to be finalised).

---

## 1. The problem this plan solves

Building the platform is the easier half. The hard half is earning paying tenants: small sellers who distrust subscriptions, buy through people they know, and can switch to a competitor with a message. The plan therefore favours trust, personal contact and word of mouth over paid advertising, and adds paid channels only after conversion is proven.

**Targets that matter (from the cost model):**

| Milestone | Why it matters |
| --- | --- |
| 5–10 paying tenants | Infrastructure cost is covered on the single launch server |
| About 30 paying tenants | Trigger to add the standby server (DAT-55) |
| 100 tenants | Proof the acquisition channels are repeatable |
| 500 tenants | Scaling roadmap tier boundary (SCL) |

---

## 2. Who we are selling to

**Primary customer (ideal customer profile):** a small Bangladeshi online seller, typically running a Facebook page and taking orders by message or phone, doing roughly 50–500 orders a month, who currently keeps orders in a notebook, spreadsheet or chat history.

**Their real problems (in their words, not ours):**

1. Fake and returned orders cost them courier fees and stock.
2. Confirming orders and booking couriers by hand takes hours every day.
3. Customers ask "where is my order?" repeatedly.
4. Taking bKash or Nagad payments and matching them to orders is error-prone.
5. They do not want to pay a monthly fee before they know it works.

**Secondary segments (later):** sellers who already have a website and need only the API; small shops moving from a physical store to online; agencies who set up shops for clients (see the agent programme, section 7).

**Not our customer at launch:** large brands with their own engineering teams, and marketplaces.

---

## 3. Positioning and message

**Positioning statement:** the fastest, simplest way for a Bangladeshi seller to run a real online shop, with orders, payments, couriers and fraud checks already connected, in Bangla, with no monthly fee to start.

**Message hierarchy (lead with the pain, not the feature list):**

1. "Stop fake orders before you ship." (fraud check)
2. "Book your courier in one tap." (courier automation)
3. "Sell today. Pay only when you sell." (pay-as-you-go free tier)
4. "Your customers track their own orders." (fewer support messages)
5. Proof line: "I run my own shop on this platform." (the operator-as-tenant case study, TEN-20)

**Rules:** Bangla first; short sentences; show screenshots of real shops; never claim features that are not live; compare on time-to-first-sale and trust, not on being the cheapest.

**Competitors to study before writing any copy:** Dukan, Softune, Storea, ShopZero, BonikLabs and Bonik AI. Where the platform wins and loses is recorded in the earlier comparison checklist (SMS billing, AI features, theme customisation and mobile apps were the noted gaps).

---

## 4. The offer

- **Pay-as-you-go:** no monthly fee, a per-order fee charged only when an order is fulfilled, and a small per-product fee. This is the low-risk entry that removes the main objection.
- **One-month (30-day) free trial** that automatically graduates to pay-as-you-go, so a seller never hits a paywall or loses data.
- **Starter, Growth and Pro subscriptions** for sellers who prefer a fixed price and higher limits.
- **Founder setup help for the first customers:** free catalogue migration and a direct WhatsApp or phone line.

Discounts are avoided; the free tier is the discount.

---

## 5. Stage 1: the first 10 customers, by hand (weeks 1–8)

Goal: 10 real shops taking real orders, and 5 usable testimonials.

| Week | Actions |
| --- | --- |
| 1–2 | Join 10–15 Facebook groups and communities for online sellers. Contribute answers for two weeks before mentioning the platform. Make a list of 50 sellers who fit section 2. |
| 2–4 | Message the list personally. Offer free setup. Run 1-to-1 demos on a phone call or screen share. Aim for 15–20 demos. |
| 3–6 | Onboard each customer yourself: migrate products, set up payment methods, place a test order together. Record where they get stuck. |
| 6–8 | Ask each happy customer for a quote and permission to name their shop. Publish 3–5 short case studies (screenshot, before and after, one number). |

Rules for this stage: no ads, no new features unless three customers ask for the same thing, and every onboarding problem becomes a product fix or a help video.

**Success measure:** a new seller reaches a first test order in under 15 minutes without help.

---

## 6. Stage 2: 10 to 100 customers, repeatable channels (months 2–6)

Run several small channels at once, measure each, and keep the ones that work.

### 6.1 Bangla video and content
- Short videos (Facebook Reels, YouTube Shorts, full YouTube tutorials): "start selling in 10 minutes", "how to stop fake orders", "how to book couriers automatically", "how to take bKash payments safely".
- One video per week minimum; reuse each as a Facebook post and a help-centre article.
- Every video ends with one call to action: start free.

### 6.2 Referral programme (built on the existing balance ledger) — deferred, not in scope now
- A tenant who refers another earns balance credit when the referred tenant makes a first payment; the referred tenant also receives a credit. Amounts: *(proposal)* 100 TK each.
- Credit uses the existing prepaid balance, so cost is low and it encourages balance top-ups.
- Abuse controls: one credit per new phone number, credit released after the referral's first paid order or subscription, and a monthly cap per referrer.
- Every shop's "Powered by" mark links to a sign-up page carrying the referrer's code.

### 6.3 Agents and resellers (section 7)
Local web agencies, Facebook page managers and freelancers who set up shops for sellers.

### 6.4 Partnerships
- Courier offices and hubs that already talk daily to sellers.
- bKash and Nagad merchant representatives.
- Seller communities and training programmes: offer a free workshop or a discount code.

### 6.5 Founder-led events
Small in-person or online workshops ("set up your shop in one hour") in seller-dense areas. Two per month.

### 6.6 Community and support as marketing
Fast, personal, Bangla support in a WhatsApp or Messenger group. In this market a quick reply is a reason to recommend the product.

**Success measure at month 6:** 50–100 tenants, with at least 30% of new tenants coming from partners or community rather than direct effort. Referral and agents are deferred (§6.2, §7), so they don't count toward this target yet.

---

## 7. Agent and reseller programme (design) — deferred, not in scope now

*(All figures are proposals. Deferred: not built or specified for launch.)*

- **Who:** freelancers, small agencies and page managers who already help sellers.
- **Reward:** a commission of about 20% of the referred tenant's subscription or fee revenue for the first 6 months, paid to their own tenant balance or by bank/wallet transfer monthly.
- **Tracking:** each agent has a code; the tenant record stores which agent introduced it; the operator console shows agent earnings.
- **Support for agents:** a short training video, a demo tenant they can show customers, and a private support line.
- **Quality control:** commission is paid only on paying, non-refunded tenants; agents who bring fraudulent or abusive tenants lose commission and access.

---

## 8. Stage 3: 100 to 500 customers, careful paid acquisition (months 6–12)

Start paid channels only when Stage 2 shows a sign-up to first-order conversion you are happy with.

- Facebook and Instagram ads aimed at sellers, using the strongest video and case study, with small budgets *(proposal: start at 5,000–10,000 TK a month)*.
- Retargeting of people who watched videos or visited the sign-up page.
- Search ads for Bangla and English seller-intent queries.
- Test one channel at a time for 3–4 weeks. Stop any channel whose cost per acquired tenant exceeds what one tenant pays over about 6 months.

**Guardrail:** infrastructure is about 5–10% of revenue, and an average tenant pays about 579 TK a month (recomputed 2026-10-02 after Starter's price moved from 499 to 449 TK). A rule of thumb is that cost to acquire a tenant should be recovered within about 6 months.

---

## 9. Funnel and metrics

| Stage | Metric | Notes |
| --- | --- | --- |
| Awareness | Video views, group reach, referral link clicks | Vanity unless it leads to sign-ups |
| Sign-up | Visitors to sign-ups | Measure per channel |
| Activation | Sign-ups to first product added, and to first order | The most important early number |
| Revenue | Trial or pay-as-you-go to paid; average revenue per tenant | Pay-as-you-go revenue arrives only as orders are fulfilled |
| Retention | Tenants still active at 30, 90 and 180 days | Growth without retention is wasted spend |
| Referral | Share of new tenants from referral, agents, partners | Shows whether word of mouth is working |
| Efficiency | Cost per acquired tenant, by channel | Decides where to spend |

Review weekly for the first 3 months, then monthly. Record the numbers in one shared sheet.

---

## 10. Onboarding as marketing

A seller who succeeds in the first day tells others; one who fails does not return.

- **First-run checklist** in the dashboard: add a product, set a payment method, connect a courier, place a test order, share the store link.
- **Setup assistance:** an optional "we set it up for you" request for the first customers (later a paid service).
- **First-order celebration and next-step prompts** (share the link, add a category, connect a listener).
- **Email or SMS nudges** for tenants who stall (no product after 2 days, no order after 7).
- **Help videos** linked from each screen, in Bangla.

---

## 11. Budget (proposal, monthly)

| Item | Stage 1 | Stage 2 | Stage 3 |
| --- | --- | --- | --- |
| Video production (phone, basic editing) | 0–2,000 TK | 2,000–5,000 TK | 5,000–10,000 TK |
| Referral credits and agent commissions | 0 | Paid from revenue | Paid from revenue |
| Workshops and events | 0–2,000 TK | 3,000–8,000 TK | 5,000–15,000 TK |
| Paid ads | 0 | 0 | 5,000–20,000 TK |
| Tools (sheet, scheduling, analytics) | 0 | 0–1,500 TK | 1,500–3,000 TK |
| **Total** | **about 0–4,000 TK** | **about 5,000–15,000 TK** | **about 15,000–50,000 TK** |

The largest cost is the founder's time; treat marketing as a fixed weekly time block (for example two days a week) from the day the product is usable.

---

## 12. First 90 days at a glance

| Days | Focus | Output |
| --- | --- | --- |
| 1–14 | Groups, prospect list, brand name and basic identity settled, landing page live | List of 50 sellers, one landing page, a 2-minute demo video |
| 15–45 | Demos and hand onboarding | 10 tenants live, onboarding problems logged |
| 46–60 | Fix top friction, publish first case studies | 3–5 case studies, onboarding under 15 minutes |
| 61–90 | Start referral programme, recruit first 3–5 agents, weekly video rhythm | First referral sign-ups, first agent tenants, first metrics review |

---

## 13. Risks and how to handle them

| Risk | Response |
| --- | --- |
| Sellers try it once and leave | Invest in onboarding and first-order success before spending on reach |
| Competitors copy the offer or cut prices | Compete on trust, local fit, support speed and referral network |
| Referral or agent abuse | Release credit only after a real paid order; cap and audit |
| Too many channels at once | Run three at a time and cut the weakest each month |
| Founder time runs out | Fix a weekly marketing block; hand repetitive setup to agents |
| Claims that are not yet true | Only market features that are live and tested |
| Brand name not final | Settle the name and trademark check before any paid or printed material |

---

## 14. Open decisions

1. Final brand name, domain and trademark check (candidates discussed: Druto, Turonto, Shabolil, Jholok, Sellio).
2. Referral amounts and agent commission percentage and term.
3. Whether to offer paid setup assistance and at what price.
4. Whether to run in-person workshops, and in which cities first.
5. Which single channel to prioritise in the first month after the first 10 customers.

---

## 15. Product gaps this plan depends on

These are not yet in the SRS and would need to be specified if the plan is adopted:

- Referral programme: codes, credit rules, abuse limits, and a referral view for tenants.
- Agent programme: agent accounts, tenant-to-agent attribution, commission tracking and payout, an agent view in the operator console.
- Onboarding checklist and stall nudges (SMS or email).
- A sign-up page that accepts a referral or agent code, linked from the "Powered by" mark.
- Attribution tracking (which channel a sign-up came from) and a funnel report in the operator console.
