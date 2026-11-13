# Restore drills

One file per drill, `docs/drills/<yyyy-mm-dd>-<kind>.md`, added by a pull request (Phase 9 Slice 9.3, the owner's
choice). They are the records DAT-29, BKP-02, DAT-26, DAT-40, DAT-54 and DAT-57 ask for. The commands are in
`docs/RUNBOOKS.md` §10.

| Kind | How often | Runbook | Passes when |
|---|---|---|---|
| `dump` | monthly | §10.2 | every table's rows match the dump's own counts (`Differences: none`) |
| `pitr` | quarterly | §10.3 | the last transaction replayed is just before the chosen minute; every payment up to it is there |
| `shop` | quarterly | §10.4 | a test shop's deleted orders and payments come back; every other shop's fingerprint is unchanged |
| `server` | yearly, and before launch | §10.5 | service back from R2 on a new server (outside Bangladesh for the yearly one) within 4 hours |
| `failover` | before the first real standby, then quarterly | §10.6, §10.7 | a promoted replica takes writes within 10 minutes; the old main is fenced |

## The record

Copy this into the new file and fill every line. The script's printed lines go in "What the script printed" as they
are.

```markdown
# <Kind> drill, <yyyy-mm-dd>

- **Who ran it:** <name>, from <the owner's computer | the staging server | a new server at …>
- **Runbook followed:** RUNBOOKS.md §<n>, by someone who <wrote it | didn't write it> (DAT-31 asks for the latter once
  a quarter)
- **Backup used:** <dump name | base backup and target time | …>
- **Where it was restored:** <a scratch container | a new server: provider, location, size>

## Times

| Step | Started | Finished |
|---|---|---|
| … | hh:mm | hh:mm |
| **In all** | | **<minutes>** (goal: <4 hours | 10 minutes | none>) |

## What the script printed

<the lines starting with "- ">

## Checks

- Row counts: <matched | differences listed>
- <Other shops' fingerprints unchanged | the newest payment | smoke tests: sign-in, an order, the storefront>

## Problems and fixes

- <what went wrong or was unclear, and the runbook or script change it led to, with its PR>
```
