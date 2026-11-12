# syntax=docker/dockerfile:1.7
#
# The edge (Slice 9.1, D9-10): Caddy with the Cloudflare DNS plugin, for the `*.<domain>` wildcard certificate's DNS-01
# challenge, and the deployment's Caddyfile. Built from the repo root (`docker build -f deploy/caddy/Dockerfile .`).
# Tagged by a hash of what goes into it (deploy/caddy/image-tag.sh), so a deploy only replaces Caddy when Caddy itself or
# the Caddyfile changed; the dashboard and the console reach it through the static volume instead (deploy/static).
#
# apps/server/test/caddy-edge.e2e.spec.ts runs this image (CADDY_IMAGE) in front of the real server.

# Caddy 2.11 with the plugin's newest release (it needs Caddy 2.7.5 or later). Caddy 2.10.0 never issued its own
# certificates for this file's localhost names (the Caddy spec and the deploy rehearsal both saw every handshake fail,
# 2026-11-12); 2.11 does. Moving either one means the Caddy spec and the rehearsal checking the pair again.
ARG CADDY_VERSION=2.11.9

FROM caddy:${CADDY_VERSION}-builder AS builder
ARG CLOUDFLARE_DNS_VERSION=v0.2.4
RUN xcaddy build --with github.com/caddy-dns/cloudflare@${CLOUDFLARE_DNS_VERSION}

FROM caddy:${CADDY_VERSION}
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
COPY deploy/Caddyfile /etc/caddy/Caddyfile
# The image refuses to build if the Caddyfile doesn't hold up as production reads it: the Cloudflare challenge on the
# wildcard site, two API processes, and the static volume's paths. The values here are placeholders, never used; the
# plugin checks a token's shape (40 letters, digits, - or _) even when only validating.
RUN PLATFORM_DOMAIN=staging.lytro.app \
    ACME_EMAIL=ops@example.com \
    CLOUDFLARE_DNS_API_TOKEN=validation-only-not-a-real-token-0000000 \
    TRUSTED_EDGE_SECRET=placeholder-placeholder-placeholder \
    SERVER_UPSTREAM="api-1:3000 api-2:3000" \
    ROBOTS=robots_noindex \
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile \
  && caddy list-modules | grep -qx 'dns.providers.cloudflare'
