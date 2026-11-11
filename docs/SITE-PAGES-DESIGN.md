# Site pages design: About, Contact, sign-up flow

Status: v1 design, 2026-10-18. A working prototype of all three is `docs/brand/lytro-site-pages.html` (open in a browser; needs internet for Google Fonts), also published at https://claude.ai/artifact/FzYn1B8r4Qj6kekuoNYLgw. This document is the spec behind it. Brand rules are in `BRAND-IDENTITY.md`; the landing page is in `LANDING-PAGE-DESIGN.md`.

Two of these pages belong to the marketing site (`apps/website`). The sign-up flow belongs to the dashboard host (`apps/admin`), because TEN-31 serves sign-up, sign-in and create-shop on `app.lytro.app`. The prototype shows them side by side behind a switcher that is not part of the product.

"Enrollment" here means a seller signing up and creating a shop. The agent and reseller programme (MARKETING-PLAN.md §7) is deferred, so there is no partner enrollment page yet; when it is scheduled, it gets its own spec.

---

## 1. About (`lytro.app/about`)

**Job.** Make the "we run our own shop on this" proof believable and show the kind of company a seller is trusting with their orders. No invented team, no invented numbers.

| Section | Content | Source |
| --- | --- | --- |
| Hero | "We are sellers first. The software came second." One-paragraph origin: a Dhaka gadget shop built the tool for itself and still runs on it. | MARKETING-PLAN.md §3 proof line, TEN-20 |
| Story | Three paragraphs: the shop before, the tool for one shop, Lytro rebuilt for every shop. Pull-quote: same account, same limits, same fees. Closing line separates Lytro (the product) from the Lytronix battery business. | SRS §2 starting point, MARKETING-PLAN.md status line |
| Facts | Four tiles with facts, not metrics: two businesses, one first tenant, ৳0 monthly to start, data hosted in Bangladesh on BDIX servers with nightly backups. | DAT-7, DAT-8 |
| Timeline | Before, then, now, next. "Next" repeats the rule that a feature is listed only when live. | |
| What we believe | The six product rules from the landing page's "Why Lytro", written as beliefs: money never passes through us, we only claim what is live, Bangla first, your data is yours, your couriers and rates, a person answers. | BRAND-IDENTITY.md §1, SRS money handling |
| Team | Three placeholder cards (founder, engineering, seller support) with dashed avatars and no names. Replaced only when real people agree to appear. | |
| Final CTA | Open a free shop, or talk to us first. | |

**Tone.** First person plural, plain, no superlatives. The page never says "best" or "number one".

---

## 2. Contact (`lytro.app/contact`)

**Job.** Get a seller to the fastest real human channel, and capture enough in a form that the reply can be useful.

| Element | Design |
| --- | --- |
| Hero | "Talk to a person, not a bot." Hours stated in the lead: every day, from the help line's opening to its closing hour. |
| Channels | WhatsApp (primary, with a Message button), phone (demo on a call), email (paper trail, Copy button). Each card shows the value as selectable text, since links to messaging apps are unreliable inside prototypes and some browsers. WhatsApp and phone are Lytro's help line, the numbers the operator sets in the console (`GET /help-line`, D8-69); one not set, or cleared there, isn't shown. |
| Hours | One line, every day, the help line's hours ("Every day, 09:00 to 22:00" to start, D8-68), and "Outside these hours: leave a WhatsApp; we reply when we open". An "Open now" or "Closed now · opens at 9 am" indicator by Dhaka's clock (`#contact-closed`). The hours never cross midnight: the console refuses a closing hour at or before the opening hour (the owner, 2026-11-10). With neither number set, the hours card goes too (`#contact-unset`). Slice 8.8's read (2026-11-10) dropped the Friday line and the "urgent: any time on WhatsApp" promise. |
| Address | A map placeholder with a pin, "Lytronix, Dhaka", visits by appointment. Real address and an embedded map go in at build time. |
| Form | Topic chips (setup help, book a demo, plans and pricing, something is broken, partnership), name, phone, optional Facebook page or shop link, message. Validates name, a Bangladeshi mobile number and a non-empty message, inline, in Bangla. Success state replaces the form with a confirmation and "send another". A privacy line: the number is used only to reply, no marketing SMS. |

**Build notes.** The form posts to a server route in `apps/website` that creates a support ticket or sends an email; the prototype only validates. Topic becomes the ticket category. The page link field lets support look at the seller's page before calling. The page reads `GET /help-line` on the server, kept as long as the route's own five minutes, and `SUPPORT_WHATSAPP` and `SUPPORT_PHONE` go (Slice 8.8). Nothing set at all keeps the "once the support line is live" sentence. Built in Slice 8.8 (2026-11-11), with the footer and the listener page reading the same help line.

---

## 3. Sign-up flow (`app.lytro.app`)

Follows AUTH-28 exactly: identity, create shop, optional password. The prototype runs the whole flow with validation and state, without a backend.

| Step | Screen | Rules it implements |
| --- | --- | --- |
| 1a | Phone number with a fixed +880 prefix; Continue with Google; Continue with Facebook; terms line; staff log-in link. | AUTH-01, AUTH-12 (one door for new and returning), AUTH-28 step 1 |
| 1b | Six-digit code in six boxes (auto-advance, backspace, paste of a full code), "valid for 5 minutes", resend disabled for 60 seconds, wrong-code message with tries left, "use a password instead". | AUTH-05, AUTH-06, AUTH-07, AUTH-13 (same reply for every number) |
| 2 | Shop name (required, 60 max), shop link with live preview of both addresses (`<slug>.lytro.app` for customers, `app.lytro.app/<slug>` for the owner), owner name (required), address, main business type as optional chips. The slug auto-fills from the name until the seller edits it. | AUTH-28 step 2, TEN-31, PST-01 |
| 3 | Optional password with three live rules (8 characters, a number, not the phone number), Skip for now, Save. Shown once. | AUTH-28 step 3, AUTH-20 |
| Done | "Your shop is live" with the shop address as a pill, the trial line, and three first-sale tasks: add a product, add a bKash or Nagad number, pair the Listener app. Then "Go to my dashboard" and a share line. | The empty-state rule in BRAND-IDENTITY.md §7 |

**Shell.** Bare: wordmark top-left, "Need help?" top-right linking to Contact, a three-segment progress bar labelled Phone, Your shop, Password, one card per step on a sunken background, "Powered by Lytro · Lytronix" footer. No marketing nav, so nothing pulls the seller away mid-flow.

**Copy.** Reuses the dashboard's existing strings where they exist (`apps/dashboard/src/i18n/locales/bn.json`: welcome title, phone prompt, verify title, resend, Google and Facebook buttons, staff link). New strings follow the same register.

**Mobile.** One column throughout, inputs 48 px tall, the phone prefix fixed, numeric keyboards on phone and code fields, the code field accepts a pasted SMS.

---

## 4. Mapping onto the apps

| Page | App | Route | Notes |
| --- | --- | --- | --- |
| About | `apps/website` | `/about` | Built 2026-10-19: `app/about/page.tsx`. Team cards read from a static list whose names are empty until people agree to appear. |
| Contact | `apps/website` | `/contact` | Built 2026-10-19: `app/contact/page.tsx`, `contact-form.tsx` and the server action in `actions.ts`, with the rules in `lib/contact/contact-submission.ts`. Channel values come from the help line (`GET /help-line`, since Slice 8.8) and `SUPPORT_EMAIL`, so placeholders cannot ship. The form posts to `CONTACT_WEBHOOK_URL`; without one it tells the visitor to use WhatsApp instead of pretending to send. "Open now" is computed in Dhaka time in the browser. |
| Sign-up | `apps/dashboard` | `/sign-in`, `/verify-code`, `/create-shop`, `/checkout`, `/set-password`, `/set-up` | Built 2026-10-19 as a fresh app to this shell (`components/ui/step-frame.tsx`); the map of screens to files is in `ONBOARDING-FLOW-DESIGN.md` §5. |
| Footer and nav | `apps/website` | | Add About and Contact to the nav and footer when the pages exist, per the landing-page spec. |
| Listener app | `apps/website` | `/listener` | Slice 5.8, part 4: §6. In the footer under Help, not the nav: it's for shops already on Lytro. |

---

## 5. Open items

- Contact details, hours and the street address are placeholders. The hours shown are a proposal.
- Team cards stay empty until people agree to be shown.
- Terms and Privacy pages are linked from the sign-up screen and the footer but are not designed here; they are legal content first.
- The Google and Facebook buttons use the official marks from `docs/brand/third-party/` (full set and README arrive with the logos PR); the built buttons must still follow each provider's sign-in branding rules.

---

## 6. The listener app (`lytro.app/listener`)

Slice 5.8, part 4, read agreed 2026-11-05. Drawn in `brand/lytro-site-pages.html` (`#listener`, and `#listener-soon` before a release).
The address the app itself opens for an update (`DOWNLOAD_URL`), and what the dashboard links to. Public, with no sign-in: the phone
installing it may not be signed in anywhere. Bangla first, with the app's own words, so the guide and the app say the same thing.

- **The top:** what the app does, Download the APK, the version, size and "Android 7 or later". On a computer, a QR of this page, since
  the file is no use there; it opens the page and not the file, so the guide comes with it.
- **The warning:** download only from lytro.app, and never install a file someone sends.
- **Install it:** the four steps, including Android's "Install unknown apps" and Play Protect's "Install anyway".
- **On Android 15 or later:** step 1 of setup can stop at "App was denied access to SMS", which is expected for an app installed from
  a browser. The three steps out are the app's own (LISTENER-APP-DESIGN §2).
- **Setup guide** (`#setup`, where the app's Help opens): pair, allow SMS, notifications, battery, a test; then keep the phone on.
- **Updates:** the app says when one is needed, and it's the same download over the old one. The SHA-256 is folded under the updates.
- **Help:** WhatsApp, the help line's number (`GET /help-line`, Slice 8.8), when one is set.

**Where the file lives** (agreed): its own public R2 bucket on `download.lytro.app` (DEPLOYMENT.md). The release command writes
`latest.json` beside the APK, and the owner uploads the APK and then that file in Cloudflare's panel. The page reads `latest.json` every
few minutes, so a release shows without a redeploy. It takes the file's name from there but always builds the address itself, on
the bucket, so nothing in that file can send a shop elsewhere.

**Before a release exists,** or if the bucket can't be read, the page says the app isn't ready and offers Talk to us; the guide stays.
