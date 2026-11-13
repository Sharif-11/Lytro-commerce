# The security pass (Phase 9 Slice 9.7)

Phase 9's exit criterion 7: each of SEC-01 to SEC-16 with its evidence, and the scanners' findings fixed or listed in
`KNOWN-GAPS.md` with a reason (§148). Recorded 2026-11-14, when Slice 9.7 merged. The tests named are in
`apps/server/test` unless another package is named, and run in CI on every change they can be affected by.

| | What holds it | Evidence | |
| --- | --- | --- | --- |
| SEC-01 | Passwords are bcrypt hashes at cost 12. Courier, gateway, Meta and Lytro's own wallet credentials, API keys and feed tokens are sealed (AES-256-GCM) with a key that is never in the database (SEC-10). | `password.e2e.spec.ts` reads the stored hash and the session's hashed cookie and CSRF token; `reseal.e2e.spec.ts` finds every `bytea` column in the schema and requires each to be sealed or named as not a secret. | Met |
| SEC-02 | Row-level security, forced on every shop's table, and every query in the shop's own context. | `isolation/foreign-ids.e2e.spec.ts` calls every dashboard route taking an ID (108, found in the running application) with another shop's real IDs: each answers as an ID that never existed. `isolation/isolation.spec.ts` checks the data layer and that every shop route has its named case; `operator-routes.e2e.spec.ts` refuses a seller on every operator route. | Met |
| SEC-03 | Every query is Drizzle's builder or its `sql` template, whose values are parameters. | `sql-injection.e2e.spec.ts`: SQL in a phone number is refused by its shape; in a search it is searched for as text and finds nothing. The weekly ZAP scan is passive only (§148). | Met; scan passive |
| SEC-04 | One set of Caddy snippets on every host: HSTS a year with subdomains on Lytro's hosts and without on shops' own domains, `nosniff`, `frame-ancestors 'none'` and `X-Frame-Options`, a referrer policy (`no-referrer` on pay and admin). | `caddy-edge.e2e.spec.ts` reads every host's headers through the real Caddyfile; the ZAP baseline fails on a missing one (`.zap/rules.tsv`). | Met |
| SEC-05 | Couriers' and Resend's messages carry their secrets, checked before anything is read; payment return addresses are the shop's own. | The courier specs (`courier-pathao.e2e.spec.ts` and the others), `payment-sessions.e2e.spec.ts`. API-13's own webhooks come with the next release (SEC-15). | Met for what exists |
| SEC-06 | Uploads go straight to R2, never through the server, and are checked by their bytes before they count. | `media.e2e.spec.ts` refuses a renamed executable by its content; `manual-entries.e2e.spec.ts` the same for screenshots. | Met |
| SEC-07 | Session tokens are random and stored hashed; a reset or sign-in code works once and locks after five wrong tries. | `password.e2e.spec.ts`: a used reset code opens no second session; `signup.e2e.spec.ts`: the lock after five. | Met |
| SEC-08 | Credentials go only in request bodies; the dashboard's credential fields are masked and never saved by the browser. Caddy's logs hold no bodies. | The gateway sheet's app key and secret and Meta's token are `type="password"` with `autocomplete="new-password"` (Slice 9.7). | Met |
| SEC-09 | A credential is opened only in the call that uses it, in memory; one that won't open asks the shop to connect again. | `courier-screens.e2e.spec.ts`: an unreadable courier login reads as needing reconnection, never a 500. | Met |
| SEC-10 | As D9-8 amends it: the key is a root-only file (`$LYTRO_HOME/env/data-encryption.key`, mode 600) handed to the API and worker as a compose secret, read by the image's entrypoint as root before it becomes `node`; a human read is a dated break-glass entry. `node dist/reseal.js` seals every stored value again after a rotation. | `RUNBOOKS.md` §3; the deploy rehearsal's steps "The sealing key is root's alone" and "An older server's key moves to its own file"; `reseal.e2e.spec.ts`. | Met |
| SEC-11 | Every use of a stored courier, gateway or Meta credential is logged with its time, shop, provider, order or payment, and result, never the credential. | `GET /operator/tenants/:id/credential-uses.csv` (its console button comes with Slice 9.9); `courier-screens.e2e.spec.ts` "credential uses as a CSV"; `public-orders.e2e.spec.ts` checks Meta's log, a call an open circuit refused logging nothing. | Met |
| SEC-12 | Every free-text field has a maximum, and the listener's message text is bounded on purpose at 64 KB. | `packages/validators/test/text-bounds.spec.ts` walks every request schema and fails on any string without a maximum. | Met |
| SEC-13 | Text is stored as typed and escaped where it is shown (React, the server's own pages); control characters are refused except line breaks where a field allows them. | `packages/validators/test/text.spec.ts`; CSVs guard formula cells (Meta's feed with a leading space). | Met |
| SEC-14 | The session cookie is `SameSite=Lax`, `HttpOnly` and `Secure`; every request that changes something carries the session's own CSRF token. | `signup.e2e.spec.ts`: a missing token and another session's real token are both refused; `cookies.spec.ts`. | Met |
| SEC-15 | Tenant webhooks (API-12) come with the next release; nothing calls a shop's address yet. | — | Not applicable yet |
| SEC-16 | A fault answers with its request ID and a plain message; stacks, paths and providers' text stay in the log and error tracking. | `error-handling.e2e.spec.ts`, `request-ids.e2e.spec.ts`, `response-envelope.e2e.spec.ts`. | Met |

**The scanners:**
- **Dependency audit** (`pnpm audit --prod`, in CI's checks since this slice). Found 1 critical (Next.js's image
  optimiser) and 21 high. Fixed at patch level: Next.js 15.5.28, sharp 0.35.5, and overrides for multer, lodash,
  js-yaml, postcss, body-parser and zod 4's copy. Left, with a date: Drizzle ORM before 0.45.2 and zod 4.6.6's path
  (`.github/audit-allowlist.json`, until 2026-12-15, each its own pull request next; KNOWN-GAPS §148).
- **ZAP baseline** (`.github/workflows/zap-baseline.yml`): weekly and on demand against staging. Its first run follows
  this slice's deploy; what it finds is fixed or listed in §148 then.
