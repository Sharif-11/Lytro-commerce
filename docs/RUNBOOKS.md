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
