# The load test (Phase 9 Slice 9.10)

What it proves, and the owner's answers it is built on: `docs/PHASE-9-PLAN.md`, Slice 9.10. In short: twice the capacity
model's peak for 100 shops (about 0.46 orders, 92 catalogue requests and 16 dashboard requests a second), 50 shops
holding a year of data, a launch burst of 200 sign-ups in 10 minutes, and no outside service called. Then the load keeps
rising until something breaks.

## The pieces

- `outside/`: the stand-in for every outside service (BulkSMSBD, Steadfast, Pathao, RedX, bKash, Resend, Gemini), with
  realistic delays. It serves HTTPS from a certificate authority of its own, and keeps the sign-in codes it receives,
  readable on its plain listener (`:8081/codes`).
- `compose.load.yml`: laid over the release's `deploy/compose.yml`. It runs the stand-in, points every provider at it,
  replaces each provider's key, and raises the sign-up limits that one load machine would meet.
- `k6/`: the seeder (`seed-shops.js`, `seed-catalogue.js`, `seed-orders.js`), the load (`load.js`) and the owner's two
  spikes (`spike.js`). k6 1.0.0, in Docker.
- `sql/`: the seeder's steps run as the database's owner (`seed-limits.sql`, `spread-year.sql`).
- `run/`: the scripts below.
- `apps/website/public/timing.html`, served by the website as `https://<domain>/timing.html`: MED-05's timing from a
  phone's own network. The owner opens it on three networks (the owner's answer, 2026-11-14) as
  `https://<domain>/timing.html?shop=<a shop's address>&media=<a media file's full URL>`, and pastes back what it shows:
  the API's health, a shop's page, and one media file missed and then hit in Cloudflare's cache. It sends nothing
  anywhere. Shop pages go behind Cloudflare's edge cache before launch whatever these show (the owner, 2026-11-14); the
  shop page's numbers are its before picture, and the media's are MED-05's.

## A run, in order

On the **server under test**, as root, from the live release:

1. `bash /opt/lytro/state/current/load/run/arm.sh`. Add `--ceiling` for the ramp past twice the peak: it also raises RTE-06's
   120 requests a minute per visitor, since all the load comes from one address.
2. `RUN=lt bash /opt/lytro/state/current/load/run/seed.sh`, about an hour and a half. For a quick shakedown, make it smaller:
   `SHOPS=10 FULL_SHOPS=5 FULL_PRODUCTS=50 FULL_ORDERS=300 CUSTOMERS=100`. A second seeding on the same server needs its
   own `RUN` and `PHONE_OFFSET` (e.g. `RUN=lt3 PHONE_OFFSET=3000`): the owners an earlier seeding signed up stay.
3. Copy `/opt/lytro/state/load/out/roster.json` to the load machine's `./out/roster.json`.

On the **load machine** (the staging server, for the production run), which reaches the server under test by SSH:

4. `MODE=pass TARGET=deploy@<server> DOMAIN=<its PLATFORM_DOMAIN> TARGET_IP=<its address> bash deploy/load/run/run.sh`.
   It holds twice the peak for 30 minutes after a 5-minute ramp, with the sign-up burst from minute 10. Its thresholds are
   the pass: errors under 1%, API reads under 500 ms and search under 300 ms at the 95th percentile.
5. `MODE=ceiling ... run.sh` (after `arm.sh --ceiling`) adds twice the peak again every 5 minutes, and stops when errors
   pass 5% or reads pass 2 s. Where it stopped is the ceiling.

Before k6 starts, `run.sh` resets the load operator's second factor (`reset-operator.sh`), so the run signs it in afresh.
A run can be made smaller or shorter: `FACTOR`, `MINUTES`, `RAMP_MINUTES`, `SIGNUPS`, `SIGNUP_MINUTES`,
`SIGNUP_START_MINUTES`, `STEP`, `MAX_FACTOR`, and `SKIP` (scenarios left out, by name: `shoppers`, `websites`,
`storefrontOrders`, `websiteOrders`, `sellers`, `phones`, `operator`, `signups`).

**The owner's two spikes** (`k6/spike.js`; the viral product, 2026-11-16, and the flash sale), each on one product of
one shop of the roster (`SPIKE_SHOP`, `SPIKE_PRODUCT`: indexes, 0 by default):

6. **The viral product**, from the load machine through the public path (Caddy, and in production Cloudflare's edge):
   `MODE=viral TARGET=... DOMAIN=... TARGET_IP=... bash deploy/load/run/run.sh`.
   - Each shopper lands on the product's page with an ad's click ID of its own (`?fbclid=`) and asks its delivery charge
     as the page does (the GET Cloudflare keeps).
   - It ramps to `VISITS` a second (67: about 2,000 shoppers on the page at once) over `RAMP_SECONDS` (60) and holds
     for `HOLD_MINUTES` (10). `LANDING=1` lands on `/l/`.
   - It places no orders: from one machine they'd all be one shopper, held to RTE-06's 10 a minute.
   - Behind the edge, the server's own measurements show what of it still reached the server.
7. **The flash sale**, on the server under test itself, as the seeder runs, so each order names a shopper of its own:
   `STOCK=300 ORDERS=10 HOLD_MINUTES=3 bash /opt/lytro/state/current/load/run/flash.sh`.
   - It sets the product's stock to `STOCK`, then places `ORDERS` a second on it through the shop's website key.
   - It counts what was placed, refused as sold out (409), held to the shop's minute (429) or busy (503); a 500 fails
     it. Afterwards it logs the units held for orders, which match what was placed and never pass `STOCK`.
   - Run beside a viral run with `ORDERS=1`, it's the ad's shoppers ordering while the page is busy.

Then, back on the server: `bash /opt/lytro/state/current/load/run/disarm.sh`. The report goes in `docs/drills/` (below).

## Never on a server that isn't armed (D9-34)

Load places orders and signs sellers up, and each of those sends an SMS. On a server that isn't armed those SMS would
go to the real BulkSMSBD, to made-up phone numbers that may belong to real people.

Staging's live runs on 2026-11-19 found two ways it could happen. Both times the SMS were refused only because the
balance had run out:

- the first run kept placing orders for ten minutes after it was disarmed, and 49 order SMS went to the real provider;
- the second run stopped before its disarm, but 24 of its order SMS were still queued when the worker came back on the
  real provider.

So:

- **`run.sh`, `seed.sh` and `flash.sh` start only on an armed server.** `run/armed.sh` checks two things:
  - the stand-in is running and answering;
  - the API and the worker point every provider that `compose.load.yml` names at the stand-in.
- **`run.sh` keeps asking every 20 seconds.** Two misses in a row stop its k6.
- **`run.sh` stops its k6 whenever it exits.** The k6 container is named `lytro-load-<run>`, and an interrupted or
  killed script stops it too.
- **k6 stops itself** (exit 108) once the stand-in is gone or answers 410 (`k6/lib/guard.js`), even when nothing else
  is left to stop it:
  - the load, the spikes and the seeding of orders check every 10 seconds;
  - the seeder checks before each sign-up.

  Each check also tells the stand-in that a run is going (`GET /load/ping`).

- **`disarm.sh` refuses while a run checked in within the last 30 seconds** (`GET /load` on the stand-in). Stop the run
  first: on the load machine, `docker ps --filter ancestor=grafana/k6:1.0.0` lists what still runs. `disarm.sh --force`
  disarms anyway, and the run then stops itself.
- **Standing down comes before the real providers come back.** `disarm.sh` and every deploy run `run/stand-down.sh`,
  which does nothing when no test is armed. In order:
  1. The stand-in answers every run's next check 410 (`POST /load/stop`), and a run still going gets 30 seconds to
     stop.
  2. While the stand-in still answers, the work the test queued for an outside service drains: order and usage SMS,
     OTP retries, couriers' fraud checks, Meta's purchase events, and the SMS and mail outboxes. It waits up to 3
     minutes (`DRAIN_SECONDS`). Whatever is still waiting then, of what was queued since the stand-in was made, is
     cancelled.
  3. The stand-in goes.
  4. The per-visitor setting `--ceiling` raised goes back.

  Then `disarm.sh` restarts the API and the worker on the real providers; a deploy does it in its step 5.

## What each run leaves

- In `./out/` on the load machine:
  - k6's summary (`<run>-k6.json`, `<run>-k6.txt`);
  - the server's side, every 10 seconds: CPU, memory, swap, PostgreSQL's connections and buffer cache hit ratio
    (`<run>-server.csv`), and each container's CPU and memory (`<run>-containers.csv`);
  - the 20 queries that took the most time (`<run>-queries.txt`).
- On the server: the seeded shops, until the production server's wipe before launch. Staging keeps them, which costs
  nothing but disk.

## The report

`docs/drills/<yyyy-mm-dd>-load-<server>.md` (the drills' own naming, `docs/drills/README.md`):

- DAT-32's checklist of what was in place: the PostgreSQL memory settings, two API processes and one worker, the pooler,
  pools of at most 5, and no export or migration running;
- every threshold against its measurement: errors, API reads and search at the 95th percentile, Redis checks (RED-03),
  connection errors (DAT-11), memory under 80%, no swap, and order creation while reports ran (DAT-18);
- CPU, database queries a second, the buffer cache's hit ratio and the slowest queries;
- the ceiling, and the Cloudflare decision with its numbers;
- every setting the run raised, and every fix it led to.
