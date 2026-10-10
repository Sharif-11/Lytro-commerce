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
  api/
    <domain>/
      <resource>/    <resource>-<suffix>.ts
  index.ts           barrel for the whole package
```

- `api/` file suffixes are fixed: `-common` (fragments and action bodies used by more than one endpoint), `-create`, `-update`, `-details`, `-list`.
- Enumerations are TypeScript `enum`s. The database builds its Postgres enums from them, and never redefines values.
- JSON column shapes are types from this package, applied with `$type<...>()`.
- `package.json` declares subpath exports (`common`, `enums`, `plans`). Consumers may import a subpath.
- Zod stays at version 3 until a deliberate upgrade.

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
    health/                  health check
    shared/                  infrastructure shared by modules
      messaging/             outbox, SMS providers and the retry worker
    <module>/                each module has the same layout:
      <module>.module.ts
      controllers/           HTTP only; calls a service
      dto/                   request classes built from validators schemas
      services/              business rules; depends on ports (interfaces), never on the database
      ports/                 interfaces the services need; one file per contract, implemented in database/adapters
      types/                 result and input types that services return or accept
      tokens.ts              injection tokens for the module
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

## 6a. Admin app (apps/admin)

Decided 2026-10-09, while planning slice 9. One Vite + React build, deployed to two hosts (see
`docs/DEPLOYMENT.md`): the tenant-facing domain (sign-up, sign-in, dashboard, staff) and `admin.<platform
domain>` (the operator console). The router picks which route tree to mount by `window.location.hostname` at
boot — one codebase, not two.

```
apps/admin/src/
  main.tsx                 entry point
  router.tsx                TanStack Router setup; host-branches into the tenant or operator route tree
  routes/                   thin: one file per route. Sets metadata and renders a view. No business logic.
    sign-in.tsx, verify-code.tsx, create-shop.tsx, set-password.tsx, forgot-password/
                             transitional auth-flow screens — outside the dashboard layout on purpose
                             (create-shop in particular has no tenant yet to show a dashboard shell for)
    dashboard/
      route.tsx               the layout route: the one session guard, renders the shell around an Outlet
      index.tsx                the dashboard home page
      staff.tsx, roles.tsx, activity.tsx
                               nested under the same layout, same one guard (D32, 2026-10-10 — a regular
                               `dashboard/` directory with a `route.tsx`, not a pathless `_dashboard/` group:
                               the latter collides with the root route's own path)
    operator/                sign-in, enroll, verify
  views/<route>/
    index.tsx                 the real page
    components/                view-local components, used only by this view
  components/
    ui/                       shared primitives (buttons, inputs, dialogs — not view-specific)
    layout/                   the dashboard shell, split by ENGINEERING-STANDARDS.md §2a's
                               container/presentational line:
      dashboard-shell.tsx        container — calls useMe()/useDocumentTitle(), composes the rest
      top-bar.tsx, bottom-nav.tsx presentational — read nav-items.ts, render their own markup (not unified
                                   into one polymorphic component; see §2a/§4 for why)
      nav-items.ts                the one array both nav components read — adding a destination is one
                                   entry here, not an edit to both components (open/closed, §2a)
      brand-mark.tsx, powered-by-mark.tsx
                                   presentational; brand-mark is also used by AuthCard, so it lives here
                                   rather than as a second copy duplicated into auth-card.tsx
      language-toggle.tsx         presentational control over i18n/index.ts's setLanguage/getLanguage
  hooks/                     generic, non-API-specific reusable hooks — distinct from api/<domain>/ the
                             same way the server's ports/ are distinct from its services/
    use-document-title.ts     sets document.title, restores the previous one on unmount; not shop-specific
  api/
    client.ts                  the typed fetch wrapper: attaches the CSRF header on mutating requests, parses
                                the error envelope from @lytronix/shared-types
    <domain>/                  query/mutation hooks (TanStack Query) for one backend module each, mirroring
                                the server's own module names (auth, staff, roles, operator-auth, ...) — a
                                view calls useMe() or useStaffList(), never the client directly (dependency
                                inversion, §2a)
  i18n/                       react-i18next setup; bn.json and en.json dictionaries
  session/
    tenant-session.ts          holds the CSRF token and the last /me result; the auth-init gate protected
                                queries wait on
    operator-session.ts        holds the CSRF token; no gate (no protected operator screens exist yet)
  types/
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
- `apps/admin` may import `@lytronix/validators` and `@lytronix/shared-types` directly (confirmed neither has
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
