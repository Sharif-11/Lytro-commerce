# syntax=docker/dockerfile:1.7
#
# The load test's stand-in for every outside service the server calls (Phase 9 Slice 9.10): BulkSMSBD, Steadfast,
# Pathao, RedX, bKash, Resend and Gemini over HTTPS on 8443, from a certificate authority of its own (start.sh), and
# its codes, stats and health over plain HTTP on 8081 too. Node's own modules only, so nothing is installed.
#
# Built from this folder (compose.load.yml), as a server's release folder holds deploy/ alone. RedX's areas are then
# six Dhaka ones (server.mjs): the load's shops ship by hand and never book RedX. A run that does can mount Lytro's
# locations file and point LOCATIONS_FILE at it.
#
# Run as root: start.sh writes the certificates into the /certs volume, which the API containers mount to trust ca.pem
# through NODE_EXTRA_CA_CERTS.

ARG NODE_IMAGE=node:24-alpine3.22
FROM ${NODE_IMAGE}

RUN apk add --no-cache openssl
WORKDIR /app
COPY server.mjs /app/server.mjs
COPY --chmod=755 start.sh /app/start.sh

ENV PORT=8443 \
    CODES_PORT=8081 \
    CERT_DIR=/certs
VOLUME /certs
EXPOSE 8443 8081
HEALTHCHECK --interval=5s --timeout=3s --retries=10 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.CODES_PORT || 8081) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
ENTRYPOINT ["/app/start.sh"]
CMD ["node", "server.mjs"]
