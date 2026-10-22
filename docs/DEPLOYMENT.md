# Deployment

Status: planned, not yet built — no server exists to point DNS at. Written now so the frontend work (slice 9 and
onward) is built against a real target from the start, instead of a shape that turns out to need rework once a
VPS exists. Nothing here is infrastructure that currently runs; this is the plan for when it does.

## 1. Why this shape

Four apps are frontend-facing (`apps/website`, `apps/dashboard`, `apps/operator`, `apps/storefront`; the dashboard is `apps/admin` until Phase 3's Slice 0b renames it and moves the operator console out, D3-12), plus the backend
(`apps/server`) and Postgres. The budget constraint already stated in `ENGINEERING-STANDARDS.md` §0 (500
tenants, one VPS, no rewrite at 10,000) applies here exactly as it does to the backend: everything below runs
on one VPS, behind one reverse proxy, as containers — no per-service cloud platform, no CDN subscription, no
managed database, until real load or revenue justifies the cost.

## 2. Topology

```
                    ┌──────────────────────────────────────────────────────┐
                    │                     Caddy (edge)                      │
                    │  TLS termination, wildcard cert, host routing,        │
                    │  adds the edge secret                                 │
                    └───┬─────────────┬─────────────┬─────────────┬─────────┘
                        │             │             │             │
                        ▼             ▼             ▼             ▼
                   dashboard      operator       website      storefront
                 app.lytro.app  admin.lytro.app  lytro.app    *.lytro.app
                  static dist/   static dist/   (Next, SSR)   (Next, SSR)
                  no process     no process     container     container
                        │             │             │             │
                        └──── /api ───┘             └──────┬──────┘
                               │                           │
                               └─────────────┬─────────────┘
                                             ▼
                                  server (NestJS, container)
                                             │
                                             ▼
                                   postgres (container)
```

**Two separate static apps (D3-12, Phase 3 Slice 0b).** The tenant dashboard and the operator console are
different builds, each with its own:
- host
- directory on disk
- Content Security Policy
- release

Neither app's files contain the other's screens or API calls. Each calls the backend through Caddy's `/api/*`
rule on its own host. Session cookies are host-only (`TEN-29`), so a seller's session exists only on
`app.lytro.app` and an operator's only on `admin.lytro.app`. `apps/dashboard` (built 2026-10-19 from the
onboarding design) serves `app.lytro.app`; `apps/operator` (built the same day, the inverted console of
BRAND-IDENTITY.md §8.4) serves `admin.lytro.app`.

## 3. Why Caddy, not nginx

`*.lytro.app` needs a **wildcard TLS certificate**, which needs the ACME **DNS-01** challenge, not the simpler
HTTP-01 one. Caddy does this natively — built-in ACME client, a DNS-provider plugin for the DNS-01 step,
automatic renewal, no cron job to maintain. nginx needs certbot bolted on as a second piece of software with
its own renewal hook to keep working. For a solo-maintained deployment, one less moving part to operate is
worth more here than nginx's larger ecosystem.

Caddy is open source (Apache 2.0), free for any use including commercial, with no license fee and no feature
gated behind payment — including the automatic-HTTPS/wildcard-cert support this plan relies on. (Its
maintainer separately sells paid support contracts; the server itself is not paid software.)

## 4. DNS records

The platform domain is `lytro.app` (decided 2026-10-18). Every host below is on it.

**Target layout (D3-11, decided 2026-10-18).** `deploy/Caddyfile`, the apps and the Phase 1–2 test plans still
implement the earlier path-split layout (the dashboard on the apex and on every shop's subdomain) until Phase
3's Slice 0 lands; that slice changes all of them together. The operator console moves to its own app,
`apps/operator`, in Slice 0b (D3-12), which also renames `apps/admin` to `apps/dashboard`.

| Record | Target | Purpose |
|---|---|---|
| `lytro.app` (apex) | VPS IP | marketing site (`apps/website`) only |
| `www.lytro.app` | VPS IP | redirects to the apex |
| `app.lytro.app` | VPS IP | sign-up, sign-in, create-shop and the tenant dashboard at `/<shop>` (`apps/dashboard`) |
| `admin.lytro.app` | VPS IP | operator console (`apps/operator`, its own build, D3-12) |
| `api.lytro.app` | VPS IP | the public API at `/v1/...` (`apps/server`), API keys only (API-14) |
| `pay.lytro.app` | VPS IP | the hosted payment page for manual payments, and the return address for wallet gateways (PAY-01, PAY-06); Phase 5 |
| `media.lytro.app` | the media Worker (a Cloudflare Workers custom domain, not the VPS) | every shop's media (`apps/media-worker`, MED-02, BND-01): metered, then the Worker's cache, then R2. No Cloudflare cache rule sits in front of it. The media bucket's own public address stays off in production, or requests would skip the metering |
| `*.lytro.app` (wildcard) | VPS IP | every shop's public pages: storefront and landing pages (`apps/storefront`) only. Covers every tenant automatically; no per-shop DNS entry is ever created. `app`, `admin` and `www` are reserved labels (TEN-26), so no shop can take them. |

## 5. Routing rules

**Correction, 2026-10-09:** the first draft of this section routed `/auth*` to `apps/admin`'s static build on
every host. That's wrong — the backend's own API routes live at that same prefix (`/auth/phone/code`,
`/auth/operator/signin`, ...), and the admin SPA calls them as same-origin, relative fetches (`/auth/...`).
The rule as first written would have swallowed every one of those calls into "serve `index.html`" instead of
reaching the backend at all. Fixed below by giving the backend its own reserved prefix, checked first, on
every host.

One `Caddyfile`, with a rule checked first on the two app hosts, `app.lytro.app` and `admin.lytro.app`:

- **`/api/*`** → reverse-proxy to `server` unchanged, with `x-lytronix-edge-secret` added (§6). This is how
  the dashboard and the operator console reach the backend: same-origin, relative fetches to `/api/v1/...` on
  their own host. **Updated 2026-10-14 (API-14):** the backend itself serves every route under `/api/v1/...`
  (the exact prefix the apps call), so Caddy strips nothing — a plain `handle`, not `handle_path`.
  **Corrected 2026-10-22 (KNOWN-GAPS §90):** each app's files and their `index.html` fallback sit in their own
  catch-all `handle`, so the `/api/*` rule is really checked first; at the top level Caddy's `try_files` had rewritten
  every API call to `index.html` before any `handle` ran.
- **Not on any other host (D3-11).** The apex serves the marketing site only, and a shop's host serves its
  public pages only, the storefront owning every path there (`TEN-08`, `SFT-02`), so neither forwards `/api`.
  The storefront and the website call the backend server-side, inside the deployment (§6), and code running
  in a shopper's browser uses the public API at `api.lytro.app` with a public key (`API-14`, D3-1). Until
  Slice 0 lands, `deploy/Caddyfile` still forwards `/api/*` on every host, as the earlier layout needed.

Then, per host, one rule each and no path lists:

- **`lytro.app`** → reverse-proxy to `website`. `www.lytro.app` redirects here.
- **`app.lytro.app`** → serve `apps/dashboard`'s static build, with a fallback to `index.html` for any unmatched
  path (the client-side router takes over): sign-up, sign-in, create-shop, the password screens, the
  dashboard at `/<shop>/...`, and the OAuth callback. `OAUTH_CALLBACK_BASE` is `https://app.lytro.app`:
  Google and Facebook send the browser back to `/auth/oauth/:provider/callback`, a route of the SPA, which
  reads `code`/`state` off its own URL and calls `/api/v1/auth/oauth/:provider/callback` itself, then routes
  on the response's `next` like a normal sign-in.
- **`admin.lytro.app`** → serve `apps/operator`'s static build from its own directory, with a fallback to
  `index.html` for any unmatched path (the console's own router takes over), under its own strict Content
  Security Policy (`operator_csp` in `deploy/Caddyfile`). Scripts, styles, fetches, the service worker and the
  manifest come from the console's own origin only. The two exceptions are Google Fonts' stylesheet and font
  files, and `data:` images for the two-factor QR code. No inline script, no plugin, no framing. No
  operator code ships to sellers, and no seller code to operators (D3-12). The old `apps/admin` build that
  carried both was removed on 2026-10-19; `apps/operator` replaced it the same day.
- **`api.lytro.app`** → reverse-proxy `/v1/*` to `server` as `/api/v1/*`, with the edge secret added. Keys only:
  the backend refuses a session cookie here (API-14). This is the one address in the public API's documentation.
- **`pay.lytro.app`** → the hosted payment page (built in Phase 5), served with a Content Security Policy that
  allows only the platform's own scripts and styles and the wallets' logo images (PAY-23). Wallet gateways
  return the shopper here; it confirms the payment, then redirects to the session's return address.
- **`*.lytro.app`** (any other single-label host, a shop's own subdomain) → reverse-proxy to `storefront`,
  which reads `Host` itself to resolve which tenant to render (SFT-01). Every path belongs to the storefront,
  including the shopper sign-in (SFT-09); nothing here serves the dashboard.

**Replaced 2026-10-18 (D3-11).** Until then the apex and every shop's subdomain split their paths between the
dashboard app and the website or storefront, using hand-maintained path lists that fell out of step with the
app's routes more than once (the 2026-10-09 correction, and staff sign-in, which no list covered). One rule per
host removes the lists. The earlier rules are in this file's git history, and the Phase 1 plan's slice 9
walkthrough still describes them.

## 6. The edge secret (already built, on the backend side)

`TenantGuard`/`EdgeSecret` (`apps/server/src/common/guards/edge-secret.ts`, header `x-lytronix-edge-secret`)
already requires a trusted edge to vouch for the `Host` header on every request reaching the backend — this
predates this document and isn't new. Caddy, as that edge, must:

- Pass `Host` through unmodified (its default `reverse_proxy` behavior — no explicit handling needed).
- Add `x-lytronix-edge-secret: <the configured secret>` on every proxied request to `server`, `website` and
  `storefront` (the two Next.js apps also call the backend, server-side, and need the same header on *their*
  outbound requests to it).
- The secret itself is a deployment secret (environment variable on the Caddy host and on each app container
  that calls the backend), never committed, matching how every other secret in this codebase is handled
  (`SEC-10`'s framing, even though this isn't a courier/gateway credential specifically).

## 7. Custom domains (`TEN-09`, `TEN-11`, `TEN-13`, `TEN-24`) — no manual mapping, ever

Built in `PHASE-3-PLAN.md` Slice 13 (D3-13); until then only the host lookup below exists.

A Growth/Pro tenant can point their own domain (e.g. `fashionhouse.com`) at their shop instead of
`fashion-house.lytro.app`. Nothing about this needs a human to edit Caddy's config per tenant — the mechanism
is fully automatic on the platform side, split across three pieces that are each already required by the SRS:

- **Tenant's own action (manual, unavoidable):** they add one DNS record at their own registrar, pointing
  their domain at this platform (CNAME or A record to the VPS/Cloudflare IP). True of every platform offering
  custom domains (Shopify, Wix, etc.) — there is no way around the tenant proving they control that domain by
  pointing its DNS somewhere.
- **Verification (`TEN-11`, already specified):** the backend checks periodically (within 10 minutes) whether
  that DNS record now exists, and flips the domain's status from `pending` to `active` on its own. No operator
  review step.
- **Resolution (`TEN-24`, already built):** `HostClassifier`'s `'custom'` branch looks up *any* incoming
  hostname against the `tenant_domains` table — a database query, not a static file Caddy needs editing. A
  newly `active` domain works immediately, with no Caddy config change and no redeploy.
- **The certificate (`TEN-13`: *"issued automatically for each active custom domain"*):** Caddy's **On-Demand
  TLS** feature is the mechanism for this. Instead of a fixed list of hostnames to provision certificates for,
  Caddy requests one automatically the first time it sees a request for a hostname it doesn't yet have a
  certificate for — gated by an "ask" callback Caddy makes first, to confirm that hostname is legitimate
  before spending a Let's Encrypt rate-limit slot on it. That callback is a small new endpoint on the backend
  (`GET /internal/domains/:host/active` or similar) answering yes/no from the same `tenant_domains` lookup
  `TEN-24` already needs — not a new system, one more read of data that already exists. Once issued, Caddy
  renews that certificate on its own, same as the wildcard cert.

Net effect: adding a custom domain is a tenant-dashboard action (enter the domain, see DNS instructions, wait
for `active`) with zero infrastructure work on this platform's side per tenant.

## 8. Per-app build and runtime

| App | Served at | Build output | Runtime | Why |
|---|---|---|---|---|
| `apps/dashboard` | `app.lytro.app` | `vite build` → static `dist/` | **none** — Caddy serves the files directly | A pure client-rendered SPA; there is nothing to run once the files exist |
| `apps/operator` | `admin.lytro.app` | `vite build` → static `dist/` | **none** — Caddy serves the files directly | The operator console's own build, kept apart from the sellers' app (D3-12) |
| `apps/website` | `lytro.app` | Next.js, a standard server build (not a static export) | Node container, `next start` | Content is expected to grow (testimonials, a blog later per the landing-page plan); starting server-rendered avoids re-architecting the moment something dynamic is added, and costs little extra on a VPS already running two other Node processes |
| `apps/storefront` | `*.lytro.app`, custom domains | Next.js, standalone server build | Node container, `next start` | Must render dynamically per request — SFT-01 requires one shared app serving every tenant differently based on the request's `Host`, which a static export cannot do |
| `apps/media-worker` | `media.lytro.app` | `wrangler deploy --dry-run` → bundled `dist/` | **Cloudflare Workers**, deployed with `wrangler deploy` | Metering has to happen in front of every media request, cached or not (MED-02), at Cloudflare's edge, near R2 |

**The media Worker's setup** (once, in Cloudflare; Phase 3 Slice 7):
1. The Workers Paid plan. The free plan's 100,000 requests a day cannot carry shop traffic.
2. A KV namespace for the shared store; put its id in `apps/media-worker/wrangler.jsonc` (`MEDIA_EDGE`).
3. An Analytics Engine dataset named `lytro_media_usage` (`MEDIA_USAGE`); it is made on the first deploy.
4. An R2 API token, **Object Read only**, on the media bucket only. Set it and the rest as the Worker's secrets:
   `wrangler secret put R2_ENDPOINT` (the account's S3 address), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and
   `MEDIA_LINK_SECRET` (a long random value, shared with the server). Record the token in RUNBOOKS §2.
5. `wrangler deploy` from `apps/media-worker`. It takes `media.lytro.app` as the Worker's custom domain.
6. Turn the media bucket's public r2.dev address off, and set the server's `MEDIA_PUBLIC_BASE_URL` to
   `https://media.lytro.app`.
7. For the server's side (Slice 7b): an account API token with **Account Analytics: Read** and **Workers KV Storage:
   Edit**. Set it in `apps/server/.env` as `CLOUDFLARE_API_TOKEN`, with `CLOUDFLARE_ACCOUNT_ID` and the KV
   namespace's id as `MEDIA_EDGE_KV_NAMESPACE_ID`; record it in RUNBOOKS §2. Every minute the server then totals each
   shop's bandwidth and writes the blocked list and each shop's website addresses. Without the token, nothing is
   counted or blocked.

**The server's fonts** (Phase 3 Slice 11.1b): the server draws each shop's app-icon monogram from the fonts in
`apps/server/assets/fonts` (TEN-17), found three folders above `dist/modules/shop-app`. The server's image carries
`apps/server/assets` beside `dist`.

**The credential sealing key** (Phase 3 Slice 9b): set `DATA_ENCRYPTION_KEY` (32 random bytes, base64) on the server
from a secrets manager, never from a committed file; the server refuses to start in production without it. Its
rotation is RUNBOOKS §3.

## 9. Fits the existing CI/CD pipeline (`ENGINEERING-STANDARDS.md` §7) without changing it

That section already specifies build-once/promote-with-a-smoke-test/manual-production-approval. This section
only adds concrete artifacts to it, nothing new in process:

- **The build step produces one versioned artifact per app.**
  - `server`, `website` and `storefront` are container images.
  - `apps/dashboard` and `apps/operator` are each their own static build: baked into a small image alongside
    Caddy's config, or shipped as a plain build artifact that Caddy's container mounts at that app's
    directory.
  - Every artifact still goes staging → smoke test → manual production promotion.
- **The two static apps release independently (D3-12).** A change to one doesn't rebuild or redeploy the
  other. A seller-dashboard release can never change the operator console, and the reverse.
- **A static app's deploy is cheaper than the others.** Its files are swapped behind the already-running
  edge, with no container restart at all. Rollback is simpler too: keep the previous build's directory and
  point back to it. The existing rollback story still applies (§7: "the previous container image stays
  available and redeployable in one step").

## 10. Open, deliberately deferred

Not blocking any of the frontend work in `docs/PHASE-1-PLAN.md`; revisit once an actual VPS exists to deploy to:

- The VPS provider and sizing.
- Backup strategy for the Postgres volume (the local dev `docker-compose.yml` has none; production needs one).
- Whether `website` and `storefront` really need separate containers from day one, or could share one Node
  process initially to save RAM on a small VPS, splitting later once traffic justifies it.
- **Cloudflare in front of Caddy**, if added later: a pure addition, not a redesign. Caddy's routing rules
  (§5) don't change at all — Cloudflare just forwards to Caddy's IP, invisible to every app behind it. The
  only changes are environment config, not code: `CLIENT_IP_HEADER=cf-connecting-ip` and
  `CLIENT_IP_FORMAT=single` (both already supported by `ClientIp`'s existing config shape — no code change),
  and optionally swapping Caddy's Let's Encrypt wildcard cert for a Cloudflare Origin Certificate on the
  Cloudflare→Caddy leg (simpler, ~15-year validity, no ACME DNS-01 dance needed once Cloudflare owns the
  visitor-facing TLS leg via its free Universal SSL).
