# Running Lytro on a server

How staging (and later production) is set up and deployed (Phase 9 Slice 9.1). Everything a server runs is in this
folder; a server holds only its secrets (`/opt/lytro/env`) and what it has deployed. `docs/DEPLOYMENT.md` explains the
design; this is the procedure.

| File                       | What it is                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `compose.yml`              | Every container on one server: edge, two API processes, the worker, website, storefront, PostgreSQL, Redis |
| `Caddyfile`, `caddy/`      | The edge: every host's routing, certificates, and its image (Caddy with the Cloudflare DNS plugin)         |
| `postgres/10-app-role.sh`  | Makes the roles the app connects as (writes, and reads only): on first start, and before each migration    |
| `pgbouncer/`               | The API's pooler: its image, and the start script that writes its settings and limits                      |
| `static/publish.sh`        | Publishes a release's dashboard and console files into the edge's volume                                   |
| `scripts/setup-server.sh`  | A fresh Ubuntu 24.04 server made ready, once, as root                                                      |
| `scripts/make-env.sh`      | The server's settings and secrets, written once                                                            |
| `scripts/lytro-ssh`        | The one command GitHub's deploy key may run on the server                                                  |
| `scripts/deploy.sh`        | One deploy: pull, dump, migrate, replace each process in turn                                              |
| `scripts/outside-check.sh` | Every host checked from outside, after each deploy                                                         |

## What you need first

1. **The server's address** (its public IPv4), from the provider's welcome email.
2. **Your SSH key** on your computer: `C:\Users\<you>\.ssh\id_ed25519.pub`.
3. **A deploy key for GitHub**, made on your computer, used only for deploys:
   `ssh-keygen -t ed25519 -f lytro-github-deploy -N "" -C lytro-github-deploy`
   This makes `lytro-github-deploy` (private: goes into GitHub's secrets) and `lytro-github-deploy.pub` (public: goes
   onto the server).
4. **A Cloudflare API token that can edit lytro.app's DNS and nothing else.** Cloudflare → My Profile → API Tokens →
   Create Token → "Edit zone DNS" template → Zone Resources: Include, Specific zone, `lytro.app`. Never reuse the
   server's media token (`CLOUDFLARE_API_TOKEN`).
5. **Keys from outside services.** The server won't start without the first five:
   - BulkSMSBD: API key and sender ID;
   - Resend: API key and its webhook's signing secret;
   - Gemini: API key;
   - media (optional; Cloudflare R2): the bucket names and keys, as in `apps/server/.env.example`.

## 1. DNS (Cloudflare → lytro.app → DNS)

Two records, both **DNS only (grey cloud)**: Cloudflare's free certificate covers one level of names, and Caddy issues
its own for every staging name.

| Type | Name        | Content              |
| ---- | ----------- | -------------------- |
| A    | `staging`   | the server's address |
| A    | `*.staging` | the server's address |

`*.staging` covers `app.`, `admin.`, `api.`, `pay.` and every shop.

## 2. Your key on the server, and this folder

From PowerShell on your computer, in the repository's folder (the provider's root password is asked for once):

```
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@<address> "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
scp -r deploy root@<address>:/root/lytro-deploy
```

## 3. Set the server up

```
ssh root@<address>
ADMIN_KEY="$(head -1 ~/.ssh/authorized_keys)" DEPLOY_KEY="<the line in lytro-github-deploy.pub>" \
  bash /root/lytro-deploy/scripts/setup-server.sh
```

It ends by switching off root login and passwords. **Before closing that session**, check in a second terminal that
`ssh lytro@<address>` logs you in. From then on you log in as `lytro` and use `sudo`.

## 4. The server's settings

```
sudo PLATFORM_DOMAIN=staging.lytro.app PLATFORM_ADDRESSES=<address> ACME_EMAIL=<your email> ROBOTS=robots_noindex \
  bash /root/lytro-deploy/scripts/make-env.sh
```

It writes `/opt/lytro/env/*.env` with every secret Lytro makes itself, and never prints one. Each file lists every
setting its app reads, in three groups: made by the script (leave them), **required** (empty: fill each in), and
optional (commented, with where each comes from: remove the `#` to turn one on). Fill in the required ones with
`sudo nano /opt/lytro/env/server.env` (BulkSMSBD's key and sender ID, Resend's key and its webhook's secret, Gemini's
key) and `sudo nano /opt/lytro/env/edge.env` (the Cloudflare token). Copy `DATA_ENCRYPTION_KEY` from `server.env` into
your password manager: without it, the couriers' and wallets' saved logins can't be read back (RUNBOOKS "The
credential sealing key").

For production, use `PLATFORM_DOMAIN=lytro.app`, leave out `ROBOTS`, and add this server's memory sizes to
`/opt/lytro/settings.env` (the names are in `compose.yml`).

## 5. GitHub

In the repository's Settings:

- **Environments → `staging`** (deploys from `main` only). Its secrets, so no other job ever sees the deploy key:
  - `STAGING_HOST`: the server's address;
  - `STAGING_SSH_KEY`: the whole of `lytro-github-deploy` (the private file);
  - `STAGING_KNOWN_HOSTS`: the output of `ssh-keyscan <address>`, every host key the server offers (a provider's image
    may hold only an RSA key).
- **Secrets and variables → Actions → Variables:**
  - `STAGING_DOMAIN`: `staging.lytro.app`;
  - `DEPLOY_ENABLED`: `true` (only once steps 1 to 4 are done).

Or with the GitHub CLI, from `cmd` (its `<` passes a file as it is):

```
gh secret set STAGING_HOST --env staging --body <address>
gh secret set STAGING_SSH_KEY --env staging < lytro-github-deploy
ssh-keyscan <address> > known_hosts.txt
gh secret set STAGING_KNOWN_HOSTS --env staging < known_hosts.txt
gh variable set STAGING_DOMAIN --body staging.lytro.app
```

The first time the Deploy workflow builds on `main`, GitHub makes the five `lytro-*` packages **private**. Make each
public, once: your profile → Packages → the package → Package settings → Change visibility → Public. The server pulls
them without a token. They hold only the public repository's code, never a secret.

## 6. The first deploy

Re-run the latest Deploy workflow on `main` (Actions → Deploy → Re-run all jobs), or merge anything. Its staging job
deploys, then checks every host from outside. The first certificates can take a minute.

Then make the first operator (the console's sign-in), on the server:

```
cd /opt/lytro/state/current
set -a; . /opt/lytro/settings.env; . /opt/lytro/state/release.env; set +a
read -rs PASSWORD   # type it, then Enter; it isn't shown or kept in the history
sudo -E docker compose --profile tools run --rm migrate \
  node node_modules/@lytronix/db/dist/create-operator.js <your email> "$PASSWORD"
unset PASSWORD
```

## Moving PostgreSQL to a new major version

A data folder made by one major version doesn't open in the next (16 to 17 in Slice 9.2). Each deploy leaves a dump in
`/opt/lytro/backups/pre-deploy/`; with the newest one at hand, on the server:

```
cd /opt/lytro/state/current
set -a; . /opt/lytro/settings.env; . /opt/lytro/state/release.env; set +a
sudo -E docker compose stop
sudo -E docker compose rm -f postgres
sudo docker volume rm lytro_pgdata
```

Then deploy the release that names the new version (re-run its Deploy workflow). PostgreSQL starts empty, the roles
are made, and the migrations run. To keep the data, restore the dump before that deploy's migrations, as Slice 9.3's
restore runbook will say; staging's test data can simply be made again.

## Media (photos)

Optional, and best switched on once the first deploy works. In Cloudflare (`docs/DEPLOYMENT.md` §8, "Staging's media"):

1. **R2:** the three buckets, none public; the uploads bucket's CORS policy; and four Account API tokens: the signer
   (Object Read & Write, uploads), the processor (the same, all three buckets, the server's address only), the deleter
   (media and evidence, the server's address only), and the Worker's (Object Read only, media).
2. **Workers KV:** the namespace; its id is in `apps/media-worker/wrangler.jsonc`.
3. **A token for the server's counts:** Account Analytics Read and Workers KV Storage Edit, the server's address only.
4. **The Worker**, from `apps/media-worker` on your computer:
   ```
   npx wrangler login
   npx wrangler deploy --env staging
   npx wrangler secret put R2_ENDPOINT --env staging            # https://<account id>.r2.cloudflarestorage.com
   npx wrangler secret put R2_ACCESS_KEY_ID --env staging       # the Worker's token
   npx wrangler secret put R2_SECRET_ACCESS_KEY --env staging
   npx wrangler secret put MEDIA_LINK_SECRET --env staging      # a long random value, kept in your password manager
   ```
5. **The server:** fill the `MEDIA_` and `CLOUDFLARE_` lines in `server.env` (with `MEDIA_USAGE_DATASET`) and the two
   `MEDIA_` lines in `edge.env`, remove their `#`, and deploy again.

## Day to day

- **What runs:** `ssh lytro@<address>`, then `sudo docker ps`; or `cat /opt/lytro/state/release.env`.
- **A container's log:** `sudo docker logs --tail 100 lytro-api-1-1` (and `lytro-worker-1`, `lytro-edge-1`, ...).
- **Rolling back:** re-run an earlier commit's Deploy workflow (Actions → Deploy → that run → Re-run all jobs). It
  deploys that commit's images again. Migrations only ever add, so the older code runs on the newer database.
- **The dumps before each deploy:** `/opt/lytro/backups/pre-deploy/`, the last five. Slice 9.3 brings the real backups.
- **Security updates** install themselves; the server restarts at 04:00 when one needs it, and every container comes
  back by itself.
