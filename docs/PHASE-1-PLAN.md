# Phase 1 plan: identity and tenancy

Status: draft for discussion, 2026-10-03. Builds on `IMPLEMENTATION-PLAN.md` Phase 1. Requirement IDs refer to `SRS-detailed.md`; schema to `DATABASE-SCHEMA.md`; endpoints to `API-CONTRACT.md`. The end-to-end test plan is in `PHASE-1-TEST-PLAN.md`.

Items marked **Decision** need your answer before the slice they affect starts. Items marked **Proposed** are my recommendation and take effect unless you change them.

---

## 1. Goal and exit criteria

**Goal.** A person can sign up and get a working trial tenant. Staff can sign in and act only within their role. Every request is bound to exactly one tenant, and no request can reach another tenant's data.

**Phase 1 is complete when all of these hold:**

1. Every `M` requirement in AUTH, TEN, STF, AUD, I18N-01/02 and ADM-01/18 has a passing automated test (see the test plan).
2. The isolation suite (SEC-02) passes on every endpoint that takes a resource ID, with two tenants holding overlapping data.
3. Row-level security is on every tenant table, and the application role cannot bypass it.
4. A new developer can run `pnpm dev`, sign up through the dashboard, and see their own shop, with no manual database steps.
5. Staging-equivalent CI is green on `main`, and the pull request flow has been used for every slice.

**Out of scope for Phase 1:** plans and billing (Phase 2), products, orders, payments, couriers, storefront, SMS beyond the two essential messages, and any real third-party provider.

---

## 2. Decisions needed

| # | Decision | Proposed | Affects |
|---|---|---|---|
| D1 | **Decided:** session model | Server-side sessions stored in Postgres. The browser holds a random session ID in an `HttpOnly`, `Secure` (production), `SameSite=Lax` cookie scoped to the exact host. The session ID is stored hashed, rotated on sign-in, bound to one tenant, and carries a per-session CSRF token. Expiry is fixed at seven days. Revocation is a database change in the same transaction as the cause. | Slices 4, 5 |
| D2 | **Decided:** password hashing | bcrypt with automatic per-password salt and a cost factor of at least 12. Passwords must be 8 to 20 characters (AUTH-03 minimum, plus the 20-character maximum), so the 72-byte input limit is never reached. | Slice 5 |
| D3 | Seat and trial limits before Phase 2 | Seed a minimal `control.plans` table with the Trial and Starter rows in Phase 1, with limits stored as data. Phase 2 adds billing on top. | Slices 4, 7 |
| D4 | **Decided 2026-10-04:** development domain | `*.localhost` (for example `fashion-house.localhost:3001`) for local development and tests. It resolves to the local machine in modern browsers, so no DNS setup is needed. The staging hostname scheme is redefined when a staging server exists. | Slices 2, 9 |
| D5 | Platform domain for production | Undecided, because the brand is not final (`MARKETING-PLAN.md` §14). Build with a configuration value so the domain can change without code changes. | Slice 2 |
| D6 | SMS and email providers | Build against a stub that records messages to the database and the console. The real provider is chosen before launch. | Slices 4, 5, 6 |
| D7 | Google and Facebook sign-in | Include the code in slice 6, but registration with each provider is an external step on your side. Slice 6 can close without them, with those two methods switched off. | Slice 6 |
| D8 | Operator console login (ADM-01, ADM-18) | Build in Phase 1, as the implementation plan says, so the console is protected from its first screen. | Slice 10 |
| D9 | Staff phone numbers unique platform-wide (STF-06) | Yes, as an assumption already marked in the SRS. | Slice 7 |
| D10 | Language storage | Both staff and shopper choice saved per device, client-side (I18N-02, revised by D31 — originally staff was per account). | Slices 9 |
| D12 | **Decided 2026-10-04:** stepped onboarding | The entry screen shows a phone number input, a "Continue with Google" button and a "Continue with Facebook" button. Sign-up and sign-in share this screen: each path verifies the identity first, creates an account if new, and signs the person in (AUTH-01, AUTH-12). The shop is created in the next step, which starts the trial (AUTH-10). Straight after, the owner is offered once to set a password and may skip it (AUTH-28). A person who verified their identity but never created a shop is routed to the create-shop step on every return. Code sign-in stays available after a password is set, so a forgotten password is recovered by signing in with a code and setting a new one (AUTH-17, AUTH-20). Sign-up and sign-in codes are platform cost (AUTH-21). The temporary-password flow applies only to staff passwords set by the owner (AUTH-19, STF-13). | Slices 4, 5, 9 |
| D13 | **Decided 2026-10-06:** where sessions live | Three host kinds reach the `/admin` dashboard. **(1) Platform host** (`lytronix.com/admin`, dev: `localhost:3001/admin`): the entry screen and the create-shop step live here; after the shop is created the owner stays on the platform host and the dashboard is served there; the tenant is read from the session, not the host. **(2) Shop subdomain** (`fashion-house.lytronix.com/admin`): tenant resolved from the subdomain; used by owners and staff who sign in directly at their shop. **(3) Custom domain** (`mybrand.com/admin`): tenant resolved from `tenant_domains`; same dashboard, different host. In all three cases the cookie is scoped to the exact host (D1, TEN-29). No handoff token is needed. `sessions.tenant_id` is nullable only for the brief moment between identity verification and shop creation; it is set when the shop is created. The TenantGuard reads the tenant from the host for kinds 2 and 3, and from the session for kind 1. A session from one host is refused on any other host. AUTH-23 (deleted tenant) is served on the platform host where the session has no live tenant. | Slices 5, 9 |
| D14 | **Decided 2026-10-06:** platform-neutral edge | The server is reached only through an edge: any reverse proxy or load balancer that adds the edge secret header (`x-lytronix-edge-secret`) to every request it forwards. Every route except `/health` refuses a request without a current or rotation secret (R3). During a rotation both `TRUSTED_EDGE_SECRET` and `TRUSTED_EDGE_SECRET_NEXT` are accepted. The client address is read from the header named by `CLIENT_IP_HEADER` (default `x-forwarded-for`), with `CLIENT_IP_FORMAT` (list or single) and `TRUSTED_PROXY_HOPS` (the entry that trusted proxies added); the address is read only with a valid edge secret, and the entries before it are never trusted. Cloudflare is one implementation (it appends to `X-Forwarded-For`). | Slice 5 |
| D15 | **Decided 2026-10-06:** sign-in next steps by lifecycle | An owner signing in to a `locked` or `archived` shop gets `next: renewal`; to a `deleted` shop, `next: purchase`; to a suspended shop, `next: unavailable`. Otherwise `dashboard`. Owners can call `GET /me` in every lapsed state. Staff sign-in in a later state is refused with `tenant_offline` once staff sessions exist (slice 7). | Slice 5 |
| D16 | **Decided 2026-10-06:** per-IP limits | The sign-in lock is per account only. Per-IP limits on SMS and sign-up (SMS-6, SMS-11, SUP-08, RTE-06, LSN-10) stay required and are built in a later slice, counted per IP over a shared window. Carrier-grade NAT means many users can share one address, so thresholds are set against measured traffic. | Later slice |
| D17 | **Decided 2026-10-06:** Google is its own identity kind | Google accounts are matched by the Google account ID, as a `google` identity, separate from `email`. AUTH-08's uniqueness rule applies to each kind; an email address is not a Google identity. | Slice 6 |
| D18 | **Decided 2026-10-06:** mail provider | Codes and shop-ready notices by email go through a mail port, with a console stub as the provider until a real one is chosen, as SMS does. | Slice 6 |
| D19 | **Decided 2026-10-06:** provider switches | Google and Facebook sign-in are off by default and switched on by `GOOGLE_SIGN_IN_ENABLED` and `FACEBOOK_SIGN_IN_ENABLED` once registered. Their flows are tested against fake providers in every run. | Slice 6 |
| D20 | **Decided 2026-10-06:** any verified identity opens a shop | A person verified by phone, email or a provider can create a shop. The shop-ready notice goes by SMS when a phone exists, otherwise by email; with no channel it is skipped. A Facebook account with no email is told once that Facebook is its only way back in (AUTH-27). | Slice 6 |
| D21 | **Decided 2026-10-07:** the staff seat limit counts the owner | The plan's `staff` limit is the total seats, including the owner: Trial is 1 (owner only), Starter is 2 (owner plus one staff member). A plan with no `staff` key gets 1 seat by default. | Slice 7 |
| D22 | **Decided 2026-10-07:** a staff member is a platform account | Adding staff reserves the phone as a platform subscriber: an existing account is reused, and a new phone gets an account with the phone as a pending identity, verified by the person's first code sign-in. A phone that belongs to a shop owner, or is already staff in another shop, is refused with `conflict` (STF-06, platform-wide). This lets the same person own a shop and be staff elsewhere, as one account (OD-10 still limits them to one owned shop). | Slice 7 |
| D23 | **Decided 2026-10-07:** staff sign in on the shop's own host, with a separate password | Staff sign in at `POST /auth/staff/signin` on their shop's host, with the phone and a password the owner set, never the account password. Staff sessions are refused on the platform host. A reset by the owner ends the member's sessions and forces a new password at the next sign-in (STF-13); a normal change needs the current password (AUTH-20). | Slice 7 |
| D24 | **Decided 2026-10-07:** the activity log's retention purge runs outside the app | The insert-only trigger on `tenant.activity_log` rejects UPDATE and DELETE from any role, unconditionally (AUD-03, DAT-10), so the app can never hold a credential that deletes a row. AUD-06's purge runs as its own privileged pipeline step (`packages/db/src/purge-activity-log.ts`), the same category as a migration: a separate schema-owner connection, never bundled into the server. | Slice 8 |
| D25 | **Decided 2026-10-07:** pg-boss is the job queue (SCL-08) | A Postgres-only job library, not a hand-rolled outbox per job type and not Redis (RED-07). Chosen over graphile-worker: upcoming job types need different policies per queue (SMS and email want fast retry; AI replies want rate-throttling, not retry; a scheduled plan change is one-shot and due at a future timestamp; a data export is a single slow job) — pg-boss configures that per named queue, where graphile-worker's flat task registry would need it hand-layered per task. Low latency where it matters (OTP, sign-in codes) comes from pg-boss's own `LISTEN`/`NOTIFY` support, opted into per queue (`useListenNotify`, `notify: true`), not the default 2-second poll; a queue that doesn't need instant delivery (a data export) is left on the plain poll. SCL-08 requires every caller to go through one queue interface this codebase owns, so pg-boss sits behind that interface as the adapter, swappable for a message broker later without touching callers (SCL-08's own stated trigger: sustained throughput past 100/s, or lock contention). The activity log's retention purge (D24) is not a pg-boss job: its workers run under the ordinary app role, which can never delete from `tenant.activity_log` regardless, so that purge stays its own privileged script. Replaces the hand-rolled `SmsOutbox`/`SmsWorker`; email's outbox is built on it from the start rather than a second hand-rolled copy. **Correction, verified against the installed packages 2026-10-07:** pg-boss's `db`/`executeSql` adapter option takes the raw `pg` client backing a transaction, but Drizzle (`drizzle-orm@0.36.4`, node-postgres) exposes that client (`$client`) only on the top-level `db` object, never on the `tx` passed into `db.transaction(async (tx) => ...)` — there is no public, documented way to get the raw client for an *open* transaction, so pg-boss cannot be handed our transaction directly without reaching into Drizzle's private internals (rejected: exactly the unchecked-cast risk this codebase's own rules warn against, and silently breakable by a future Drizzle upgrade).

**The queue interface still enqueues atomically, by a different route.** A small outbox table of our own (ordinary Drizzle, no private API) records "enqueue this" in the same transaction as the business write that caused it — the atomicity boundary is that transaction's own commit, nothing pg-boss-specific. A relay, woken by `LISTEN`/`NOTIFY` on that table (the same mechanism already chosen for low latency), reads newly-committed rows and calls `boss.send()`, with a `singletonKey` so a relay retry can't double-enqueue. This is the standard transactional-outbox-feeding-an-external-queue pattern, used here specifically because the queue library and the ORM can't cleanly join one transaction. Not every job strictly needs this — a missed SMS or email code just gets resent — but it costs nothing for those, and webhooks and data export (both later) do need it: a silently-missing webhook job diverges a tenant's external system with no resend path, and a silently-missing export job leaves a request stuck "in progress" forever. One rule for every job, rather than deciding per job type, is what keeps the guarantee from quietly missing the one job that needed it. | Messaging now; webhooks, AI-reply throttling, scheduled plan changes and data export later |
| D26 | **Decided 2026-10-07:** the official pg-boss dashboard, wired in once the operator console exists, not before | pg-boss ships an official UI (`@pg-boss/dashboard`) to view, cancel, retry, resume and delete jobs, embeddable as a plain handler in an existing app. Embedded mode has no authentication of its own — the host app must gate it — and this codebase has no platform-operator session yet to gate it behind (Phase 1 has only tenant-scoped staff and owner sessions). Deferred until the operator console exists, then mounted behind the same guard chain every operator route uses, platform-host only, view versus manage split by an operator permission, its own narrower database credential (`SELECT`-only on the `pgboss` schema for viewing; write grants only for whoever can manage jobs) rather than the app's own role. Accepted gap (option 1 of two considered): the dashboard talks to Postgres directly, bypassing this codebase's queue interface and `AuditService`, so an operator's cancel/retry/delete does not produce an activity log entry; accepted because a queue-management action is a platform operation, not an action on a tenant in AUD-08's sense, rather than built around with a custom audited wrapper. | Phase 2, whenever the operator console is built |
| D27 | **Decided 2026-10-07:** a bounded pg-boss retry for a failed OTP SMS send, built on the job queue (SCL-08, D25) | A code is valid for `CODE_TTL_MS` (5 minutes) after it is issued; today a synchronous send failure gives up for good (`nextAttemptAt: null`) even though the code itself is still usable. `OneTimeCodeService.issue()` now queues a second attempt on `SmsDeliveryError`, through the same `JOB_QUEUE` port every caller uses — `MessagingService.queueOtpRetry` bounds the job's own `expireInSeconds` to whatever is left of that code's TTL at the moment of the failed attempt, with `retryLimit: 2` and `retryDelay: 20` seconds, so pg-boss drops the job once the window passes rather than resending a dead code. This needed the job outbox's columns to carry per-job `expireInSeconds`/`retryLimit`/`retryDelay` (migration `0022_job_outbox_send_options`), since the relay forwards whatever each enqueued row set rather than only the queue's own defaults. **The job carries the plaintext code, briefly, as an accepted trade-off.** Only the code's one-way hash is ever stored elsewhere (`OneTimeCodeHasher`), so a background retry has nowhere else to read the code from; it rides in `job_outbox.payload` and then in pg-boss's own job row, both of which are internal queue infrastructure, not request logs — the row is gone once the job is sent and succeeds, or once `expireInSeconds` passes, whichever comes first. A dedicated `otp_retry` queue name keeps this apart from whatever the general-purpose `sms`/`mail` queue names end up carrying later, so nothing else can be mistaken for an OTP resend. **Mail is explicitly out of scope here**, deliberately: `MailService.deliverCode` has no outbox or claim mechanism at all yet (unlike SMS's `sms_outbox`/`SmsRepository`), so giving it a matching bounded retry is a separate, larger piece of work, not a one-line addition to this one. A `MailDeliveryError` still behaves exactly as before. | SMS OTP now; a matching mail retry, once mail has its own outbox, is a later slice |
| D28 | **Decided 2026-10-07:** mail gets its own outbox, mirroring SMS's exactly (SMS-18, D6) | Mail has no delivery-failure safety net today: a sync `MailDeliveryError` on an OTP is gone with no record, and `ShopCreationService.notifyByEmail`'s shop-ready failure is only `console.error`'d — never retried, never seen again. SMS already solved this (`sms_outbox`, `SmsRepository.claimDue`'s lease-based `SKIP LOCKED` claim, `MessagingService.dispatch`/`runDue`, `RETRY_WAIT_MINUTES = [1,5,15,60]`, a 30s `SmsWorker` poller); mail gets a second, structurally identical copy — `MailKind`/`MailStatus` enums, `control.mail_outbox` (its own schema file), `MailRepository`, a `MailStore` port and `DrizzleMailStore` adapter, the same five methods added to `MailService`, and a `MailWorker` poller. **Mirrored rather than generalized, deliberately**: every other SMS/mail pair in this codebase is already two separate things (separate tokens, separate error types, separate modules), so a second copy here is consistent with that, even though `RETRY_WAIT_MINUTES` and the lease-claim SQL end up duplicated verbatim; folding both channels onto one generic base would mean refactoring the already-shipped SMS outbox to fit it, not just adding mail, and is explicitly rejected for this piece of work. `OneTimeCodeService.issue()`'s email branch moves its outbox insert inside the same transaction as the challenge row, mirroring the SMS branch, then delivers after commit — same permanent-failure-on-first-attempt behavior SMS has today, just durable and auditable instead of invisible. `ShopCreationService.notifyByEmail` is replaced by `mail.queueShopReady` in the same transaction as the SMS shop-ready queueing, then `mail.dispatch(...)` alongside the existing SMS dispatch call, so a flaky mail provider no longer permanently loses the shop-ready notice. **A bounded pg-boss retry for mail OTP, matching D27, is a deliberate follow-up after this merges, not bundled into it** — it needs this outbox to exist first, the same way D27 needed SMS's. | Mail now; the matching pg-boss OTP retry (D27's mail half) is the next piece after this |
| D30 | **Decided 2026-10-09:** operator login with mandatory TOTP, built as its own account space (ADM-01, ADM-18, D8) | A new `control.operator_accounts`/`operator_backup_codes`/`operator_sessions` triple, structurally separate from `control.sessions` (whose `subscriber_id` is `NOT NULL`, tied to tenant sign-in) — a tenant credential cannot reach an operator route and vice versa, by construction, not by a runtime check. `otplib` (v13, the functional API) generates the TOTP secret and the `otpauth://` URI and verifies codes, with one time-step (±30s) of drift tolerance; the server never renders a QR image, only the secret and URI — rendering is a frontend concern for whenever the operator console's UI exists (deferred, see the UI-after-every-slice note). Every auth step (`signin`, `enroll`, `verify`) re-asserts email and password; there is no intermediate "pending enrollment" session to protect separately. Ten backup codes (10 random hex bytes each) are hashed with the same `PasswordHasher` (bcrypt, D2) used for the password itself, shown once at enrollment confirmation. The session cookie (`lytronix_operator_session`) is `SameSite=Strict` outright, not just SEC-14's Lax minimum — this console has no OAuth or payment redirect to accommodate — and its TTL is 12 hours, deliberately shorter than the tenant dashboard's 7 days (D1): a tighter default for the one account type that can reach every tenant's data, not a figure the SRS specifies. **Operator accounts are never created by a public endpoint.** `packages/db/src/create-operator.ts` is a reusable privileged CLI script, the same category as `migrate.ts`/`purge-activity-log.ts`: run with the schema-owner credential, never from the live app, which has no INSERT grant on `operator_accounts` at all (migration `0024_operator_login`). It covers both the solo operator now and operator #2+ later (OD-32) — no separate one-time "seed" script. **Break-glass recovery (ADM-18) is the same category of script**, not an API endpoint, matching its own wording ("a direct, logged database action") and SEC-10's break-glass framing: `packages/db/src/reset-operator-2fa.ts` nulls the 2FA enrollment, deletes the backup-code set, and writes one row to `control.platform_audit_log` — the audit log's first writer — all in one transaction. ADM-18's second half (a second operator's approval, once one exists) is not built: OD-32 keeps the platform solo-operator for now. | Operator login and break-glass now; the full operator-console feature set (ADM-02 to ADM-17) and the second-operator-approval half of ADM-18 are later work |
| D31 | **Decided 2026-10-09:** the dashboard's language choice persists per device, not per staff account (I18N-02, revised) | I18N-02 originally split the rule: the storefront persists a shopper's language choice per device (client-side), but the dashboard was to persist it per staff account — which needed a `language` column on `tenant.users` and an endpoint to read/write it, built for no other purpose. Revised so both surfaces use the same per-device rule: a staff user switching language on one device does not carry it to another, and a cleared browser starts back in Bangla, same as a shopper. Drops the need for that backend field and endpoint entirely — the toggle is client-side only (e.g. `localStorage`), same mechanism react-i18next would use for the storefront. | Dashboard and storefront now, identically |
| D11 | **Decided 2026-10-04:** closed shop response | A shop whose public side is offline answers 403 `tenant_offline` (SRS-detailed error table), with no shop data. Closed states are the lifecycle table states `read_only`, `locked`, `archived`, `deleted` (LIF-07), plus any suspended shop (LIF-24). The guard refuses with the standard error body. | Slice 2 |
| D32 | **Decided 2026-10-10:** dashboard shell architecture — one layout route, no new state library, mobile-first nav | Settled while planning slice 9's real build, after re-reading `docs/CODING-CONVENTIONS.md` §6a and re-exploring the `founderuplift` reference project's `apps/dashboard` and `packages/store`. Four pieces: **(1) One layout route does the session guard.** `routes/dashboard/` (§6a originally named this `_dashboard/`, a pathless layout group; corrected in D33 once building it showed that name collides with the root route's own path) wraps the dashboard home, staff, roles and activity screens behind a single guard; `create-shop`, `set-password` and `forgot-password` stay outside it as transitional auth-flow screens, not dashboard destinations. Slice 9's own early build had drifted from this — `create-shop`, `set-password` and the dashboard placeholder had each grown their own redundant `beforeLoad` session check — corrected as part of this slice rather than carried forward. `founderuplift`'s `PrivateGuard`, mounted once in its own single layout route with zero per-route guard code anywhere downstream, independently confirms this shape. **(2) No Redux/RTK Query adopted.** `founderuplift`'s `packages/store` is a cross-app RTK Query client shared between two separate apps (website, dashboard), with exactly one hand-written state slice — session/identity data — the same job already split between `tenant-session.ts` and TanStack Query here. Lytro has one admin app and no second consumer to share a client with, so adopting it would mean a second, mostly-idle caching layer next to TanStack Query. Rejected. What's adopted instead, store-free: a flat `permission: string` field on each nav item, filtered client-side by `.includes()` against the signed-in staff member's permission list (mirrors `founderuplift`'s `app-sidebar.tsx`, and matches STF-10/11's existing server-side permission model) — no hierarchy logic, no server round-trip at render time. **(3) Sidebar nav rejected for the primary (mobile) breakpoint.** `founderuplift` uses a full collapsible sidebar (shadcn/ui `Sidebar`) — the right call for a desktop-first admin tool, which is what it is. Lytro's tenants are explicitly mobile users (restated throughout this phase's planning), so a collapsible sidebar is the wrong primitive here: a bottom tab bar for phones (sm and below), a simple top bar from the `sm` breakpoint up — the same mobile-full-bleed/desktop-card split `AuthCard` already established for the auth screens. **(4) `api/<domain>/` hooks, matching §6a, not inline calls.** The early auth build called `tenantSession.client.post(...)` directly inline in each view rather than through a dedicated `api/auth/` hooks layer as §6a specifies; slice 9 introduces `api/staff/` and `api/roles/` as TanStack Query hook files from the start, and retrofits the existing auth views onto an `api/auth/` layer at the same time, rather than compounding the drift into the new screens too. | Slice 9 |
| D33 | **Decided 2026-10-10:** SOLID/DRY and named frontend patterns for the dashboard shell, written up in full in `ENGINEERING-STANDARDS.md` §2a/§3a | Requested explicitly while planning the shell's component breakdown, rather than left implicit the way the rest of `apps/admin` had been built so far. Corrects `routes/_dashboard/`'s naming from D32/§6a to `routes/dashboard/` (a regular directory with a `route.tsx` layout file) — building it showed a pathless layout group collides with the root route's own path, something neither D32 nor §6a had been checked against before being written. Adds: a `hooks/` directory for generic, non-API-specific hooks (`use-document-title.ts`), distinct from `api/<domain>/`'s server-state hooks the same way the server's `ports/` are distinct from its `services/`; a container/presentational split for the shell (`dashboard-shell.tsx` fetches and sets side effects, `top-bar.tsx`/`bottom-nav.tsx`/`brand-mark.tsx`/`powered-by-mark.tsx` only render props); and an explicit decision to keep `TopBar` and `BottomNav` as two separate components reading one shared `nav-items.ts` array, rather than one polymorphic component with a `variant` prop — their markup differs enough that unifying them would relocate the branching rather than remove it (ENGINEERING-STANDARDS.md §4's own DRY boundary, applied here). `BrandMark` is extracted out of `AuthCard` (where it had been a private inline function) into `components/layout/`, since the shell needs the identical mark and a second copy would be exactly the drift this decision is about preventing. | Slice 9, and every `apps/admin` component built after it |
| D34 | **Decided 2026-10-10:** dashboard nav redesign — adopts Lytronix's own shipped dashboard UI/UX (reverses D32 point 3) | Built per D32, then rejected by direct user feedback against both breakpoints ("I don't like the dashboard nav in desktop and mobile screen — please refer to Lytronix's dashboard"), followed by two further explicit instructions in the same review: use Lytronix's actual color scheme (reversing the earlier "Lytro gets a brand-new identity, not Lytronix's palette" stance — an explicit, confirmed change of direction, not a drift), and follow Lytronix's UI/UX for both breakpoints, not just its structure. Four changes from D32: **(1) Desktop gets Lytronix's real sidebar back**, not the bottom-tab-only call D32 point 3 made — a fixed-left, dark-surface (`--color-sidebar`/`-alt`/`-line`, Lytronix's own `#0A0B08`/`#16180F`) nav list, active item solid `brand-600`, with language toggle, avatar and sign-out grouped at the bottom, mirroring Lytronix's `Sidebar.jsx` structure (not file-for-file, since Lytro has four destinations against Lytronix's ten-plus, but the same surface/placement). **(2) Brand palette is now Lytronix's own**, not Lytro's invented teal: `index.css`'s `--color-brand-*`/`--color-accent-*` ramp is re-anchored on Lytronix's real tokens (`brand-600` = `#4A7D1E`, `brand-700` = `#3A6216`, `brand-500` = `#76C043` — its literal logo green — `accent-500` = `#D97706`). **(3) Mobile's account actions move into a bottom sheet**, not a header dropdown — a fifth BottomNav tab (`AccountSheet`) opens a slide-up panel (drag handle, shop identity, language toggle, sign-out), matching Lytronix's own `MoreSheet` pattern for anything that isn't direct page navigation; Lytro's four real nav items still render as direct tabs since they fit without needing Lytronix's overflow-into-More reason. **(4) `LanguageToggle` matches Lytronix's actual vocabulary** — a single click-to-flip pill (`EN / বাংলা`, a language glyph icon, a `title` tooltip reading "বাংলায় দেখুন"/"Switch to English"), not Lytro's earlier two-segment selector, taken directly from Lytronix's own `LanguageToggle.jsx`; `document.documentElement.lang` is now kept in sync with the active language too, matching Lytronix's `LanguageContext`. | Slice 9, supersedes D32 point 3 |

---

## 3. Architecture for this phase

Follows `ENGINEERING-STANDARDS.md` §1 (modular monolith): each module owns its tables and is reached only through its service.

**Modules in `apps/server/src`:**

| Module | Owns | Responsibility |
|---|---|---|
| `identity` | `control.subscribers`, `control.subscriber_identities` | Sign-up verification, identities, sign-in, sessions, passwords, OTP |
| `tenancy` | `control.tenants`, `control.tenant_domains`, slug rules | Tenant creation, slug generation, host resolution, reserved names |
| `staff` | `tenant.users`, `tenant.roles`, `tenant.user_roles` | Staff accounts, roles, permission checks, seat limit |
| `audit` | `tenant.activity_log`, `control.platform_audit_log` (already exists) | Writing and reading audit entries |
| `operator` | `control.operator_accounts`, `control.operator_backup_codes` | Operator login with TOTP |
| `messaging` (stub) | `tenant.sms_log` | Records sent messages; real providers plug in behind the same interface |

**Request pipeline for every tenant-scoped endpoint, in order:**

1. Resolve the tenant from the host name (TEN-24). Nothing else selects the tenant.
2. Reject if the host and the session's tenant differ (TEN-28).
3. Authenticate the session or API key.
4. Check the required permission (STF-11).
5. Open a transaction and set `app.tenant_id` for it (DAT-03).
6. Run the business logic, then write the audit entry in the same transaction (AUD-01).

Steps 1 to 5 live in shared guards and decorators, so no controller repeats them (ENGINEERING §3, decorator pattern).

**Decided 2026-10-04: packages and layers.**

- **`packages/db` (`@lytronix/db`)** holds the database layer: the connection factory, the migration runner, the drizzle-kit configuration and migrations, the schema split by area (`schema/shared.ts`, `schema/control/{platform,identity,tenancy,plans,sessions,signup}.ts`, `schema/tenant/{staff,audit}.ts`), and the database tests. Repositories are **not** in this package.
- **Repositories live in `packages/db/src/repositories/<module>/`**, grouped by module, the compromise chosen in the discussion. A lint rule stops a module's services from importing another module's repository folder. Repositories return table row types only, so the package never depends on the server.
- **`packages/validators` (`@lytronix/validators`)** holds the Zod schemas, the single source for every request shape. DTO classes are created with `createZodDto(schema)`, so no shape is written twice. Validation rules use Zod only. Business rules stay in services.
- **Server module folders** are domain-grouped with layer folders inside each one: `controllers/`, `dto/`, `services/`. No repository folder in the server.
- **Dependency rules, enforced by lint (`import/no-cycle`):** `validators` and `shared-types` import no internal package. `db` imports only `validators`. The server imports `db`, `validators` and `shared-types`. Apps never import `db` directly.
- **OpenAPI** is generated from the Zod schemas, not from decorators. API-15 is read accordingly.
- **Owner password** lives on `control.subscribers.password_hash`. `tenant.users.password_hash` is null for the owner row and set only for staff.
- **SMS delivery never blocks a request (SMS-18).** Messages are recorded in the same transaction as the change that caused them, sent after commit, and retried by a worker with backoff (1, 5, 15, 60 minutes; five attempts; then `failed` and a logged alert). A one-time code is sent during its request, its text is never stored, and a failed send is reported, because no code arrived.
- **The SMS retry worker is the first background job.** The outbox holds platform-level messages, with no tenant data, so the job reads no tenant tables. P1-I04 becomes binding when a tenant-scoped message joins the outbox; that change must add the isolation case.
- **Sessions** are `control.sessions`, in their own file, since they depend on identity and tenancy (no cycle, because nothing imports them).

---

## 4. Database work

Migrations are generated from the Drizzle schema and reviewed before they run (DAT-04). Each slice adds its own migration.

**Tables added in Phase 1:**

- `control.subscribers`, `control.subscriber_identities` (DATABASE-SCHEMA §2.1)
- `control.tenants` (§2.2): the table already exists in the schema design but has no migration yet. Add its columns, including `kyc_status`.
- `control.tenant_domains` (§2.2), for custom domains. Phase 1 creates the table; custom domain behaviour comes with Growth and Pro, in a later phase.
- `control.plans` (minimal, per D3): Trial and Starter rows with their limits as data.
- `tenant.users`, `tenant.roles`, `tenant.user_roles` (§3.1)
- `tenant.activity_log` (§3.5)
- `control.operator_accounts`, `control.operator_backup_codes` (§11)
- `control.identity_verifications` already exists in the design (§15) but is needed only for KYC, a later phase.

**Row-level security:**

- Enabled on every `tenant.*` table, with the policy `tenant_id = tenant.current_tenant_id()` (the helper already exists in the bootstrap migration).
- Two database roles: a migration role that owns the schema and runs migrations, and an application role with no `BYPASSRLS`, which receives only the privileges the app needs.
- The activity log and the platform audit log are insert-only for the application role (DAT-10). The audit log already has a trigger that blocks updates and deletes; the activity log gets the same treatment in its migration.

**Indexes:** every tenant table has `tenant_id` as its leading index column (ENGINEERING §5).

---

## 5. API surface for this phase

From `API-CONTRACT.md`:

- **Auth and onboarding (§2):** `auth/phone/code`, `auth/phone/verify` (sign-up and sign-in, D12), `auth/signin` (password), `shops` (create-shop step), `auth/forgot-password`, `auth/forgot-password/verify`, `auth/oauth/*` (slice 6), `auth/signout`, `auth/password`, `me`, `me/identities` (add, remove).
- **Staff and roles (§3):** `staff` (list, create, update), `roles` (list, create, delete).
- **Operator (§9, partial):** operator sign-in and TOTP enrolment only. Tenant management endpoints come in Phase 8.
- **Shared rules:** every error uses the standard body (SRS §2.6); every write accepts `Idempotency-Key` where it creates something (API-11); every response carries `X-Request-Id` (API-27).

Endpoints that depend on later phases (billing, orders, storefront) are not built in Phase 1.

---

## 6. Slices

Each slice is one branch and one pull request. CI must pass before merge. Branches stay after merge (the team rule from now on). Slices are sequential where marked, and parallel otherwise.

### Slice 1: identity and tenancy schema
- **Branch:** `feat/identity-schema`
- **Delivers:** migrations for the tables in §4; RLS policies; migration and application database roles; the insert-only activity log.
- **Requirements:** TEN-01, TEN-02, DAT-02, DAT-03, DAT-10, AUTH-08 (uniqueness constraints), TEN-15 (one tenant per owner identity).
- **Done when:** a migration applies cleanly to an empty database; a query without tenant context returns no rows from any tenant table; an update to the activity log is refused.

### Slice 2: tenant resolver and slugs
- **Branch:** `feat/tenant-resolver`
- **Depends on:** slice 1, decision D4 and D5.
- **Delivers:** host normalisation; subdomain lookup; custom domain lookup (structure only); reserved slug list stored as data; slug suggestion from the shop name's Latin letters, with format, reserved-name and availability checks on the owner's chosen address (AUTH-11); numeric suffix suggestions; a process-memory lookup cache with a 60-second lifetime and invalidation.
- **Requirements:** TEN-24, TEN-25, TEN-26, TEN-27, TEN-28, AUTH-11, TEN-19 (slug immutable).
- **Done when:** an unknown host returns the generic not-found page before any auth code runs; a request with a forged `tenant_id` parameter changes nothing; "Admin" gets `admin-2`; renaming a shop does not change its slug.

### Slice 3: isolation test suite
- **Branch:** `test/isolation-suite`
- **Depends on:** slices 1 and 2.
- **Delivers:** a test harness that creates two tenants with overlapping data and calls every resource endpoint with the other tenant's IDs. Runs in CI.
- **Requirements:** SEC-02, TEN-03, TEN-04, TEN-05, TEN-06.
- **Done when:** every endpoint existing at that point returns `not_found`, and the suite fails if a new endpoint is added without an isolation case.

Slice 3 comes before any tenant-scoped endpoint is written, so each later endpoint is covered as it's added.

**Decisions (2026-10-04):**
- **Registry:** a central case registry (`apps/server/test/isolation/registry.ts`) is compared with the routes the application registers. A shop-owned route without a case fails the suite, and so does a case whose route no longer exists.
- **Status for another shop's ID:** `not_found` everywhere, including writes. `forbidden` is reserved for a shop's own staff lacking a permission, decided in a later slice.
- **P1-I04 (background jobs):** deferred. Phase 1 has no jobs. The first job's pull request must add its isolation case, and this item is required before any job ships.

### Slice 4: sign-up by phone
- **Branch:** `feat/signup-phone`
- **Depends on:** slices 2 and 3; decisions D3 and D6.
- **Delivers:** Bangladeshi phone validation with normalisation; OTP generation, storage as a hash, expiry, single use; the wrong-code lock; resend cooldown and hourly cap; subscriber, owner user and trial tenant created in one transaction; the trial plan from the seeded `control.plans`; the "shop ready" message through the stub.
- **Requirements:** AUTH-01, AUTH-02, AUTH-04, AUTH-05, AUTH-06, AUTH-07, AUTH-09, AUTH-10, AUTH-21, SMS-18, TRL-01, TRL-02, TRL-05 (counter starts), TEN-15.
- **Done when:** a new phone signs up end to end; a sixth wrong code is refused even when correct; a second resend within 60 seconds is refused with a retry hint; the trial is created with the trial limits; the shop-ready stub message contains the live URL.

**Decisions (2026-10-04):**
- **Phone only** in this slice. Email and Google/Facebook follow in a later slice.
- **Codes are stored as a keyed hash** (HMAC-SHA256 with `OTP_SECRET`, bound to the phone number), not bcrypt.
- **No device or IP trial limit** in this slice. One trial per verified phone is enforced by the unique phone identity (AUTH-08).
- **Sign-up asks for no password.** The owner sets one later from account settings (AUTH-01, AUTH-03 amended). Until then sign-in is by one-time code (slice 5).
- **After sign-up** the owner sees the "shop ready" message and is sent to sign in; sessions belong to slice 5.
- **Superseded by D12 in slice 5:** the single `signup/phone/complete` request that verifies the code and creates the shop together is split into a verify-phone step and a separate create-shop step, and the create-shop step can be reached after any sign-in method.
- **Lock belongs to the number:** a locked number cannot request a new code until the lock ends, so a lock cannot be reset by asking for a fresh code.

### Slice 5: phone sign-in, sessions and stepped onboarding
- **Branch:** `feat/signin-sessions`
- **Depends on:** slice 4; decisions D1, D2, D12 and D13.
- **Delivers:** the three-button entry screen (phone, Google, Facebook); code sign-in and password sign-in; the create-shop step; the one-time set-password offer; sessions on three host kinds (D13) with `tenant_id` nullable until the shop is created; forgot-password with a dedicated reset code that produces a `must_set_password` session (AUTH-17, AUTH-18); the `must_set_password` block on all dashboard routes (AUTH-19); change-password that requires the current password or a recent code (AUTH-20); lockout counting wrong codes and wrong passwords together; expiry at seven days, sign-out, and revocation; a CSRF token on every state-changing request; sign-in by lifecycle state. Two code kinds in the challenges table: `signin` and `reset`.
- **Requirements:** AUTH-01, AUTH-03, AUTH-10, AUTH-12 to AUTH-23, AUTH-28, SEC-07, SEC-14. AUTH-19 (staff case) moves to slice 7 with STF-13; the forgot-password case of AUTH-19 is built here.
- **Done when:** a new number reaches the dashboard through the three steps; a returning user signs in with a password; forgot-password sends a reset code and the must_set_password screen blocks the dashboard until a new password is saved; the password sign-in response is byte-identical for an unknown phone, an account with no password and a wrong password; the sixth failed attempt is throttled; a signed-out session is refused; a session from one host is refused on any other host; signing in on the platform host gives a dashboard scoped to the right tenant; a staff sign-in in `locked` returns `tenant_offline`.

### Slice 6: email, Google and Facebook sign-up, multiple identities
- **Branch:** `feat/identities-oauth`
- **Depends on:** slice 5; decision D7.
- **Delivers:** email verification by code; OAuth start and callback for Google and Facebook, with the provider's account ID as the identity; adding a second or third identity, each checked for uniqueness; refusing removal of the last identity; recovery paths by identity kind; the Facebook-only notice at sign-up.
- **Requirements:** AUTH-08, AUTH-24, AUTH-25 (withdrawn, so it must not be enforced), AUTH-26, AUTH-27.
- **Done when:** a Google account signs in to the same subscriber on repeat sign-in; the same person can hold a phone tenant, an email tenant and a Facebook tenant as separate tenants (TEN-15); a Facebook-only account sees the recovery notice.
- **Risk:** the OAuth provider registrations are external. If they aren't ready, this slice closes with the OAuth methods disabled and their tests marked as pending, not deleted.

### Slice 7: staff and roles
- **Branch:** `feat/staff-roles`
- **Depends on:** slice 5, decision D3 and D9.
- **Delivers:** staff creation by the owner with a phone and password; roles built from the permission list; permission checks on every endpoint; seat limit counting the owner plus active staff; deactivation that ends sessions at once; reactivation that re-checks the seat limit; the owner role that can never be changed or removed; owner password reset for staff, which forces a change at next sign-in.
- **Requirements:** STF-01 to STF-14, AUTH-19.
- **Done when:** the Trial's second staff member is refused with `plan_limit_reached`; a permission removed mid-session applies on the next request; a role in use cannot be deleted; a deactivated user's session ends immediately.

### Slice 8: activity log
- **Branch:** `feat/activity-log`
- **Depends on:** slices 5 and 7 (the events come from them).
- **Delivers:** a writer used by every identity and staff event; the Activity page API with filters for date range, actor and action; retention purge by a scheduled job; operator actions shown with "Platform support" as the actor.
- **Requirements:** AUD-01 to AUD-08, LIF-25 (state transitions audit, the writer exists here for later use).
- **Done when:** each listed action produces exactly one entry; no entry contains a password, OTP or key; a user without `audit:read` gets 403; a tenant never sees another tenant's entries.

### Slice 9: dashboard shell
- **Branch:** in practice split across three, each its own PR rather than one large branch: `feat/dashboard-shell` (router/query/i18n/API-client architecture, merged), `feat/tenant-auth-ui` (sign-up, sign-in, create-shop, set-password, forgot-password, PWA install — in progress), and a further branch for the nav/branding/staff/roles piece described below (not started).
- **Depends on:** slices 4 to 7 (the API it calls).
- **Delivers:** sign-up, sign-in, change-password and staff screens in `apps/admin`; the tenant name, tab title and logo in the navigation (a placeholder logo until the owner uploads one); the "Powered by" mark; Bangla by default with an English toggle that changes every visible label; the language choice saved per device, client-side (I18N-02, D31 — not per staff account). The nav/staff/roles piece follows D32's architecture: one `routes/_dashboard/` layout route gates staff/roles/activity/the dashboard home behind a single session check; a mobile bottom-tab-bar nav (a desktop-style collapsible sidebar was considered and rejected, D32); nav items filtered by a flat permission-string check, no new state library.
- **Requirements:** TEN-16, TEN-18, I18N-01, I18N-02, plus the screens for AUTH and STF flows.
- **Done when:** a new session opens in Bangla; the toggle changes every label; two tenants' dashboards show different names in the same browser without a refresh.
- **Note:** PWA install per tenant (TEN-17) is in scope but is verified in the browser at the end of the phase, since it needs the built app.

### Slice 10: operator login with two-factor
- **Branch:** `feat/operator-login`
- **Depends on:** slice 1; decision D8.
- **Delivers:** operator accounts separate from subscribers; TOTP enrolment that shows the QR code and secret once and requires one valid code to confirm; ten single-use backup codes; mandatory two-factor for every operator, with no toggle; break-glass recovery as a logged database action.
- **Requirements:** ADM-01, ADM-18, SEC-10 (break-glass part), SEC-14 for the operator session.
- **Done when:** a tenant credential cannot sign in to the console; an unconfirmed operator cannot use the account; a backup code works once.

### Slice 11: marketing landing page
- **Branch:** `feat/marketing-landing`
- **Depends on:** nothing — no API calls beyond linking to slice 9's sign-up route, which only needs to exist as a URL, not be deployed first. Runs in parallel with slice 9, not after it.
- **Requirements:** none from the SRS — this slice has no requirement ID anywhere in `SRS-detailed.md`, because a public marketing site for Lytro itself was never speced; it surfaced only while planning slice 9's UI (see `docs/DEPLOYMENT.md` for the hosting/routing decisions it depends on). Added here so it has the same tracked, scoped shape as every other piece of work, not because an existing requirement demanded it.
- **Delivers:** `apps/website` (Next.js, new app — see `docs/DEPLOYMENT.md` §7/§8 for why Next.js and how it's hosted): a mobile-first, content-populated landing page — hero, features, pricing information (descriptive only; no live plan data, since the purchase flow itself is Phase 2, D3) — a "Create your shop" call to action linking to the tenant sign-up route, aimed specifically at a manual seller (someone currently selling without a storefront) deciding whether to sign up at all, not at an existing tenant.
- **Done when:** every page renders correctly at a phone viewport width with no horizontal scroll; the call to action reaches the sign-up route; no plan price or figure is hard-coded as if purchasable today.

---

## 7. Order and parallel work

```
1 schema ──► 2 resolver ──► 3 isolation ──► 4 sign-up ──► 5 sign-in ──┬──► 6 identities
                                                              │        ├──► 7 staff ──► 8 activity
                                                              │        │
1 schema ───────────────────────────────────────────────────────────────┴──► 10 operator login
                                                                                  
                                                                       5,7,8 ──► 9 dashboard shell

11 marketing landing (no dependency — runs in parallel with everything above)
```

- Slices 6, 7 and 10 can run in parallel once their dependencies are merged.
- Slice 9 waits until the APIs it calls exist, so it comes after 7 and 8.
- Slice 11 depends on nothing in this list and can start, or finish, at any point.
- If time is short, the first milestone is slices 1 to 5 plus 9. That gives sign-up and sign-in with a usable dashboard.

---

## 8. Non-functional requirements for this phase

- **Rate limits:** OTP per phone, per IP and per tenant (SMS-11); sign-in per account (AUTH-14); sign-up per IP per hour (SUP-08). The in-process limiter is used now; Redis replaces it when it's added to compose (RED-02).
- **Security:** parameterised queries only (SEC-03); no secrets in logs (LOG-02); no stack traces in responses (SEC-16); cookies scoped to the exact host (TEN-29); CSRF token on state-changing requests (SEC-14).
- **Performance:** host resolution adds negligible time because of the cache (TEN-27); sign-in under 500 ms at the local scale.
- **Localisation:** error messages use the `message` field, localised; `code` stays English (SRS §2.6).

---

## 9. Risks

| Risk | Effect | Mitigation |
|---|---|---|
| Plans table pulled into Phase 1 (D3) | Phase 2 billing has to build on it | The table only holds limits; billing rules come later |
| OAuth registrations not ready (D7) | Slice 6 blocked | Close the slice with methods disabled; tests kept as pending |
| Brand or domain changes (D5) | Subdomain logic affected | Domain is configuration, not code |
| Row-level security misconfigured | Cross-tenant leak | Isolation suite (slice 3) before any tenant endpoint exists |
| Cookie scoping mistakes | Session shared between tenants | Test with two `*.localhost` hosts (S01-08) |
| Code sign-in after a password is set (D12) | Whoever holds the phone, for example after a SIM swap, can sign in | Same exposure as sign-up already has; revisit with a second factor when paying tenants exist |
| Codes are platform cost (AUTH-21) | Each code sign-in is an SMS the platform pays for | Seven-day sessions keep sign-ins rare; the hourly cap (AUTH-07) bounds abuse; watch the SMS spend |
| Single-person review | Mistakes pass unnoticed | Pull request checklist, CI, and the isolation suite as an automatic reviewer |

---

## 10. Definition of done (per slice)

1. Requirements listed for the slice have passing automated tests named after their IDs.
2. Migrations reviewed; the previous release still works against the new schema (DAT-04).
3. `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build` pass locally and in CI.
4. The pull request template checklist is completed.
5. No new endpoint is merged without an isolation test case.
6. Activity log entries exist for every auditable action in the slice.
