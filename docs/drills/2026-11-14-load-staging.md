# Load drill, 2026-11-14: staging's shakedown

The shakedown Phase 9 Slice 9.10's read set before the production run (PHASE-9-PLAN §9.10, the owner's answers): the
scripts tried on a real server, the obvious faults found first. Staging is not the production server, so nothing here
is the pass. The pass runs on the production server (D9-5, D9-24).

- **Who ran it:** b9 ran the server side (copy, arm, seed, disarm). The load came from the owner's computer over its
  home connection, with run.sh and the owner's SSH access to staging.
- **Scripts:** deploy/load at 0d9686c0, with the seeder's fix 49b04312 (PR #371).
- **Server:** staging, a BDIX VPS with 2 vCPU, 3 GB and 40 GB NVMe, release 99a0c675. Two API processes and one worker,
  PgBouncer, Redis, the storefront and the edge on the one machine (DAT-32's set).
- **Armed:** every outside service answered by the stand-in, from 10:20Z to the disarm.
- **Data (small, the owner's choice):** 10 shops, 5 of them full. A full shop had 100 products and 300 orders (a month
  of the capacity model's shop), a small one 20 and 30. In all 2,850 orders from 100 customers a shop, spread over a
  year. Seeding took about 13 minutes: 600 orders refused on the first try (below), then 5,222 requests with none failing.

## The pass run: the model's peak (FACTOR 1), 30 minutes after a 3-minute ramp

All of the 100-shop model's traffic went through the 10 shops, from one address. 50 sign-ups ran in 10 minutes from minute
10, and the operator read reports twice a minute.

| | |
| --- | --- |
| Requests | 67,836 (33 a second) |
| Failed | 34.6%: all 429, or storefront 500s caused by 429 (below) |
| API reads, 95th percentile | 381 ms (the pass asks under 500) |
| Search, 95th percentile | 195 ms (under 300) |
| All requests, 95th / 99th percentile | 901 ms / 2.32 s |
| Without a failure | sellers' dashboard (16,121), stock changes (769), sign-ups (51), operator reports (69), phones (35) |
| The API's own 5xx | none in 15 minutes of both processes' logs (b9's count) |

Staging, every 10 seconds:

| | |
| --- | --- |
| CPU | average 78%, peak 99%; load average about 6 on 2 vCPU |
| Memory | 56%, with about 17 MB of swap in use |
| PostgreSQL | at most 30 connections and 4 active, no lock waits, buffer cache hits 100%, 176 commits a second |
| Most CPU | the storefront, then each API process and PostgreSQL |

## The ceiling run: from half the peak, up by half every 5 minutes

RTE-06's 120 requests a minute per visitor was raised for this run (`arm.sh --ceiling`), so the climb met the server's
limit, not that one. It stopped itself after 12 minutes, early in the 1.5× step, when reads' 95th percentile passed 2 s
(2.09 s). Errors stayed at 0.12%: staging slowed down rather than failing.

| Step | CPU average (peak) | Load average, peak | PostgreSQL active, peak |
| --- | --- | --- | --- |
| 0.5× | 60% (70%) | 3.8 | 2 |
| 1.0× | 90% (98%) | 10.2 | 3 |
| 1.5× | 98% (99%) | 11.4 | 3 |

**Staging's two vCPUs carry about the capacity model's 1× peak for 100 shops.** The limit is CPU, shared by the storefront's
page rendering, the API and PostgreSQL, and not the database's locks or connections. The production server has twice the
CPU, so twice the peak, the pass, may sit close to its own limit; its run says.

The slowest queries in the climb, by total time:
- the dashboard's order list (8.3 ms each, 1,386 calls);
- `set_config`, the shop's row-level security context (232,267 calls, 0.01 ms each);
- pg-boss's maintenance lock (160 ms each, 12 calls);
- the tenant lookup (0.37 ms, 5,093 calls);
- **`INSERT INTO tenant.delivery_zones`, 6,585 calls in 12 minutes** (below).

## What it found

1. **A storefront page answers 500 when the API says "too many requests".**
   - All 10,184 storefront errors in 15 minutes were the API's 429 (b9's count of the storefront's log), turned into
     Next's error page.
   - A shopper should see a calm "busy, try again in a moment" state instead. That is a new screen state, so it is
     sketched for the owner first (the owner's rule).
2. **Every delivery estimate tries to write.** `DeliveryZoneRepository.ensureDefaults` runs two
   `INSERT ... ON CONFLICT DO NOTHING` at the start of every zone transaction, estimates included, so a read pays for a
   write and can never move to a read-only replica (DAT-41). The defaults can be made once, when the shop opens.
3. **The seeder outran a shop's 60 orders a minute** (`public_orders_per_shop_per_minute`, Slice 4.2), and 1,050 orders
   were refused. Fixed in the seeder (49b04312): it keeps each shop at 50 a minute.
4. **The test's phones beat too often.** A rate rounded up to one a minute made each of the 10 phones beat every
   10 minutes, past LSN-03's 4 an hour. Fixed in the load (5b1bd213).
5. **run.sh couldn't copy the measurements**, since staging's SSH user isn't in the deploy group. It now fetches them
   through sudo (d2c5117e).
6. **Found before staging, in the local trial:** a burst of catalogue edits in one shop holds pooled connections while
   they wait for that shop's lock. The pool then runs out, and the wait for a connection is answered as the database
   being lost: 503 "changes won't be saved for a few minutes". The shakedown didn't meet it: none of the API's lines
   showed the pool or a pause.

## What the 429s mean

They come from this run's shape, not from Lytro's limits being wrong:
- 10 shops carried the traffic of 100;
- every request came from one address, so each shop had one "visitor";
- RTE-06 holds a visitor to 120 requests and 10 orders a minute in a shop.

The storefront forwards each shopper's own address (storefront-api.ts), so real shoppers are counted one by one. The
production run's 100 shops each carry a tenth of this, under 120 a minute at twice the peak.
