# Load drill, 2026-11-18: staging's recheck after the edge cache

Staging (2 vCPU, 3 GB, release `116bbefd`: the edge cache #380, the small fixes #381, the catalogue write queue #382),
armed with `arm.sh --ceiling`, so the one load machine's requests weren't held to one shopper's 120 a minute. Seeded
small (`RUN=lt3 PHONE_OFFSET=3000 SHOPS=10 FULL_SHOPS=5 FULL_PRODUCTS=100 SMALL_PRODUCTS=20 FULL_ORDERS=300
SMALL_ORDERS=30 CUSTOMERS=100`), loaded from the owner's PC, disarmed at 19:26 UTC (the limit back to 120, the stand-in
gone, the load operator removed). The owner's go: 2026-11-18. Staging has no Cloudflare in front of its shop pages
(D9-32's answer 1), so every page here was rendered at the server: this is the edge cache's cost when nothing is cached.

## Seeding

| | |
| --- | --- |
| Shops, products, delivery areas | 10, 600, 200; none failed |
| Orders | 1,603 spread over the year; 31 of 7,019 requests answered **503 "the server is very busy"** at two short bursts |

The first two seedings made no shops: every seeding gave its owners the same phones, and the server keeps the owners of
the 14 November seeding, so their codes were refused. `PHONE_OFFSET` now moves a seeding's phones past an earlier one's.

## The pass run: the model's peak (FACTOR 1), 10 minutes after a 2-minute ramp

| | |
| --- | --- |
| Requests | 17,888 (22 a second) |
| Failed | 45.8%: all **503 busy**, none 500 |
| API reads, 95th percentile | **45.7 s** (14 November: 381 ms, though a third of its load was turned away cheaply by 429) |
| CPU | average 96%, peak 100%; load average 14 on 2 vCPU |
| PostgreSQL | at most 29 connections and 5 active, **no lock waits** (the catalogue queue), buffer cache hits 100% |

Each container's CPU against 14 November's pass: Caddy 11% → 27%, each API process about 22% → 30%, PostgreSQL 26% →
32%, the storefront 34% → 31%. The API's own counts of what it answered, by route, show why:

| Route | Answered | What it would have been |
| --- | --- | --- |
| `internal/storefront/context` (which shop a host serves) | 5,051 | about 1,500: the storefront keeps each host's answer 5 seconds, but pages asking at once each asked for themselves |
| `public/shop` (the shop's frame) | 1,542 | about 200: #380 had a page for the edge read the frame afresh every time |
| `public/catalogue/categories` | 948 | about 200: the same |

About 5,600 of the 18,000 calls could have been avoided. On a server already at its 1× capacity (14 November's ceiling
run), they tipped it into queueing, where every route's 95th percentile was 7 to 28 seconds. The answers it gave were
right: busy pages and busy answers with a wait, never a 500.

**Fixed with this report:** a host's lookup is shared by the pages asking at once; a page for the edge takes a frame at
most 4 seconds old (under the 5 seconds the server waits after a change before it purges), not a fresh one each time.
The pass and the viral product are run again once that is on staging.

## The flash sale: 10 orders a second for 3 minutes on one product holding 300

Run on the server (`flash.sh`), each order a shopper of its own, through the shop's website key.

| | |
| --- | --- |
| Orders sent | 1,763 |
| Placed | 297 |
| Refused as sold out (409) | 243 |
| Held to the shop's 180 a minute (429) | 1,223 |
| Failed (500) | **0** |
| Stock after | 300 on hand, **300 held for orders** (297 placed now, 3 by the seeding before): nothing promised past the stock |

## What it found

1. **The storefront asked the API too often** (above): fixed here.
2. **Busy is answered as busy.** The seeding's bursts and the pass run's queueing gave 503 with a wait, never "saving
   paused" or a 500 (#381).
3. **One shop's catalogue changes no longer block others.** No lock waits through the run, with sellers' stock changes
   in it (#382).
4. **A flash sale never oversells,** and past 180 orders a minute a shop's orders are held, not failed.
5. **The old seeded shops are read-only** (`lt-s*`, 14 November): trial shops seeded far past a trial's limits. They
   cost nothing; the production server's wipe removes such shops before launch.
