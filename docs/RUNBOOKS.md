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

**Budget (MED-12).** In the Cloudflare dashboard, set a billing notification at 80% of the month's R2 budget. Each
shop's stored bytes are the sum of its rows in `tenant.media_objects`; Worker requests per shop arrive with Slice 7.
