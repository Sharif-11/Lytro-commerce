# Restoring data: a short guide

What Lytro's backups can bring back, and the command for each. The full detail is in `docs/RUNBOOKS.md` §10.

## What's saved

- **The archive**: a full backup every Friday and a smaller one every other night, both at 05:30 Dhaka, plus every
  change in between, sent within a minute. Together they rebuild the database **at any minute of the last 14 days**
  (often up to 21).
- **The nightly copy**: a complete copy every night, encrypted with the owner's key. It's the last resort if the
  archive is ever damaged.

Neither can be deleted or overwritten early, even by someone who breaks into the server: the buckets are locked.

## How to ask for a minute

Every restore takes a time, in Dhaka time, written like this: `2026-11-20T10:42:00+06:00`. Pick a minute **just
before** the problem.

First, on the server, every time:

```
ssh lytro@<server>
sudo -s
set -a; . /opt/lytro/settings.env; . /opt/lytro/state/release.env; set +a
```

## 1. Look at the database as it was (safe: changes nothing)

```
docker run --rm --env-file /opt/lytro/env/backup.env --env-file /opt/lytro/env/postgres.env \
  $REGISTRY/lytro-database:$DATABASE_TAG lytro-restore-pitr --to 2026-11-20T10:42:00+06:00
```

It builds a copy at that minute and prints the last change it replayed (just before your minute), each table's rows
and the newest payment. Then it throws the copy away.

To look inside the copy, add `--name lytro-pitr-look` before the image and `--serve` at the end. Then, in a second
terminal:
`sudo docker exec -it lytro-pitr-look psql -h /var/run/postgresql -U lytronix -d lytronix`. Press Ctrl+C in the first
terminal when you're done.

## 2. Bring back one shop's lost data

For a shop that deleted something by mistake, or lost it to a fault:

```
bash /opt/lytro/state/current/restore/shop.sh --shop <shop id> --to 2026-11-20T10:42:00+06:00
```

- This is a **dry run**: it lists, table by table, what it would bring back, and changes nothing.
- If the list is right, run the same command with `--apply` at the end.

It only **adds back what's missing**. It never changes a row the shop has now, and never touches another shop (it
checks every other shop before and after, and undoes everything if one changed). A row whose tracking ID another
order now uses is skipped and reported. Photos aren't backed up, so a deleted product's photos don't come back.

## 3. Roll the whole database back (disaster only)

This **discards everything after the chosen minute, for every shop**. Use it only when the whole database is wrong
(for example, a bad change that damaged every shop). Tell shops first, from the notice board.

```
cd /opt/lytro/state/current
docker compose stop edge api-1 api-2 worker website storefront backup pgbouncer postgres

# Keep the current database aside, never delete it.
docker volume create lytro_pgdata_before_rollback
docker run --rm -v lytro_pgdata:/from -v lytro_pgdata_before_rollback:/to alpine cp -a /from/. /to/
docker compose rm -f postgres
docker volume rm lytro_pgdata
docker volume create lytro_pgdata

# The database at that minute, into the empty volume.
docker run --rm --env-file /opt/lytro/env/backup.env --env-file /opt/lytro/env/postgres.env \
  -v lytro_pgdata:/var/lib/postgresql/data $REGISTRY/lytro-database:$DATABASE_TAG \
  lytro-restore-pitr --to 2026-11-20T10:42:00+06:00 --data /var/lib/postgresql/data

docker compose up -d
# A fresh full backup straight away, starting the archive's new line.
docker exec lytro-backup-1 lytro-walg backup-push --full /var/lib/postgresql/data
```

Check the site works, then tell shops it's back. Keep `lytro_pgdata_before_rollback` for a few days, then delete it.

## 4. The server is lost

Set up a new server and restore the latest minute onto it, as `docs/RUNBOOKS.md` §10.5 says. The goal is to be back
within 4 hours.

## Off the server: the monthly check

Once a month, on the owner's computer, the latest nightly copy is restored and every table counted
(`docs/RUNBOOKS.md` §10.2). It needs the owner's read-only key and the private key for the copies, both kept
offline. Record each check in `docs/drills/`.
