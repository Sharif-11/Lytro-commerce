# Runbooks

Operational procedures run by whoever has server/database access, not through the live app. The first entry
is `ADM-18`'s own break-glass recovery; add further runbooks as their own numbered sections, same shape, as
the platform needs them (a purge run, a stuck job, etc.) rather than growing this into a general ops diary.

---

## 1. Operator 2FA break-glass recovery (ADM-18)

**When to use this:** an operator has lost both their TOTP device and all ten backup codes, and cannot sign
in to the operator console at all. This is the only recovery path — there is no "forgot 2FA" self-service
flow, by design (`SRS-detailed.md` `ADM-18`).

**Who can run this:** whoever has a direct connection to the production database with the schema-owner
role (`lytronix`, not the app's own restricted `lytronix_app` role — the app has no `UPDATE`/`DELETE` grant
on `operator_accounts`/`operator_backup_codes` at all, by the same construction `create-operator` relies
on). In practice: SSH into the host running Postgres, or wherever `packages/db`'s own `DATABASE_URL`
(schema-owner) is configured for the deploy pipeline — never the app server's own `.env`.

**Current limitation, by design:** `ADM-18`'s second half — once a second operator exists, resetting
another operator's 2FA needs that second operator's approval, not a unilateral reset — is not built.
`OD-32` keeps the platform solo-operator for now, so there is nothing to approve yet. Revisit this runbook
once a second operator account exists.

### Procedure

1. Confirm the request is genuine and from the actual locked-out operator (out-of-band — email thread,
   phone call, whatever channel you already trust them on; this script has no identity check of its own
   beyond "you have DB access and typed a real email").
2. From `packages/db`, with `DATABASE_URL` set to the schema-owner connection string:
   ```
   pnpm --filter @lytronix/db reset-operator-2fa <operator-email>
   ```
   (Built: `packages/db/src/reset-operator-2fa.ts`, run via the `reset-operator-2fa` script in
   `packages/db/package.json`.) It fails loudly with "no operator account for `<email>`" if the email is
   wrong — nothing is changed in that case.
3. In one transaction, this: nulls the account's `twoFactorSecret` and `twoFactorConfirmedAt`, deletes every
   row in `operator_backup_codes` for that operator, and writes one `control.platform_audit_log` row
   (`action = 'break_glass_2fa_reset'`, the actor and target both the reset account) — so a reset can never
   happen silently. Confirm it worked by checking that row exists, or by the console log line the script
   itself prints (`operator 2FA reset for <email> — re-enrollment is required before next sign-in`).
4. Tell the operator to sign in normally (`POST /auth/operator/signin` with their existing email and
   password — the password is untouched by this procedure, only 2FA is reset). Since their enrollment is
   now unconfirmed, sign-in returns a **freshly generated** secret and QR URI (`next: 'enroll-2fa'`), not the
   old one.
5. The operator confirms with one valid code from that fresh secret (`POST /auth/operator/enroll`), which
   re-opens a session and issues a new set of ten backup codes, shown once — exactly the same first-time
   enrollment flow a brand-new operator account goes through. The account is unusable until this step
   completes; there is no partial state where 2FA is reset but the account still works.

### What this does not do

- Does not touch the account's password — only 2FA state. A locked-out operator who has also forgotten
  their password needs a separate password reset (not built for operators at all today — `create-operator`
  is the only script that sets one, and only at account creation).
- Does not require a second operator's sign-off, since none exists yet (see the limitation above).
- Leaves no way to recover the *old* backup codes or TOTP secret — this is a hard reset, not a rotation.
  `ADM-01`'s own self-service **regenerate** (`POST /auth/operator/backup-codes/regenerate`, while still
  signed in and still holding either the TOTP device or one valid backup code) is the lighter-weight path
  for an operator who still has *one* working factor and just wants a fresh set — this break-glass procedure
  is only for the case where both factors are gone.

---

## 2. Media storage keys: inventory and rotation (MED-07)

**What this is:** the record MED-07 asks for — every key that reaches the media buckets, what it may do, where it is
kept and when it was last rotated — and the steps to rotate one. Keys never go in the repository or in chat; they live
in `apps/server/.env` on each server and in the CI secrets.

**The keys.** One per job, each with the least it needs. Fill in the dates when a key is made or rotated; each is due
again 90 days later.

| Key (env names) | R2 permission and buckets | Used by | Made / last rotated | Next due |
| --- | --- | --- | --- | --- |
| `MEDIA_SIGNER_*` | Object Read & Write, the uploads bucket only | signing browser uploads (`S3MediaStorage.signUpload`) | — | — |
| `MEDIA_PROCESSOR_*` | Object Read & Write, the uploads, media and evidence buckets | the processing job: reading and clearing uploads, writing media, listing for the nightly run; payment screenshots (D8-47) | — | — |
| `MEDIA_DELETER_*` | Object Read & Write, the media and evidence buckets | the deletion jobs only (`MediaDeleter`, and the two-year removal of screenshots, D8-47) | — | — |
| Media Worker's `R2_*` secrets | **Object Read only**, the media bucket only | serving media (`apps/media-worker`, `S3Origin`); a write fails at R2 itself | — | — |
| `MEDIA_LINK_SECRET` (the Worker's secret and the server's setting) | signs and checks private links (BND-07) | the server signs, the Worker checks | — | — |
| `CLOUDFLARE_API_TOKEN` (with `CLOUDFLARE_ACCOUNT_ID` and `MEDIA_EDGE_KV_NAMESPACE_ID`) | an account API token, not an R2 one: **Account Analytics: Read** and **Workers KV Storage: Edit**, this account only | the minute's bandwidth pass (`CloudflareMediaEdge`): reading the Worker's usage, writing the blocked list and each shop's website addresses to its KV store; and each hour's read of R2's own figures for the media costs page (`CloudflareR2Usage`, Slice 8.6, GraphQL analytics) | — | — |

**Accepted limit: R2 cannot split writing from deleting** (decided 2026-10-21, confirmed 2026-10-28, KNOWN-GAPS §78).
R2 tokens come only as read, or read and write, per bucket, and read and write includes deleting; a Worker's R2 binding
allows both too. So the processor's key can delete media, though no code path does: only `MediaDeleter` deletes, and
the processor sends its own leftovers to it. The media Worker cannot write at all (its token is read only). It stays an
accepted risk next to the media loss entry in the risk register (SRS.md §17).

**Checked on the development keys, 2026-10-28** (`lytro-dev-*` tokens on `lytro-dev-uploads` and `lytro-dev-media`):
the signer cannot write media; the processor writes and also deletes media; the deleter deletes media; the Worker's
token lists and reads the media bucket and is refused writing to it and reading the uploads bucket (403 each). Run the
check again on the production keys when they are made, and add the date here.

**Check a key's scope** — after making or rotating one, from a machine with that `.env`:

```
pnpm --filter @lytronix/server exec tsx scripts/media-key-check.ts
```

It writes one small object under `key-check/` in the media bucket (outside every shop's prefix) and removes it, and
prints, for example:

```
signer writes to the media bucket: no
processor writes to the media bucket: yes
processor deletes from the media bucket: YES (R2 cannot split write from delete)
deleter deletes from the media bucket: yes
```

**Rotate a key** (every 90 days, or at once if one may have leaked):
1. In the Cloudflare dashboard (R2 → Manage API tokens), make a new token with the same permission and buckets as the
   table says.
2. Put its access key and secret in `apps/server/.env` on each server, and in the CI secrets, under the same names.
3. Restart the server, and run the check above.
4. Revoke the old token in the dashboard, and write today's date in the table.

The `CLOUDFLARE_API_TOKEN` is made and rolled under My Profile → API Tokens instead, with the two permissions the
table names. After a restart with the new value, the server log shows no `MediaBandwidth` error within two minutes;
then revoke the old one. While the token is refused, bandwidth is not totalled and the blocked list is not written;
the Worker keeps serving with the last list it read, and the minutes missed are totalled once the token works again.
With the token unset, nothing is totalled at all, then or later.

**Budget (MED-12, Slice 8.6).** The console's media costs page reads R2's own figures from Cloudflare each hour, with the
same `CLOUDFLARE_API_TOKEN` (its Account Analytics: Read), and holds the period's estimate against the budget setting
(`media_budget_usd`, $10 by default). Set `media_cost_alert_email` to the address the 80% alert goes to: until it's set
the alert is only logged. If Cloudflare's invoice period doesn't start on the 1st, set `cloudflare_billing_day` to its
day; when Cloudflare changes a price, change `cloudflare_prices`. Cloudflare's own billing notification is still worth
keeping as a second net, since the estimate leaves out Workers' CPU time, KV and Analytics Engine. Each shop's stored
bytes are the sum of its rows in `tenant.media_objects`; the bytes and requests the media Worker sent for it each cycle
are its row in `control.media_bandwidth` (Slice 7b).

---

## 3. The credential sealing key: `DATA_ENCRYPTION_KEY` (SEC-01, SEC-10)

**What this is:** the key the server seals stored credentials with -- a shop's Meta Conversions API token and its
catalog feed link today, courier and gateway credentials from Phases 5-6. Each sealed value names the key that
sealed it (a 4-byte fingerprint), so a second key can be brought in while the first is retired.

- **Where it lives:** set from a secrets manager on real servers, as the application's own runtime secret, never in
  a file in the repository or a build artifact (SEC-10). The server refuses to start in production without it.
  Outside production, left unset, the server makes a key at start-up that is gone at the next: sealed values do not
  outlive the process there, and a feed link made with it must be made again.
- **Make one:** `openssl rand -base64 32`.
- **Rotate it** (once a year, or at once if it may have leaked):
  1. Set `DATA_ENCRYPTION_PREVIOUS_KEY` to the current key, and `DATA_ENCRYPTION_KEY` to a new one. Restart.
     New values are sealed with the new key; values sealed with the old one still open.
  2. Have each value sealed again: a shop's feed link by `POST /catalog-feed/regenerate`, a Conversions API token by
     entering it again. There is no job that does this for every shop yet (KNOWN-GAPS §81).
  3. Once no value names the old key, unset `DATA_ENCRYPTION_PREVIOUS_KEY` and restart.
- **If a key is lost:** values sealed with it cannot be opened. The dashboard answers "make a new link" for the
  feed (the old link keeps working for Meta, found by its hash, until the shop makes a new one), and the token must
  be entered again.

## 4. Is the per-visitor limit refusing real shoppers? (RTE-06)

**What this is:** a public key has no per-minute limit of its own (KNOWN-GAPS §82). One visitor -- one IP address --
may make [120] requests a minute to one shop. Many phones on one mobile carrier, or one office's Wi-Fi, can share an
address, and then real shoppers meet that figure together.

- **Look:** each shop's refusals this cycle, flushed every minute.
  ```sql
  SELECT t.slug, u.cycle_start, u.requests, u.refused_requests, u.refused_visitors
  FROM control.api_usage u JOIN control.tenants t ON t.id = u.tenant_id
  WHERE u.refused_requests > 0
  ORDER BY u.refused_visitors DESC, u.refused_requests DESC;
  ```
- **Read it:** many refused requests from one or two visitors is a scraper or a broken script, and the limit is doing
  its job. Refusals spread over many visitors, a few each, are likely real shoppers sharing addresses: raise the
  figure. A server restart may count a visitor again, so the visitor figure can run a little high.
- **Change it:** `PATCH /operator/settings/public_requests_per_visitor_per_minute` with `{ "value": 200 }`. It takes
  effect within 5 seconds, without a deploy, and is in the platform audit log.

## 5. A fast-spend alert arrived (RTE-12)

**What this is:** an email to every operator that a shop's public API requests in one clock hour reached [5]% of its
cycle's limit. Nothing was refused; the shop's owner was told too. It goes out at most once a day per shop.

- **Look:** the shop's requests and refusals this cycle (RUNBOOKS §4's query), and the platform audit log's
  `usage_fast_spend_alerted` entries for how often it happens.
- **Read it:** a busy sale or a live post is real shoppers -- nothing to do. Steady traffic at night, or many requests
  refused by the per-visitor limit, is a scraper or an attack.
- **Act:** the shop keeps being served until its month and the grace after it are spent. If an attack spent it, give
  the shop room again with an override of `requests_monthly` (PLN-11), with the reason. The share is the setting
  `fast_spend_percent`, and the grace past every limit `usage_grace_percent`, both changed with
  `PATCH /operator/settings/<key>`.

## 6. Lytro's help line (D8-4, D8-68)

**What this is:** the WhatsApp and phone numbers shops reach Lytro on, and the hours Lytro answers, every day. Lytro's
payment page, the dashboard's Help, the website's contact page, footer and listener page, and the listener app show them
(since Phase 8 Slice 8.8).

- **Set before launch:** `help_whatsapp` and `help_phone`, each `01XXXXXXXXX`, with `PATCH /operator/settings/<key>` and a
  reason. Until one is set, its button shows nowhere, and neither number stands in for the other (D8-85).
- **Hours:** `help_opens_hour` and `help_closes_hour`, 0 to 23 in Dhaka, 9 and 22 until set.
- **Clearing a number:** an empty value, with a reason, means not set: its button goes everywhere, the listener app's
  support row included (D8-76, D8-80).
- **After a change:** pages and the app read it within five minutes (`GET /help-line` is cached that long).

## 7. Retiring a wallet type (WAL-18, D8-65 to D8-67)

**What this is:** stopping shops from starting a payment method type (a wallet closing its merchant service, say), then
removing it once nothing uses it.

- **Retire:** `POST /operator/payment-method-types/<method>/retire` with a reason. Shops that never set it up stop seeing
  it; each that did keeps it, checkout included, and its owner is told. `POST …/undo-retire` brings it back.
- **Watch:** `GET /operator/payment-method-types` gives each type's shops with it on, shops with an account for it,
  payments open on it, and whether Lytro's own page takes it.
- **Remove:** once `shopsOn` and `openPayments` are 0, turn it off on Lytro's own page
  (`PATCH /operator/payment-methods/<method>` with `enabled: false`), then `POST …/remove` with a reason. Every shop's
  accounts for it are deleted; past payments stay. It can't be undone. If some shop failed (the server logs it), remove
  again to finish.

## 8. Resetting an owner's sign-in (ADM-04, D8-36, D8-87)

**What this is:** an owner who lost their phone or password gets back in, without the operator ever seeing or setting a
password.

- **First, check it's them** (D8-5). The phone you're given becomes the account's at once.
- **Reset:** the shop page's Owner reset, with the phone they give you and a reason. Every session of the account ends,
  that phone becomes the account's, and a reset code goes to it.
- **Then tell them:** if the lost phone was also the shop's listener, it stays paired, since a listener phone doesn't
  record its number. Once signed in again, they unpair it on the dashboard's listener page, where each phone shows its
  name and model.

## 9. The uploads bucket's expiry (MED-03, D8-47)

**What this is:** a file a browser uploads lands in the uploads bucket first, and moves on once its request is accepted.
One whose request is refused or never sent (a product photo, or a payment screenshot) has no row, so no job of Lytro's
removes it.

- **Set once, in Cloudflare:** an object lifecycle rule on the uploads bucket that deletes objects 7 days after upload.
  Nothing reads the uploads bucket after a request's own minutes.
- **Check:** R2, the uploads bucket, Settings, Object lifecycle rules. KNOWN-GAPS §144 records it until it is set.

## 10. Backups and restores (D9-18, D9-19, BKP-01 to BKP-03, DAT-22 to DAT-40, DAT-54, DAT-57)

**What runs (Phase 9 Slice 9.3).** Everything is in the database image, `lytro-database` (`deploy/database/`):
PostgreSQL 17 with WAL-G, age and the backup scripts.

- **The archive, for restoring to a minute (DAT-34):** the `postgres` container sends each finished write-ahead-log file
  to the archive's R2 bucket, at least every 60 seconds (`archive_command = lytro-archive`). It's switched on by
  deploy.sh once `backup.env` holds the archive's settings.
- **Every night at 05:30 Dhaka (the owner's time):** the `backup` service runs `lytro-nightly`. If the last good night is
  more than 26 hours old when it starts, it runs at once. In order:
  - **the nightly dump (DAT-22, DAT-30):** every table counted in one held snapshot, `pg_dump` of that same snapshot,
    checked readable, encrypted with age to the owner's public key, then uploaded with a manifest (counts, size,
    checksum), and the manifest last;
  - **the base backup:** full on Fridays, otherwise what changed since Friday's. The oldest are then deleted, keeping 3
    full ones (14 to 21 days).
- **The buckets** (one key each, IP-locked to the server; the app never has either, DAT-28):

  | Bucket | Holds | Lock (nothing deleted or replaced) | Then |
  |---|---|---|---|
  | `…-pitr` | WAL-G's base backups and archived log, under `pg17/` | 14 days | WAL-G deletes past 3 full backups |
  | `…-dumps` | `nightly/<yyyy>/<mm>/<stamp>.dump.age` and `.manifest.json.age` | 29 days | lifecycle rule: deleted at 29 days, gone by day 30 (LIF-22) |

  R2 has no write-only key. The locks are what stop anyone with the server's keys deleting backups (D9-18 as amended),
  and the dumps are unreadable without the owner's private key.
- **Who holds what:**

  | What | Server (`/opt/lytro/env/backup.env`) | Owner's offline copy |
  |---|---|---|
  | Archive encryption key (`BACKUP_PITR_ENCRYPTION_KEY`) | yes (made by make-env.sh) | yes |
  | Read-only restore token (both buckets) | no | yes |
  | age private key (dumps) | **never** | yes |
  | age public key (`BACKUP_DUMP_RECIPIENT`) | yes | yes |

  Without the owner's copies, a lost server's backups can't be read by anyone.

### 10.1 Is it working?

On the server:
- `sudo docker logs --tail 40 lytro-backup-1`: the last night's `[dump]`, `[base]` and `[nightly]` lines, and the next run.
- `sudo docker exec lytro-backup-1 cat /var/lib/lytro-backup/status/nightly.json`: `"ok": true` and its time.
- `sudo docker exec lytro-postgres-1 psql -U lytronix -Atc "SELECT last_archived_time, failed_count FROM pg_stat_archiver"`:
  the last archived file a minute or so ago. A rising `failed_count` means the archive is failing, and the log piles
  up on the server's disk until it works again.

Slice 9.6's alerts watch these (DAT-27: a backup or dump older than 26 hours, archiving more than 5 minutes behind).

### 10.2 The monthly drill: restore the latest dump and count it (DAT-22, DAT-29, BKP-02)

On the owner's computer, with Docker:
1. Fill a copy of `deploy/restore/restore.env.example` from the offline copies, kept **outside every repository**.
2. Read the image's name from the server: `ssh lytro@<server> cat /opt/lytro/state/release.env`, then
   `<REGISTRY>/lytro-database:<DATABASE_TAG>` (REGISTRY is in `/opt/lytro/settings.env`).
3. Run:
   `docker run --rm --env-file <restore.env> -v <the age private key file>:/keys/dump.key:ro <image> lytro-restore-dump latest`
4. Pass: `Differences: none`. Copy the printed lines into a drill record (`docs/drills/`, a PR).

### 10.3 The quarterly drill: restore to a minute (DAT-29, DAT-34, BKP-01, BKP-03)

`docker run --rm --env-file <restore.env> <image> lytro-restore-pitr --to 2026-11-20T10:42:00+06:00`

It picks the newest base backup before that time, replays the archive up to it, and prints the last transaction
replayed (just before the minute), each table's rows and the newest payment (every payment up to the minute is
there: BKP-03). Record it in `docs/drills/`.

### 10.4 Restoring one shop (DAT-26)

When a shop lost data, by its own mistake or a fault, with the time just before the loss:
1. `sudo bash /opt/lytro/state/current/restore/shop.sh --shop <shop id> --to <time>`: a dry run. It makes a scratch copy
   of the database at that time beside the live one (several minutes), then prints what it would add, table by table.
2. If that's right, run it again with `--apply`.

What it does: it adds the shop's rows the live database is missing, exactly as they were, and never changes a row that
exists (the owner's rule, 2026-11-13: "bring back what's missing"). A row whose unique value another row now holds (a
tracking ID) is skipped, and so is anything hanging off it. Every other shop's rows are fingerprinted before and
after in the same transaction; any difference undoes everything. It never brings back sign-ins, used codes, messages
waiting to be sent or usage meters. Media has no backup (MED-06): a deleted shop's photos come back as rows whose files
are gone. The quarterly rehearsal deletes a test shop's orders and payments on staging and brings them back.

### 10.5 Restoring onto a new server (DAT-40, DAT-54: service back from R2 within 4 hours)

1. A new server, set up as `deploy/README.md` steps 2 to 4 say (setup-server.sh, then make-env.sh). Put the backup
   settings into its `backup.env` (the archive key from the offline copy).
2. Fill its empty database volume from the archive, stopping cleanly:
   `sudo docker run --rm --env-file /opt/lytro/env/backup.env --env-file /opt/lytro/env/postgres.env -v lytro_pgdata:/var/lib/postgresql/data <image> lytro-restore-pitr --to latest --data /var/lib/postgresql/data`
   If the archive can't be used, restore the latest dump instead (§10.2's command with `--serve`, then `pg_dump`
   from it into the new database).
3. Deploy the release that was running (GitHub, Deploy workflow, run again), point the DNS records at the new server,
   and run the outside check (`deploy/README.md`).
4. Record the elapsed time and the smoke tests in `docs/drills/` (the yearly drill restores onto a server outside
   Bangladesh).

### 10.6 Failover to a replica (DAT-37 as amended by D9-2): once a second server exists

Only after the monitor's alert, and only if the main database is really down:
1. On the replica's server, run `lytro-db-failover` from the image with `FAILOVER_REPLICAS` (each replica),
   `FAILOVER_OLD_PRIMARY`, `FAILOVER_FENCE` (stops the old one and sets its restart policy to `no`),
   `FAILOVER_SWITCH` (the database name's DNS record, 30-second TTL) and `FAILOVER_REPLICATION` (how replicas connect,
   `{host}` for the new main).
2. It picks the replica that has replayed furthest. **It refuses if the old main still takes writes.** It fences the
   old main, promotes, proves a write, points the other replicas at the new main and switches the apps, then prints
   each step's time (DAT-23: within 10 minutes).
3. Then (DAT-39): reconcile the last 30 minutes before the failure against wallet receipts and the SMS log, and re-verify
   or re-enter any missing payment.
4. The old main database comes back only as a replica (§10.7), never started as a main.

### 10.7 Adding a replica (DAT-57), or rebuilding the old main as one

1. On the main database, once: a replication role (`CREATE ROLE lytronix_replica REPLICATION LOGIN PASSWORD …`), and a
   `pg_hba.conf` line letting it replicate from the new server's address.
2. On the new server, with its empty database volume:
   `sudo docker run --rm -e REPLICA_SOURCE='host=<main> user=lytronix_replica password=…' -v lytro_pgdata:/var/lib/postgresql/data <image> lytro-db-add-replica --wait`
   It copies the main database (`pg_basebackup`), starts it as a replica, waits until it has caught up, and stops it.
3. Start it with the compose file, check its lag, then add it to `DATABASE_READ_URL` and the load balancer. Nothing
   routes to it before that, so the shops never notice (DAT-57). CI rehearses this on every change
   (`.github/scripts/backups/failover.sh`); staging rehearses it before the first real one.

### 10.8 A new PostgreSQL major version

The archive keeps each major version under its own folder (`BACKUP_PITR_PREFIX`, `pg17` now). A move to 18 takes a new
base backup into `pg18/` straight after; the dumps carry on. The move itself is `deploy/README.md` "Moving PostgreSQL to
a new major version". Staging's move from 16 to 17 on 2026-11-12 (Slice 9.2) took about 2 minutes of downtime: counts,
`pg_dump`, a new volume, `pg_restore`, counts equal.

## 11. Redis is down (D9-15, RED-01 to RED-05)

**What it holds (Phase 9 Slice 9.4).** Every everyday rate limit, counted once for all API copies and servers: a
visitor's requests a minute, sign-ins, tracking reads, address and fraud checks, courier calls, the listener's uploads
and heartbeats. Also each wallet account's bKash token, sealed. Nothing in it has to survive a restart: every key
expires, and none is saved to disk. Exact limits are never in it: orders, payment sessions, shopper sign-up codes and
listener pairing are counted in PostgreSQL.

**What happens when it stops answering.** Nothing stops working:
- Each API process counts the everyday limits in its own memory at **half** each, so the two on a server together stay
  about the same (the owner's answer, 2026-11-13).
- A process that just started gives Redis 15 seconds before counting it as down, so a deploy sends no email.
- After about 15 seconds of failed tries, the operators get **one email**: "Redis is down", however many processes
  noticed. When it answers again, one more: "Redis is back", with how long it was out.
- bKash tokens stay in each process for the outage. The two-an-hour limit still holds, because token calls take turns
  through the database.
- `GET /health/ready` reports `redis: down`, and the process stays ready.

**What to do:**
1. `ssh lytro@<server>`, then `sudo docker ps --filter name=redis`: is `lytro-redis-1` up and healthy?
2. `sudo docker logs --tail 50 lytro-redis-1`: an out-of-memory kill, or a crash.
3. Restart it: `cd /opt/lytro/state/current`, then
   `set -a; . /opt/lytro/settings.env; . /opt/lytro/state/release.env; set +a`, then
   `sudo -E docker compose up -d redis`. Every process notices within 5 seconds, and the "back" email follows.
4. If it was memory: raise `REDIS_MAXMEMORY` (and `REDIS_MEMORY`, the container's ceiling) in
   `/opt/lytro/settings.env` and deploy again. Production runs `256mb` (RED-01); staging `64mb`.

**Afterwards.** Counts start again from empty, so limits are briefly looser. Nothing needs repairing.
