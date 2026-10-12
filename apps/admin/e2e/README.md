# Admin E2E suite

A real Chromium browser against a real backend and a real Postgres database — for the handful of Phase-1
scenarios that an API-level (supertest) test genuinely cannot stand in for: cookie scoping as the browser
itself enforces it (`P1-E07`), and visual/DOM state split across tabs, reloads or separate browser contexts
(`P1-E29` to `P1-E31`). Everything else in the test plan with an `[E2E]` tag already has solid API-level
coverage in `apps/server/test/` and does not need to be duplicated here.

## Running it

```bash
pnpm build                     # produces dist/, which the harness serves
DATABASE_TEST_ADMIN_URL=postgres://lytronix:lytronix_local_only@localhost:5433/lytronix pnpm test:e2e
```

Needs the same local Postgres the server's own e2e specs use (`docker-compose.yml` at the repo root). The
suite runs serially (`workers: 1`) — one shared backend and database for the whole run, not one per test.

## Why this exists as its own thing, not vite's dev proxy

Production (`docs/DEPLOYMENT.md` §5) puts one Caddy edge in front of everything: it serves the admin SPA's
static build and forwards `/api/*` to the backend, on whichever tenant host the browser actually used, with
that `Host` header passed through unchanged — that's the whole mechanism multi-tenant host resolution
(`HostClassifier`/`TenantGuard`) depends on.

`apps/admin`'s own dev-mode Vite proxy (`vite.config.ts`) does the same `/api/*` forwarding, but with
`changeOrigin: true` — deliberately, for normal local development, where nobody's testing multiple tenant
subdomains against one dev server at once. For real multi-host E2E that's exactly wrong: it rewrites the
outgoing request's `Host` header to match the _backend's_ address, so the backend would see `localhost:4100`
no matter which subdomain the browser actually visited, and every host-based scenario would be untestable.

`support/host-proxy.ts` is a small, separate static-file-plus-proxy server built for this suite alone,
mirroring Caddy's actual behavior: serve `dist/` with an `index.html` fallback, forward `/api/*`, and never
touch the incoming `Host` header.

## The pieces

| File                    | What it does                                                                                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `global-setup.ts`       | Creates a fresh test database (mirrors `apps/server/test/support/database.ts`), starts the real backend (`node dist/main.js`, built by `apps/server`'s own build) as a child process, starts the host-preserving proxy in front of `apps/admin`'s build.      |
| `global-teardown.ts`    | Kills the backend process and drops the test database.                                                                                                                                                                                                        |
| `support/host-proxy.ts` | The Caddy stand-in described above.                                                                                                                                                                                                                           |
| `support/backend.ts`    | Spawns the backend with its stdout/stderr redirected to a log file — not inherited, since `global-setup` and the test workers that need to read it are separate OS processes; an in-memory listener in `global-setup` would be unreachable from a test file.  |
| `support/sms-log.ts`    | Reads the backend's own stub-SMS console line (`ConsoleSmsProvider`, which only prints outside `NODE_ENV=test` — this process deliberately runs as `development`) back out of that log file, to get a real OTP code without ever touching the database.       |
| `support/api.ts`        | Fast fixture setup through the real API (sign up a phone, verify, create a shop, set a password) — a test shouldn't have to drive every onboarding screen through the UI just to get to the scenario it actually cares about.                                 |
| `support/session.ts`    | Puts an already-created session into a browser tab: the cookie into the context's cookie jar, and the CSRF token into that origin's `sessionStorage` (the frontend's own route guard reads the token from storage, never the `HttpOnly` cookie it can't see). |

## Ports

Fixed, not dynamic (`support/ports.ts`): `4100` for the backend, `4101` for the proxy — distinct from the
normal dev ports (`3000`, `3002`) so a `pnpm dev` already running on the same machine never collides with a
test run.
