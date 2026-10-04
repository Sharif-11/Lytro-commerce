# Engineering standards

Status: draft v1, for review. How the code itself will be built — architecture, patterns, and practices — as opposed to `SRS.md`/`SRS-detailed.md` (what it must do) and `DATABASE-SCHEMA.md`/`API-CONTRACT.md` (the concrete shapes). This document is what I'll hold myself to while writing the actual NestJS/Next.js/React code.

**The budget-vs-scale tension, stated plainly.** We're building for 500 tenants in the first few months, on one VPS, with a real ceiling on what infrastructure we can afford today (DAT-19, DAT-54). We also don't want a rewrite at 10,000. Those two goals aren't in conflict — SCL-01 to SCL-14 already prove the *infrastructure* doesn't need to change until real load demands it. What has to be right from day one is the *code's internal seams*: module boundaries, data-access patterns, and interfaces that don't assume a single small server. Get those right now, cheaply, and scaling later is a deployment change, not a rewrite. Get them wrong to save a week now, and scaling later is a rewrite no matter how much money is available. Everything below is in service of that one idea.

---

## 1. Architecture: modular monolith, not microservices, not a big ball of mud

One deployable NestJS application (SCL-09), not a services-per-module split — a 500-tenant business can't absorb microservices' network calls, distributed transactions and operational overhead, and doesn't need to. But it's built so that any one module *could* be extracted later without touching the others, because:

- **Each module owns its own tables** and is used by every other module only through its public interface (a service class with a defined method signature), never by reaching into another module's repository or writing a cross-module SQL join. This is SCL-09, restated as a coding rule: if I'm tempted to `import` another module's repository directly, that's the signal to add a method to that module's service instead.
- **Layering inside a module** follows one direction only: `Controller → Service → Repository → Database`. A controller never touches the database directly; a service never knows about HTTP; a repository never contains business rules. This isn't ceremony — it's what makes a service testable without spinning up a real database, and what makes swapping the persistence layer (e.g., adding a cache in front of a repository) a one-file change.
- **Cross-module communication is event-based where it doesn't need to be synchronous** (SCL-09's "domain events"): `order.booked`, `payment.confirmed`, `plan.changed` are emitted inside the module that owns the change and consumed by whichever modules care (notifications, webhooks, audit). A module that emits an event doesn't know or care who's listening — that's what lets a future service subscribe to the same event stream without the producer changing at all.

## 2. SOLID, applied to this codebase specifically — not as decoration

- **Single responsibility.** A module is one business capability (catalogue, orders, payments, couriers...), and inside a module a service class does one job (`OrderPricingService` computes prices; it does not also send notifications or touch couriers). If a class's constructor needs more than about five injected dependencies, that's usually a sign it's doing two jobs.
- **Open/closed.** The courier and payment-gateway adapters (CRR-01, WAL-19 — already decided, not new) are the clearest example: adding Pathao or Nagad is a new class implementing a fixed interface, never an edit to the booking or payment-session logic that calls it. The same shape applies to delivery-charge modes (ORD-06a): `Default` and `Adjustable` are two implementations of one `DeliveryChargeStrategy` interface, and a third mode later is a third class, not a rewritten `if/else`.
- **Liskov substitution.** Every courier adapter, every payment adapter, every delivery-charge strategy must be swappable for another implementing the same interface with no caller-side special-casing. The contract test already required for couriers (CRR-21) is exactly this principle enforced automatically — if a new adapter fails that suite, it isn't substitutable yet.
- **Interface segregation.** Don't give every adapter a fat interface with methods most implementations don't need. A courier without a public API (CRR-16, manual tracking-link only) shouldn't be forced to implement `book()` — split the interface (e.g., `TrackableCourier` vs. `BookableCourier`) so a manual courier only implements what it actually does.
- **Dependency inversion.** Services depend on interfaces (a repository interface, an adapter interface), injected by NestJS's container — never on a concrete Postgres client or a specific HTTP library directly. This is what makes unit-testing a pricing calculation possible without a database at all: inject a fake repository that returns fixed data.

## 3. Design patterns, and exactly where each one is used

| Pattern | Where | Why here specifically |
| --- | --- | --- |
| **Adapter** | Couriers (CRR-01), payment gateways (WAL-19) | Third-party APIs vary; the app's core logic shouldn't know or care which one it's talking to. |
| **Strategy** | Delivery-charge modes (ORD-06a), verification levels (manual/listener/gateway, 19.3) | Several interchangeable algorithms for the same job, chosen at runtime by data, not by branching logic scattered through the codebase. |
| **Repository** | Every module's data-access layer | Isolates SQL/query-builder code from business logic; the thing that makes SOLID's dependency inversion actually testable. |
| **Factory** | Resolving a courier/payment adapter instance by its `key` | The registration-by-key pattern already decided (CRR-01, WAL-19) *is* a factory; formalizing it as one keeps adapter instantiation in exactly one place. |
| **Observer / domain events** | Cross-module effects (SCL-09) | Decouples "an order was booked" from "who needs to know" — notifications, webhooks and audit logging all subscribe independently. |
| **Decorator** | NestJS guards/interceptors: auth, tenant-context injection (`SET LOCAL app.tenant_id`), rate limiting, idempotency-key handling | Cross-cutting concerns applied declaratively per route, not copy-pasted into every controller method. |
| **Circuit breaker** | Every outbound third-party call: courier, payment gateway, SMS provider, AI provider | Specified as PRF-05 in `SRS-detailed.md`. A slow or failing courier API shouldn't be able to exhaust the app's connection pool or stall unrelated requests; a breaker trips after N consecutive failures and fails fast until a cooldown passes (see §9). |
| **Idempotency key** | Every write with a cost or side effect (API-11) | Already decided; listed here because it's a real pattern with a real name, not just "a header we check." |

## 4. DRY, specifically (not "never repeat a line of code" — repeating a *decision* is the actual risk)

- **One calculation function, every caller.** Order pricing (ORD-06/06a) is called from order creation *and* the storefront's delivery estimate (SFT-20) — the same function, not two implementations that could drift. This exact principle applies everywhere a number is shown to a user before it's charged: plan-upgrade pricing preview, pay-as-you-go fee estimate (PYG-12), SMS cost preview (SMS-10).
- **One validation path.** The same DTO/validation class is used whether a request comes from the dashboard, a secret key, or a public key (API-18's "the same action through the API and the dashboard produce the same metering and charges" already demands this outcome; sharing the validation code is how it's guaranteed rather than hoped for).
- **One limit-check.** Every plan-limit check reads the tenant's snapshot and overrides through one shared guard (RTE-10, already decided), never a hard-coded number re-typed per feature.
- **The line to not cross.** DRY stops being a virtue when it forces two genuinely different concerns to share code just because they look similar today — e.g., the canonical zilla/thana list (CUS-08) and a courier's own zone list are superficially similar (both "location data") but are kept as two separate tables (CUS-08 vs. CUS-10) on purpose, because they change independently and for different reasons. Shared structure, not shared meaning, is not a reason to merge two concepts.

## 5. Database query practices

**Decided 2026-10-03: Drizzle ORM with drizzle-kit, on PostgreSQL 16 via the `pg` driver.** Chosen because the schema depends on features an ORM's own schema language handles poorly (partial unique indexes, CHECK constraints, multiple schemas `control` and `tenant`, row-level security policies). Migrations are generated SQL files, reviewed in source control before they run (DAT-04). Repositories use Drizzle's query builder; raw SQL is allowed where it is clearer, such as RLS policies and `SET LOCAL app.tenant_id`.

Most of this is already decided in `DATABASE-SCHEMA.md`; this section is the *habits*, not the schema:

- **Every tenant-scoped query starts from an index that has `tenant_id` first** (already the pattern throughout the schema) — a query plan that does a sequential scan on a tenant table fails code review, full stop.
- **Keyset pagination, never `OFFSET`** for any list that can grow past a page or two (CCH-11) — offset pagination gets linearly slower as the offset grows, which is exactly the failure mode that shows up first at real scale.
- **No N+1 queries.** Loading a list of orders and then querying each order's lines in a loop is a bug, not a style choice — batch-load with one `WHERE order_id = ANY($1)` query, or a join, chosen by whether the caller needs the lines at all.
- **Read-only queries use the read pool** (DAT-41, already decided) — this needs to be enforced by a lint rule or a repository-layer convention (e.g., read-only repository methods are physically a different injected client), not left to a developer remembering it per call site.
- **Every migration is expand-then-contract** (DAT-04, already decided): add the new column/table nullable, deploy, backfill, only then make it required and remove the old shape in a later migration — never a single migration that breaks the previous release.
- **`EXPLAIN ANALYZE` on anything touching a hot endpoint** (catalogue read, order create, payment session, upload — DAT-17) before it merges, not after it's slow in production.

## 6. Caching strategy

Already fully specified in `SRS-detailed.md` §14.3 (CCH-01 to CCH-13) and `SRS.md`'s PRF-2 — restated here only as the one-line summary worth keeping in mind while coding: **device cache → Cloudflare edge → in-process memory cache → PostgreSQL, in that order, with a per-tenant catalogue version as the invalidation key instead of purging, and checkout/order-creation never served from any cache.** Nothing new to design here; the discipline is not accidentally adding a second caching mechanism that doesn't respect that version key.

## 7. CI/CD pipeline

Not yet specified anywhere else — new content.

**Source control.** Trunk-based with short-lived feature branches; every change lands via a PR, even solo, so there's a reviewable diff and a place for CI to gate. Added 2026-10-02: while solo, CI green is the merge gate (no second-reviewer requirement, since there is no second person) — the moment a second engineer joins, branch protection shall require at least one reviewer's approval in addition to green CI, and this line shall be revisited rather than left as an assumption each person interprets differently.

**Pre-commit (local, via Husky):** a `pre-commit` hook runs `lint-staged`, which runs ESLint `--fix` and Prettier `--write` on staged files only (fast — seconds, not a full-repo pass), and a `commit-msg` hook runs commitlint against the conventional-commit format already required (§10). This is a developer convenience, not the enforcement point — it catches most issues before they're even pushed, but someone can `--no-verify` past it, which is exactly why CI runs the same checks unconditionally below as the actual gate.

**CI (on every push/PR):**
1. Install, `tsc --noEmit` (TypeScript strict mode, no implicit any).
2. Lint (ESLint) and format check (Prettier) — fails the build, not just a warning. Same rules the pre-commit hook used, run here without `--fix` (CI reports, it doesn't rewrite code) so a bypassed or skipped hook can't let something through.
3. Unit tests (services in isolation, mocked repositories/adapters).
4. Integration tests (real Postgres in a CI-spun container, exercising repository + service layers together).
5. Build (NestJS server, Next.js storefront, Vite admin) — a build failure blocks merge.
6. Contract tests for any adapter (CRR-21) — run whenever an adapter file changes.

**CD (on merge to trunk):**
1. Build a versioned artifact (container image) once; the same artifact is what gets deployed everywhere, never rebuilt per environment.
2. Deploy to staging automatically; smoke test (the same scripted order-and-payment check from OBS-08) runs against it. Added 2026-10-02: a failed smoke test halts the pipeline before any production step is even offered, alerts the operator the same way a production page would (not a silent log line), and the failing artifact is never eligible for promotion — the next deploy to staging is a fresh attempt (a new commit, or a manual retry), not an automatic skip-ahead.
3. Manual promotion to production (not automatic — a person approves, given real money moves through this system); the thing promoted is the exact artifact that passed staging's smoke test, never a rebuild.
4. Production deploy follows the already-decided sequence (AVL-05): standby first, health check, then primary, zero-downtime reload. At launch (phase 1, one server) this collapses to a single health-checked reload; the pipeline step doesn't change when phase 2 adds the standby — only which servers it targets does.
5. Migrations run as their own pipeline step, before the new code deploys, against a fresh backup (DAT-04) — never bundled invisibly into the app's own startup.

**Rollback.** The previous container image stays available and redeployable in one step; expand-then-contract migrations (§5) mean the previous release keeps working against the new schema, so a code rollback is never blocked on a database rollback.

## 8. Testing strategy

- **Unit tests** — one module's service logic, dependencies mocked. Fast, run on every save during development.
- **Integration tests** — a module's service *and* repository together, against a real (containerized) Postgres, to catch what mocks hide: real constraints, real query behavior.
- **Contract tests** — every courier/payment adapter against the shared interface suite (CRR-21), before it's ever enabled for a tenant.
- **E2E tests** — the twelve suites already defined in §26.1 of `SRS-detailed.md` (S01–S12), run against a running instance with test doubles for external providers (§26.3).
- **Load tests** — DAT-32's pre-launch test and the ongoing SCL-01 capacity-model reviews are load testing, formally; nothing new to add here beyond keeping them in the same pipeline's vocabulary.

## 9. Circuit breakers on outbound calls — now a formal requirement

Decided: every outbound third-party call (courier adapter, payment gateway, SMS, AI, fraud aggregator) goes through a circuit breaker, not just a timeout (CRR-18's 30s remains the per-call timeout; the breaker is what stops a provider's bad day from costing connection-pool and worker capacity that unrelated tenants' requests need). After 5 consecutive failures the circuit opens and refuses fast (no outbound attempt) for 60 seconds, then one trial call decides whether to close it again — scoped per tenant-and-provider-account for couriers and gateways (credentials are per-tenant), per-provider for SMS/AI/fraud (credentials are platform-level). Formalized as `PRF-05` in `SRS-detailed.md`, with a courier-specific cross-reference at `CRR-26`.

## 10. Code quality conventions

- TypeScript strict mode everywhere, no `any` without a comment explaining why.
- **Classes, not free functions.** Services, controllers, repositories, helpers, rules and the entry point are classes. Dependencies and settings (a secret, a clock, a platform domain) are injected through the constructor, not passed on every call. Module-level constants and type declarations are fine. Two cases stay functions because the language requires it: decorators (`SkipTenant`) and declarative column helpers used by the schema (`createdAt`). Adopted 2026-10-04.
- **Explicit injection tokens.** Every class-typed constructor parameter in a Nest class carries an `@Inject(...)` token, so wiring does not depend on decorator metadata emitted by the build tool.
- ESLint + Prettier, enforced in CI, not just editor config — Husky + lint-staged mirror the same two checks locally at commit time (§7), so feedback arrives in seconds instead of at the next CI run.
- Conventional commit messages (`feat:`, `fix:`, `refactor:`...) — cheap, and it's what makes a changelog and a bisect useful later. Enforced by a Husky `commit-msg` hook running commitlint, not left to memory or review comments.
- **Deferred, not forgotten:** static-analysis/security scanning (Semgrep, self-hosted SonarQube Community Edition) and dependency-vulnerability scanning (Dependabot) are deliberately out of scope for launch — same budget-vs-scale reasoning as §0, since ESLint/Prettier/Husky/tsc already catch the highest-value issues for free and these tools add setup/maintenance cost without a user base yet big enough to justify it. Revisit when either triggers: (a) the team grows past ~2-3 developers (bug classes ESLint can't catch start costing real review time), or (b) a real security incident or paying-tenant data breach risk makes the extra scanning worth it. Dependabot is the cheapest of the three to turn on early (zero maintenance, free on private GitHub repos) if that trigger arrives before the others.
- A PR description states *what* and *why*, not just *what* — the same "why over what" discipline the SRS itself has followed throughout.

## 11. How this all actually answers "500 now, 10,000 later"

Nothing in this document costs extra infrastructure — it's free at 500 tenants and is exactly what makes the SCL-01 to SCL-14 scaling roadmap possible without a rewrite:

- Module boundaries (§1) are what let a module become a separate service later (SCL's 10,000+ tier) by changing *where* it runs, not *how* it's written.
- The repository pattern (§3) is what lets a read-heavy repository grow a cache, or point at a read replica (already true at launch per DAT-41), without touching the service layer that calls it.
- Adapter/strategy patterns (§3) are what let a new courier, payment method, or pricing mode show up as a new file, never a spreading `if/else` that gets harder to change every time.
- The CI/CD pipeline (§7) is what makes "add a server" (DAT-56, DAT-57) a configuration change to an existing deploy step, not a new pipeline built under pressure at 500 tenants.

In short: the discipline is the cheap part. It's what's paid for once, now, instead of paid for twice — once badly under pressure later, and once properly in a rewrite after that.
