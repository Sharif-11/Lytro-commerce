# Phase 1 test plan: identity and tenancy

Status: draft for discussion, 2026-10-03. Companion to `PHASE-1-PLAN.md`. The scenario-level suites S01 to S12 in `TEST-PLAN.md` are the wider plan; this document is the detailed plan for Phase 1 and uses the same ID style (`P1-…`).

---

## 1. Test layers

| Layer | What it proves | Tool (proposed) | Runs |
|---|---|---|---|
| **Unit** | One service's logic with fake repositories (for example OTP expiry, slug suffixes, phone normalisation) | Vitest | Every save; every CI run |
| **Integration** | A service with real Postgres: constraints, RLS, triggers, transactions | Vitest with the Docker Postgres | Every CI run |
| **API** | HTTP contract: status codes, error bodies, headers, rate-limit responses | Vitest + supertest against the running server | Every CI run |
| **Isolation** | Two tenants with overlapping data; every resource endpoint called with the other tenant's IDs | Custom suite (slice 3) | Every CI run; blocks merge |
| **End-to-end (E2E)** | A real browser through the dashboard, against the full stack | Playwright (proposed) | Every CI run once the dashboard exists; full set before phase exit |
| **Manual checks** | Things a test can't see: PWA install, visual language, real SMS delivery | Checklist with recorded result | Before phase exit only |

**Blocking rule:** the isolation suite and the API suite must pass for a pull request to merge. E2E failures block merge once the scenario exists.

---

## 2. Environment

- **Database:** the Docker Postgres from `docker-compose.yml` (port 5433). Each test run creates its own database, applies migrations, and drops it afterwards, so tests never share state.
- **Hosts:** two tenants at `alpha.localhost` and `beta.localhost` (per D4), each on its own port through the dev server. In CI, the same names are mapped to `127.0.0.1` through the runner's hosts file.
- **Providers:** the SMS and email stub (per D6) records every message in a test-visible store. Tests read the OTP from that store, never from a real phone.
- **Clock:** a controllable clock for expiry tests (OTP 5 minutes, sessions 7 days, lockouts 15 minutes, the 10-minute window for setting a password after a code sign-in). The clock is available only in test and development builds.
- **Fixtures:** two tenants seeded with overlapping data: the same staff phone numbers excluded (they must be unique), but identical shop names, identical role names, and identical order-style IDs where they exist.

---

## 3. Scenarios

Each scenario lists its preconditions, numbered steps, expected result, and the requirement IDs it covers. Layer tags: **[API]**, **[E2E]**, **[INT]** (integration), **[ISO]** (isolation).

### A. Sign-up and tenancy

**P1-E01 Stepped phone onboarding creates a working trial. [E2E]**
- Preconditions: a phone number not registered; the stub store is empty.
- Steps:
  1. Open "continue with phone" on the platform host. Enter phone `01711111111`. Submit.
  2. Read the OTP from the stub store. Enter it within five minutes. The create-shop step opens.
  3. Enter a shop name, owner name and the address `gamma`. Submit.
  4. The set-password offer opens. Skip it.
  5. Land on the dashboard at `gamma.localhost/admin`.
- Expected: after step 2 a subscriber and a verified phone exist, with no tenant; after step 3 the owner user and the tenant in `trial` exist with the subdomain `gamma`; the dashboard shows trial limits (40 handled orders, 20 products, 1 seat, 200 MB, 5 GB, 8 essential SMS) and a setup checklist; the stub store holds one "shop ready" message with the live URL; the essential counter reads 1 of 8, because the code is platform cost; the account has no password.
- Covers: AUTH-01, AUTH-04, AUTH-05, AUTH-10, AUTH-12, AUTH-21, AUTH-28, TRL-01, TRL-03, SMS-18, TRL-08.

**P1-E02 Phone format and required fields are validated. [API]**
- Steps: at the code step submit `+8801711111111`, `0171111` and `02123456789`; at the create-shop step submit a 60-character-plus shop name and an empty owner name.
- Expected: `+88…` is stored as `01711111111`; the other phone numbers and the empty owner name are refused with `validation_error` and field details; nothing is created.
- Covers: AUTH-01, AUTH-02.

**P1-E03 OTP lifecycle. [API]**
- Steps: request a code; enter a wrong code five times; try the correct code; request a resend twice within 60 seconds; request six resends within an hour; let a code expire and try it.
- Expected: the sixth attempt returns `rate_limited` for 15 minutes even with the correct code; the second resend within 60 seconds returns `rate_limited` with `Retry-After`; the sixth hourly resend is refused; an expired code is refused; a used code cannot be reused.
- Covers: AUTH-05, AUTH-06, AUTH-07, SMS-11.

**P1-E04 Identity uniqueness and channel independence. [API]**
- Steps: register a phone; verify the same phone again; create a tenant with an email; create a tenant with a Facebook account; try the create-shop step a second time from the first phone.
- Expected: verifying the same phone again signs in to the same subscriber and creates no second one, and the reply reveals nothing a new number would not get; the three channels each create a separate tenant; the second create-shop from the same phone is refused with `conflict`.
- Covers: AUTH-08, TEN-15, OD-53.

**P1-E05 Subdomain assignment and reserved names. [API]**
- Steps: sign up shops named "Fashion House" twice and "Admin" once; check the subdomains shown before sign-up completes; try to claim `www` and `api` directly.
- Expected: `fashion-house` and `fashion-house-2`; "Admin" gets `admin-2`; `www` and `api` are never issued; the slug never changes when the shop is renamed.
- Covers: AUTH-11, TEN-19, TEN-26.

**P1-E06 Unknown and reserved hosts resolve to nothing. [API]**
- Steps: request `unknown.localhost`; request an unknown host with a forged `tenant_id` query parameter pointing at a real tenant; request a host with a forged `X-Tenant` header.
- Expected: each returns the generic not-found page; no tenant data; no fallback to a default tenant.
- Covers: TEN-24, TEN-25.

**P1-E07 Session cookie is scoped to its exact host. [E2E]**
- Steps: sign in on `alpha.localhost`; inspect the cookie's domain; open `beta.localhost` in the same browser.
- Expected: the cookie's domain is `alpha.localhost` exactly, with no parent domain; the request to `beta.localhost` carries no cookie; `beta.localhost` shows the sign-in page.
- Covers: TEN-29, SEC-14.

**P1-E08 A session from one tenant is refused on another tenant's host. [API]**
- Steps: obtain a session on tenant alpha; send it to tenant beta's API host.
- Expected: `403`; the response leaks nothing about the other tenant.
- Covers: TEN-28.

**P1-E09 Requests that bypass the edge are refused. [API]**
- Steps: send a request straight to the origin with a forged `Host` header, bypassing the trusted edge (simulated with a configuration flag that marks the request as untrusted).
- Expected: refused before any tenant lookup; logged.
- Covers: TEN-28.

### B. Sign-in, sessions and recovery

**P1-E10 Sign-in and identical errors. [API]**
- Steps: request a code for a known and an unknown phone and compare the replies; sign in a known phone by code; set a password; sign in with it; sign in by code again; try password sign-in with an unknown phone, with an account that has no password, and with a wrong password; compare the three failed responses, including timing.
- Expected: the two code replies are identical; code sign-in works before and after the password is set; the right password returns a session; the three failures are byte-identical in body and status, with timing in the same band.
- Covers: AUTH-12, AUTH-13.

**P1-E11 Lockout. [API]**
- Steps: fail five times in fifteen minutes on one account, mixing wrong passwords and wrong codes; attempt a sixth with the correct password, then with a correct code; wait for the lock to pass; attempt again.
- Expected: the sixth attempt returns `rate_limited`, even with the right password or code; after the window, the correct password works.
- Covers: AUTH-14.

**P1-E12 Session lifetime and sign-out. [API]**
- Steps: sign in; sign out; replay the old session; sign in again; advance the clock seven days; replay the session.
- Expected: the replayed session after sign-out returns `unauthenticated`; the session after seven days returns `unauthenticated`.
- Covers: AUTH-15, AUTH-16.

**P1-E13 Forgot-password flow. [E2E]**
- Preconditions: an owner with a password and a second open session.
- Steps: on Screen 2B click "Forgot password?"; submit an existing phone and an unknown phone — compare responses; submit the existing phone a second time within 2 minutes; enter the reset code; check the dashboard is blocked; enter a wrong current password on the password screen; save a new password.
- Expected: the two responses are identical; the second request within 2 minutes is accepted with no second SMS; the dashboard returns `forbidden` until the password is saved; a wrong current password is rejected; the new password is accepted; other sessions return `unauthenticated`; the old password stops working.
- Covers: AUTH-17, AUTH-18, AUTH-19, AUTH-20.

**P1-E14 A staff password set by the owner forces a change. [E2E]** (slice 7, AUTH-19 staff case)
- Steps: the owner resets a staff member's password; the staff member signs in with it; tries to open the staff page and the sign-out route; changes the password.
- Expected: every route except change-password is refused until the change; afterwards the dashboard works.
- Covers: AUTH-19, STF-13.

**P1-E15 Password rules. [API]**
- Steps: a seven-character password; an eight-character password; a twenty-character password; a twenty-one-character password; a Google-created account.
- Expected: seven and twenty-one characters refused; eight and twenty accepted; the Google account is not asked for a password.
- Covers: AUTH-03, AUTH-24.

**P1-E16 Sign-in by lifecycle state. [INT]**
- Preconditions: tenants in `trial`, `active` and `grace` (simulated by setting the state directly in the test database).
- Steps: staff and owner sign in under each state.
- Expected: staff and owner can sign in during `active`, `grace`. Staff in a later state receives `tenant_offline`. An owner of a `locked` or `archived` shop gets `next: renewal`; a `deleted` shop gets `next: purchase`; a suspended shop gets `next: unavailable`. The owner can still call `/me` in those states.
- Covers: AUTH-22, partially. The full lifecycle set is covered in Phase 2.

**P1-E33 Three-host dashboard access and onboarding resume. [API]**
- Steps: verify a new phone on the platform host and stop; sign in again — check `next`; create the shop on the platform host; confirm the dashboard loads there; sign in directly on the shop subdomain and confirm the same dashboard; send the platform-host session to the shop subdomain and vice versa; sign in again after the set-password offer was seen.
- Expected: the second sign-in on the platform host returns `next: create-shop`; the dashboard loads on the platform host after shop creation; signing in on the subdomain also gives the dashboard; a session from one host is refused on any other host with `forbidden`; the set-password offer is not shown again.
- Covers: AUTH-10, AUTH-28, TEN-28, TEN-29, D13.

**P1-E34 The trusted edge guards every route except health. [API]**
- Steps: with the edge secret configured, call a sign-in route with no edge header; call it again with the header; call `/health` with no header.
- Expected: the first call returns 403 `forbidden`; the second succeeds; `/health` answers 200.
- Covers: R3, R6, D14.

**P1-E35 The client address comes from the edge header only with the edge secret. [API]**
- Steps: with the edge secret configured, send a sign-in with an `X-Forwarded-For` value through a single trusted proxy (one hop) and the edge header; fail one verification and then sign in correctly.
- Expected: the failed attempt is recorded with the forwarded address, and so is the new session. A sign-in request without the edge header is refused with 403, so it never reaches the address logic; the forwarded value is ignored without a valid secret (unit test).
- Automated: `test/edge.e2e.spec.ts` (recorded addresses) and `test/client-ip.spec.ts` (ignored without the secret).
- Covers: D14, AUTH-14.

**P1-E36 Google and Facebook sign-in against fake providers. [API]**
- Steps: list the providers; start a Google sign-in and return with a fresh code; repeat it with the same account; replay the state; start with one provider and return to the other; sign in with a Facebook account that shares no email.
- Expected: the list shows both providers when switched on; a new account has no password and reaches create-shop; the same account signs back into the same subscriber; a replayed or foreign state is refused with 400; the Facebook account without email gets `recovery: facebook-only` once.
- Covers: AUTH-24, AUTH-27, D19.

**P1-E37 Sign-in methods on an account. [E2E]**
- Steps: sign up by email; list identities; try to remove the only one; add a verified phone by code; try a number another account holds; remove the phone again.
- Expected: the last identity cannot be removed (409); a held number is refused (409); a wrong code shows the attempts left; removal of another account's identity answers 404.
- Covers: AUTH-08, AUTH-26.

### C. Other identities

**P1-E17 Google sign-up and repeat sign-in. [E2E]**
- Preconditions: a Google test account; provider registration done (D7). If not, this scenario is marked pending.
- Steps: sign up with Google; sign out; sign in with the same Google account.
- Expected: no password asked; the second sign-in reaches the same subscriber.
- Covers: AUTH-24.

**P1-E18 Add and remove identities. [API]**
- Steps: on a phone-only account, add a verified email that is not registered; try to add an email already registered elsewhere; try to remove the phone (the only identity) before adding the email; remove the email after adding it.
- Expected: the first add succeeds; the duplicate is refused; removing the only identity is refused; with two identities, removing one succeeds.
- Covers: AUTH-08, AUTH-26.

**P1-E19 Recovery by identity kind. [E2E]**
- Steps: recover a phone-only account by SMS; an email-only account by email; create a Facebook-only account without an email grant.
- Expected: the phone account receives the SMS; the email account receives the email; the Facebook-only account sees the plain notice at sign-up that Facebook is its only way back.
- Covers: AUTH-27.

### D. Staff and roles

**P1-E20 Staff seat limit on trial. [API]**
- Steps: on the trial tenant (one seat for the owner), try to create a staff member.
- Expected: `plan_limit_reached` with an upgrade prompt; nothing created.
- Covers: STF-02, TRL-03.

**P1-E21 Staff sign-in and permissions. [E2E]**
- Preconditions: a tenant on Starter (two seats, per D3's seeded plans); a role with `orders:read` only (orders come later, so use `staff:read`).
- Steps: the owner creates a staff member and a role; the staff member signs in and opens the staff page; then tries an action outside the role.
- Expected: the staff member sees only permitted screens; the action outside the role returns `forbidden`; the UI hides the control.
- Covers: STF-01, STF-07, STF-11.

**P1-E22 Permission change applies to the next request. [API]**
- Steps: the staff member is signed in with `staff:manage`; the owner removes that permission; the staff member's next call.
- Expected: `forbidden` on the next request without signing in again.
- Covers: STF-10.

**P1-E23 Deactivation ends the session at once. [API]**
- Steps: the staff member has an open session; the owner deactivates them; the staff member's next call; the owner reactivates them.
- Expected: `unauthenticated` immediately; sign-in refused while deactivated; after reactivation, sign-in works and the seat limit is checked again.
- Covers: STF-03, STF-04, STF-05.

**P1-E24 Role in use cannot be deleted; owner role is protected. [API]**
- Steps: delete a role assigned to a staff member; try to deactivate the owner; try to change the owner's role; the owner resets a staff member's password.
- Expected: deletion returns `conflict` and names the count of users; owner changes return `forbidden`; the reset forces a change at next sign-in.
- Covers: STF-09, STF-12, STF-13.

**P1-E25 Staff phone is unique across the platform. [API]**
- Steps: create a staff member with a phone already used by another subscriber in another tenant.
- Expected: `conflict`.
- Covers: STF-06 (assumption, per D9).

### E. Activity log

**P1-E26 Every auditable action writes one entry. [API]**
- Steps: perform each action in the list: sign-in success and failure, sign-out, password change, staff created, edited, deactivated, reactivated, role changed, owner password reset. Read the activity log.
- Expected: each action appears exactly once; no entry contains a password, OTP, session token or phone number beyond the last four digits.
- Covers: AUD-01, AUD-02.

**P1-E27 Activity log is append-only and tenant-scoped. [INT]**
- Steps: try to update and delete an activity log row through the application role; read another tenant's log as the first tenant.
- Expected: update and delete are refused by the database; the other tenant's entries never appear.
- Covers: AUD-03, AUD-05, DAT-10.

**P1-E28 Activity filters and permission. [E2E]**
- Steps: the owner filters by date range, actor and action; a staff member without `audit:read` opens the Activity page.
- Expected: the filters narrow the results correctly with pagination; the staff member gets `forbidden`.
- Covers: AUD-04.

### F. Dashboard shell and language

**P1-E29 Default Bangla and full English switch. [E2E]**
- Steps: open the sign-in page in a new browser; check the language; switch to English; check every visible label, button and message; reload.
- Expected: Bangla by default; the toggle changes every label, not some; the choice holds after reload for the signed-in staff member.
- Covers: I18N-01, I18N-02.

**P1-E30 Language follows the account, not the device. [E2E]**
- Steps: a staff member chooses English; signs out; signs in from a different browser.
- Expected: English on the new browser.
- Covers: I18N-02.

**P1-E31 Tenant branding stays separate in one browser. [E2E]**
- Steps: open alpha's dashboard, then beta's dashboard in another tab of the same browser; check the navigation name and tab title; switch back.
- Expected: each tab shows its own shop name and placeholder logo; no hard refresh needed; the "Powered by" mark is present on both.
- Covers: TEN-16, TEN-18.

### G. Operator login

**P1-E32 Operator console isolation and mandatory two-factor. [E2E]**
- Steps: sign in to the console with a tenant owner's credentials; create an operator account and try to sign in before enrolment; enrol with a wrong code, then the right one; use a backup code, then reuse it.
- Expected: the tenant credential is refused; the account is unusable until a valid code confirms enrolment; the backup code works once and is refused on reuse.
- Covers: ADM-01, ADM-18 (the break-glass path is a documented manual check, see section 5).

### H. Isolation sweep

**P1-I01 Every resource endpoint refuses another tenant's IDs. [ISO]**
- Steps: for every endpoint in the phase that takes an ID (users, roles, sessions, activity entries, identities, tenants), call it with tenant beta's IDs using tenant alpha's session, for GET, PATCH and DELETE.
- Expected: every call returns `not_found`, never `forbidden`, so the existence of another tenant's record is not revealed.
- Covers: TEN-03, SEC-02.

**P1-I02 Lists and totals are scoped. [ISO]**
- Steps: each list endpoint (staff, roles, activity log) called by both tenants with overlapping data.
- Expected: each tenant sees only its own rows and totals.
- Covers: TEN-04, AUD-05.

**P1-I03 Uniqueness is per tenant where it should be. [ISO]**
- Steps: both tenants create a role named "Manager" and a staff member with an identical role name.
- Expected: both succeed; a duplicate inside one tenant is refused.
- Covers: TEN-05.

**P1-I04 Background jobs process tenants separately. [INT]**
- Steps: run the activity log retention purge over two tenants with entries of different ages.
- Expected: each tenant's entries are purged by its own retention; no entry from one tenant is affected by the other's setting.
- Covers: TEN-07, AUD-06.

### I. Non-functional checks for this phase

**P1-N01 Rate limits return the right codes and headers. [API]**
- Steps: exceed the sign-up limit per IP per hour; exceed the OTP limit per IP.
- Expected: the eleventh sign-up in an hour is limited; OTP limits are enforced on their own axis.
- Covers: SUP-08, SMS-11.

**P1-N02 No secrets in logs or responses. [INT]**
- Steps: run every scenario above with a log capture; search the logs and every response body for passwords, OTP codes and session tokens.
- Expected: no matches.
- Covers: LOG-02, SEC-01, AUD-02.

**P1-N03 Errors carry no internal detail. [API]**
- Steps: force an unhandled exception through a test-only route in a production-like configuration, and send a request claiming to be a developer.
- Expected: a generic `message` and `code`; no stack trace or path in the body.
- Covers: SEC-16.

**P1-N04 Password and token storage. [INT]**
- Steps: read the database directly after sign-up and sign-in.
- Expected: passwords are bcrypt hashes at cost 12 or more, not plain text (D2); session tokens and OTPs are stored only as hashes.
- Covers: SEC-01, SEC-07.

---

## 4. Coverage matrix

Every `M` requirement in Phase 1 must appear in at least one scenario. The matrix below is maintained as the phase progresses.

| Requirement group | Scenarios |
|---|---|
| AUTH-01, 02, 04–07, 09, 10, 21, 28 | P1-E01, E02, E03, E04, E33 |
| AUTH-03, 24 | P1-E15, E17 |
| AUTH-08, 26 | P1-E04, E18 |
| AUTH-11 | P1-E05 |
| AUTH-12, 13 | P1-E10 |
| AUTH-14 | P1-E11 |
| AUTH-15, 16 | P1-E12 |
| AUTH-17, 18 | P1-E13 |
| AUTH-19, 20 | P1-E13, P1-E14 (staff case slice 7) |
| AUTH-22, 23 | P1-E16 (partial; full lifecycle in Phase 2) |
| AUTH-27 | P1-E19 |
| TEN-01 to 03 | P1-I01, I02 |
| TEN-04, 05 | P1-I02, I03 |
| TEN-06 | P1-I01 (media paths arrive with products; re-test then) |
| TEN-07 | P1-I04 |
| TEN-15 | P1-E04 |
| TEN-16, 18 | P1-E31 |
| TEN-19 | P1-E05 |
| TEN-24, 25 | P1-E06 |
| TEN-26 | P1-E05 |
| TEN-27 | Covered by the cache unit test (invalidation within five seconds) |
| TEN-28 | P1-E08, E09 |
| TEN-29 | P1-E07 |
| STF-01, 07, 11 | P1-E21 |
| STF-02, TRL-03 | P1-E20 |
| STF-03, 04, 05 | P1-E23 |
| STF-06 | P1-E25 |
| STF-09, 12, 13 | P1-E24 |
| STF-10 | P1-E22 |
| STF-08, 14 | Unit test (role count, downgrade reshuffle is Phase 2) |
| AUD-01, 02 | P1-E26 |
| AUD-03, 05 | P1-E27, I02 |
| AUD-04 | P1-E28 |
| AUD-06 | P1-I04 |
| AUD-07, 08 | Integration test (money-related retention; operator-actions entries) |
| I18N-01, 02 | P1-E29, E30 |
| SMS-18, TRL-01, TRL-02, TRL-05, TRL-08 | P1-E01 |
| ADM-01, ADM-18 | P1-E32 (break-glass is a manual check) |
| SEC-01, 07 | P1-N04 |
| SEC-02 | P1-I01 |
| SEC-03 | Static check in CI (no string-concatenated SQL) |
| SEC-14 | P1-E07, plus a request without a CSRF token refused (API test) |
| SEC-16 | P1-N03 |
| LOG-02 | P1-N02 |
| SUP-08, SMS-11 | P1-N01 |

**Requirements deliberately not tested in Phase 1:** those that depend on plans, billing, orders or the storefront. They're listed in the Phase 2 onwards test plans. Withdrawn requirements are checked for absence: for AUTH-25 a test confirms the Facebook email is not enforced; AUTH-18 is restored; both AUTH-17 and AUTH-18 have passing tests.

---

## 5. Manual checks (before phase exit)

These can't be fully automated, so each has a recorded result:

| Check | Procedure | Recorded result |
|---|---|---|
| PWA install per tenant (TEN-17) | Install the dashboard from two tenants' hosts on a phone or desktop | Two distinct names and icons |
| Break-glass operator recovery (ADM-18) | Simulate losing the TOTP device and backup codes; run the documented database procedure | Account unusable until re-enrolled; the action is logged |
| Visual review of Bangla labels | Review the sign-up, sign-in and staff screens in Bangla | No broken glyphs; layout holds at 360 px width |
| Real SMS delivery | Send one OTP through the real provider once it's chosen (D6) | Message received |
| Provider OAuth (D7) | Google and Facebook sign-in against live registrations | Successful sign-in |

---

## 6. Exit criteria for the phase

1. Every scenario tagged for the phase passes in CI.
2. The coverage matrix has no gaps for `M` requirements, except those listed as deliberately deferred.
3. The isolation suite includes every resource endpoint built in the phase.
4. The manual checks in section 5 are recorded, with any pending items (such as OAuth, if D7 isn't ready) marked as pending rather than skipped silently.
5. No known cross-tenant leak, secret in logs, or unhandled error path remains open.
