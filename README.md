# Lytronix commerce platform

Multi-tenant commerce platform (monorepo).

## Layout

| Path                    | Contents                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `apps/server`           | NestJS API and background jobs                                                                        |
| `apps/storefront`       | Shared, tenant-branded shopper storefront (Next.js)                                                   |
| `apps/dashboard`        | Tenant dashboard at app.lytro.app: sign-up, onboarding, every shop at /<slug> (Vite + React)          |
| `apps/operator`         | Operator console at admin.lytro.app: 2FA sign-in, payment queue, tenants, plans, rates (Vite + React) |
| `apps/website`          | Marketing site (Next.js) — added to this table 2026-10-16, pre-existing in the repo                   |
| `packages/shared-types` | Types shared between apps (API error contract)                                                        |
| `packages/validators`   | Zod request schemas and shared enums (also shapes the Drizzle schema)                                 |
| `packages/db`           | Drizzle schema, repositories, migrations, transaction runner                                          |
| `packages/config`       | Shared TypeScript configuration                                                                       |
| `docs/`                 | Requirements, database and API design, implementation plan, test plan                                 |

Start with `docs/IMPLEMENTATION-PLAN.md`; requirement IDs are defined in `docs/SRS-detailed.md`.

## Getting started

```bash
corepack enable
pnpm install
pnpm build
pnpm test
```

Local database (requires Docker): `docker compose up -d postgres`.

## Run everything

One command starts Postgres and every app in watch mode (Turborepo runs each workspace's `dev` script):

```bash
pnpm dev
```

| App                                 | Address               |
| ----------------------------------- | --------------------- |
| API (`apps/server`)                 | http://localhost:3000 |
| Storefront (`apps/storefront`)      | http://localhost:3001 |
| Tenant dashboard (`apps/dashboard`) | http://localhost:3002 |
| Marketing site (`apps/website`)     | http://localhost:3003 |
| Operator console (`apps/operator`)  | http://localhost:3005 |

The two Vite apps proxy `/api` to the API, so they need no extra setup. One app alone:
`pnpm --filter @lytronix/operator dev`.

## Development flow

Work on a branch, open a pull request, merge once CI passes. See docs/ENGINEERING-STANDARDS.md §7.
