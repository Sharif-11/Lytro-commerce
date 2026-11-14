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
- `k6/`: the seeder (`seed-shops.js`, `seed-catalogue.js`, `seed-orders.js`) and the load (`load.js`). k6 1.0.0, in
  Docker.
- `sql/`: the seeder's steps run as the database's owner (`seed-limits.sql`, `spread-year.sql`).
- `run/`: the scripts below.

## A run, in order

On the **server under test**, as root, from the live release:

1. `bash /opt/lytro/state/current/load/run/arm.sh`. Add `--ceiling` for the ramp past twice the peak: it also raises RTE-06's
   120 requests a minute per visitor, since all the load comes from one address.
2. `RUN=lt bash /opt/lytro/state/current/load/run/seed.sh`, about an hour and a half. For a quick shakedown, make it smaller:
   `SHOPS=10 FULL_SHOPS=5 FULL_PRODUCTS=50 FULL_ORDERS=300 CUSTOMERS=100`.
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

Then, back on the server: `bash /opt/lytro/state/current/load/run/disarm.sh`. The report goes in `docs/drills/` (below).

## What each run leaves

- In `./out/` on the load machine:
  - k6's summary (`<run>-k6.json`, `<run>-k6.txt`);
  - the server's side, every 10 seconds: CPU, memory, swap, PostgreSQL's connections and buffer cache hit ratio
    (`<run>-server.csv`), and each container's CPU and memory (`<run>-containers.csv`);
  - the 20 queries that took the most time (`<run>-queries.txt`).
- On the server: the seeded shops, until the production server's wipe before launch. Staging keeps them, which costs
  nothing but disk.

## The report

`docs/drills/load-test-<server>-<day>.md`:

- DAT-32's checklist of what was in place: the PostgreSQL memory settings, two API processes and one worker, the pooler,
  pools of at most 5, and no export or migration running;
- every threshold against its measurement: errors, API reads and search at the 95th percentile, Redis checks (RED-03),
  connection errors (DAT-11), memory under 80%, no swap, and order creation while reports ran (DAT-18);
- CPU, database queries a second, the buffer cache's hit ratio and the slowest queries;
- the ceiling, and the Cloudflare decision with its numbers;
- every setting the run raised, and every fix it led to.
