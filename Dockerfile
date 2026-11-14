# syntax=docker/dockerfile:1.7
#
# The release images (Phase 9 Slice 9.1, D9-10): built once per commit in GitHub Actions, pushed to ghcr.io, and run on
# staging and later production unchanged; settings alone tell environments apart (Phase 9 §3.6).
#
#   server      the NestJS API, as an API process or the job worker (SERVER_ROLE, D9-11), and the migration step
#   website     the marketing site (Next.js, standalone)
#   storefront  every shop's storefront (Next.js, standalone)
#   static      the dashboard's and the console's built files, published into the edge's volume (deploy/static)
#
# The edge (Caddy with the Cloudflare DNS plugin) is its own image: deploy/caddy/Dockerfile.

ARG NODE_IMAGE=node:24-bookworm-slim

# --- One build of the whole workspace -------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS build
# The commit this image is built from: the storefront's service worker version (CCH-10) and every image's RELEASE.
ARG RELEASE=local
# OBS-03 (Slice 9.6): the dashboard's Sentry address, public as every browser sees it (the repository's
# DASHBOARD_SENTRY_DSN variable); empty, the dashboard sends nothing.
ARG DASHBOARD_SENTRY_DSN=
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=1 \
    HUSKY=0 \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo
COPY . .
# Every package, with its install scripts: ffmpeg-static downloads the Linux ffmpeg the worker converts videos with.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
RUN NEXT_STANDALONE=1 STOREFRONT_BUILD_ID=${RELEASE} VITE_RELEASE=${RELEASE} VITE_SENTRY_DSN=${DASHBOARD_SENTRY_DSN} \
    pnpm turbo run build \
      --filter=@lytronix/server \
      --filter=@lytronix/website \
      --filter=@lytronix/storefront \
      --filter=@lytronix/dashboard \
      --filter=@lytronix/operator
# Slice 9.7: the dashboard's and the console's files compressed once, beside each (.zst, .gz), for Caddy to send.
RUN node deploy/static/compress.mjs apps/dashboard/dist apps/operator/dist
# The server with its production packages only, the workspace's own (db with its migrations, validators,
# shared-types) copied in.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm --filter=@lytronix/server deploy --prod /out/server

# --- The server ------------------------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS server
ARG RELEASE=local
# FONTCONFIG_FILE: text is drawn with the server's own fonts only (apps/server/assets/fonts/README.md); the slim image
# has no fontconfig set-up, which logged an error on every monogram.
ENV NODE_ENV=production \
    RELEASE=${RELEASE} \
    HOME=/home/node \
    PORT=3000 \
    FONTCONFIG_FILE=/app/assets/fonts/fonts.conf
WORKDIR /app
COPY --from=build --chown=node:node /out/server /app
# SEC-10, D9-8 (Slice 9.7): started as root only to read the sealing key's root-only file, then run as `node`
# (deploy/server/entrypoint.sh).
COPY --chmod=755 deploy/server/entrypoint.sh /usr/local/bin/lytro-server-entrypoint
ENTRYPOINT ["lytro-server-entrypoint"]
EXPOSE 3000
# Liveness only (D9-21's ready check comes in Slice 9.2). The slim image has no curl.
HEALTHCHECK --interval=10s --timeout=3s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# deploy/compose.yml's `migrate` step runs `node node_modules/@lytronix/db/dist/migrate.js` from this image instead.
CMD ["node", "dist/main.js"]

# --- The website -----------------------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS website
ARG RELEASE=local
ENV NODE_ENV=production \
    RELEASE=${RELEASE} \
    HOSTNAME=0.0.0.0 \
    PORT=3003 \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/website/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/website/.next/static ./apps/website/.next/static
COPY --from=build --chown=node:node /repo/apps/website/public ./apps/website/public
USER node
EXPOSE 3003
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3003/').then((r) => process.exit(r.status < 500 ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/website/server.js"]

# --- The storefront --------------------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS storefront
ARG RELEASE=local
ENV NODE_ENV=production \
    RELEASE=${RELEASE} \
    HOSTNAME=0.0.0.0 \
    PORT=3001 \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/storefront/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/storefront/.next/static ./apps/storefront/.next/static
COPY --from=build --chown=node:node /repo/apps/storefront/public ./apps/storefront/public
USER node
EXPOSE 3001
# Any answer but a server error: an unknown host answers the storefront's own not-found (SFT-16).
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/').then((r) => process.exit(r.status < 500 ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/storefront/server.js"]

# --- The dashboard's and the console's files -------------------------------------------------------------------------
FROM busybox:1.37 AS static
ARG RELEASE=local
ENV RELEASE=${RELEASE}
COPY --from=build /repo/apps/dashboard/dist /release/dashboard
COPY --from=build /repo/apps/operator/dist /release/operator
COPY deploy/static/publish.sh /publish.sh
CMD ["sh", "/publish.sh"]
