# Deployment

Status: planned, not yet built — no server exists to point DNS at. Written now so the frontend work (slice 9 and
onward) is built against a real target from the start, instead of a shape that turns out to need rework once a
VPS exists. Nothing here is infrastructure that currently runs; this is the plan for when it does.

## 1. Why this shape

Three apps are frontend-facing (`apps/website`, `apps/admin`, `apps/storefront`), plus the backend
(`apps/server`) and Postgres. The budget constraint already stated in `ENGINEERING-STANDARDS.md` §0 (500
tenants, one VPS, no rewrite at 10,000) applies here exactly as it does to the backend: everything below runs
on one VPS, behind one reverse proxy, as containers — no per-service cloud platform, no CDN subscription, no
managed database, until real load or revenue justifies the cost.

## 2. Topology

```
                    ┌─────────────────────────────────────────┐
                    │              Caddy (edge)                │
                    │  TLS termination, wildcard cert,         │
                    │  host+path routing, adds the edge secret │
                    └──────┬──────────┬──────────┬─────────────┘
                           │          │          │
              ┌────────────┘          │          └────────────┐
              ▼                       ▼                       ▼
     admin (static files)     website (Next, SSR)     storefront (Next, SSR)
     no process — Caddy              container                container
     serves dist/ directly                │                       │
                                           └───────────┬───────────┘
                                                        ▼
                                              server (NestJS, container)
                                                        │
                                                        ▼
                                              postgres (container)
```

## 3. Why Caddy, not nginx

`*.lytro.com` needs a **wildcard TLS certificate**, which needs the ACME **DNS-01** challenge, not the simpler
HTTP-01 one. Caddy does this natively — built-in ACME client, a DNS-provider plugin for the DNS-01 step,
automatic renewal, no cron job to maintain. nginx needs certbot bolted on as a second piece of software with
its own renewal hook to keep working. For a solo-maintained deployment, one less moving part to operate is
worth more here than nginx's larger ecosystem.

Caddy is open source (Apache 2.0), free for any use including commercial, with no license fee and no feature
gated behind payment — including the automatic-HTTPS/wildcard-cert support this plan relies on. (Its
maintainer separately sells paid support contracts; the server itself is not paid software.)

## 4. DNS records

| Record | Target | Purpose |
|---|---|---|
| `lytro.com` (apex) | VPS IP | marketing (`apps/website`) + tenant sign-up/sign-in/dashboard (`apps/admin`), split by path |
| `www.lytro.com` | VPS IP | same as apex |
| `admin.lytro.com` | VPS IP | operator console (`apps/admin`, same build, host-branched route tree) |
| `*.lytro.com` (wildcard) | VPS IP | every shop subdomain — `apps/storefront` (public) + `apps/admin` (staff dashboard), split by path. Covers every tenant automatically; no per-shop DNS entry is ever created. |

## 5. Routing rules

One `Caddyfile`, three host blocks:

- **`lytro.com`, `www.lytro.com`**
  - `/sign-up*`, `/sign-in*`, `/dashboard*`, `/auth*` → serve `apps/admin`'s static build, with a fallback to
    `index.html` for any unmatched path (client-side router takes over from there)
  - everything else → reverse-proxy to `website`
- **`admin.lytro.com`**: everything → serve `apps/admin`'s static build directly. Same files as above — the
  SPA's own router shows the operator route tree instead of the tenant one purely because of which host it's
  running on (`window.location.hostname`), not a different build.
- **`*.lytro.com`** (any other single-label host — a shop's own subdomain)
  - `/dashboard*`, `/sign-in*`, `/auth*` → serve `apps/admin`'s static build (staff sign-in and dashboard)
  - everything else → reverse-proxy to `storefront`, which reads `Host` itself to resolve which tenant to
    render (SFT-01)

A worked example of this whole path, host by host, is in `docs/PHASE-1-PLAN.md`'s slice 9 planning discussion;
nothing here repeats it — this document is the infrastructure, not the walkthrough.

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

A Growth/Pro tenant can point their own domain (e.g. `fashionhouse.com`) at their shop instead of
`fashion-house.lytro.com`. Nothing about this needs a human to edit Caddy's config per tenant — the mechanism
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

| App | Build output | Runtime | Why |
|---|---|---|---|
| `apps/admin` | `vite build` → static `dist/` | **none** — Caddy serves the files directly | A pure client-rendered SPA; there is nothing to run once the files exist |
| `apps/website` | Next.js, a standard server build (not a static export) | Node container, `next start` | Content is expected to grow (testimonials, a blog later per the landing-page plan); starting server-rendered avoids re-architecting the moment something dynamic is added, and costs little extra on a VPS already running two other Node processes |
| `apps/storefront` | Next.js, standalone server build | Node container, `next start` | Must render dynamically per request — SFT-01 requires one shared app serving every tenant differently based on the request's `Host`, which a static export cannot do |

## 9. Fits the existing CI/CD pipeline (`ENGINEERING-STANDARDS.md` §7) without changing it

That section already specifies build-once/promote-with-a-smoke-test/manual-production-approval. This section
only adds concrete artifacts to it, nothing new in process:

- The build step now produces container images for `server`, `website`, `storefront`, plus `apps/admin`'s
  static files (baked into a tiny image alongside Caddy's own config, or shipped as a plain build artifact
  Caddy's container mounts) — still one versioned release, still staging → smoke test → manual production
  promotion.
- `apps/admin`'s own "deploy" is cheaper than the others: swapping its static files behind the same
  already-running edge, with no container restart needed at all — the existing rollback story (§7: "the
  previous container image stays available and redeployable in one step") applies even more simply here.

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
