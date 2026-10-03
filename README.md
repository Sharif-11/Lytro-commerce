# Lytronix commerce platform

Multi-tenant commerce platform (monorepo).

## Layout

| Path                    | Contents                                                              |
| ----------------------- | --------------------------------------------------------------------- |
| `apps/server`           | NestJS API and background jobs                                        |
| `apps/storefront`       | Shared, tenant-branded shopper storefront (Next.js)                   |
| `apps/admin`            | Tenant dashboard and operator console (Vite + React)                  |
| `packages/shared-types` | Types shared between apps (API error contract)                        |
| `packages/config`       | Shared TypeScript configuration                                       |
| `docs/`                 | Requirements, database and API design, implementation plan, test plan |

Start with `docs/IMPLEMENTATION-PLAN.md`; requirement IDs are defined in `docs/SRS-detailed.md`.

## Getting started

```bash
corepack enable
pnpm install
pnpm build
pnpm test
```

Local database (requires Docker): `docker compose up -d postgres`.

## Development flow

Work on a branch, open a pull request, merge once CI passes. See docs/ENGINEERING-STANDARDS.md §7.

<!-- gate test -->
