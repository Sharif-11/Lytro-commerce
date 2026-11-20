# Dump drill, 2026-11-20

- **Who ran it:** the owner, from the owner's computer (Windows, Docker Desktop), with Claude reading along
- **Runbook followed:** RUNBOOKS.md §10.2, by someone who didn't write it (DAT-31)
- **Backup used:** production's first nightly dump, `nightly/2026/11/20261120T160743Z`, made on the night the backups
  were switched on (release 469d9168)
- **Where it was restored:** a scratch container on the owner's computer, from `ghcr.io/sharif-11/lytro-database:2b9d721c995cf899`
- **Keys used:** only the owner's offline copies: the read-only `production-backups-restore` R2 key and the age private
  key. Neither is on any server.

## Times

| Step | Started | Finished |
|---|---|---|
| Fetch and decrypt | 22:56:33 | 22:56:36 |
| Restore | 22:56:36 | 22:56:53 |
| Count and compare | 22:56:53 | 22:56:53 |
| **In all** | | **20 seconds** (goal: none for this drill; DAT-54's 4 hours is the `server` drill's) |

Times are Dhaka's. The first run also pulled the database image, which isn't counted.

## What the script printed

```
- Dump: nightly/2026/11/20261120T160743Z (made 20261120T160743Z, PostgreSQL 17.11 (Debian 17.11-1.pgdg13+2), 761472 bytes encrypted)
- Fetched and decrypted in 3 s; restored in 17 s; checked in 0 s; 20 s in all
- Tables: 188 in the dump, 188 restored. Rows: 1356 in the dump, 1356 restored.
- Differences: none
```

## Checks

- Row counts: matched (188 tables, 1,356 rows)
- The restore key reached R2 from an address other than the server's, and the age key opened the dump: the two offline
  copies a lost server would leave the owner with both work.

## Problems and fixes

- **The server's own dumps key went into the drill's settings at first.** `restore.env` had `production-dumps` (the
  server's write key, locked to the server's address) in the dump slot, which R2 refuses from anywhere else. Caught
  before the run by comparing fingerprints with the server's keys; the restore key went in both slots. Follow-up: say in
  `deploy/restore/restore.env.example` that the one restore key fills both slots, and give production's bucket names
  beside staging's (small fixes).
- **A placeholder was left in `BACKUP_PITR_ENCRYPTION_KEY`.** Caught by checking the file's shape (length and a `<`)
  before the run.
- **The offline age entry looked like it held only the public key** (`age1…`). The key file that `age-keygen` wrote was
  still on the owner's desktop, so nothing was lost. Rule kept: before deleting that file, the offline copy must show a
  line starting `AGE-SECRET-KEY-1`.
