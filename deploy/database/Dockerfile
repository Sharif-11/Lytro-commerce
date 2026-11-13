# syntax=docker/dockerfile:1.7
#
# The database and its backups (Phase 9 Slice 9.3, D9-18, DAT-22, DAT-34): PostgreSQL 17 with WAL-G, age and the
# backup scripts. One image for two services in deploy/compose.yml:
#   postgres   the database; it sends each finished write-ahead-log file to R2 (archive_command = lytro-archive)
#   backup     the nightly run at 05:30 Dhaka (lytro-scheduler): the encrypted dump, then the base backup
# and for the restore scripts (deploy/restore/), which run it on any machine with Docker.
#
# Tagged by a hash of what goes into it (deploy/database/image-tag.sh), so a deploy replaces it only when this file or a
# script changed. Built from the repo root (`docker build -f deploy/database/Dockerfile .`).
#
# The base stays on Debian 13 (trixie), the release staging's data was first written under: a different C library
# sorts text differently, which would quietly break text indexes. Change the tag on purpose, never to a floating one.

ARG POSTGRES_TAG=17.11-trixie
FROM postgres:${POSTGRES_TAG}

# WAL-G (DAT-34 names it beside pgBackRest): it writes every object in the bucket once, so R2's bucket lock can cover
# the whole archive (D9-18 as amended). The release's own checksum is checked before it's installed.
ARG WALG_VERSION=v3.0.9
ARG WALG_SHA256=444ce216230c254edef803e098a59a1746806da3e0d55671d7b0f0082db14ef4

# age encrypts the nightly dump to the owner's public key; its private key never touches a server (DAT-30).
RUN apt-get update \
  && apt-get install -y --no-install-recommends age ca-certificates curl jq \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL -o /tmp/wal-g.tar.gz \
    "https://github.com/wal-g/wal-g/releases/download/${WALG_VERSION}/wal-g-pg-24.04-amd64.tar.gz" \
  && echo "${WALG_SHA256}  /tmp/wal-g.tar.gz" | sha256sum -c - \
  && tar -xzf /tmp/wal-g.tar.gz -C /tmp \
  && install -m 755 /tmp/wal-g-pg-24.04-amd64 /usr/local/bin/wal-g \
  && rm -f /tmp/wal-g.tar.gz /tmp/wal-g-pg-24.04-amd64 \
  && wal-g --version

# The backup service's working folder (a volume in compose takes this owner): the dump while it's encrypted and sent,
# and status/*.json, what the last night did.
RUN install -d -o postgres -g postgres -m 700 /var/lib/lytro-backup

COPY --chmod=755 deploy/database/bin/ /usr/local/bin/
