# Lytro's isolated data layer

Status: a proposal, 2026-11-20. The owner: "What if we create a self managed data layer spreading multiple regions and
make data layer isolated from api layer?", then "create a seperate doc with isolated data layer".

PostgreSQL and Redis run as a layer of their own. They have their own servers and their own private network, the API
layer reaches them through one door, and they are spread over two regions, so even a city-wide outage leaves a copy.
All of it is self-managed, which keeps it far below the managed cloud's cost (`MANAGED-CLOUD.md`).

It builds on `TWO-DATA-CENTRES.md` and `DATA-LAYER.md`. It amends DAT-19 (a second region) and D9-2, DAT-37 and OD-37
(automatic failover inside Dhaka). Nothing here is bought or built yet.

## In short

- **What's isolated: network, access, credentials and change.**
  - The data servers have no public addresses.
  - App servers reach them only through a gateway on one port, using roles that can't replicate, back up or
    administer.
  - The data layer deploys on its own schedule, so an app release can't touch it.
- **Where it runs: Dhaka, plus a second region.**
  - The primary and a synchronous standby stay in Dhaka's two data centres, next to the API.
  - A disaster-recovery standby and the witness sit in Mumbai or Singapore, a few seconds behind.
- **What it survives: a server, a data centre, even all of Dhaka.**
  - Inside Dhaka, failover is automatic: about 1–2 minutes, with nothing lost.
  - If all of Dhaka goes dark, region 2 is promoted on purpose. That takes about 10–20 minutes with a warm API layer
    there, or 30–60 minutes cold, and loses a few seconds of data.
- **The cost at 2,000 shops: about ৳1.89 lakh a month,** with region 2 cold in AWS Mumbai, or ৳2.26 lakh warm. The
  managed cloud was ৳4.15–6.9 lakh, and two centres without region 2 ৳1.49 lakh.

## Two rules it rests on

- **Separation is about network, not distance.** The primary stays in Dhaka beside the API servers. A page makes about
  10 queries in a row, so a primary 48 ms away in Singapore would add about half a second to every page, and would hold
  an order's stock lock across the sea. Region 2 holds only copies.
- **Region 2 is never promoted by itself.** Its standby carries Patroni's `nofailover` tag. Promoting it moves the
  whole platform out of Dhaka, API layer included, so a person decides that it's an outage of the region and not a
  blip. Inside Dhaka, failover stays automatic.

## The layout

![Cloudflare in front of an API layer in two Dhaka data centres; below it a separate data layer on its own private network with a gateway in each centre, the PostgreSQL primary in A and synchronous standby in B, and Redis in each centre; region 2 in Singapore or Mumbai with an asynchronous DR standby, the witness and an optional warm API layer; backups outward to R2.](diagrams/isolated-layout.svg)

- **What crosses between the layers:** the API layer sits above and the data layer below. Nothing crosses between them
  except PgBouncer's port and each centre's Redis.
- **Region 2 is a copy,** a few seconds behind. It also holds the witness that breaks ties inside Dhaka.
- **Where region 2 streams from:** its standby streams from centre B, so the primary sends only one stream.

## What may reach the data layer, and what may not

![The only flows allowed: shoppers to the API layer through Cloudflare; the API layer to the data gateway on 6432 and its own centre's Redis on 6379; the gateway to PostgreSQL on 5432; admins through the bastion over SSH; backups and metrics outward only. Refused: app servers to PostgreSQL, Patroni or etcd directly, and anything from the internet.](diagrams/isolated-access.svg)

Only the ports drawn are open. The data servers' own firewalls drop everything else, and the servers have no public
address to reach in the first place. The links between data servers, the bastion's and the gateway's all run inside
the WireGuard tunnel.

| Who | Role in PostgreSQL | May | May not |
| --- | --- | --- | --- |
| The API and workers | `lytronix_app` and the read role, through the gateway | read and write shops' rows, under row-level security | replicate, back up, change the schema, see other roles |
| Migrations | the owner role, in a one-off job through the gateway | change the schema, after the deploy's dump | run from a browser or an app process |
| Patroni and the standbys | the replication role, inside the data network | stream WAL, rewind a rejoining server | read shops' rows over the gateway |
| Backups | WAL-G and the dump's role, on the data servers | read everything, write to R2's locked buckets | delete or overwrite a backup (the bucket locks prevent it) |
| Monitoring | `pg_monitor` | read the statistics | read shops' rows |
| Admins | personal roles, through the bastion | switchovers, drills, a restore | log in from anywhere but the bastion |

## When all of Dhaka goes dark

![Dhaka goes dark; checks fail within a minute and kept pages are still served; someone confirms it's a regional outage in 5–15 minutes; region 2 is promoted after Dhaka is fenced in about 5 minutes; the API layer starts there, warm in 1–2 minutes or from images in 20–30; orders work again after 10–20 minutes warm, 30–60 cold. Coming back, Dhaka is rebuilt as standbys and switched over in a quiet hour.](diagrams/isolated-region-failover.svg)

- **Data lost going to region 2:** the few seconds the asynchronous stream was behind. Orders placed in those seconds
  are found again by the daily money check against bKash and the couriers (DAT-52).
- **The person in the loop** is the price of never having two primaries across the sea.
- **A drill twice a year** moves the platform to region 2 and back, and records the times in `docs/drills/`.

## What each failure does

| What fails | What happens | Downtime | Data lost |
| --- | --- | --- | --- |
| An app server | Cloudflare and the gateway skip it | none | none |
| A data gateway | that centre's app servers use the other centre's gateway | seconds | none |
| The primary, or all of centre A | Patroni promotes centre B's synchronous standby | ≈ 1–2 min | none |
| The standby, or all of centre B | A writes alone; region 2 streams from A meanwhile | none | none, but only one copy in Dhaka |
| The link between A and B | A keeps the lead with the witness's vote; B catches up later | B's writes wait | none |
| All of Dhaka | region 2 is promoted on purpose (above) | ≈ 10–20 min warm, 30–60 cold | a few seconds |
| Bangladesh's international links | Dhaka keeps serving inside the country; region 2 falls behind and catches up | none inside Bangladesh | none |
| Region 2 or the witness | nothing for shoppers; alerted and replaced | none | none |
| The bastion | no admin access until it's rebuilt; nothing for shoppers | none | none |
| An app server broken into | it reaches only the gateway's port and its centre's Redis, as the app role: no schema, no backups, no other roles | none | what that role can read |

## What it costs at 2,000 shops

Dhaka's two centres stay as priced in `TWO-DATA-CENTRES.md`, and the gateways run on the database servers themselves.
What's added is region 2 and a small bastion. Region 2 is either:
- **cold:** the standby and the witness, with the API layer started from images when needed; or
- **warm:** two app servers running there too.

Prices were verified on each provider's own page, price feed or API on 2026-11-20, before tax, at 124.75 taka to the
dollar.

| Region 2 | The standby (8 vCPU / 64 GB, 1 TB) | Cold: standby + witness | Warm: + 2 app servers |
| --- | --- | --- | --- |
| **AWS Mumbai (41 ms)** | r7g.2xlarge $219 + 1 TB gp3 $91 | **$326 = ৳40,656** | **$620 = ৳77,320** |
| Linode Singapore or Mumbai | shared 16 vCPU / 64 GB, 1.3 TB disk, $384 | $389 = ৳48,528 | $677 = ৳84,456 |
| Vultr Singapore or Bangalore | Memory Optimized $320 + 1 TB NVMe $100 | $425 = ৳53,019 | $745 = ৳92,939 |
| DigitalOcean Singapore or Bangalore | Memory-Optimized $336 + 1 TB volume $100 | $442 = ৳55,140 | $778 = ৳97,056 |
| Hetzner Singapore | 16 vCPU / 64 GB dedicated $403 + 1 TB volume $77 | $489 = ৳60,988 | $710 = ৳88,580 |
| AWS Singapore (48 ms) | r7g.2xlarge $377 + 1 TB gp3 $96 | $496 = ৳61,881 | $990 = ৳1,23,475 |
| A second Bangladeshi city | Meghna Cloud (the national data centre, Kaliakoir) and BDCOLO quote on request; Axentec's Jashore cloud lists nothing above 8 vCPU / 16 GB | ask for a quote; it keeps the copy at home | |

| The whole layout, a month at 2,000 shops | Region 2 cold | Region 2 warm |
| --- | --- | --- |
| Dhaka: two centres (without their witness, which moves to region 2) | ৳1,47,551 | ৳1,47,551 |
| Region 2 in AWS Mumbai | ৳40,656 | ৳77,320 |
| Bastion (the smallest CloudXen VPS) | ৳686 | ৳686 |
| **Total** | **≈ ৳1,88,893 ($1,514), ৳94 a shop** | **≈ ৳2,25,557 ($1,808), ৳113 a shop** |
| For comparison: the managed cloud | ≈ ৳4.15–6.9 lakh (`MANAGED-CLOUD.md`) | |
| For comparison: two centres, not isolated, no region 2 | ≈ ৳1.49 lakh | |

**About these figures:**
- **Replication traffic is free.** Every provider charges nothing for inbound traffic, so receiving the replication
  stream (about 150 GB a month) costs nothing.
- **What AWS's totals cover:** they include public addresses. They leave out root disks and outbound traffic past 100
  GB, which a standby barely uses until it's promoted.
- **Stand-in plans:**
  - Hetzner and Linode have no 8 vCPU / 64 GB plan, so their rows use 16 vCPU stand-ins.
  - Vultr's Mumbai has only HDD block storage, a poor fit for PostgreSQL, so its Indian row is Bangalore.
- **Taxes and card charges aren't included:** neither the taxes nor the currency charges on a card billed from
  Bangladesh.
- **Residency:** a copy of shoppers' data abroad raises the same question as the managed option, only for a copy.

## What changes from today

| Change | Why | Kind |
| --- | --- | --- |
| PgBouncer moves from the app servers to the data gateway | One door into the data layer, owned by it. App servers keep their own small pools to the gateway. | Deploy |
| The data layer gets its own deploy | Patroni, etcd, HAProxy, PgBouncer and PostgreSQL deploy from their own files, on their own schedule. `deploy.sh` stops touching the database. | Code |
| Migrations run as a one-off job through the gateway | The owner role is used only there, after the deploy's dump, as today. | Deploy |
| WireGuard between every server | The data network spans Dhaka's two centres, region 2 and the bastion. | Ops |
| Firewall rules written down as code | The allowed flows above and nothing else, checked after every change. | Ops |
| Patroni tags for region 2 | `nofailover` and `replicatefrom`, so it never leads by itself and spares the primary a second stream. | Ops |
| Region 2's allowlists | R2's keys, the SMS gateway, bKash and the couriers learn region 2's addresses before the day it's needed. | Ops |
| A region-failover runbook and its drill | Fence Dhaka, promote, start the API layer, move pool C. Twice a year. | Drill |

## For the owner to decide

| Decision | Recommendation | What it changes |
| --- | --- | --- |
| Where region 2 goes | **Ask Meghna Cloud and BDCOLO for a quote first**, to keep the copy in Bangladesh. Otherwise **AWS Mumbai**: the closest at 41 ms, and the cheapest verified 8 vCPU / 64 GB with fast disks. | A copy abroad needs the residency check in `MANAGED-CLOUD.md` |
| Cold or warm | **Cold first** (৳40,656). A Dhaka-wide outage then takes 30–60 minutes; warm (৳36,664 more) brings it to 10–20. | Warm can be switched on at any time |
| Where the gateways run | **On the database servers**, at no extra cost, until about 5,000 shops. Separate gateway servers after that. | Nothing now |
| Patroni, or one command, inside Dhaka | **Patroni**, as in `DATA-LAYER.md` | Amends D9-2, DAT-37 and OD-37 |
| When | **After the two Dhaka centres run** and their failover drill passes. Region 2 comes next, then the isolation steps as each part is rebuilt. | DAT-19's later phases, amended for a second region |

## Sources

- **Design:** `TWO-DATA-CENTRES.md`, `DATA-LAYER.md` and `MANAGED-CLOUD.md`; DAT-19, DAT-28, DAT-37, DAT-52 and D9-2.
- **Prices** (verified 2026-11-20):
  - AWS's published EC2, data-transfer and VPC price lists;
  - Hetzner's price feed;
  - DigitalOcean's pricing pages;
  - Vultr's and Linode's public APIs;
  - Axentec's published plans.

  Meghna Cloud and BDCOLO publish no prices.
- **Latency:** WonderNetwork's Dhaka tables, 2026-11-06 to 11-20.
- **Timings** are estimates until the region-failover drill measures them.
- Prices change, so check them before buying.
