#!/usr/bin/env sh
# The load test's outside stand-in (Phase 9 Slice 9.10): its container's entrypoint, run as root. The first time CERT_DIR
# (a volume the API containers mount too) lacks them, it makes a certificate authority of its own (ca.pem, ca.key) and a
# server certificate it signs (server.pem, server.key) for the names `outside` and `localhost`. The API containers trust
# ca.pem through NODE_EXTRA_CA_CERTS, so the server's HTTPS-only providers (BulkSMSBD, Resend, Gemini) take the stand-in.
# Then it runs the stand-in, or the command it was given.
#
#   CERT_DIR   where the certificates live (/certs)
#   OPENSSL    the openssl to use (openssl on PATH)
set -eu

CERT_DIR="${CERT_DIR:-/certs}"
OPENSSL="${OPENSSL:-openssl}"
DAYS=825

has() {
  [ -s "$CERT_DIR/$1" ]
}

if ! has ca.pem || ! has ca.key || ! has server.pem || ! has server.key; then
  mkdir -p "$CERT_DIR"
  # The keys stay root's; the certificates, and the folder, are readable by the API containers' own user.
  chmod 755 "$CERT_DIR"
  umask 077
  config="$CERT_DIR/openssl.cnf"
  cat > "$config" <<'EOF'
[ca_req]
distinguished_name = ca_dn
prompt = no
[ca_dn]
CN = Lytro load-test stand-in CA
[server_req]
distinguished_name = server_dn
prompt = no
[server_dn]
CN = outside
[ca_ext]
basicConstraints = critical, CA:TRUE
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
[server_ext]
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature
extendedKeyUsage = serverAuth
subjectAltName = DNS:outside, DNS:localhost, IP:127.0.0.1
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid, issuer
EOF
  # A new authority only when there is none: a server certificate made again is signed by the one the API already trusts.
  if ! has ca.pem || ! has ca.key; then
    "$OPENSSL" req -x509 -new -config "$config" -section ca_req -extensions ca_ext \
      -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -sha256 -days "$DAYS" \
      -keyout "$CERT_DIR/ca.key" -out "$CERT_DIR/ca.pem"
  fi
  "$OPENSSL" req -new -config "$config" -section server_req \
    -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes \
    -keyout "$CERT_DIR/server.key" -out "$CERT_DIR/server.csr"
  "$OPENSSL" x509 -req -in "$CERT_DIR/server.csr" -CA "$CERT_DIR/ca.pem" -CAkey "$CERT_DIR/ca.key" \
    -CAcreateserial -CAserial "$CERT_DIR/ca.srl" -sha256 -days "$DAYS" \
    -extfile "$config" -extensions server_ext -out "$CERT_DIR/server.pem"
  rm -f "$CERT_DIR/server.csr" "$config"
  chmod 644 "$CERT_DIR/ca.pem" "$CERT_DIR/server.pem"
  echo "outside: made a certificate authority and a certificate for outside and localhost in $CERT_DIR"
fi

case "$0" in
  */*) cd "${0%/*}" ;;
esac
if [ "$#" -eq 0 ]; then
  set -- node server.mjs
fi
exec "$@"
