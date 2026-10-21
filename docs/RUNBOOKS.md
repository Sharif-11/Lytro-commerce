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
| `MEDIA_PROCESSOR_*` | Object Read & Write, the uploads and media buckets | the processing job: reading and clearing uploads, writing media, listing for the nightly run | — | — |
| `MEDIA_DELETER_*` | Object Read & Write, the media bucket only | the deletion job only (`MediaDeleter`) | — | — |
| Media Worker's `R2_*` secrets | **Object Read only**, the media bucket only | serving media (`apps/media-worker`, `S3Origin`); a write fails at R2 itself | — | — |
| `MEDIA_LINK_SECRET` (the Worker's secret and the server's setting) | signs and checks private links (BND-07) | the server signs, the Worker checks | — | — |
| `CLOUDFLARE_API_TOKEN` (with `CLOUDFLARE_ACCOUNT_ID` and `MEDIA_EDGE_KV_NAMESPACE_ID`) | an account API token, not an R2 one: **Account Analytics: Read** and **Workers KV Storage: Edit**, this account only | the minute's bandwidth pass (`CloudflareMediaEdge`): reading the Worker's usage, writing the blocked list and each shop's website addresses to its KV store | — | — |

**Accepted limit: R2 likely cannot split writing from deleting** (decided 2026-10-21, KNOWN-GAPS §78). R2 tokens
come only as read, or read and write, per bucket, and Cloudflare does not say that read and write leaves deleting out;
a Worker's R2 binding allows both too. So the processor's key can likely delete media, though no code path does: only
`MediaDeleter` deletes, and the processor sends its own leftovers to it. The media Worker cannot write at all (its
token is read only). The check below shows what each key really may do; run it once the keys exist and record the
answer here. If R2 refuses the processor's delete, §78 closes; if not, it stays an accepted risk next to the media
loss entry in the risk register (SRS.md §17).

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

**Budget (MED-12).** In the Cloudflare dashboard, set a billing notification at 80% of the month's R2 budget. Each
shop's stored bytes are the sum of its rows in `tenant.media_objects`; the bytes and requests the media Worker sent
for it each cycle are its row in `control.media_bandwidth` (Slice 7b).

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
