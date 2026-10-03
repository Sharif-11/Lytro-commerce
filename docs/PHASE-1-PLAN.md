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
| D10 | Language storage | Staff choice saved on the account; shopper choice saved on the device (I18N-02). | Slices 9 |

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

- **`packages/db` (`@lytronix/db`)** holds the database layer: the connection factory, the migration runner, the drizzle-kit configuration and migrations, the schema split by area (`schema/shared.ts`, `schema/control/{platform,identity,tenancy,plans,sessions}.ts`, `schema/tenant/{staff,audit}.ts`), and the database tests. Repositories are **not** in this package.
- **Repositories live in `packages/db/src/repositories/<module>/`**, grouped by module, the compromise chosen in the discussion. A lint rule stops a module's services from importing another module's repository folder. Repositories return table row types only, so the package never depends on the server.
- **`packages/validators` (`@lytronix/validators`)** holds the Zod schemas, the single source for every request shape. DTO classes are created with `createZodDto(schema)`, so no shape is written twice. Validation rules use Zod only. Business rules stay in services.
- **Server module folders** are domain-grouped with layer folders inside each one: `controllers/`, `dto/`, `services/`. No repository folder in the server.
- **Dependency rules, enforced by lint (`import/no-cycle`):** `validators` and `shared-types` import no internal package. `db` imports only `validators`. The server imports `db`, `validators` and `shared-types`. Apps never import `db` directly.
- **OpenAPI** is generated from the Zod schemas, not from decorators. API-15 is read accordingly.
- **Owner password** lives on `control.subscribers.password_hash`. `tenant.users.password_hash` is null for the owner row and set only for staff.
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

- **Auth and onboarding (§2):** `signup`, `signup/verify`, `auth/oauth/*` (slice 6), `auth/signin`, `auth/signout`, `auth/forgot-password`, `auth/change-password`, `me`, `me/identities` (add, remove).
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

### Slice 4: sign-up by phone
- **Branch:** `feat/signup-phone`
- **Depends on:** slices 2 and 3; decisions D3 and D6.
- **Delivers:** Bangladeshi phone validation with normalisation; OTP generation, storage as a hash, expiry, single use; the wrong-code lock; resend cooldown and hourly cap; subscriber, owner user and trial tenant created in one transaction; the trial plan from the seeded `control.plans`; the "shop ready" message through the stub.
- **Requirements:** AUTH-01, AUTH-02, AUTH-04, AUTH-05, AUTH-06, AUTH-07, AUTH-09, AUTH-10, AUTH-21, SMS-18, TRL-01, TRL-02, TRL-05 (counter starts), TEN-15.
- **Done when:** a new phone signs up end to end; a sixth wrong code is refused even when correct; a second resend within 60 seconds is refused with a retry hint; the trial is created with the trial limits; the shop-ready stub message contains the live URL.

### Slice 5: sign-in, sessions and recovery
- **Branch:** `feat/signin-sessions`
- **Depends on:** slice 4; decisions D1 and D2.
- **Delivers:** password sign-in with identical errors for unknown accounts and wrong passwords; lockout after five failures in fifteen minutes per account and IP; session creation, expiry at seven days, sign-out, and revocation on password change or deactivation; forgot-password with identical responses and one request per two minutes; temporary passwords that force a change before any other route; change-password that ends other sessions.
- **Requirements:** AUTH-03, AUTH-12 to AUTH-20, AUTH-22, AUTH-23, SEC-07, SEC-14 (CSRF token on every state-changing request).
- **Done when:** the sign-in response is byte-identical for an unknown phone and a wrong password; the sixth attempt is throttled even with the right password; a signed-out session is refused; a temporary password blocks every route except change-password.

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
- **Delivers:** staff creation by the owner with a phone and password; roles built from the permission list; permission checks on every endpoint; seat limit counting the owner plus active staff; deactivation that ends sessions at once; reactivation that re-checks the seat limit; the owner role that can never be changed or removed; owner password reset for staff.
- **Requirements:** STF-01 to STF-14.
- **Done when:** the Trial's second staff member is refused with `plan_limit_reached`; a permission removed mid-session applies on the next request; a role in use cannot be deleted; a deactivated user's session ends immediately.

### Slice 8: activity log
- **Branch:** `feat/activity-log`
- **Depends on:** slices 5 and 7 (the events come from them).
- **Delivers:** a writer used by every identity and staff event; the Activity page API with filters for date range, actor and action; retention purge by a scheduled job; operator actions shown with "Platform support" as the actor.
- **Requirements:** AUD-01 to AUD-08, LIF-25 (state transitions audit, the writer exists here for later use).
- **Done when:** each listed action produces exactly one entry; no entry contains a password, OTP or key; a user without `audit:read` gets 403; a tenant never sees another tenant's entries.

### Slice 9: dashboard shell
- **Branch:** `feat/dashboard-shell`
- **Depends on:** slices 4 to 7 (the API it calls).
- **Delivers:** sign-up, sign-in, change-password and staff screens in `apps/admin`; the tenant name, tab title and logo in the navigation (a placeholder logo until the owner uploads one); the "Powered by" mark; Bangla by default with an English toggle that changes every visible label; the staff language choice saved to the account (I18N-02).
- **Requirements:** TEN-16, TEN-18, I18N-01, I18N-02, plus the screens for AUTH and STF flows.
- **Done when:** a new session opens in Bangla; the toggle changes every label; two tenants' dashboards show different names in the same browser without a refresh.
- **Note:** PWA install per tenant (TEN-17) is in scope but is verified in the browser at the end of the phase, since it needs the built app.

### Slice 10: operator login with two-factor
- **Branch:** `feat/operator-login`
- **Depends on:** slice 1; decision D8.
- **Delivers:** operator accounts separate from subscribers; TOTP enrolment that shows the QR code and secret once and requires one valid code to confirm; ten single-use backup codes; mandatory two-factor for every operator, with no toggle; break-glass recovery as a logged database action.
- **Requirements:** ADM-01, ADM-18, SEC-10 (break-glass part), SEC-14 for the operator session.
- **Done when:** a tenant credential cannot sign in to the console; an unconfirmed operator cannot use the account; a backup code works once.

---

## 7. Order and parallel work

```
1 schema ──► 2 resolver ──► 3 isolation ──► 4 sign-up ──► 5 sign-in ──┬──► 6 identities
                                                              │        ├──► 7 staff ──► 8 activity
                                                              │        │
1 schema ───────────────────────────────────────────────────────────────┴──► 10 operator login
                                                                                  
                                                                       5,7,8 ──► 9 dashboard shell
```

- Slices 6, 7 and 10 can run in parallel once their dependencies are merged.
- Slice 9 waits until the APIs it calls exist, so it comes after 7 and 8.
- If time is short, the first milestone is slices 1 to 5 plus 9. That gives sign-up and sign-in with a usable dashboard.

---

## 8. Non-functional requirements for this phase

- **Rate limits:** OTP per phone, per IP and per tenant (SMS-11); sign-in per account and IP (AUTH-14); sign-up per IP per hour (SUP-08). The in-process limiter is used now; Redis replaces it when it's added to compose (RED-02).
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
| Single-person review | Mistakes pass unnoticed | Pull request checklist, CI, and the isolation suite as an automatic reviewer |

---

## 10. Definition of done (per slice)

1. Requirements listed for the slice have passing automated tests named after their IDs.
2. Migrations reviewed; the previous release still works against the new schema (DAT-04).
3. `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build` pass locally and in CI.
4. The pull request template checklist is completed.
5. No new endpoint is merged without an isolation test case.
6. Activity log entries exist for every auditable action in the slice.
