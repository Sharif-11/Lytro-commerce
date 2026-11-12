# syntax=docker/dockerfile:1.7
#
# The pooler (Phase 9 Slice 9.2, D9-13, DAT-11): PgBouncer in transaction mode, in front of PostgreSQL for the API
# processes only. The worker's job queue and the migrations connect to PostgreSQL directly. Built from Alpine's own
# package rather than a third party's image, and tagged by a hash of what goes into it (deploy/pgbouncer/image-tag.sh),
# so a deploy replaces it only when this file or its start script changed. Built from the repo root
# (`docker build -f deploy/pgbouncer/Dockerfile .`).
#
# Its settings are written from the environment each time it starts (entrypoint.sh): the two roles' passwords, and the
# limits every API connection runs under (DAT-23).

ARG ALPINE_VERSION=3.22
FROM alpine:${ALPINE_VERSION}

# PgBouncer 1.24 in Alpine 3.22, run as its own user (made here if the package didn't), never root. Its settings and
# the passwords are written at start into a folder only that user can read.
RUN apk add --no-cache 'pgbouncer~1.24' \
  && (getent passwd pgbouncer > /dev/null || adduser -S -D -H -s /sbin/nologin pgbouncer) \
  && install -d -o pgbouncer -m 700 /etc/pgbouncer/run
COPY --chmod=755 deploy/pgbouncer/entrypoint.sh /usr/local/bin/lytro-pgbouncer

USER pgbouncer
EXPOSE 6432
# Answers on its port: enough for compose to start the API after it. Whether PostgreSQL itself answers is the server's
# ready check (Slice 9.2).
HEALTHCHECK --interval=5s --timeout=3s --retries=10 CMD nc -z 127.0.0.1 6432 || exit 1
ENTRYPOINT ["/usr/local/bin/lytro-pgbouncer"]
