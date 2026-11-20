# Point-in-time drill, 2026-11-20

- **Who ran it:** the owner, from the owner's computer (Windows, Docker Desktop), with Claude reading along
- **Runbook followed:** RUNBOOKS.md §10.3, by someone who didn't write it (DAT-31)
- **Backup used:** production's first base backup, `base_000000010000000000000019`, and the archive after it; target
  `2026-11-20T22:45:00+06:00`
- **Where it was restored:** a scratch container on the owner's computer, from `ghcr.io/sharif-11/lytro-database:2b9d721c995cf899`
- **Keys used:** only the owner's offline copies: the read-only `production-backups-restore` R2 key and the archive's
  encryption key (its fingerprint matched the server's before the run).

## Times

| Step | Started | Finished |
|---|---|---|
| Fetch the base backup and the archive | 23:18:29 | 23:18:53 |
| Replay up to the target | 23:18:53 | 23:19:12 |
| **In all** | | **43 seconds** (goal: none for this drill; DAT-54's 4 hours is the `server` drill's) |

Times are Dhaka's.

## What the script printed

```
[restore-pitr 17:18:29] base backup base_000000010000000000000019, then the archive up to 2026-11-20T22:45:00+06:00
- Target: 2026-11-20T22:45:00+06:00; base backup base_000000010000000000000019
- last completed transaction was at log time 2026-11-20 16:44:58.785809+00
- Fetched in 24 s; replayed in 19 s; 43 s in all
- Tables: 188; rows: 1831
- Newest payment: none
```

## Checks

- The last transaction replayed (22:44:58.79 Dhaka) is just before the chosen minute (22:45:00).
- The newest payment: none. Production had taken no payment yet; the next `pitr` drill, after launch, checks a real
  one (BKP-03).
- 188 tables and 1,831 rows: more than the night's dump (1,356), since the first operator and the deploys' own rows came
  after it.

## Problems and fixes

- **PowerShell left the pasted command at its `>>` prompt** instead of running it; an extra Enter ran it. Worth a line in
  §10.3 for a Windows computer.
- **Still to do before launch:** the `server` drill (§10.5), onto a fresh server within 4 hours (DAT-54).
