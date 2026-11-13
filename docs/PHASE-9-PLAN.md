# Phase 9 plan: hardening for launch

Status: agreed 2026-11-11. D9-1 to D9-8 were settled with the owner that day. D9-9 to D9-25 follow from them or from
existing requirements, and are raised with this plan, so the owner can overrule any of them. Builds on
`IMPLEMENTATION-PLAN.md` Phase 9, with these changes:

- **Launch runs on one server, and the code is ready for more** (DAT-54, DAT-56). Phase 9 builds what one server needs
  from day one (backups, restores, alerts, the load test) and the code a second server needs: separate read and write
  connections, read-only mode and the failover command. The second server itself, the load balancer and active-active
  serving wait for DAT-55's trigger (D9-23).
- **Redis runs on the main server first** (D9-1) and moves to its own server when a second app server arrives.
- **Failover stays one command** (D9-2), written for any number of replicas, not only one standby.
- **Free monitoring tools at launch** (D9-3), **our own security pass** (D9-4), **the load test on the production
  server before launch** (D9-5).
- **The terms and privacy policy are drafted without a lawyer's review before launch** (D9-6). §9 records the risk.
- **Staging comes first** (D9-9): almost every slice proves itself on a running copy.

Requirement IDs refer to `SRS-detailed.md` §24.1 (LOG, MON), §24.2 (AVL, BKP, PRF, SEC, LEG), §24.3 (DAT), §24.4 (RED)
and §24.5 (OBS). Deployment refers to `DEPLOYMENT.md`, and the pipeline to `ENGINEERING-STANDARDS.md` §7.

Reopening a decision in §2 needs an explicit change to its row, not a silent deviation during a slice. The points §2.1
leaves to a slice's read are settled there, each with its own answer.

---

## 1. Goal and exit criteria

**Goal.** Lytro can be deployed, watched, backed up and restored. It holds at twice its expected peak on one server
and fails safely when an outside service or its own database does. Adding a standby later is a settings change, not
a code change.

**What already exists** (the survey, 2026-11-11, `main` at 8fe0067a):
- **Data and limits:**
  - the catalogue's short cache behind the key check (RED-06, PRF-02)
  - idempotency, payment sessions and the job queue in PostgreSQL (RED-07)
  - sign-in, reset and shopper codes counted exactly in PostgreSQL (part of RED-11)
  - a 10-second statement timeout
  - the order of shutdown
- **Security:**
  - row-level security with the isolation suite (SEC-02)
  - sealed courier and gateway credentials (SEC-01, SEC-09)
  - CSRF tokens (SEC-14)
  - upload checks (SEC-06)
  - no stack traces in responses (SEC-16)
- **Logs and provider calls:**
  - request IDs on responses and log lines (LOG-01, in part)
  - a shop's problems on its console page (MON-05)
  - circuit breakers on couriers, bKash, SMS, Gemini, Resend, web push and Meta (PRF-05, in part)
- **Legal and deploy:**
  - the terms acceptance record (LEG-01)
  - a Caddyfile tested through real Caddy (§141)

Nothing is deployed. There is:
- no Dockerfile, backup or second connection pool
- no Redis, error tracking, security headers past CSP, or load test
- a health check that never checks the database

**Phase 9 is complete when all of these hold:**

1. Every requirement in §3.1 has a passing automated test, or, for `MAN` and `LOAD` requirements, a recorded check.
2. **Staging runs `main`:** every merge builds each app once, deploys it to staging and runs the order-and-payment
   smoke test (OBS-08); production takes the same images by a manual promotion (`ENGINEERING-STANDARDS.md` §7).
3. **A restore is proven, not just configured:** the nightly dump and the point-in-time archive each restore onto a
   fresh server; the app comes back from R2 inside 4 hours (DAT-54, DAT-40); one shop's data restores without touching
   another's (DAT-26). Each drill is recorded.
4. **The load test passes on the production server** before launch: twice the expected peak, 50 shops' data, no
   connection errors, memory under 80%, no swap (DAT-32, PRF-01, PRF-03).
5. **The second server is code-ready:** with both pools pointing at one server, reads take the read pool and
   writes the write pool. A CI test with a primary and a streaming standby proves the rest:
   - reads go to the standby
   - a caller's reads stay on the primary just after it writes
   - a write never lands on the standby
   - stopping the primary gives read-only mode
   - the failover command promotes, re-points and passes its test write (DAT-37, DAT-41 to DAT-47)
6. **Every day-one alert has fired once on staging**, by causing what it watches: uptime, disk, memory, backup age,
   archive lag, a missed job heartbeat, an error spike, Redis down, an opened circuit.
7. **The security pass is recorded:** each of SEC-01 to SEC-16 with its evidence; the scanners' findings fixed or listed
   in `KNOWN-GAPS.md` with a reason.
8. **The terms and privacy policy are on the website** in Bangla and English, at the versions sign-up records (LEG-01,
   LEG-02), and say that launch runs on one server (DAT-54).
9. CI is green on `main`, and the pull-request flow has been used for every slice.

---

## 2. Decisions

**D9-1 to D9-8 agreed 2026-11-11** (the Phase 9 read).

| # | Decision | Decided | Affects |
|---|---|---|---|
| D9-1 | **Where Redis runs.** RED-01, DAT-19 and DAT-56 give it its own small server from day one. | **On the main server, in its own container, from launch**, hardened as RED-01 says (password, dangerous commands off, a [256] MB cap evicting only keys with an expiry, no persistence). Production uses the Redis code from day one. It moves to its own server, reached over the private tunnel, when a second app server arrives: an address change, no code. Amends RED-01, DAT-19 and DAT-56. | Slices 9.1, 9.4 |
| D9-2 | **Replacing a failed main database**, once a standby exists. The owner asked whether the requirements support one writer, many read replicas and promotion on failure. They do, with failover by one command (DAT-37), but its steps name one standby only. | **One command, as DAT-37 says** (no Patroni or automatic promotion). Extended to any number of replicas: promote the replica that has replayed furthest; point the other replicas at it; the old main server rejoins as a replica only after the data checks (AVL-04), rewound or rebuilt from a base backup, never started as a main server. | Slices 9.2, 9.3 |
| D9-3 | **Monitoring at launch.** OD-43 times the full stack to 50 paying shops, but DAT-54 and MON-01 require some alerts from day one. | **OD-43's providers on their free plans from launch:** UptimeRobot for uptime and job heartbeats, Sentry for errors, Grafana Cloud for the server's and the database's alerts. Alerts reach the owner through their phone apps and email. Paid plans, log shipping and the dashboards (OBS-04's shipping, OBS-05, OBS-06, OBS-09 to OBS-11) at 50 paying shops, as OD-43 says. | Slice 9.6 |
| D9-4 | **Who does the security pass.** | **Us, with free scanners:** each SEC row checked and fixed with tests; an OWASP ZAP baseline scan against staging; a dependency audit in CI. No paid penetration test before launch. | Slice 9.7 |
| D9-5 | **Where the load test runs** (DAT-32: one 4 vCPU / 6 GB server). | **On the production server, before launch:** bought a few weeks early, tested while empty, wiped, then launched on. A first run on staging shakes the scripts out. | Slice 9.10 |
| D9-6 | **The terms and privacy policy** (LEG-02). LEG-03 and OD-08 want a legal review before launch. | **Drafted by us** in Bangla and English from LEG-02, DAT-54's disclosure and `SUPPORT-LEGAL-PAGES-DESIGN.md` §3 and §4. **No lawyer reviews them before launch;** a review of the terms, payment handling and VAT follows when the business can pay for it. Amends LEG-03 and OD-08. | Slice 9.8 |
| D9-7 | **VAT on Lytro's invoices to shops** (LEG-03). Lytro isn't registered. | Lytro's invoices gain VAT fields (the BIN, the rate and the tax amount), **hidden until the operator sets a BIN and a rate** in Settings. Registering later needs no code. | Slices 9.8, 9.9 |
| D9-8 | **Where the sealing key lives** (`DATA_ENCRYPTION_KEY`; SEC-10 asks for a secrets manager). | **A file only root can read, on the server**, handed to the app's container at start, with an offline copy in the owner's password manager. No secrets-manager service. A person reading the file is a break-glass action recorded in `RUNBOOKS.md`. The re-seal job after a key rotation (§81) is built. Amends SEC-10 and DAT-14's secrets store. | Slice 9.7 |

**D9-9 to D9-25 follow from those or from existing requirements.** They weren't asked in the read, so the owner can
overrule any of them when reviewing this plan.

| # | Decision | Decided | Affects |
|---|---|---|---|
| D9-9 | **Staging first.** Restores, alerts, scans and the load test each need a running copy. | Slice 9.1 deploys staging on the owner's BDIX VPS (2 vCPU, 3 GB, 40 GB NVMe): `PLATFORM_DOMAIN=staging.lytro.app`, with `staging.lytro.app` and `*.staging.lytro.app` as "DNS only" records, since Cloudflare's free certificate covers one level only. Staging sends real SMS, so it runs test shops only, under the SMS spend cap. Smaller PostgreSQL settings than production, same images. | Slice 9.1 |
| D9-10 | **What's built and how it ships** (DEPLOYMENT §8, §9). | One image for each of the server, website and storefront, built once in GitHub Actions and pushed to GitHub's container registry; the dashboard and the console as static builds Caddy serves. The Caddy image is built with the Cloudflare DNS plugin and uses its own token that can only edit lytro.app's DNS (never the media token), and the Caddy test runs that image. The website and storefront keep their own containers (DEPLOYMENT §10's open point): 6 GB holds both. | Slice 9.1 |
| D9-11 | **Processes on one server** (DAT-32, DAT-36). The server runs its API and every job worker in one process today. | One image, two roles set by an environment setting: **API processes** (two in production) start no workers; **one worker process** runs every job. Each Node process has a heap limit and its container a memory limit, covering ffmpeg's children for the worker. PostgreSQL is the last thing the kernel kills. A 2 to 4 GB swap file with low swappiness. | Slice 9.1 |
| D9-12 | **Deploys without downtime on one server** (AVL-05's single-server form, `ENGINEERING-STANDARDS.md` §7.4). | Caddy sends to both API containers, which are replaced one at a time, each passing the ready check before the next. Migrations run as their own step, after a fresh dump, before the new code (DAT-04). The previous images stay one step away. | Slice 9.1 |
| D9-13 | **Database connections** (DAT-11, DAT-23, DAT-41, DAT-44 to DAT-47). One pool today. | Two pools: **write**, always the primary, and **read**, a role with SELECT only and read-only transactions by default, pointing at the primary until a replica exists. Code marks a read explicitly; everything else, any transaction included, writes. A shop's read on the read pool still sets the shop for row-level security inside its read-only transaction. After a session or API key writes, its reads use the primary for [10] seconds, with the marker kept in Redis. A dropped connection is retried once for reads, and for writes only when an idempotency key covers them. A connection pooler sits in front (DAT-11). | Slice 9.2 |
| D9-14 | **Read-only mode and degraded mode** (DAT-42, DAT-38). | **Read-only mode is automatic:** when the primary can't be reached, writes answer 503 with a retry hint and the dashboard and storefront show a banner, until a write succeeds again. **Degraded mode is the operator's switch:** it divides every shop's limits by a set factor, pauses heavy jobs (exports, reports, reading orders, bulk imports, non-urgent retries), keeps orders, payments, verification, courier booking, sign-in and tracking running, and posts a notice. | Slices 9.2, 9.5, 9.9 |
| D9-15 | **Limits and counters across servers** (RED-02 to RED-05, RED-11, MON-04). | The in-memory windows sit behind one asynchronous store with a Redis version and an in-process version. When Redis can't be reached, each server falls back to its own, at half the limit for sign-in codes, orders, payment sessions and listener pairing, and alerts. Monthly usage counts follow RED-04. The exact limits (orders, payment sessions, listener pairing) move to PostgreSQL counters, as sign-in codes already are. The state that holds on one server only moves to PostgreSQL or Redis: §107's bKash token lock, §119's checkout dedupe and daily fee notice, §125's Gemini reads, §136's SMS spend cap. Each scheduled job runs once at a time across servers, proven by a test with two workers. **Slice 9.4's read (2026-11-13):** one email when Redis goes down and one when it's back; half the limit per process while it's down; the read-your-writes marker waits for the second database server; one PR. Built with leases (a lapsing claim in PostgreSQL) for the one-server state and the passes, and the shared token sealed in Redis. | Slice 9.4 |
| D9-16 | **Money records after a failure** (DAT-51, DAT-52, OD-44). Replication is asynchronous, so a failover can lose the last seconds. | Gateway callbacks and courier messages are stored raw before they're acknowledged, as listener receipts already are; an unreadable courier message is kept, not dropped. A **daily reconciliation** compares the ledger with wallet and gateway records, the listener SMS log and issued invoices, and lists each difference for the operator. | Slices 9.5, 9.9 |
| D9-17 | **Outside calls** (PRF-04, PRF-05). | Every outside call goes through a circuit breaker, adding R2, the Cloudflare API, the courier area list and Google and Facebook sign-in. **Every opened circuit alerts the operator**, not only couriers'. Time spent waiting on an outside service is logged apart from Lytro's own. | Slice 9.5 |
| D9-18 | **Backups** (DAT-22, DAT-27, DAT-30, DAT-34, BKP-01, BKP-03). | ~~pgBackRest~~ **WAL-G** (Slice 9.3's read, 2026-11-13: R2 has no write-only key, so a bucket lock keeps backups from being deleted or replaced, and only WAL-G writes each object once; DAT-34 names both) archives the write-ahead log to R2 within [60] seconds, takes a weekly full and a daily differential backup, encrypts with a key the owner also keeps offline, and keeps 3 full backups (at least [14] days), in a bucket locked [14] days. A nightly `pg_dump`, encrypted to the owner's age public key, goes to a separate R2 bucket with its own key, locked [29] days and then deleted, gone by day 30 (LIF-22). Both run at 05:30 Dhaka (the owner's time), on staging first. One shop's restore brings back only what's missing (the owner's rule). | Slice 9.3 |
| D9-19 | **Restore and failover tools** (DAT-26, DAT-29, DAT-31, DAT-37, DAT-40, DAT-57). | Scripts in the repo, each with a runbook in `RUNBOOKS.md`: full restore, restore to a minute, one shop's restore, failover (D9-2) and adding a replica. The failover and add-replica scripts are tested in CI with two PostgreSQL containers; the restores are drilled on staging, and DAT-54's restore onto a fresh server is drilled before launch. | Slices 9.2, 9.3 |
| D9-20 | **Logs** (LOG-01 to LOG-03, OBS-04). Nest's text logger today. | JSON lines carrying the request ID and the shop's ID. One redaction list masks keys, tokens, codes and payment details, and shows only a phone's last 4 digits. Kept [14] days on the server, then deleted. Shipping logs out waits for 50 paying shops (D9-3). | Slice 9.6 |
| D9-21 | **Health** (MON-02, AVL-02, OBS-01). `/health` reports `database: 'not_configured'`. | `/health` stays a liveness check. A new **ready** check reports whether the database answers and is the primary, and whether Redis answers. Caddy's rollout and UptimeRobot use the ready check. | Slice 9.2 |
| D9-22 | **Security headers** (SEC-04, API-28). Only a content security policy today, on two hosts. | HSTS, `nosniff`, a referrer policy and frame options on every host, set once in the Caddyfile. API-28's check that plain HTTP redirects to HTTPS is recorded. | Slice 9.7 |
| D9-23 | **Not built in Phase 9.** | **When a second server arrives** (DAT-55's trigger): AVL-01 to AVL-04, DAT-21's replication, DAT-43's weights, DAT-53's check after a real failover, and standby-first deploys (AVL-05, DAT-24), as DAT-56 says. D9-13 and D9-19 build their code; the servers come then. **With the shop API** (next release, D8-1): SEC-15 and SEC-05's outgoing webhooks. **When something pushes live:** RED-08. **At 50 paying shops:** D9-3's rest of OBS. **Phase 10's launch list:** the checks that need production keys (a real bKash payment §107/§137, Gemini on a billed key §125, real parcels, MED-12 against a real invoice §138). | §3.3 |
| D9-24 | **The production server** (DAT-19, DAT-20, DAT-35). | A BDIX KVM VPS of 4 vCPU, 6 GB and 100 GB NVMe that meets DAT-20 (its international bandwidth stated), PostgreSQL set as DAT-35 says. Bought early enough for D9-5's test. | Slice 9.10 |
| D9-25 | **Screens.** | Last, sketched first: the console's degraded-mode switch, its list of reconciliation differences and the VAT settings; the read-only and degraded banners in the dashboard and the storefront. | Slice 9.9 |

### 2.1 Points left to each slice's read

Each is settled in its slice's read, before code, and recorded there.

| Slice | To settle |
|---|---|
| 9.1 | The image registry's access, the deploy's connection to the server (an SSH key held by GitHub, or the server pulling), staging's PostgreSQL and process sizes, where the static apps live, and the server's base setup (user, firewall, updates). |
| 9.2 | PostgreSQL 16 or 17 (17 adds a whole-transaction timeout for DAT-23's [5] seconds), the pooler and its mode with pg-boss's own connections, which reads move to the read pool first, and the read-only banner's words. |
| 9.3 | The backup buckets and their keys, where the encryption key's offline copy lives, the dump's time of night, and what a recorded drill holds. |
| 9.4 | The store interface's shape, which limits move to PostgreSQL, and how Redis being down is shown to the operator. |
| 9.5 | How long raw messages are kept, the reconciliation's time and what counts as a difference, the degraded factor and the notice's words. |
| 9.6 | Each alert's threshold where the requirement leaves a range, and which alerts wake the owner and which only notify. |
| 9.7 | What the ZAP scan may touch on staging, and the break-glass record's form. |
| 9.8 | The terms' and privacy policy's sections, and their version names. |
| 9.9 | Settled by its sketch. |
| 9.10 | The expected peak in numbers (PRF-01's 100 shops and sign-up burst), the 50 shops' data, and what a pass report holds. |

---

## 3. Requirement coverage

### 3.1 Completed by this phase

| Area | Requirements |
|---|---|
| Data | DAT-11, DAT-17, DAT-22, DAT-23, DAT-26, DAT-27, DAT-29 (first drills), DAT-30, DAT-31, DAT-32, DAT-34, DAT-35, DAT-36, DAT-38, DAT-40 (first drill), DAT-41, DAT-42, DAT-44 to DAT-47, DAT-51, DAT-52, DAT-54, DAT-56 |
| Backup | BKP-02 (first test), BKP-03 |
| Redis and limits | RED-02 to RED-05, RED-09, RED-11 |
| Performance | PRF-01, PRF-03 to PRF-05 |
| Security | SEC-03, SEC-04, SEC-07, SEC-08, SEC-10 (as D9-8 amends it), SEC-11, SEC-12, SEC-13 |
| Logging and monitoring | LOG-01 to LOG-03, MON-01 to MON-04, OBS-01 to OBS-03, OBS-08 |
| Legal | LEG-02, LEG-03 (as D9-6 and D9-7 amend it) |
| Others | API-28's recorded check |

### 3.2 Partially completed by this phase

| Requirement | Built here | Left | Where |
|---|---|---|---|
| DAT-19, RED-01 | the main server, with Redis on it (D9-1) | the standby, replicas and Redis's own server | DAT-55's trigger |
| DAT-24, DAT-25, DAT-33 | the alerts one server has; resizing and patching in an announced window (DAT-54), rehearsed on staging | replication-lag alerts, the rolling resize | DAT-55's trigger |
| DAT-37, DAT-57 | the command and the procedure, tested in CI and rehearsed on staging (D9-19) | a real failover and a real addition | DAT-55's trigger |
| DAT-55 | an alert when a threshold is crossed (paying shops, load) | the monthly review | the owner, monthly |
| AVL-05 | the single-server rollout (D9-12) | standby first | DAT-55's trigger |
| OBS-04 | JSON lines, kept 14 days (D9-20) | shipping | 50 paying shops |
| SEC-05 | (inbound already built) | outgoing webhooks | next release (D8-1) |

### 3.3 Listed for Phase 9 but not built here

| Requirements | Why |
|---|---|
| AVL-01 to AVL-04, DAT-21, DAT-43, DAT-53 | Need a second server (D9-23, DAT-56); their code is D9-13's and D9-19's. |
| SEC-15 | Tenant webhooks come with the shop API (D8-1). |
| RED-08 | Nothing pushes live between processes yet; notifications go through the job queue. |
| OBS-05, OBS-06, OBS-07, OBS-09 to OBS-12 | At 50 paying shops (OD-43, D9-3). DAT-17's slow-query review is built here. |
| DAT-28 | Not code: the owner turns on two-factor sign-in on every account (§7). |

### 3.4 Dependencies between requirements

- DAT-41 to DAT-47's read-your-writes marker lives in Redis (D9-13), so Slice 9.4's store comes before the marker is
  switched on with a real replica; with one server it changes nothing.
- DAT-42's read-only mode and AVL-02's rollout both read D9-21's ready check.
- DAT-27's backup-age alerts read D9-18's backups; MON-03's job backlog and OBS-02's heartbeats read D9-15's
  single-runner jobs.
- DAT-38's degraded mode divides the limits D9-15 moves into the store.
- DAT-32's load test runs last, on everything else.
- LEG-02's text is what LEG-01 records: publishing it changes the terms versions sign-up stores (Phase 3 close-out).

### 3.5 Rework of code and documents built before this phase

| What | Today | Becomes | Slice |
|---|---|---|---|
| `DatabaseConnector` | one pool | write and read pools, the read role, the retry and the timeouts (D9-13) | 9.2 |
| The server's start | API and every worker in one process | two roles (D9-11) | 9.1 |
| `/health` | `database: 'not_configured'` | liveness, plus a ready check (D9-21) | 9.2 |
| `SlidingWindow` and its ~10 users | synchronous, in memory | an asynchronous store, Redis or in-process (D9-15) | 9.4 |
| The tick queues | pg-boss's defaults | once at a time across servers (D9-15) | 9.4 |
| `CircuitBreaker` users | couriers alert | every circuit alerts (D9-17) | 9.5 |
| `RequestLogger` | text, request ID | JSON, shop ID, redaction (D9-20) | 9.6 |
| `deploy/Caddyfile` | CSP on two hosts, no DNS plugin | headers on every host (D9-22), the DNS plugin (D9-10) | 9.1, 9.7 |
| `.github/workflows/deploy.yml` | placeholder steps | the real pipeline (D9-10, D9-12) | 9.1 |
| Lytro's invoices | no tax fields | VAT fields, hidden until set (D9-7) | 9.8 |
| `SRS-detailed.md` | RED-01, DAT-19, DAT-56; DAT-37; SEC-10, DAT-14; LEG-03, OD-08 | amended by D9-1, D9-2, D9-8 and D9-6, each in its slice | 9.1, 9.3, 9.4, 9.7, 9.8 |
| `KNOWN-GAPS.md` §16 | open | closed: request IDs shipped in Slice 8.1 | 9.6 |

### 3.6 Architecture for this phase

- **One image, every environment.** What runs in production is the image that passed staging, never a rebuild;
  settings alone tell environments apart.
- **Everything the servers run is in the repo:** images, compose files, Caddy, PostgreSQL settings, backup
  configuration and scripts. A server is built from the repo and a few secrets, never by hand.
- **Code chooses the read pool explicitly.** A forgotten choice writes, which is always safe.
- **Each limit has one store.** Its callers never know whether Redis or memory answers.
- **No secret in an image, a repo or a log.** Secrets reach a container from root-only files on its server.

---

## 4. Database work

Migrations take the next free number when each slice's PR opens (`main` reached 0128 with Slice 8.8's console; Phase
8's close-out took none, so 0129 is next). Each slice brings `DATABASE-SCHEMA.md` in line with what it builds.

| Change | Holds | Slice |
|---|---|---|
| a read-only role (`scripts/db/`) | SELECT on the app's tables, read-only by default (D9-13) | 9.2 |
| counters for the exact limits | orders, payment sessions and listener pairing (D9-15) | 9.4 |
| the one-server state | §107, §119, §125, §136's state, moved out of memory (D9-15) | 9.4 |
| raw incoming messages | gateway callbacks and courier messages as received (D9-16) | 9.5 |
| reconciliation differences | each day's differences and what the operator did about them (D9-16) | 9.5 |
| degraded mode's settings | the switch and its factor (D9-14) | 9.5 |
| `pg_stat_statements` | query statistics for DAT-17's review | 9.6 |
| tax on `control.invoices` | the BIN, the rate and the amount; the BIN and rate as settings (D9-7) | 9.8 |

---

## 5. API surface for this phase

| Who | Route | Notes |
|---|---|---|
| Caddy, UptimeRobot | `GET /health/ready` | D9-21 |
| Every write, while the primary is down | 503 with `Retry-After` | DAT-42 |
| Operator | the degraded-mode settings | DAT-38, D9-14 |
| Operator | `GET /api/v1/operator/reconciliation` and marking a difference handled | DAT-52, D9-16 |
| Operator | a shop's credential-use log as CSV | SEC-11 |
| Website | `/terms` and `/privacy`, in Bangla and English | LEG-02, D9-6 |

Each slice's read settles its routes' exact shapes; `API-CONTRACT.md` records them as built.

---

## 6. Slices

### Slice 9.0: the plan
- **Delivers:** this document, and `IMPLEMENTATION-PLAN.md`'s Phase 9 section brought in line with it, in Phase 8's
  close-out PR.

### Slice 9.1: staging
- **Depends on:** 9.0; the owner's staging VPS and DNS records (§7).
- **Delivers:**
  - Images for the server, website and storefront; the Caddy image with the DNS plugin; compose files for a server
    (D9-10).
  - The server's two roles, heap and memory limits, and swap (D9-11).
  - The pipeline: build once, deploy to staging, smoke test, a manual promotion that stays off until production
    exists, and migrations after a dump (D9-12).
  - The server's base setup as a runbook, and staging running `main`.
  - Amends RED-01's placement (D9-1); Redis's container starts here.

### Slice 9.2: database connections
- **Depends on:** 9.1.
- **Delivers:**
  - The write and read pools, the read role, read-your-writes, the retry and the timeouts, and the pooler (D9-13).
  - The ready check (D9-21) and read-only mode (D9-14).
  - CI's two-container test (exit criterion 5).

### Slice 9.3: backups and restores
- **Depends on:** 9.1.
- **Delivers:**
  - pgBackRest and the nightly dump to R2 (D9-18).
  - The restore, one-shop restore, failover and add-replica scripts with their runbooks (D9-2, D9-19).
  - The first drills on staging. Amends DAT-37 (D9-2).
- **Shipped:** #357 (2026-11-13), with WAL-G in place of pgBackRest (D9-18 as amended). The read's answers are in
  the PR. The first staging drills follow its deploy (KNOWN-GAPS §146).

### Slice 9.4: limits across servers
- **Depends on:** 9.1.
- **Delivers:**
  - The limit store with Redis and in-process versions, and the fallback and its alert (D9-15).
  - PostgreSQL counters for the exact limits, and the one-server state moved out of memory.
  - Scheduled jobs once at a time.

### Slice 9.5: money safety and outside calls
- **Depends on:** 9.2, 9.4.
- **Delivers:**
  - Raw messages kept first, and the daily reconciliation (D9-16).
  - Degraded mode's server side (D9-14).
  - Circuit breakers on every outside call, each alerting, and outside time logged apart (D9-17).

### Slice 9.6: monitoring and logs
- **Depends on:** 9.1, 9.3, 9.4.
- **Delivers:**
  - JSON logs with redaction, kept 14 days (D9-20).
  - Sentry, UptimeRobot's checks and job heartbeats, and Grafana Cloud's host and database alerts (D9-3; MON-01,
    MON-03, DAT-25, DAT-27).
  - The 15-minute order-and-payment probe (OBS-08).
  - The slow-query log and `pg_stat_statements` (DAT-17).
  - DAT-55's threshold alert.
  - Every alert fired once on staging.

### Slice 9.7: the security pass
- **Depends on:** 9.1; best after 9.2 to 9.6, so it reviews what they add.
- **Delivers:**
  - SEC-01 to SEC-16 checked with evidence (D9-4).
  - Headers and HSTS (D9-22).
  - Every free-text field bounded, with a test that fails a new unbounded one (SEC-12); control characters refused
    (SEC-13).
  - The credential-use export (SEC-11).
  - The key file, the re-seal job and the break-glass record (D9-8).
  - Phase 8's close-out findings: a test that walks every operator route as a seller, and formula-safe feed cells.
  - A sealed value that can't be opened never breaks a list: a courier connection whose login is unreadable shows as
    needing reconnection instead of failing `GET /couriers/connections` with a 500 (found in development,
    2026-11-12), as storefront keys and catalogue feeds already do.
  - The ZAP baseline and a dependency audit in CI.

### Slice 9.8: terms, privacy and tax
- **Depends on:** 9.0; can run beside any slice.
- **Delivers:**
  - The terms and privacy policy, drafted in Bangla and English (D9-6), as `SUPPORT-LEGAL-PAGES-DESIGN.md` lays them
    out, at new versions recorded by sign-up.
  - The VAT fields on Lytro's invoices (D9-7).
  - Amends LEG-03 and OD-08.

### Slice 9.9: the screens
- **Depends on:** 9.2, 9.5, 9.8; a sketch first.
- **Delivers:** D9-25's screens.

### Slice 9.10: the load test
- **Depends on:** every other slice; the production server (D9-24).
- **Delivers:**
  - Load scripts in the repo, with 50 shops' data.
  - A shakedown run on staging, then the pass on the production server before it's wiped (D9-5, DAT-32, PRF-01,
    PRF-03).
  - The fixes it calls for.
  - The search and media measurements earlier phases left for real servers (CCH-12, MED-05).
  - DAT-54's restore onto a fresh server, drilled on the same machine.

---

## 7. Slice dependencies and order

```
9.0 plan ──► 9.1 staging ──► 9.2 connections ──┐
                        ├──► 9.3 backups ──────┤
                        └──► 9.4 limits ───────┴──► 9.5 money, outside calls ──► 9.6 monitoring
                                                                     │
9.8 terms, tax (any time) ───────────────────────────────────────────┤
                                       9.7 security pass ◄───────────┘
                                                 │
                                    9.9 screens ─┴──► 9.10 load test (production server)
```

**Order, one slice at a time:** 9.1 → 9.2 → 9.3 → 9.4 → 9.5 → 9.6 → 9.7 → 9.8 → 9.9 → 9.10. Slice 9.8's drafting
can start earlier, alongside any slice.

**What the owner provides, when its slice starts.** Each secret goes in a local file outside every repo, or straight
onto the server, which I name when it's needed and never open or print.

| Slice | Needs |
|---|---|
| 9.1 | The staging VPS (Ubuntu 24.04) and its IP, with the owner's SSH key on it; the two DNS records in Cloudflare, "DNS only"; a Cloudflare token that can only edit lytro.app's DNS; GitHub Actions allowed to publish packages |
| 9.3 | Two R2 buckets for backups and their write-only keys; a place for the backup encryption key's offline copy |
| 9.6 | UptimeRobot, Sentry and Grafana Cloud accounts, each with two-factor sign-in (DAT-28) |
| 9.7 | The sealing key's offline copy in the owner's password manager |
| 9.10 | The production server (D9-24), a few weeks before launch |

---

## 8. Non-functional requirements for this phase

- **Money exactly once:** a retried connection never repeats a write without an idempotency key; a failover never
  applies a write to a standby.
- **Isolation:** the read pool keeps row-level security, and a shop's read on it still sets the shop; every new
  route is in the isolation registry.
- **Secrets:** none in an image, the repo, a log or a CI output; the redaction list is tested as LOG-02 says.
- **Scripts are safe to run twice**, and each is run on staging before production needs it.
- **Staging is not a second production:** test shops only, real SMS under the spend cap.

---

## 9. Risks

| Risk | Response |
|---|---|
| No lawyer reviews the terms, payment handling or VAT before launch (D9-6) | The drafts follow LEG-02 and DAT-54 exactly and promise nothing stronger than the 4-hour recovery objective. The review is the first legal cost once revenue allows, and its changes publish as new terms versions. |
| One server at launch | DAT-54's safeguards: point-in-time recovery, a nightly dump, alerts, a rehearsed restore within 4 hours, maintenance windows announced 48 hours ahead, and terms that say so. |
| Redis on the main server competes for memory (D9-1) | RED-01's 256 MB cap; the fallback to in-process limits when it's down (RED-05). |
| A failover loses the last seconds of writes (OD-44) | Raw messages kept first and the daily reconciliation (D9-16); DAT-39's 30-minute check with the manual entry tool. |
| The failover command isn't run for real until a standby exists | CI's two-container test on every change (D9-19); DAT-57's rehearsal on staging before the first real standby. |
| The BDIX server's international bandwidth is slow | Ask before buying (DAT-20); backups and image pulls measured on staging. |
| The load test fails weeks before launch | The staging shakedown finds most of it first; the production server is bought early enough to fix and rerun (D9-24). |
| Free monitoring plans run out | Their limits checked when each account is made; paid plans at 50 paying shops (OD-43). |

---

## 10. Definition of done (per slice)

Same as Phase 8, plus one rule for servers:
- its own branch and PR
- every listed requirement proven by a test written against its pass criteria, or a recorded check for `MAN` and
  `LOAD` ones
- a sabotage-confirm-restore pass on the slice's central rule, and on every rule about money it adds
- `typecheck`, `lint`, `build` and every package's tests clean, the full server suite where shared foundations change,
  and a real boot of the built server
- the isolation registry updated for any new route
- **anything a server runs is proven on staging**: a script, a setting, an alert or a drill, with its result recorded
- `KNOWN-GAPS.md` updated if anything listed here turns out not to hold
- this plan's slice entry marked shipped with its PR number
