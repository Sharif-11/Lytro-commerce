# Coding conventions and file structure

Status: adopted 2026-10-04. How code is written and where it lives. `ENGINEERING-STANDARDS.md` says why; this document says what to do. Where the two disagree, fix this document and the standards together. Reviewers check new code against this document.

## 1. Repository layout

```
apps/server/src/          NestJS modular monolith
packages/db/              @lytronix/db: connection, schema, repositories, migrations, database tests
packages/validators/      @lytronix/validators: request shapes, shared limits, enumerations, plan shapes
packages/shared-types/    @lytronix/shared-types: error codes and API envelope types
packages/config/          shared TypeScript configuration
docs/                     requirements, designs, plans and this document
```

Dependency rules (enforced by lint where possible):
- `validators` and `shared-types` import no internal package.
- `db` imports only `validators`.
- `server` imports `db`, `validators` and `shared-types`.
- Applications never import `db` directly except through the server.

## 2. Language rules

- **Classes, not free functions.** Services, controllers, repositories, adapters, helpers, rules and the entry point are classes. Settings (a secret, a clock, a platform domain, a pool size) come through the constructor, not through each call.
- **Two exceptions** stay functions because the language requires it: decorators (`SkipTenant`) and declarative schema helpers (`createdAt`).
- Interfaces and result types live in the module's ports/ and types/ folders, not in the service file. A service file holds the class and the constants used only by that class.
- **Explicit injection tokens.** Every class-typed constructor parameter in a Nest class carries `@Inject(...)`. Wiring must not depend on decorator metadata, which the test runner does not emit.
- **No `any`, and no unchecked casts.** Narrow with checks, generics or inferred types. A precise cast is allowed only with a one-line reason.
- **File names are kebab-case.** Classes are PascalCase; the file that holds them is kebab-case.
- **Commit messages** follow conventional commits, with lowercase subjects and lines under 100 characters.

## 2a. Branch names

- A branch that builds on another is named after the branch it builds on: `refactor/signup-phone` is the refactor of `feat/signup-phone`. Its name shows where it came from, so nobody has to read its history to understand it.
- The prefix states the kind of change: `feat/`, `refactor/`, `docs/`, `test/`, `fix/` or `chore/`.
- Merge the parent first. Then rebase the child on `main`, so its pull request contains only its own commits.
- A branch for a reusable or infrastructure piece (a queue, a cache, a client library) ships that piece alone, proven by its own test, with no business feature wired to it yet. Wiring a consumer onto it is a separate branch, built after this one merges. Adopted 2026-10-07, from the job queue (`feat/job-queue`): the branch built the queue mechanism and stopped there; migrating SMS and building mail's outbox onto it are follow-up branches.

## 2b. Injection tokens

- Each module has a `tokens.ts`. A token is a `Symbol` named in UPPER_SNAKE_CASE after what it provides: `CHALLENGE_STORE` provides the `ChallengeStore` port, and `OTP_SECRET` provides the secret setting.
- A class that is its own provider uses the class as its token, with no entry in `tokens.ts`. Repositories and the transaction runner work this way (`AccountRepository`), and an adapter injects them with `@Inject(AccountRepository)`.
- The module that registers a provider owns its token. A token needed by two modules moves to the module that provides it, and the other module imports it.
- Infrastructure tokens that every module uses (`ENV`, `DatabaseService`) live in `config/` and `database/`, and their modules are global.

## 3. One definition per concept

A limit, an enumeration, a type shape or a constant is defined in exactly one place and imported everywhere else.

| Kind | Home |
|---|---|
| Request limits (name length, slug format, code length) | `packages/validators/src/common/limits.ts` |
| Enumerations (tenant state, KYC and domain status, SMS kind and status, identity kind) | `packages/validators/src/db/enums.ts` |
| Plan limits shape | `packages/validators/src/db/plans/plan-limits.ts` |
| Request shapes (API DTO schemas) | `packages/validators/src/api/<domain>/<resource>/` |
| Field problem codes, field names and their Bangla/English messages (API-16) | `packages/validators/src/validation/` |
| Postgres enums | `packages/db/src/schema/enums.ts`, built from the validators enums |
| Table row types | Each table file: `Select<Name>`, `Insert<Name>`, `Update<Name>` |
| Durations | `apps/server/src/common/time.ts` |
| Business rules and their settings | The owning service |
| Pool and connection settings | Validated environment, passed into `DatabaseConnector` |

A shape that matches another is an alias of the shared type. It is never copied.

## 4. Validators package

```
packages/validators/src/
  common/            limits.ts, index.ts
  db/                enums.ts, plans/plan-limits.ts
  validation/        field problem codes, field labels, messages, fieldProblemsOf
  api/
    <domain>/
      <resource>/    <resource>-<suffix>.ts     -- a domain with several schemas per resource
      <action>.ts                               -- a domain with one schema per action, no resource nesting
  index.ts           barrel for the whole package
```

- `api/` file suffixes are a loose convention, not a fixed enum — **corrected 2026-10-16**: the
  `-common`/`-create`/`-update`/`-details`/`-list` set describes `staff/`, `roles/`, `activity/`'s own
  files, but most domains added since (`balance/`, `billing/`, `operator/`, `platform/`, `auth/`) use plain
  free-form action names directly under the domain folder with no `<resource>/` nesting at all —
  `balance/top-up.ts`, `billing/purchase.ts`, `billing/upgrade.ts`, `billing/downgrade.ts`,
  `platform/tenant-search.ts`, `auth/auth-code.ts`, and so on. Use `<resource>/<resource>-<suffix>.ts` when
  a domain genuinely has several schemas for the same resource; otherwise a plain `<action>.ts` is fine.
- Enumerations are TypeScript `enum`s. The database builds its Postgres enums from them, and never redefines values.
- JSON column shapes are types from this package, applied with `$type<...>()`.
- `package.json` declares subpath exports (`common`, `enums`, `plans`). Consumers may import a subpath.
- Zod stays at version 3 until a deliberate upgrade.
- Schemas carry rules, not wording. What a person reads when a field fails comes from `validation/`:
  `fieldProblemsOf` turns a failed check into one problem per field (`too_short`, `required`, ...), and
  `fieldProblemMessage` words it in Bangla or English. The server and the dashboard both use these, so a field
  says the same thing before and after a request is sent.
- A new request field needs an entry in `FIELD_LABELS`, in both languages (`null` only when its meaning differs
  between requests); a test fails otherwise. A field that needs an example of the right format (phone, code,
  shop URL) gets a message in `FIELD_MESSAGES`.
- A custom check (`refine`, `superRefine`) names its problem with `params: { problem: FieldProblemCode.X }`
  and the field it is about with `path`; without them it is reported as a format problem on the whole request.

## 5. Database package

```
packages/db/
  drizzle/                 SQL migrations and snapshots; never regenerated from scratch
  drizzle.config.ts
  src/
    client.ts              DatabaseConnector: builds a pool from a URL and settings
    migrate.ts             MigrationRunner
    transactions.ts        TransactionRunner, Transaction and Executor types
    index.ts               package barrel
    schema/
      shared.ts            Postgres schemas and the createdAt helper
      enums.ts             Postgres enums built from validators
      index.ts             barrel (drizzle-kit reads it)
      control/             identity, plans, platform, sessions, signup, tenancy
      tenant/              audit, staff
    repositories/
      <module>/            <entity>.repository.ts, one class per entity
  test/                    database tests and their setup
```

- Repositories are plain classes. Each method takes an executor as its first argument, so it runs on the pool or inside a transaction.
- A repository never contains business rules, and never imports another module's repository.
- Every migration is additive where possible (expand, then contract). Each new table gets its grants in the same migration, and a constraint-name check is kept in the tests.
- The migration check must report no changes after any schema edit: `pnpm --filter @lytronix/db generate`.

## 6. Server

```
apps/server/src/
  main.ts                    entry point: an Application class
  app/app.module.ts          composition root
  config/env.ts              EnvironmentParser (validated settings) and tokens
  common/                    cross-cutting code, used by every module
    api-error.ts             ApiError and the status map
    api-error.filter.ts      renders ApiError in the documented shape
    decorators/              SkipTenant
    errors/                  UniqueViolation, SmsDeliveryError
    guards/                  TenantGuard, EdgeSecret
    pipes/                   ZodValidationPipe
    time.ts                  durations
  database/                  database providers and adapters
    database.module.ts       global: connection, repositories and the transaction runner as providers
    database.service.ts      owns the pool; closes it on shutdown
    adapters/                <module>.adapter.ts: implements a module's ports with repositories
  modules/                   every domain module lives here
    identity/                sign-up by phone
    tenancy/                 tenant resolution, slugs, trial shops
    staff/                   staff accounts
    audit/                   platform/tenant activity log (Phase 2)
    balance/                 ledger, rates, top-up (Phase 2, D2-8)
    billing/                 plans, terms, prices, purchase/upgrade/downgrade, lifecycle state machine (Phase 2, D2-8)
    operator/                operator session/2FA guards (Phase 2 slice 8's console sign-in)
    payments/                plan payments, invoices (Phase 2)
    platform-settings/       operator-editable platform-wide settings (stage lengths, etc.)
    health/                  health check
    shared/                  infrastructure shared by modules
      messaging/             outbox, SMS providers and the retry worker
    <module>/                each module has the same layout:
      <module>.module.ts
      services/              business rules; depends on ports (interfaces), never on the database
      ports/                 interfaces the services need; one file per contract, implemented in database/adapters
      types/                 result and input types that services return or accept
      tokens.ts              injection tokens for the module
    team/                    **the one deliberate exception, added 2026-10-16**: every HTTP controller and
                              request/response DTO for balance/billing/operator/staff/roles/activity actually
                              lives here, not inside each domain module above — `team/controllers/*.ts`,
                              `team/dto/*.ts`. The domain modules above have no `controllers/`/`dto/` of
                              their own at all; `team` is the shared HTTP layer across them, calling into
                              each one's real service the normal way. Not yet reconciled with the
                              "each module has the same layout" rule two lines up — flagged, not resolved.
```

### Layering

- A controller calls a service. It never touches the database, messaging or a repository.
- A service holds the business rules. It depends on ports (interfaces the service owns) and on other modules' services, never on Drizzle or repositories.
- An adapter implements a port by calling repositories. It is the only place where repositories and the database appear in the server.
- Repositories receive their dependencies through their constructors. Adapters receive repositories and the database service through their constructors. Modules register adapters as classes.

### Cross-module work

- A module uses another module only through its service. For example, sign-up creates a shop by calling the tenancy service, and the tenancy service calls the staff and messaging services.
- A transaction that spans modules is opened by the module that starts the work, and passed down as a `Transaction` argument.
- Messages are recorded in the same transaction as the change that caused them, and sent after commit. A send failure never fails the request that created the message.

### Validation

- Request bodies are validated by `ZodValidationPipe`, with the schema named on each route, for example `@Body(new ZodValidationPipe(CreateShopDto.schema))`.
- Rules that need data (uniqueness, reserved names, phone normalisation against the rules) stay in services.

### Configuration

- The server reads settings only through `EnvironmentParser`. Nothing else reads `process.env` except the entry point's bootstrap and the test setup.
- Every variable a turbo task reads is listed in that task's `env` in `turbo.json`.

## 6a. Dashboard app (apps/dashboard)

Rebuilt 2026-10-19 from `ONBOARDING-FLOW-DESIGN.md` as a fresh Vite + React app serving only the tenant side at
`app.lytro.app` (D3-12). The old `apps/admin`, which also carried the operator console and picked its screens
by hostname, was removed; `apps/operator` (§6b) took the console the same day. Shared code (`packages/ui`,
`packages/api-client`, PHASE-3-PLAN Slice 0b) is still to be extracted; until then each app carries its own
copy of the request wrapper, the error mapping, the icons, the wordmark and the primitives.

```
apps/dashboard/src/
  main.tsx                 entry point: query client, router, the one /me auth-init call
  router.tsx               TanStack Router setup over the generated route tree
  routes/                  thin: one file per route, a search schema and a view. No business logic.
    index.tsx               / → /shops when signed in, /sign-in otherwise
    sign-in.tsx, verify-code.tsx, auth/oauth/$provider/callback.tsx
    create-shop.tsx, checkout.tsx, set-password.tsx, set-up.tsx
                             the onboarding steps (AUTH-28), each with its own session guard since there is no
                             shop yet to hang a layout on
    shops.tsx               lands on the person's shop (TEN-31)
    staff-sign-in.tsx, staff-set-password.tsx, forgot-password/, unavailable.tsx
    $shop/
      route.tsx              the layout route: the one session guard, renders ShopShell around an Outlet
      index.tsx              the dashboard home
      orders.tsx, products.tsx, customers.tsx, more.tsx
      plans.tsx, balance.tsx, invoices.tsx, staff.tsx, roles.tsx, activity.tsx, settings.tsx, account.tsx
                             the Phase 1–2 sections, gated per permission inside the view
  views/<screen>/
    index.tsx                the real page; sibling files are view-local pieces (checkout/plan-picker.tsx)
  components/
    ui/                      primitives: button, text-field, otp-input, chip, notice, icon, language-toggle,
                             step-frame (the onboarding shell with the progress bar), confirm-dialog, fields
                             (select, checkbox row, page header, card, page column)
    brand/                   the mark, the wordmark, Powered by Lytro, the Google and Facebook marks
    layout/                  the shop shell, split on ENGINEERING-STANDARDS.md §2a's container/presentational
                             line: shop-shell.tsx (container, reads /me) over sidebar.tsx, bottom-nav.tsx,
                             shop-header.tsx, lifecycle-banner.tsx (presentational); nav-items.ts is the one
                             list both navs render
  api/
    client.ts                the typed fetch wrapper: CSRF header on mutating requests, the error envelope
    me.ts, auth.ts, billing.ts, balance.ts, staff.ts, activity.ts, shop-settings.ts, identities.ts
                             query/mutation hooks per backend module; a view calls useMe(), never the client
    error-message.ts         ErrorCode → copy, exhaustive, no default
  session/
    tenant-session.ts        the CSRF token and the last /me; the auth-init gate guards wait on
    sign-up-intent.ts        the claimed address and picked plan, carried through step 1 (AUTH-28/29)
    shop-setup-store.ts      the set-up answers and the share-link tick, per device until the endpoints exist
    next-step.ts             NextStep → route, exhaustive
  lib/                       pure helpers with injected settings: app-config, slug, phone, pricing-table, money
  hooks/                     generic hooks: use-document-title, use-countdown, use-copy-to-clipboard
  i18n/                      react-i18next; bn.json and en.json
  types/                     structural duplicates of server response shapes (me, auth, billing)
```

- **React components stay functions.** This is the one place §2's "classes, not free functions" rule does not
  apply — React's own model (hooks) requires function components. The rule still applies to everything in this
  tree that is *not* a component: `client.ts`, the two session holders above, are classes with injected
  config, the same shape the server's own services use.
- Stack: TanStack Router (file-based) and TanStack Query (server state) — not React Router or Redux Toolkit.
  Chosen over RTK Query specifically to avoid adopting Redux as the app's state layer for an app that has no
  cross-cutting client state that needs it (see the comparison in the slice 9 planning discussion for the
  fuller reasoning).
- The language choice (Bangla default, English toggle, I18N-01) persists per device via `localStorage`, not
  per account (D31) — no backend call needed for this.
- A component mirrors the one-view-one-folder shape above rather than growing into a grab-bag file. No fixed
  line-count cap is adopted (the 150-line rule from a sibling project's own convention was considered and not
  carried over without evidence it's needed here yet) — split a component when it's doing two things, the same
  single-responsibility judgement call §2's layering already asks for everywhere else.

## 6b. Operator app (apps/operator)

Built 2026-10-19 as its own Vite + React app at `admin.lytro.app` (D3-12), the inverted console of
`BRAND-IDENTITY.md` §8.4: dark chrome, teal-400 primary, marigold eyebrow, English by default with the Bangla
toggle. Same stack and the same layering as §6a; no `/me` for operators, so the session holder answers from
the CSRF token alone and a 401 on any call clears it (`main.tsx`).

```
apps/operator/src/
  main.tsx                 entry point: query client with the 401 handler, router
  routes/                  thin: index (→ queue or sign-in), sign-in, _console (the one session guard + shell)
    _console/              payment-queue, tenants, plans, billing-terms, rates, settings, wallets, account
  views/<screen>/          sign-in (credentials, enroll with the QR drawn client-side, backup codes, verify),
                           payment-queue, tenants (list + the one panel: suspend/restore, balance adjust,
                           limit overrides, assign plan), plans (form, list, prices, versions), billing-terms,
                           rates, settings, wallets, account (backup-code regeneration)
  components/
    ui/                    the dark primitives: button, text-field (+ textarea), chip/tag, notice, fields,
                           confirm-dialog, icon, language-toggle
    layout/                console-shell (sidebar from 1024 px, menu sheet below), auth-frame, nav-items
  api/                     client.ts, error-message.ts, operator-auth, plans, billing-terms, rates, settings,
                           tenants, payment-queue, platform-wallets
  session/                 operator-session.ts (CSRF key lytro.operator.csrf)
  lib/                     limit-keys (from planLimitsSchema, the one list), dates, money, download, use-copy
  types/operator.ts        structural duplicates of the operator response shapes
```
- `apps/dashboard` may import `@lytronix/validators` and `@lytronix/shared-types` directly (confirmed neither has
  a Node-only dependency) — reusing a zod schema or an enum from there is preferred over redefining it
  client-side, the same "one definition per concept" rule §3 states for the server.
- SOLID and the frontend design patterns this tree is built around (container/presentational, the `api/`
  layer as a facade, a custom hook as the unit of reuse) are written up in full in
  `ENGINEERING-STANDARDS.md` §2a and §3a — this section is the file tree those principles produce, not a
  restatement of the reasoning behind it.

## 7. Database connection

- The pool is built by `DatabaseConnector.connect(url, settings)` with the settings from validated configuration: maximum connections (default 5), connection wait (5 seconds), statement limit (10 seconds), and the application name `lytronix-server`.
- Migrations use one connection with no statement limit, named `lytronix-migrations`.
- The pool is closed on shutdown by `DatabaseService`.

## 8. Testing

- Services are unit-tested with fake ports. The clock and the secret are injected, so time-based rules are tested exactly.
- Adapters are unit-tested with fake repositories where their own logic matters, such as error mapping.
- Database tests run against a migrated database, one database per suite name, so suites never share state.
- End-to-end tests start the real application module over HTTP.
- Tests do not replace typecheck. Run typecheck, lint, tests and the migration check before a commit.

## 9. Checks before a commit

```
pnpm --filter @lytronix/validators build
pnpm --filter @lytronix/db build
pnpm --filter @lytronix/db generate          # must report no schema changes
pnpm -r typecheck
pnpm -r test
npx eslint <changed paths>
```

## 10. Changing this document

Add a rule here when a decision is made, with its date. Remove or amend a rule the same way. The memory notes and the engineering standards must not contradict it.
