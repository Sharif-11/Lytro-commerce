# Phase 1 + Phase 2 HTTP path-coverage test plan

Status: draft v1, 2026-10-15. Companion to `TEST-PLAN.md` (realistic end-to-end journeys) and `PHASE-1-TEST-PLAN.md`/`PHASE-2-TEST-PLAN.md` (requirement-clustered scenarios). **This document is a different shape on purpose**: instead of a user journey, it takes every real HTTP endpoint implemented today and asks, path type by path type, "what real request proves this works, and what does it prove?" Use this document when you need to know "is this one endpoint actually fully tested," and the other three when you need "does this user journey work end to end." Together they should leave no gap.

Grounded directly in the controller code under `apps/server/src/modules/**/controllers`, not in `docs/API-CONTRACT.md`, which has drifted significantly from what is actually implemented (see **Appendix: docs drift**, bottom of this file) — every path below is real and callable today.

## The seven path types

Each endpoint below is tested against the path types that actually apply to it (not every type applies to every endpoint — a read-only `GET /plans` has no business-rule or retry/concurrency path worth a distinct test, for example):

1. **Happy path** — does it work?
2. **Validation path** — does it reject bad input?
3. **Authentication and authorization path** — does it protect access?
4. **Business-rule path** — does it enforce the rules?
5. **Resource and state path** — does it handle missing or invalid states?
6. **Failure and recovery path** — does it handle dependency failures safely?
7. **Retry and concurrency path** — does it preserve data integrity under repeated or simultaneous requests?

## Conventions used below

- Every path is relative to the API's base; prepend `/api/v1` per the server's global prefix convention, except `health` and the hosted/public-key routes, which have none.
- `Host:` header selects the tenant for every tenant-scoped and public-storefront route (subdomain-based multi-tenancy, `TEN-7a`) — `shop-a.lytronix.test` / `shop-b.lytronix.test` denote two distinct tenants with overlapping data, used throughout for isolation checks (`TEN-03`, `SEC-02`).
- `Cookie: session=<opaque>` denotes a signed-in dashboard/staff session; `Cookie: session=<opaque>; csrf=<token>` + `X-CSRF-Token: <token>` denotes the same session with its CSRF pair, required on every mutating dashboard request.
- `Cookie: op_session=<opaque>` denotes a signed-in operator session (separate cookie/session type from tenant sessions, `ADM-01`).
- `Idempotency-Key: <uuid>` is shown on every write that is cost-bearing or side-effecting; where the route does **not** actually wire `IdempotencyInterceptor` (flagged inline), the retry-path test proves the *current* behavior (a duplicate side effect), which is itself the finding to act on, not a passing test to ignore.
- A fresh phone/email is denoted `+8801XXXXXXXXX` / `owner+N@example.com`; a known-bad phone format is `+1-555-0100` (not Bangladeshi, `AUTH-01`).

---

## 1. Identity and auth (`AUTH`, `TEN`)

### `POST /auth/phone/code` — request a sign-in/sign-up code by phone

Guards: none (public, `@SkipTenant()`). DTO: `RequestSigninCodeDto`.

- **Happy**: `POST /auth/phone/code {"phone":"+8801711111111"}` → `202`, `{"ok":true}`; one SMS queued (`AUTH-05`).
- **Validation**: `{"phone":"+1-555-0100"}` → `422 validation_error`, field `phone` (`AUTH-01`). Empty body → `422` listing the missing field.
- **Business-rule**: request the same phone twice within 60s → second call `429 rate_limited` with `Retry-After` (`AUTH-06`); 6th request within an hour → `429` (`AUTH-07`).
- **Resource/state**: a phone already mid-signup with a held identity elsewhere → same generic `202` (never reveals account existence, `AUTH-15`-style non-enumeration).
- **Retry/concurrency**: two near-simultaneous requests for the same phone → exactly one SMS in flight at a time, second is rate-limited, never two codes racing to be "the" valid one.

### `POST /auth/phone/verify` — verify the code, open a session

DTO: `VerifySigninCodeDto`.

- **Happy**: correct 6-digit code within 5 minutes → `200`, `Set-Cookie: session=...`, body names `next` step (`AUTH-05`).
- **Validation**: 5-digit code, non-numeric code → `422 validation_error`.
- **Business-rule**: 5 wrong codes in a row → 6th attempt (even correct) → `403 rate_limited` for 15 minutes (`AUTH-14`). Code reused after first successful verify → `401`/`not_found`-equivalent (single-use).
- **Resource/state**: code expired (>5 min) → `401 expired_code`; phone never requested a code → same generic failure, no enumeration.
- **Retry/concurrency**: submit the same correct code twice in parallel → exactly one session created, second request either re-returns the same session or fails cleanly — never two divergent sessions from one code.

### `POST /auth/email/code`, `POST /auth/email/verify` — same shape as phone, email channel

Same seven-path treatment as above, substituting `email` field and `AUTH-01`'s email-format validation. Covers `AUTH-05` (email variant).

### `POST /auth/signin` — phone + password sign-in

DTO: `PasswordSigninDto`.

- **Happy**: correct phone+password → `200` + session cookie (`AUTH-12`).
- **Validation**: missing `password` field → `422`.
- **AuthN**: unknown phone, account with no password set, wrong password for a real account — all three return the **identical** body/status/timing-class (`AUTH-13`); verify via three parallel requests and diffing response byte-for-byte except timestamp. **Verified live, 2026-10-15**: `POST /auth/signin {"phone":"+8809999999999","password":"whatever123"}` (unknown) and the same body against a real, verified-but-no-password account both returned byte-for-byte `{"success":false,"statusCode":401,"message":"এই ফোন নম্বর ও পাসওয়ার্ড মিলছে না।","errors":{"code":"unauthenticated","details":{}}}`.
- **Business-rule**: 5 failures (mixing wrong password and wrong OTP attempts against the same account) within 15 minutes → 6th attempt, even with the right password, `429 rate_limited`; failures age out after 15 minutes (`AUTH-14`).
- **Retry/concurrency**: fire the 5th and 6th failing attempt in the same instant → the lockout still engages exactly once, not raced open.

### `POST /auth/forgot-password`, `/forgot-password/email`, `/forgot-password/*/verify` — reset flow

- **Happy**: known phone → `202` + reset code SMS; verify code → session that **must** set a password before anything else (`AUTH-17`, `AUTH-19`).
- **Validation**: malformed phone/email → `422`.
- **AuthN**: known vs. unknown phone → identical `202` response (`AUTH-17`, non-enumeration).
- **Business-rule**: second reset request within 2 minutes → no second SMS sent, same `202` (`AUTH-18`); a session that owes a password reset is blocked from every dashboard route except `POST /auth/password` and `POST /auth/signout` (`AUTH-19`).
- **Resource/state**: reset code expired or already used → `401`.
- **Retry/concurrency**: two reset-verify calls with the same code in parallel → exactly one succeeds, the other gets the already-used failure, never two live "must-set-password" sessions from one code.

### `POST /auth/password` — set/change password (session-authed)

DTO: `SetPasswordDto`. Guards: `SessionGuard`, `@AllowPendingPassword()`.

- **Happy**: valid new password while a password-change is pending (no current password required) → `200`, old sessions revoked (`AUTH-19`).
- **Happy (normal change)**: current + new password supplied, more than 10 minutes since the code sign-in that opened the session → `200`.
- **Validation**: new password under the length minimum → `422` field `password`.
- **AuthN**: no session cookie → `401 unauthenticated`. Normal change (not pending) with no `currentPassword` or a wrong one → `422 CurrentPasswordWrong` (`AUTH-20`).
- **Resource/state**: within 10 minutes of a code sign-in, a normal change is allowed without the current password (grace window) — verify the boundary at 9:59 vs 10:01.
- **Retry/concurrency**: the same change submitted twice in parallel → both end at the same final password, sessions revoked once, no partial/double-hash state.

### `POST /auth/signout`

- **Happy**: `200`, cookie cleared, session invalidated — immediate replay of the old cookie → `401 unauthenticated`.
- **AuthN**: no session → `401`.
- **Retry/concurrency**: sign out twice in a row with the same (now-stale) cookie → second call still `401`, never a crash on an already-revoked session.

### `GET /auth/providers`, `GET /auth/oauth/:provider/start`, `GET /auth/oauth/:provider/callback` — OAuth

- **Happy**: `GET /auth/oauth/google/start` → `200` with a redirect URL; completing the flow and hitting `.../callback?code=...&state=...` → session opened, no password ever prompted (`AUTH-24`).
- **Validation**: `:provider` not in the enabled set (e.g. `twitter`) → `404` or `422`.
- **Business-rule**: callback where the provider reports an email already used by a different, email-verified tenant → still creates/attaches correctly per `OD-53`'s deliberate "separate verification channel, separate tenant" policy, not a silent merge or a rejection.
- **Resource/state**: callback with a tampered/expired `state` param → `401`, no session opened.
- **Retry/concurrency**: the same OAuth `code` posted to `.../callback` twice (replay) → second attempt fails cleanly (codes are single-use upstream), no duplicate account/session.

### `GET/POST/DELETE /me/identities[...]` — identity management

Guards: `SessionGuard`, `DashboardGuard` with `@Dashboard({lapsed:true, withoutShop:true})`.

- **Happy**: `GET /me/identities` → lists only the session account's own identities (`AUTH-26`); `POST .../code` + `.../verify` adds a new one; `DELETE .../:id` removes a non-last identity.
- **Validation**: malformed phone/email on add → `422`.
- **AuthN/isolation**: `DELETE /me/identities/:id` for another account's identity id → `404 not_found`, never `403` (no existence leak, `TEN-03`-style).
- **Business-rule**: attempt to add an identity already held by another account → `409 conflict`; attempt to delete the account's **last** identity → `422`/`forbidden` (an account must always have at least one way to sign in).
- **Resource/state**: verify with an expired add-identity code → `401`.
- **Retry/concurrency**: two parallel `DELETE` calls on the same last-remaining identity → exactly one succeeds in deleting down to the floor, the other is refused — never zero identities left.

### `GET /me` — dashboard shell / account summary

**Verified live, 2026-10-15**: the owner's own session is used on the **platform host** (plain `localhost`/the platform apex), not the shop's subdomain — `DashboardGuard` explicitly refuses a non-null `session.userId` (a staff session) on the platform host, and by the same logic routes the owner there, not to the subdomain. The shop's own subdomain host is for **staff** sign-in and the public storefront, not for the owner's dashboard session. Real request, immediately after `POST /shops`:

```
GET /api/v1/me
Cookie: lytronix_session=<owner's session>
```
→ `200`, `{"subscriber":{"id":"..."},"isOwner":true,"permissions":[],"tenant":{"id":"...","slug":"fashion-house","shopName":"Fashion House","state":"trial","planName":"Trial","periodEnd":"..."}}`.

- **Happy**: on the platform host with no shop yet → account summary, `withoutShop` path; once a shop exists → the shape above, `isOwner`/`permissions` included (`AUTH-22`, `AUTH-23`).
- **AuthN/isolation**: a signed-in owner's session, called on the **platform host**, always resolves to that owner's own tenant — there is no "wrong tenant" case to construct here directly, since the platform host carries no tenant of its own; the real cross-tenant attack is a **replayed/forged cookie sent with a `Host:` naming a specific shop** (not the platform host) — see the `TEN-28` cross-cutting block below, which is where this was actually exercised and returned `403 forbidden` against real shop B/shop A tenants.
- **Resource/state**: tenant in `locked`/`archived`/`deleted` → summary still returns (with `lapsed: true` info) rather than erroring, so the owner can still see "buy a plan to restore" (`AUTH-23`).

### Cross-cutting: identity-channel independence, trial abuse, and normalization (`AUTH-02`, `AUTH-08`, `AUTH-09`)

Not a single endpoint — a property of `POST /auth/phone/code`, `/auth/email/code`, the OAuth starts, and `POST /shops` together. Added here after re-reading the SRS text directly, since the first draft of this plan covered the sign-in mechanics of each channel but not these three cross-channel rules.

- **Validation (`AUTH-02`)**: `POST /auth/phone/code {"phone":"+8801711111111"}` and `{"phone":"8801711111111"}` and `{"phone":"01711111111"}` → all three normalize to the same stored number and reach the same account; `{"phone":"01212345678"}` (not `01[3-9]`) → `422`.
- **Business-rule (`AUTH-08`)**: register a phone, then independently register an email, then independently sign up via Facebook where Facebook happens to report that *same* email — all three succeed as **three separate tenants**, by design; verify no code path cross-references phone-registered-ness against email/Facebook-registered-ness. A *second* phone-code verify for an already-registered phone signs in to the existing account rather than creating a second one.
- **Business-rule (`AUTH-09`)**: complete two full trial sign-ups from the same verified phone (two different device/IP fingerprints) within 30 days → both succeed; a third from that same phone within the window → refused with a clear message, same for a third from the same device or IP with different phones. This is tested at `POST /shops` (where the trial tenant is actually created), not at the identity-verification step itself.

### Cross-cutting: stepped onboarding resumability (`AUTH-28`)

- **Resource/state**: verify a phone (step 1) and stop — sign in again later with the same phone → the server routes back to the create-shop step (step 2), not back to identity verification; complete `POST /shops` and skip the set-password prompt (step 3) → sign in again later → dashboard directly, step 3 is never shown again. This is observable purely from each sign-in response's `next` field across repeated calls, no UI needed.

### `POST /me/identities/code` + `/verify` — recovery-path guarantee (`AUTH-27`)

- **Resource/state**: an account verified only through Facebook, with no email ever granted — its sign-up response should name Facebook as the only recovery path (no phone/email to fall back to); adding a verified email via this route afterward changes that — confirm `GET /me/identities` reflects the new recovery surface immediately.

### `POST /shops` — slug suggestion and collision handling (`AUTH-11`, `TEN-26`)

**Verified live, 2026-10-15**: `CreateShopDto` has no `slug`/`address` input field at all — the client never chooses or sends one; the slug is derived entirely server-side from `shopName`, and collision handling is automatic, not a `409` the client has to retry:

```
POST /api/v1/shops
Cookie: lytronix_session=<account B's session>
X-CSRF-Token: <token>
{"shopName":"Fashion House","ownerName":"Rahim Uddin"}
```
→ `201`, `{"tenantId":"...","address":"fashion-house-2","shopUrl":"http://fashion-house-2.localhost","next":"set-password"}` — a *second* account creating a shop named identically to an already-existing `fashion-house` gets the suffixed slug automatically, in the same `201`, not a `409` naming a suggestion to retry with.

- **Business-rule**: two different accounts both naming their shop "Fashion House" → first gets `fashion-house`, second gets `fashion-house-2`, both in a single successful `201` each, confirmed live above; `{"shopName":"Admin","ownerName":"..."}` → still `201`, but the derived slug is suffixed (e.g. `admin-2`) because `admin` is reserved (`TEN-26`), never assigned verbatim.

### Cross-cutting: tenant ID is never taken from the client (`TEN-02`)

Applies to every tenant-scoped write in this document, tested once here as the representative case rather than repeated per endpoint:

- **Business-rule**: `POST /staff` (and any other tenant-scoped POST) with an extra `"tenantId": "<shop B's real id>"` field in the body, signed in as shop A → the staff member is created in shop A regardless; the extra field is silently ignored, never honored, never a validation error either (it's simply not part of the schema's effective input).

### Cross-cutting: hostname resolution happens before anything else, and the trusted edge is the only source of it (`TEN-24`, `TEN-25`, `TEN-28`)

**Verified live, 2026-10-15, against two real tenants** (`fashion-house` / `fashion-house-2`, both actually created via the flow above):

```
GET /api/v1/me
Host: fashion-house-2.localhost
Cookie: lytronix_session=<fashion-house owner's real session value>
```
→ **`403 forbidden`**, exact body `{"success":false,"statusCode":403,"message":"রিকোয়েস্টটি গ্রহণ করা হয়নি।","errors":{"code":"forbidden","details":{}}}` — `TEN-28`'s own wording ("a mismatch shall be rejected with 403") confirmed to the letter. Note this had to be constructed with a manually-set `Cookie:` header, not a browser cookie jar — a real browser's jar never sends shop A's cookie to shop B's host in the first place (confirmed separately: pointing a real `curl` cookie jar at `fashion-house-2.localhost` with `--resolve` sent **no** `Cookie:` header at all, because the cookie was set with no `Domain` attribute while signing in on the platform host). So the `403` above is specifically proving the *application-layer* defense-in-depth check, for the case where a cookie is replayed/forged rather than naturally sent by a browser.

- **Happy**: `Host: fashion-house.localhost` (with `--resolve ...:127.0.0.1` or real DNS) on any dashboard/public route resolves to that tenant; the platform's own apex host resolves to the platform (no tenant) — this is also how the owner's own session is meant to be used (see the corrected `GET /me` entry above).
- **AuthN**: the forged-cookie case above (`403`) is the concrete, executed proof of `TEN-28`. A separate edge-secret check (`TRUSTED_EDGE_SECRET`) exists in the schema but is **optional outside `NODE_ENV=production`** (confirmed by reading `src/config/env.ts` directly) — it could not be exercised against the local dev server used for this pass; a production-parity test needs `TRUSTED_EDGE_SECRET` set and a request missing/wrong on that header, asserting refusal.
- **Resource/state**: `Host: no-such-shop.localhost` → `404`, generic, before any session/auth logic runs at all; `Host:` of a tenant whose state is `suspended` or `archived` → a closed/offline response, never the tenant's real data (`TEN-25`) — not re-verified live in this pass, carried over from the first draft.
- **Retry/concurrency**: n/a (pure read-time resolution, no shared mutable state at risk here beyond the 60-second lookup cache already called out in `TEN-27`, which is a load-test concern, not a correctness one).

### Cross-cutting: session cookies never cross hosts (`TEN-29`)

**Verified live, 2026-10-15**: signing in on the platform host (plain `localhost:3000`, no subdomain) produces `Set-Cookie: lytronix_session=...; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800` — **no `Domain` attribute at all**, which makes it a host-only cookie per RFC 6265, scoped to the exact host it was set on. A real cookie-jar-respecting client (tested with `curl --resolve shop.localhost:3000:127.0.0.1` and a real `-b`/`-c` jar) never sends it to any other host, `fashion-house-2.localhost` included — confirmed by inspecting the outgoing request and seeing no `Cookie:` header at all once the host changed. The `403` in the `TEN-28` block above is what happens one layer further in, if that cookie-jar protection is bypassed (a forged `Cookie:` header) rather than relied on.

### `POST /shops` — create the signed-in account's shop

DTO: `CreateShopDto` — real shape confirmed live: `{shopName: string, ownerName: string}`, nothing else (no `slug`, no `address` object; the earlier draft of this plan assumed an address field that doesn't exist). Guards: `SessionGuard` (method-level), `@SkipTenant()`.

- **Happy**: `{"shopName":"Fashion House","ownerName":"Karim Ahmed"}` → `201`, `{"tenantId":"...","address":"fashion-house","shopUrl":"http://fashion-house.localhost","next":"set-password"}`, tenant created in `trial` (`AUTH-10`, `TRL-01`) — confirmed live, exact response above.
- **Validation**: `shopName` or `ownerName` over the length cap, or empty → `422`.
- **AuthN**: no session → `401`.
- **Business-rule**: the signed-in identity already owns a tenant → `409 conflict` (one tenant per identity, `TEN-15`); a shop name colliding with an existing slug or a reserved word is auto-suffixed, never a `409` — confirmed live under `AUTH-11`'s block above.
- **Retry/concurrency**: submit the same create-shop request twice in parallel (double-click) → exactly one tenant created, the second either 409s or idempotently returns the same tenant — never two tenants for one identity.

---

## 2. Staff sign-in and self-service (`STF`, `AUTH`)

### `POST /auth/staff/signin`

DTO: `PasswordSigninDto`, shared shape. No `@SkipTenant()` — tenant resolved from `Host:`.

- **Happy**: `Host: shop-a.lytronix.test` + correct staff phone/password → `200`, session scoped to shop A (`AUTH-12`).
- **Validation**: malformed phone → `422`.
- **AuthN/isolation**: a staff phone that belongs to shop A, called with `Host: shop-b.lytronix.test` → refused, same generic failure as any wrong credential (`TEN-03`-style, no cross-shop leak).
- **Business-rule**: a deactivated staff member's phone/password → same generic failure as wrong credentials (`STF-05`); the shop is `locked` → only the owner may sign in, staff refused `tenant_offline` (`LIF-11`); shop `archived` → dashboard content withheld even if sign-in nominally succeeds.
- **Business-rule (`LIF-10`)**: the *owner's* own `POST /auth/phone/code`/`POST /auth/forgot-password` for a `locked` or `archived` tenant still sends the SMS (this is the owner's essential sign-in/reset path, carved out from the lapsed-state freeze) — confirm via `GET /balance` immediately before/after that the balance is unchanged and via `GET /activity` that no essential-SMS-allowance counter moved, in contrast to the same call failing outright for a *staff* phone in the same `locked` tenant (previous bullet).
- **Resource/state**: unknown subdomain in `Host:` → `404` before any credential check runs at all.
- **Retry/concurrency**: parallel sign-in attempts against the same account's 5-strikes lockout boundary → lockout engages exactly once.

### `POST /auth/staff/password` — self password change

DTO: `ChangeStaffPasswordDto`. Guards: `SessionGuard`, `@AllowPendingPassword()`.

- **Happy**: correct current password + valid new one → `200`, old sessions revoked (`STF-13`, `AUTH-20`).
- **Validation**: new password too short → `422`.
- **AuthN**: wrong current password → `422 CurrentPasswordWrong`; this route works even while the session's own tenant is `read_only` (`LIF-06`'s explicitly-allowed write).
- **Resource/state**: a `mustSetPassword`-pending session changing for the first time → current password not required (matches the owner-reset flow).
- **Retry/concurrency**: two parallel change attempts with the same current password but different new ones → exactly one new password wins, no split-brain hash state.

### `GET/POST/PATCH /staff[...]`, `POST /staff/:id/password`

Guards: `SessionGuard, DashboardGuard, PermissionGuard` + `RequirePermission(StaffRead|StaffManage)`.

- **Happy**: `GET /staff` → seats + list, scoped to the session shop (`STF-01`, `STF-02`); `POST /staff` with a fresh phone/password/roleIds → `201`; `PATCH /staff/:id` deactivates/reactivates or changes roles; `POST /staff/:id/password` resets another staff member's password.
- **Validation**: `POST /staff` with a malformed phone, empty password, or a `roleIds` entry that isn't a UUID → `422`.
- **AuthN**: a session lacking `staff:manage` calling `POST /staff` → `403 forbidden`, naming the missing permission; one holding only `staff:read` can `GET` but not mutate.
- **Business-rule**: creating staff at the plan's seat limit → `403 plan_limit_reached` naming the seat cap (`STF-02`); phone already staff in **another** shop, or already the owner's own phone → `409 conflict` (`STF-06`); `PATCH` on the owner's own row (id) → `403 forbidden`, the owner row cannot be changed via this route (`STF-12`).
- **Resource/state**: `PATCH /staff/:id` / `POST /staff/:id/password` for an id that belongs to **shop B** while signed in to shop A → `404 not_found`, never `403` (`TEN-03`).
- **Retry/concurrency**: two `POST /staff` calls racing for the **last** free seat → exactly one succeeds, the other gets `plan_limit_reached`, never over-the-limit seats; two parallel `PATCH .../password` resets for the same staff id → last-write-wins on the hash, but exactly one `PasswordReset` audit entry is **not** guaranteed doubled (verify neither silently drops the audit write).

### `GET/POST/PATCH/DELETE /roles[...]`

Same guard shape, `RequirePermission(StaffRead|StaffManage)`.

- **Happy**: full CRUD on a role built from the platform permission list (`STF-07` to `STF-09`).
- **Validation**: `POST /roles` with a permission string not on the platform list → `422`; duplicate role name in the same shop → `409 conflict`.
- **Business-rule**: `DELETE /roles/:id` for a role someone currently holds → `409 conflict`; after reassigning that holder, the same delete succeeds.
- **Resource/state**: `PATCH`/`DELETE` for shop B's role id while signed in to shop A → `404`.
- **Retry/concurrency**: two parallel `DELETE` calls on a role right as its last holder is being reassigned → exactly one of {delete succeeds, delete is refused with conflict} happens deterministically, never a role deleted while still assigned to someone.
- **Business-rule (`STF-08`, roles have no cap)**: create 50 roles in the same shop in a loop → all 50 succeed, `GET /roles` lists all 50; `STF-04`'s own seat-limit check only applies to reactivating a *staff member*, never to a role — re-activate a deactivated staff member above the current seat count via `PATCH /staff/:id {"active":true}` → `403 plan_limit_reached`, the same check as creation, not skipped for a reactivation.

---

## 3. Activity log (`AUD`)

### `GET /activity`

DTO: `ListActivityDto` (query). Guard: `RequirePermission(AuditRead)`.

- **Happy**: cursor-paginated list, filterable by `action`/`actorId`/date range (`AUD-01`, `AUD-04`).
- **Validation**: malformed cursor, `dateFrom` after `dateTo` → `422`.
- **AuthN**: session without `audit:read` → `403`.
- **Business-rule**: entries beyond the shop's plan retention are purged and never returned, even to a holder of `audit:read` (`AUD-06`); no secret, password, or full phone ever appears in any entry's summary, verified by scanning every returned entry's JSON (`AUD-02`); a money-related entry (plan purchase, upgrade, balance top-up/adjustment) remains available for 24 months regardless of the plan's own shorter retention window (`AUD-07`) — seed one, run the retention-purge job past the plan's own window but short of 24 months, confirm it still returns.
- **Resource/state**: paging past the last entry → empty page with `nextCursor: null`, not an error.
- **Isolation**: shop A never sees shop B's entries, verified by requesting the same cursor shape on both hosts (`TEN-07`).
- **Retry/concurrency**: paging while new entries are actively being written → no entry is ever skipped or repeated across pages (cursor is stable under concurrent writes).
- **Business-rule (`AUD-08`)**: trigger an operator action against this tenant (e.g. `POST /operator/tenants/:id/suspend`) → the entry it writes to *this* tenant's own `GET /activity` shows the actor as "Platform support" (or equivalent generic label), never the operator's personal name/email.

### `AUD-01`'s audited-action list, mapped to the request that produces each one

`AUD-01` names roughly twenty distinct auditable actions. Rather than one test per action, this is the traceability map — every row below should appear at least once in some test's audit-log assertion, by whichever endpoint actually triggers it today:

| Audited action | Triggering request |
| --- | --- |
| Sign-in success/failure | `POST /auth/signin`, `POST /auth/staff/signin` |
| Sign-out | `POST /auth/signout` |
| Password change/reset | `POST /auth/password`, `POST /staff/:id/password`, `POST /auth/staff/password` |
| Staff created/edited/deactivated/reactivated | `POST /staff`, `PATCH /staff/:id` |
| Role changes | `POST/PATCH/DELETE /roles[...]` |
| Plan purchased/renewed/upgraded/downgraded/cancelled | `POST /billing/purchase`, `/upgrade/confirm`, `/downgrade/schedule`, `/cancel` |
| Balance top-up/adjustment | `POST /balance/top-up/confirm`, `POST /operator/tenants/:id/balance-adjust` |
| Operator view-as-tenant, export, order/payment/wallet/credential actions | **not yet buildable** — no such endpoints exist yet (Phase 3+ scope); flagged, not silently skipped. |

---

## 4. Balance and rates (`BAL`, `RAT`)

### `GET /balance`, `GET /balance/ledger`, `GET /balance/current-rates`

Guard: `RequirePermission(BalanceRead)`.

- **Happy**: current amount + `frozen` flag (`BAL-01`, `BAL-08`); ledger lists entries newest-first, keyset-paginated; current-rates returns the same platform-wide values regardless of tenant.
- **Validation**: `GET /balance/ledger` with a malformed cursor or an unknown filter value → `422`.
- **AuthN**: missing `balance:read` → `403`.
- **Resource/state**: tenant with `frozen: true` (`read_only`/`locked`/`archived`) → balance still readable (viewing is always allowed, `LIF-06`), only spending is blocked.
- **Isolation**: shop A's ledger never includes shop B's entries (`TEN-07`, checked against `tenant.balance_ledger`'s own RLS).
- **Business-rule (`BAL-06`, amended 2026-10-15)**: `POST /balance/top-up/quote` on a `trial` tenant → succeeds the same way it would on an `active`/`grace`/`pay_as_you_go` tenant (verified live: trial top-up used to `403 plan_feature_unavailable`, now intentionally does not); on a `read_only`/`locked`/`archived` tenant → still `403 tenant_offline`, independent of plan type. Both branches asserted in one test so a future refactor can't collapse them into the same wrong code.

### `POST /balance/top-up/quote`, `POST /balance/top-up/confirm`

Guard: `RequirePermission(BalanceManage)`. `confirm` carries `IdempotencyInterceptor`.

- **Happy**: quote an amount inside the platform's min/max bounds → a priced quote; confirm with a wallet transaction id/sender number/amount → `200`, ledger credited, invoice-equivalent record issued (`BAL-03`, `BAL-04`).
- **Validation**: amount below `top_up_min_amount` or above `top_up_max_amount` → `422`, naming the bound; `confirm` missing `transactionId`/`senderNumber` → `422`.
- **AuthN**: missing `balance:manage` → `403`.
- **Business-rule**: a `transactionId` already used (anywhere on the platform, `control.used_transaction_ids`) → `409 conflict`, never silently credited twice.
- **Resource/state**: confirming a quote past its 30-minute hold → `409 QuoteExpired`; confirming someone else's (shop B's) quote id while signed in to shop A → `404 not_found`.
- **Failure/recovery**: the dependent write (ledger insert + tenant balance update) is one transaction — force a failure after the ledger row but before the tenant row and confirm **neither** persisted (atomicity), not a corrected-later state.
- **Retry/concurrency**: `POST .../confirm` sent twice with the **same** `Idempotency-Key` → second call returns the first's cached result, credits once, not twice (`BIL`'s idempotency convention); sent twice with **different** keys but the same `transactionId` → second is refused by the `used_transaction_ids` uniqueness regardless of the idempotency key.

---

## 5. Public plan/billing-term catalogue (`PLN`, `TRM`)

### `GET /plans`, `GET /billing-terms`

No auth, `@SkipTenant()`.

- **Happy**: lists only `forSale: true` plans/terms, with prices (`PLN-10`, `TRM-14`).
- **Validation**: n/a (no input).
- **Business-rule**: a not-for-sale plan, or a plan with no price for a given term, never appears, enforced server-side even against a crafted request trying to name the hidden plan's id directly (`PLN-04`, `PLN-12`) — attempt `GET /plans?includeHidden=true`-style query tampering and confirm it has no effect.
- **Resource/state**: zero for-sale plans (misconfigured platform) → `200` with an empty list, not an error.
- **Failure/recovery**: a plan price lookup failing for one term shouldn't 500 the whole list — confirm the response still returns every plan, just omitting the broken term's price, or fails the whole request cleanly (pick one behavior and assert it, not an unhandled exception either way).

---

## 6. Billing: purchase, upgrade, downgrade, cancel, invoices (`BIL`, `UPG`, `DWN`, `LIF-01`)

All under `/billing`, guard `RequirePermission(PaymentsRead|PaymentsManage)`, `DashboardGuard`.

### `POST /billing/quote`

- **Happy**: valid `planId`+`billingTermId` for a for-sale plan/term combination → priced quote, `isRenewal` correctly flagged if it matches the current plan (`BIL-01`).
- **Validation**: unknown `planId`/`billingTermId` → `404 PlanNotFound`/`PriceNotFound`.
- **Resource/state**: quoting while a prior quote for the same tenant is still open (BIL's one-pending-quote-equivalent, if enforced) → either superseded or refused, assert whichever the code does; quoting while the tenant is `trial` → first purchase, not a renewal.

### `POST /billing/purchase` — confirm (balance or wallet)

`@Dashboard({readOnlyWrite:true})`, `IdempotencyInterceptor`.

- **Happy — balance**: `{"method":"balance","paymentId":"..."}` with sufficient balance → `200`, plan activated, invoice issued, balance charged exactly once (`BIL-08`).
- **Happy — wallet**: `{"method":"wallet","paymentId":"...","transactionId":"...","senderNumber":"...","amountPaid":...}` → `200`, enters the operator queue, **nothing activates yet** until approved.
- **Validation**: `method: "wallet"` missing `transactionId` → `422 TransactionIdRequired`.
- **AuthN**: this is the one write explicitly still allowed in `read_only` (`LIF-06`) — verify a `read_only` tenant's call succeeds while, e.g., `POST /billing/downgrade/schedule` on the same tenant/session is refused `tenant_offline` in the same test run.
- **Business-rule**: insufficient balance on the `balance` method → `402`/`quota_exceeded InsufficientBalance`, no plan change, no partial charge; confirming an already-`verified`/`rejected` payment id → `409 PlanPaymentNotPending`; confirming past the 30-minute quote hold → `409 QuoteExpired`.
- **Resource/state**: a `locked`/`archived` tenant's balance-pay restore → plan becomes `active`, balance unfrozen in the same transaction, any scheduled downgrade cleared (`LIF-15` — this is the exact bug fixed in slice 7: verify the unfreeze happens *before* the charge is attempted, not after).
- **Retry/concurrency**: the same `Idempotency-Key` resent → cached result returned, balance charged once; two different `paymentId`s for the same tenant confirmed in parallel (a race nobody should be able to create, but test it) → at most one succeeds in activating a plan transactionally, never two simultaneous active-plan writes corrupting `period_start`/`period_end`.

### `POST /billing/upgrade/quote`, `POST /billing/upgrade/confirm`

Same shape as purchase; `confirm` also `@Dashboard({readOnlyWrite:true})` + `IdempotencyInterceptor`.

- **Happy**: quote prorates a credit for the unused days of the current plan, confirm activates the higher-ranked plan immediately, restarting the period (`UPG-01` to `UPG-09`).
- **Validation**: target plan rank ≤ current plan's rank → `422 UpgradeMustBeHigherRank`.
- **Business-rule**: a second upgrade quoted while one is already pending → `409 UpgradePending`; confirming supersedes any pending downgrade in the **same transaction** (`UPG-13`) — verify by scheduling a downgrade first, then confirming an upgrade, then checking `GET /billing/downgrade` returns `null` immediately after.
- **Resource/state**: tenant not currently `active` with a running, unexpired period → `422 UpgradeNotAvailable` (upgrade is never available from a lapsed state — it is purchase/renewal that restores a lapsed tenant, not upgrade); confirming more than 15 minutes after the quote (`UPG-07`, shorter than a purchase's 30) → refused, a fresh quote is required, never silently re-priced.
- **Retry/concurrency**: same `Idempotency-Key` resent on `confirm` → one activation, one invoice, not two.

### `POST /billing/downgrade/preview`, `/schedule`, `/cancel`, `GET /billing/downgrade`

- **Happy**: preview shows exactly the limits (e.g. seats) the target plan would put the shop over (`DWN-03`); schedule stores it effective at current period end with nothing changing immediately (`DWN-01`, `DWN-02`); cancel removes it; `GET` returns `null` when nothing is scheduled.
- **Validation**: target plan rank ≥ current plan's rank → `422 DowngradeMustBeLowerRank`.
- **AuthN**: tenant in `read_only` → **refused** `tenant_offline` (downgrade-scheduling is explicitly *not* on `LIF-06`'s allowed-write list — this is a deliberate negative test, not an oversight).
- **Business-rule**: re-scheduling replaces any existing scheduled change rather than stacking two (`DWN-01`); cancelling with nothing scheduled → `404 not_found`.
- **Resource/state**: `GET /billing/downgrade` for shop B's tenant while signed in to shop A → impossible to even address (tenant comes from the session), so this is inherently isolated — confirm by comparing both shops' own results differ.
- **Failure/recovery (note)**: none of `/downgrade/schedule`, `/downgrade/cancel`, or `/cancel`/`cancel/undo` below carry `IdempotencyInterceptor`, unlike `/purchase` and `/upgrade/confirm` — **this is a flagged gap, not an assumed pass**. The retry-path test below documents the *actual* current behavior so a regression (or a fix) is visible.
- **Retry/concurrency**: `POST /billing/downgrade/schedule` sent twice in quick succession with no idempotency key → both calls succeed (upsert semantics mean the second just re-writes the same target, which happens to be safe here by construction, not by an idempotency key) — verify this is genuinely safe and not accidentally creating two rows before asserting it as a pass.

### `POST /billing/cancel`, `POST /billing/cancel/undo` (`LIF-01`)

- **Happy**: cancel audits `SubscriptionCancelled`, period continues working until end (nothing else changes); undo audits `SubscriptionCancellationUndone`.
- **AuthN**: missing `payments:manage` → `403`.
- **Business-rule**: cancelling twice in a row → both succeed (it's an intent flag, not a state machine with a guard) — confirm this is the intended, documented behavior rather than assuming a conflict should fire.
- **Resource/state**: undo with nothing cancelled → succeeds as a no-op (same reasoning) — assert this explicitly rather than assuming a `404`.
- **Retry/concurrency**: no idempotency key on this route either (flagged above) — two parallel cancels just both write, producing two `SubscriptionCancelled` audit entries; confirm this is the actual, current behavior.

### `GET /billing/invoices`, `GET /billing/invoices/:id`

- **Happy**: lists/returns the session tenant's own invoices (`BIL-12`).
- **Resource/state**: `:id` belonging to shop B while signed in to shop A → `404 not_found` (not `403`) — the isolation test explicitly named in the controller's own comment.
- **Business-rule**: an invoice's `billingTermLabel` reflects what was true *at issue time*, even if the term was later renamed (`TRM-15`) — verify by renaming a term after a tenant already holds an invoice referencing it, then re-fetching that invoice.

---

## 7. Operator-only surfaces (`ADM`, `PLN`, `TRM`, `RAT`, `BAL`, `LIF-24`)

All guarded by `OperatorSessionGuard`, `@SkipTenant()` — none of these are reachable with a tenant session, and `TenantGuard`'s global check is explicitly skipped, so the auth test for every route in this section includes "a valid *tenant* session cookie gets `401`/`403`, not success."

### `POST /auth/operator/signin`, `/enroll`, `/verify`, `/signout`

- **Happy**: unenrolled account signs in with email/password → told to enroll, receives a TOTP secret + `otpauth://` URI shown once; enrolling with the right 6-digit code → session opened, ten backup codes issued once (`ADM-01`); an enrolled account's next sign-in asks to *verify*, not enroll, and accepts either a TOTP code or a backup code (each backup code single-use).
- **Validation**: malformed email, short password → `422`.
- **AuthN**: unknown email and a wrong password for a real operator → identical response (`ADM-01`'s own non-enumeration); a *tenant* staff credential tried here → `401`, no account found (entirely separate account space).
- **Business-rule**: wrong TOTP code → refused, account never silently falls back to enrollment; a backup code reused a second time → refused, even though it was accepted once already; signing out invalidates the session at once, verified by immediately retrying any `operator/...` route with the old cookie.
- **Retry/concurrency**: the same backup code submitted twice in parallel → at most one succeeds in consuming it, the other gets "already used," never two sessions from one backup code.

### `GET /operator/rates`, `GET /operator/rates/:key/history`, `PATCH /operator/rates/:key`

- **Happy**: list current rates; history shows every past change; `PATCH` updates a rate and audits `RateChanged` (`RAT-01`, `RAT-05`).
- **Validation**: `PATCH` with a negative or non-numeric value → `422`.
- **AuthN**: a tenant dashboard session (even with every permission) → `401`/`403` — rates are operator-only, no tenant-facing write path exists at all.
- **Resource/state**: `PATCH /operator/rates/:key` for an unknown key → `404 not_found`.
- **Business-rule**: a rate change takes effect only for whatever reads it *next* — a quote already created under the old rate is untouched (verify by quoting, then changing the rate, then re-reading the original quote's amount).

### `GET/POST/PATCH/DELETE /operator/plans[...]`, `GET /operator/plans/:id/versions`, `POST /operator/plans/:id/assign`

- **Happy**: full plan CRUD including not-for-sale plans (`PLN-01` to `PLN-09`); editing increments the version, the prior version stays retrievable via `/versions` (`D2-3`); assigning a not-for-sale plan to a specific tenant activates immediately with no payment step, snapshot stored normally, audited to **both** the platform log and the tenant's own activity log (`PLN-17`, `D2-5`).
- **Validation**: negative limit, zero price for a for-sale plan, missing `reason` on assign → `422`.
- **AuthN**: tenant session → `401`/`403`.
- **Business-rule**: two for-sale plans sharing a rank → `409`; a not-for-sale plan may freely share a rank with anything (`PLN-16`); `DELETE` a plan referenced by any snapshot/assignment → `409 conflict`, only retirement (`PATCH forSale:false`-equivalent) is allowed, never a hard delete.
- **Resource/state**: `GET /operator/plans/:id/versions` for an id with only one version → returns that one version, not an error; editing an already-retired plan → still allowed (operators can still correct historical data).
- **Retry/concurrency**: two parallel `PATCH` edits to the same plan → both succeed as two sequential versions (last-write-wins on content, but no lost version history — verify every intermediate version is still retrievable via `/versions`, not silently overwritten).

### `GET/POST/PATCH/DELETE /operator/billing-terms[...]`, `GET/PUT/DELETE /operator/plans/:planId/prices[...]`

- **Happy**: term CRUD including months validation (1–60, `TRM-01`); set/remove a plan's price for a term.
- **Validation**: `months: 0` or `months: 61` → `422`; a price `<= 0` → `422`.
- **AuthN**: tenant session → `401`/`403`.
- **Business-rule**: `DELETE` a term with any plan priced against it → `409 conflict`, only retirement allowed; retiring a term doesn't change dates for an already-subscribed tenant, even if the term's own length is edited afterward (`TRM-07`, `TRM-08`).
- **Resource/state**: setting a price for an unknown `:planId`/`:billingTermId` combination → `404`.
- **Retry/concurrency**: two parallel `PUT .../prices/:billingTermId` calls with different prices → last-write-wins deterministically (by request arrival, not an unordered race leaving an unpredictable value) — assert the final state is one of the two submitted values, never a corrupted mix.

### `GET/POST/DELETE /operator/tenants/:tenantId/limit-overrides[...]`

- **Happy**: set a per-tenant override (e.g. extra free essential SMS) with a reason; remove it (`PLN-11`).
- **Validation**: empty `reason` → `422`.
- **AuthN**: tenant session (even the owner's own) → `401`/`403` — overrides are operator-set only, no tenant-facing write.
- **Resource/state**: removing an override that was never set → **verified live, 2026-10-15**: `200 {"ok":true}`, not `404` as the first draft of this plan assumed — `DELETE` is implemented idempotently (removing nothing is still a success), which is defensible REST design; noted here as a correction, not a defect.
- **Retry/concurrency**: set the same override key twice in parallel with different values → one wins deterministically, never a torn write.

### `POST /operator/tenants/:id/balance-adjust`

- **Happy**: signed amount + required reason → ledger entry of type `Adjustment`, `PlatformAuditAction.BalanceAdjusted` recorded (`BAL-17`).
- **Validation**: `amount: 0` → `422` ("enter a non-zero amount"); empty `reason` → `422 ReasonRequired`.
- **AuthN**: tenant session → `401`/`403`.
- **Business-rule**: unlike an ordinary charge, this can push the balance below zero/past the overdraft floor — it is itself the authority for that, verify a large negative adjustment on a near-zero balance succeeds rather than being refused by the ordinary overdraft guard.
- **Resource/state**: unknown `:id` → `404`.
- **Retry/concurrency**: two simultaneous adjustments on the same tenant → both apply, sequentially serialized by the balance row lock (`BAL-11`) — verify the final balance equals the sum of both, never a lost update.

### `POST /operator/tenants/:id/suspend`, `POST /operator/tenants/:id/restore` (`LIF-24`)

- **Happy — suspend**: required `reason` → balance frozen immediately, `suspendedAt` set, public/dashboard side closed at once even mid-period, audited to both logs.
- **Happy — restore**: suspension cleared; balance unfrozen **only if** the tenant isn't independently still `read_only`/`locked`/`archived` for an unrelated reason (the exact guard added in slice 7 — test both branches: a merely-suspended-but-otherwise-active tenant unfreezes; a suspended-*and*-independently-locked tenant stays frozen after restore).
- **Validation**: empty `reason` on suspend → `422`.
- **AuthN**: tenant session → `401`/`403`.
- **Resource/state**: `restore` on a tenant that was never suspended → succeeds as a no-op (clearing an already-null `suspendedAt`) — assert this explicitly.
- **Retry/concurrency**: `suspend` called twice in a row → `suspendedAt`/`reason` simply overwritten, two audit entries written — both expected, not an error.

### `GET/PATCH /operator/settings[...]`

- **Happy**: list every platform setting; `PATCH /operator/settings/trial_days` with a new positive int → takes effect for the *next* read, audited `SettingsChanged`, never retroactive to an already-running trial's `periodEnd` (`LIF-26`).
- **Validation**: a non-positive-integer value for any current key → `422 SettingValueInvalid`.
- **AuthN**: tenant session → `401`/`403`.
- **Resource/state**: `PATCH` for an unrecognized key → `422`/`404` (no such key in the `PlatformSettingKey` enum).
- **Business-rule**: changing `grace_days` mid-lapse-cycle doesn't retroactively move a tenant who already started lapsing under the old schedule (`LIF-26`'s explicit non-retroactivity rule — this is also a known **partial-implementation caveat** from slice 7: confirm with the actual current code whether this is fully honored or only honored for brand-new lapses, and record the finding either way, don't assume it passes).

### `GET/POST/PATCH/DELETE /operator/payment-queue[...]`

- **Happy**: list pending wallet-payment submissions by `kind`; approve one → activates the plan/credits the balance in the same transaction the approval writes, invoice/credit issued; reject with a reason → payment marked rejected, nothing activated.
- **Validation**: `reject` with no reason → `422`. **Verified live, 2026-10-15**: the body field is `note`, not `reason` (`{"note":"..."}`); confirmed both the `400` on empty `note` and a successful `201` reject with `status:"rejected"`, the payment's plan left untouched.
- **AuthN**: tenant session → `401`/`403`.
- **Resource/state**: approve/reject an already-decided (`verified`/`rejected`) payment id → `409 conflict`, not a silent re-apply.
- **Failure/recovery**: force a failure between the approval write and the plan-activation write (same transaction) → neither persists, the payment stays `pending`/`needs_review`, not half-approved.
- **Retry/concurrency**: two operators approving the same payment id in parallel → exactly one wins the transactional lock, the other gets `409`, never two activations/credits from one payment.

---

## 8. Platform lifecycle job and pay-as-you-go (`LIF`, `PYG`, `TRL`) — not reachable over HTTP directly, tested at the job boundary

These requirements are satisfied by `LifecycleService.runTick` (a pg-boss recurring job, `D2-6`) and `TrialLifecycleService.convertExpiredTrials`, not by a request a client sends — there is no `POST /lifecycle/tick` endpoint and there should never be one on a public surface. For this document's path-type lens, treat "the job runs" as the trigger and every *other* endpoint's behavior under each resulting state as the actual HTTP-observable test:

- **Happy**: advance the test clock so `runTick` moves a tenant through `grace → read_only → locked → archived → deleted`; at each stage, call `GET /me`, `GET /plans`-adjacent dashboard routes, and a mutating route (e.g. `POST /staff`) over real HTTP and confirm the response matches that stage's table in `SRS-detailed.md` §2.3 (`LIF-04` to `LIF-12`).
- **Validation**: n/a (no client input).
- **AuthN**: during `locked`, staff sign-in (`POST /auth/staff/signin`) is refused while the owner's still succeeds (`LIF-11`) — this is the HTTP-observable proof of the job's own effect.
- **Business-rule**: `read_only` allows `GET` everywhere and exactly the two flagged writes (`POST /billing/purchase`, `POST /billing/upgrade/confirm`), refuses every other write with `tenant_offline` — enumerate every mutating dashboard route in this document and confirm each one is refused at this stage except those two (`LIF-06`).
- **Resource/state**: a tenant already `deleted` → `GET /me` still works (subscriber account, plan history, invoices, balance survive, `LIF-20`), but a shop subdomain's public storefront equivalent (once it exists) would 404/offline — confirmed via `GET /billing/invoices` still returning data post-deletion.
- **Failure/recovery**: run the job, then crash it mid-tenant (simulate by throwing inside a single tenant's transaction) — confirm *other* tenants in the same tick still transition correctly (`runTick` processes tenants independently, one failure must not block the batch).
- **Retry/concurrency**: call `runTick` twice at the identical instant (`LIF-23`) — confirm via HTTP (`GET /activity` on the affected tenant) that exactly one `LifecycleStateChanged`/`DeletionWarningSent` entry exists per boundary crossed, never two.

---

## Appendix: full requirement traceability (Phase 1 + Phase 2)

Built by reading `docs/SRS-detailed.md` sections 3–12.1 in full (every `AUTH`, `TEN`, `STF`, `AUD`, `PLN`, `TRL`, `TRM`, `PYG`, `BIL`, `UPG`, `DWN`, `LIF`, `BAL`, `RAT` requirement verbatim, plus the `ADM` rows actually implemented today) and checking each one, individually, against this document and the real controller code. Three outcomes, honestly distinguished — covering every requirement does **not** mean every requirement has a passing HTTP test today; some genuinely can't, because the feature they depend on isn't built yet:

- ✅ **Covered** — a real request in this document exercises it.
- ⚠ **Gap, now added** — an endpoint exists, but the first draft of this plan missed the angle; a new test block above now covers it (see the "Cross-cutting" and other newly-added entries throughout).
- ⛔ **Not HTTP-testable yet** — no endpoint exists for the feature this requirement depends on (confirmed against the full controller inventory, not assumed). These are correctly absent from the body of this document; listing them here, rather than silently omitting them, is what makes "every requirement" an honest claim instead of a quiet one.

### AUTH (sign-up, sign-in, account security)

| ID | Status | Note |
| --- | --- | --- |
| AUTH-01 | ✅ | `POST /shops` validation + §1's stepped-onboarding block |
| AUTH-02 | ⚠ added | phone normalization, §1 cross-cutting block |
| AUTH-03 | ✅ | `POST /auth/password` validation |
| AUTH-04 | ✅ | identity-verify-before-create, `POST /auth/phone/verify` |
| AUTH-05 | ✅ | `POST /auth/phone/code`+`/verify`, `/email/code`+`/verify` |
| AUTH-06 | ✅ | `POST /auth/phone/verify` business-rule (5 wrong codes) |
| AUTH-07 | ✅ | `POST /auth/phone/code` business-rule (resend limits) |
| AUTH-08 | ⚠ added | identity-channel independence, §1 cross-cutting block |
| AUTH-09 | ⚠ added | trial-abuse limit, §1 cross-cutting block |
| AUTH-10 | ✅ | `POST /shops` happy/business-rule |
| AUTH-11 | ⚠ added | slug suggestion/collision, §1 cross-cutting block |
| AUTH-12 | ✅ | `POST /auth/signin` happy |
| AUTH-13 | ✅ | `POST /auth/signin` AuthN (identical-reply test) |
| AUTH-14 | ✅ | `POST /auth/signin` business-rule (lockout) |
| AUTH-15 | ✅ | session expiry — covered by `POST /auth/signout` retry test + general session-cookie convention |
| AUTH-16 | ✅ | `POST /auth/signout` happy |
| AUTH-17 | ✅ | `POST /auth/forgot-password` happy/AuthN |
| AUTH-18 | ✅ | `POST /auth/forgot-password` business-rule |
| AUTH-19 | ✅ | `POST /auth/password` AuthN (pending-password block) |
| AUTH-20 | ✅ | `POST /auth/password` happy/AuthN |
| AUTH-21 | ⚠ added | folded into `LIF-10`'s new test (SMS/OTP never counted) |
| AUTH-22 | ✅ | `POST /auth/staff/signin` business-rule, `GET /me` AuthN |
| AUTH-23 | ✅ | `GET /me` resource/state (deleted tenant) |
| AUTH-24 | ✅ | OAuth happy path |
| AUTH-25 | — | withdrawn in the SRS itself, nothing to test |
| AUTH-26 | ✅ | `DELETE /me/identities/:id` business-rule (last-identity floor) |
| AUTH-27 | ⚠ added | recovery-path guarantee, §1 new block |
| AUTH-28 | ⚠ added | stepped-onboarding resumability, §1 new block |

### TEN (tenant isolation and addressing)

| ID | Status | Note |
| --- | --- | --- |
| TEN-01 | ⛔ | schema-level (non-null tenant ID, composite FKs) — a `MAN` code-review/migration check, not an HTTP path |
| TEN-02 | ⚠ added | cross-cutting block, §1 |
| TEN-03 | ✅ | isolation checks throughout (staff, roles, invoices, identities, etc.) |
| TEN-04 | ✅ | implied by every "lists only the session shop's own" assertion throughout |
| TEN-05 | ⚠ | per-tenant uniqueness is implied (role names, `STF-06`'s deliberate platform-wide exception noted) but not exhaustively swept across every unique-scoped field — acceptable given no two business resources share a uniqueness rule worth a dedicated sweep yet (products/orders, where this would matter most, aren't built) |
| TEN-06 | ⛔ | media paths — no media/catalogue endpoints exist yet |
| TEN-07 | ✅ | lifecycle job per-tenant processing, activity-log purge per-tenant |
| TEN-08 | ⚠ | subdomain→dashboard resolution covered by the `TEN-24` cross-cutting block; the storefront half doesn't exist yet (⛔) |
| TEN-09 to TEN-14 | ⛔ | custom domains — no controller exists yet |
| TEN-15 | ✅ | `POST /shops` business-rule (one tenant per identity) |
| TEN-16 to TEN-19 | ⛔ | shop branding/logo/PWA — no endpoints |
| TEN-20, TEN-21, TEN-22 | ⛔ | `MAN`-type code-review checks (no built-in special treatment for the operator's own tenant) — not HTTP-observable by design |
| TEN-23, TEN-23a, TEN-23b | ⛔ | native Android app — not a server-side requirement at all |
| TEN-24 | ⚠ added | hostname-resolution-first, §1 cross-cutting block |
| TEN-25 | ⚠ added | same block (unknown/suspended/archived host) |
| TEN-26 | ⚠ added | reserved-slug test folded into the `AUTH-11` block |
| TEN-27 | ⛔ | `LOAD`-type (cache timing/latency), a performance test, not a functional HTTP path |
| TEN-28 | ⚠ added | trusted-edge-secret check, §1 cross-cutting block — this was the most significant gap found in the whole pass |
| TEN-29 | ⚠ added | cookie host-scoping, §1 cross-cutting block |

### STF (staff, roles, permissions)

| ID | Status | Note |
| --- | --- | --- |
| STF-01 | ✅ | `POST /staff` happy |
| STF-02 | ✅ | `POST /staff` business-rule (seat limit) |
| STF-03 | ✅ | `PATCH /staff/:id` deactivate frees a seat |
| STF-04 | ⚠ added | reactivation-checks-seat-limit, folded into the `STF-08` block |
| STF-05 | ✅ | deactivated staff refused sign-in/session ended |
| STF-06 | ✅ | `POST /staff` business-rule (phone uniqueness) |
| STF-07 | ✅ | `POST /roles` happy |
| STF-08 | ⚠ added | no role cap, new block at the end of §2 |
| STF-09 | ✅ | `DELETE /roles/:id` business-rule |
| STF-10 | ✅ | implied by `PATCH /roles/:id` + next-request permission check (not a distinct endpoint, but the mechanism — `PermissionGuard` reads fresh each call — is exercised by every AuthN row in §2) |
| STF-11 | ✅ | every endpoint's AuthN row in this document *is* this requirement, enumerated once per route rather than once overall |
| STF-12 | ✅ | `PATCH /staff/:id` business-rule (owner row immutable) |
| STF-13 | ✅ | `POST /staff/:id/password` happy, `AUTH-19` |
| STF-14 | ✅ | → `DWN-08` (seat overage resolution), covered under §6's downgrade block |

### AUD (activity log)

| ID | Status | Note |
| --- | --- | --- |
| AUD-01 | ⚠ added | exhaustive action→endpoint map, new table in §3 |
| AUD-02 | ✅ | `GET /activity` business-rule (no secrets) |
| AUD-03 | ⛔ | append-only enforced by a DB trigger, not an HTTP path — `MAN`/schema check (this is the exact trigger slice 7's PR flagged as blocking `LIF-19`'s log-trimming ask) |
| AUD-04 | ✅ | `GET /activity` happy |
| AUD-05 | ✅ | `GET /activity` isolation |
| AUD-06 | ✅ | `GET /activity` business-rule (retention purge) |
| AUD-07 | ⚠ added | 24-month money-entry override, folded into `GET /activity`'s business-rule row |
| AUD-08 | ⚠ added | "Platform support" actor masking, folded into `GET /activity`'s business-rule row |

### PLN (plans) / TRL (trial)

| ID | Status | Note |
| --- | --- | --- |
| PLN-01 to PLN-09 | ✅ | `GET/POST/PATCH/DELETE /operator/plans[...]` |
| PLN-10 | ✅ | not-for-sale plans never leak, §7 |
| PLN-11 | ✅ | `/operator/tenants/:tenantId/limit-overrides` |
| PLN-12 | ✅ | `GET /plans` business-rule |
| PLN-13, PLN-14, PLN-15 | ⛔ | add-on catalogue — no controller exists (and marked `S`-priority in the SRS itself) |
| PLN-16 | ✅ | `/operator/plans` business-rule (rank uniqueness) |
| PLN-17 | ✅ | `POST /operator/plans/:id/assign` |
| PLN-18 | ⚠ | no-expiry-never-lapses is implied by the lifecycle job only ever touching tenants with a non-null `periodEnd`, but there's no dedicated assign-then-leave-a-year test in this document — worth adding to `TEST-PLAN.md`'s longer-running scenarios rather than here |
| TRL-01 | ✅ | `POST /shops` (trial state created); day-30 edge is a `JOB` test, see §8 |
| TRL-02 | ✅ | implied — no payment-method field exists anywhere in `POST /shops`'s schema |
| TRL-03 | ⛔ | most of the eight limits (orders, products, storage, bandwidth) need catalogue/media endpoints that don't exist yet; only the seat limit (1) is actually testable today, via `STF-02` |
| TRL-04 | ✅ | `/balance/top-up/quote` business-rule (amended 2026-10-15: trial top-up now succeeds; spend remains unavailable, but no spend endpoint exists yet to test that half) |
| TRL-05 | ⚠ added | folded into the `LIF-10`/`AUTH-21` note — essential-SMS counter, not independently HTTP-testable beyond that |
| TRL-06 | ✅ | `POST /billing/purchase` from a trial tenant, §6 |
| TRL-07 | ✅ | §8, lifecycle job (trial→pay-as-you-go) |
| TRL-08 | ⛔ | dashboard countdown display — a UI concern, no distinct endpoint |

### TRM (billing terms)

| ID | Status | Note |
| --- | --- | --- |
| TRM-01, TRM-02, TRM-04, TRM-05, TRM-07, TRM-08, TRM-11, TRM-13, TRM-15, TRM-16 | ✅ | `/operator/billing-terms[...]`, §7 |
| TRM-03 | ⛔ | discount-percent prefill is a client-side editor computation over `SetPlanPriceDto`'s stored price — nothing for the server to assert beyond "the price stored is whatever was PUT", already covered |
| TRM-06 | ⚠ added | quote-honored-through-retirement, folded into `TRM-07`'s existing bullet — should be split out as its own assertion if this document is revised again |
| TRM-09 | ✅ | folded into `POST /billing/purchase`'s period-math via `TRM-09`'s own worked dates; exercised indirectly through purchase/renewal confirm, not as a standalone endpoint |
| TRM-10 | ✅ | → `UPG-03`, covered under `/billing/upgrade/quote` |
| TRM-12 | ⛔ | purchase/comparison screen rendering — client-side, no distinct endpoint beyond `GET /plans`/`GET /billing-terms`, already covered |
| TRM-14 | ✅ | `/operator/billing-terms` business-rule (tenant-specific term) |

### PYG (pay-as-you-go)

| ID | Status | Note |
| --- | --- | --- |
| PYG-01 | ⚠ | the *choice* of pay-as-you-go (as opposed to the automatic trial-end conversion, `TRL-07`) has **no dedicated HTTP endpoint** — `switch-to-payg` was planned in the stale `API-CONTRACT.md` but never built (see docs-drift appendix below); only the automatic path is testable today |
| PYG-02, PYG-03, PYG-04, PYG-05, PYG-14, PYG-16, PYG-17, PYG-18 | ⛔ | every one of these depends on order or product creation, which has **no controller at all** yet (confirmed: Phase 3+ scope) — the fee-charging logic itself may well have its own service-level/vitest coverage already (as earlier Phase 2 slices did), but there is no HTTP path to exercise it against today |
| PYG-06, PYG-07 | ⛔ | depend on payment-session and custom-domain endpoints that don't exist |
| PYG-08 | ✅ | §8, lifecycle job (no forced state change while active) |
| PYG-09 | ✅ | §8, lifecycle job (voluntary closure / operator suspend → archived) |
| PYG-10, PYG-11 | ⛔ | no `switch-to-payg`/`switch-to-subscription` endpoint exists; only the reverse direction (`TRL-07`'s automatic conversion, and an ordinary purchase from a pay-as-you-go tenant via `POST /billing/purchase`, which *is* covered) |
| PYG-12, PYG-13 | ⛔ | dashboard cost-estimate and operator reporting — no endpoints |
| PYG-15 | ⛔ | gateway payment methods — not built |
| PYG-19, PYG-20 | ⛔ | rolling-cycle metered-limit resets — depend on metering endpoints (bandwidth/requests) that don't exist; `PYG-20` is `MAN`-verified in the SRS itself (a data/config check, not a test) |
| PYG-21 | ✅ | §8, lifecycle job — the best-covered `PYG` requirement in this document, since it's entirely about tenant *state*, not order/product actions |

### BIL (purchase, payment, invoices)

| ID | Status | Note |
| --- | --- | --- |
| BIL-01, BIL-02, BIL-03, BIL-04, BIL-05 | ✅ | `POST /billing/quote` + `/purchase`, §6 |
| BIL-06 | ⚠ | the *manual* review-queue path (`/operator/payment-queue`) is covered; the *automatic* amount-mismatch-triggers-review path depends on a wallet/SMS-listener verification mechanism that isn't built — only testable once that lands |
| BIL-07 | ✅ | `/operator/tenants/:id/balance-adjust`-adjacent uniqueness is `BAL-05`'s; `BIL-07`'s own platform-wide transaction-id uniqueness is the same `used_transaction_ids` table, exercised by `/balance/top-up/confirm`'s retry-path test |
| BIL-08 | ✅ | `POST /billing/purchase` business-rule/retry |
| BIL-09 | ✅ | `POST /billing/purchase` resource/state (quote hold) |
| BIL-10, BIL-11 | ✅ | folded into `/billing/purchase`'s resource/state row (extend vs. restart, `LIF-15`'s restore) |
| BIL-12, BIL-13 | ✅ | `GET /billing/invoices[...]` |
| BIL-14 | ⛔ | reminder job — no endpoint, `JOB`-verified in the SRS itself |
| BIL-15 | ⛔ | pending-purchase 24-hour expiry sweep — no confirmed job/endpoint for this specific sweep as of this document |
| BIL-16 | ✅ | implied structurally — every balance/wallet charge in this document requires an explicit confirm call, there is no implicit-charge path to even attempt testing |
| BIL-17 | ⛔ | `C`-priority (assumption, off by default), optional, not built |
| BIL-18 | ✅ | implied — no refund endpoint exists anywhere in the inventory to test the absence of; `/operator/tenants/:id/balance-adjust` is the only balance-reducing operator action and it requires a reason, already covered |

### UPG (upgrade)

| ID | Status | Note |
| --- | --- | --- |
| UPG-01 to UPG-06, UPG-08, UPG-09 | ✅ | `/billing/upgrade/quote` + `/confirm`, §6 |
| UPG-07 | ⚠ added | 15-minute quote expiry, folded into `/upgrade/confirm`'s resource/state row |
| UPG-10, UPG-11, UPG-12 | ⛔ | counter-reset assertions need metering endpoints (orders, SMS, bandwidth counters) that don't exist yet; the plan-swap mechanics themselves are covered |
| UPG-13 | ✅ | `/upgrade/confirm` business-rule |
| UPG-14 | ⛔ | add-ons — not built |
| UPG-15 | ✅ | implied via the invoice/audit fields already asserted under `BIL-12`/`AUD-01` |
| UPG-16 | ✅ | `/upgrade/confirm` business-rule (balance vs. wallet) |
| UPG-17 | ✅ | implied — every negative-path row above ends in "nothing changed" |

### DWN (downgrade)

| ID | Status | Note |
| --- | --- | --- |
| DWN-01, DWN-02, DWN-03, DWN-04 | ✅ | `/billing/downgrade/[...]`, §6 |
| DWN-05 | ⛔ | renewal-screen price display — client-side, no distinct endpoint beyond what's already covered |
| DWN-06 | ✅ | §8, lifecycle job (downgrade applies at effective date) — strictly this is `DowngradeService.apply`, a job-boundary test, not a new HTTP call |
| DWN-07, DWN-09 | ⛔ | depend on product/storage endpoints that don't exist |
| DWN-08 | ✅ | → `STF-14`, covered via the seat-overage resolution already proven in slice 6/7's own test suite (service-level; no dedicated HTTP endpoint shows "who stays active" directly, since staff deactivation here is system-triggered, not a request the client sends) |
| DWN-10 | ⛔ | custom domains — not built |
| DWN-11 to DWN-14, DWN-18 | ⛔ | retention-trim notices, the 30-day banner, and paired-listener-device limits all depend on endpoints that don't exist |
| DWN-15, DWN-16 | ⛔ | per-period metered limits — not built |
| DWN-17 | ✅ | implied — every downgrade action in §6 already asserts an audit trail |

### LIF (cancellation, lifecycle, deletion)

| ID | Status | Note |
| --- | --- | --- |
| LIF-01 | ✅ | `POST /billing/cancel`+`/undo`, §6 |
| LIF-02 to LIF-06, LIF-09, LIF-11, LIF-12 | ✅ | §8, lifecycle job's HTTP-observable effects |
| LIF-07, LIF-08 | ⛔ | public-API-key and secret-key routes don't exist yet (Phase 3+'s "Public API" section) |
| LIF-10 | ⚠ added | owner's-own-essential-SMS-stays-free, new block in §2 |
| LIF-13 | ⛔ | courier webhooks — not built |
| LIF-14 | ⛔ | outbound shopper messaging — not built (no shopper-facing messages exist at all yet) |
| LIF-15 | ✅ | `POST /billing/purchase` resource/state — this is the exact restore path where slice 7 found and fixed the unfreeze-before-charge ordering bug |
| LIF-16, LIF-17 | ⛔ | export — not built, explicitly deferred in slice 7's own PR |
| LIF-18 | ✅ | §8, lifecycle job (deletion warnings) |
| LIF-19, LIF-20 | ✅ | §8, lifecycle job (day-60 deletion + survivors) |
| LIF-21, LIF-22 | ⛔ | subdomain reservation / backup retention — explicitly deferred in slice 7's own PR |
| LIF-23 | ✅ | §8, lifecycle job (idempotency) |
| LIF-24 | ✅ | `/operator/tenants/:id/suspend`+`/restore`, §7 |
| LIF-25 | ✅ | implied — every transition in §8 already asserts an audit entry |
| LIF-26 | ⚠ | flagged as a **known partial-implementation caveat** in slice 7's own PR (the non-retroactivity rule); §8's business-rule row already carries this caveat forward rather than asserting a clean pass |

### BAL (balance) / RAT (rates)

| ID | Status | Note |
| --- | --- | --- |
| BAL-01, BAL-03, BAL-04, BAL-05 | ✅ | `GET /balance`, `/top-up/quote`+`/confirm`, §4 |
| BAL-02 | ✅ | implied — every ledger-producing action in this document (top-up, adjust, charge) is append-only by construction, no update/delete endpoint exists to even attempt |
| BAL-06 | ⚠ added | three-way state branch, new bullet in §4 |
| BAL-07, BAL-08, BAL-09 | ✅ | folded into `LIF-15`'s restore test and §4's resource/state row |
| BAL-10 | ✅ | implied — `/top-up/confirm`'s and `/purchase`'s insufficient-balance rows both assert the refusal |
| BAL-11 | ✅ | `/operator/tenants/:id/balance-adjust` retry/concurrency (and the concurrent-charge scenario this requirement literally names is a service-level test already in the repo's own suite, not newly added here) |
| BAL-12 | ⛔ | depends on SMS/chat-AI charge-then-fail reversal — those features don't exist |
| BAL-13 | ⛔ | low-balance notice — `JOB`-type, no endpoint |
| BAL-14 | ✅ | `GET /balance/ledger` happy/AuthN |
| BAL-15 | ⛔ | per-category spend caps — `S`-priority, not built |
| BAL-16 | ✅ | folded into the `RAT` rows below (rate-in-force-at-charge-time) |
| BAL-17 | ✅ | `/operator/tenants/:id/balance-adjust` validation |
| BAL-18 | ✅ | §8, lifecycle job (`LIF-19` + balance survives) |
| RAT-01 to RAT-06, RAT-08 | ✅ | `/operator/rates[...]`, §7 |
| RAT-07 | ⛔ | cost-estimate display — client-side |
| RAT-09 | ⛔ | notice-board publish prompt — notice board not built |
| RAT-10, RAT-11, RAT-12 | ⛔ | depend on order/product-fee charging, which depends on order/product endpoints that don't exist (same gap as the `PYG` fee rows above) |
| RAT-13, RAT-14 | ⛔ | depend on SMS sending and delivery-charge-bearing orders, neither built |

### ADM (operator administration) — only the rows actually implemented in Phase 1/2 scope

| ID | Status | Note |
| --- | --- | --- |
| ADM-01 | ✅ | `/auth/operator/[...]`, §7 |
| ADM-04 | ✅ (partial) | the suspend/restore/balance-adjust/limit-override pieces are built and covered (§7); extend-plan-by-days and reset-an-owner's-sign-in are not built |
| ADM-06 | ✅ | `/operator/payment-queue[...]`, §7 |
| ADM-11 | ✅ | `/operator/settings[...]`, §7 |
| ADM-02, ADM-03, ADM-05, ADM-07 to ADM-10, ADM-12 to ADM-18, SUP-01 to SUP-08 | ⛔ | tenant-list/detail, view-as-tenant, reports, manual payment entry, tickets, notice board — no controllers exist; confirmed Phase 3+ scope, living in SRS section 23 which also covers catalogue/orders/support features not yet built |

---

## Appendix: docs drift found while building this plan (2026-10-15)

`docs/API-CONTRACT.md` is a **pre-implementation draft** and has diverged substantially from the real code. Anyone writing tests from that document alone would be testing routes that don't exist and missing routes that do. Specifically:

1. The entire billing path scheme differs: the doc specifies `/plans/:id/purchase`, `/plan-payments/:id/submit`, `/plans/:id/upgrade`, `/plans/downgrade`, `/plans/cancel`, `/plans/switch-to-payg`; the real code implements a consolidated `/billing/*` controller with entirely different paths (§6 above). `switch-to-payg` and `/addons/*` don't exist in code at all (addons were marked **Deferred** in the doc itself, so that part is consistent).
2. The operator 2FA auth flow (`/auth/operator/signin`, `/enroll`, `/verify`, `/signout`) is undocumented anywhere in `API-CONTRACT.md`.
3. `/operator/settings` (platform settings editor, `GET`+`PATCH`) is entirely missing from the doc.
4. `/operator/rates/:key/history` is undocumented.
5. `/operator/plans/:planId/prices` (`GET`/`PUT`/`DELETE`) — the per-plan, per-term pricing sub-resource — is undocumented; the doc implies prices are set inline on the plan body, which doesn't match the real, separate controller.
6. `/operator/tenants/:id/restore` is undocumented (the doc only has `suspend`).
7. `/operator/tenants/:tenantId/limit-overrides` (`GET`/`POST`/`DELETE`) is undocumented.
8. Conversely, the doc documents several operator/KYC/verification endpoints (`operator/tenants/:id/view-as`, `/verification/*`) that have **no implementation yet** — ahead of the code, not behind it. Don't write tests assuming these exist.
9. Catalogue, orders, couriers, wallets/payment-sessions, SMS, chat, fraud, listener, webhooks, notices, tickets (doc §4–§7, §12–§18) have **no controllers implementing them yet**. Only identity/auth, staff/roles, activity, balance, billing, operator admin surfaces, platform-settings, and health are real as of Phase 1 + Phase 2. This document covers exactly that real set — nothing here tests a route that doesn't exist, and nothing in Phase 1/2 scope is missing from it.

Recommendation: either refresh `API-CONTRACT.md` to match the real `/billing/*` scheme and add the eight undocumented route groups, or mark it explicitly superseded by the controller code for Phase 1/2 and point future readers here and at the controller source directly.
