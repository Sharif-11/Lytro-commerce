#!/usr/bin/env bash
# Prepares a fresh Ubuntu 24.04 server to run Lytro (Phase 9 Slice 9.1). Run once as root, from a copy of the repo's
# deploy/ folder; safe to run again. deploy/README.md walks through it.
#
#   ADMIN_KEY="<your public SSH key>" DEPLOY_KEY="<GitHub's deploy public key>" bash deploy/scripts/setup-server.sh
#
# It does what the Slice 9.1 read settled (2026-11-12):
#   - an admin user (ADMIN_USER, default `lytro`) who logs in with ADMIN_KEY and may use sudo, and a `deploy` user whose
#     one key may only run /opt/lytro/bin/lytro-ssh (GitHub's deploys);
#   - root login and password login switched off, once the admin's key is in place;
#   - a firewall that lets in SSH, HTTP and HTTPS only;
#   - security updates installed by themselves, the server restarting at 04:00 Bangladesh time when one needs it;
#   - Docker from Docker's own packages, a swap file (D9-11), and /opt/lytro.
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo 'run as root' >&2; exit 1; }
: "${ADMIN_KEY:?your public SSH key, the line in id_ed25519.pub}"
: "${DEPLOY_KEY:?the public half of the GitHub deploy key}"
ADMIN_USER="${ADMIN_USER:-lytro}"
SWAP_SIZE="${SWAP_SIZE:-2G}"
REGISTRY="${REGISTRY:-ghcr.io/sharif-11}"
LYTRO_HOME=/opt/lytro
HERE="$(cd "$(dirname "$0")/.." && pwd)"

for key in "$ADMIN_KEY" "$DEPLOY_KEY"; do
  if ! [[ "$key" =~ ^ssh-(ed25519|rsa)\ [A-Za-z0-9+/=]+(\ .*)?$ ]]; then
    echo "not an SSH public key: ${key:0:30}..." >&2
    exit 1
  fi
done

step() { printf '\n== %s\n' "$*"; }
export DEBIAN_FRONTEND=noninteractive
# A provider's image often carries its own sshd_config; an upgrade keeps every changed file as it is, never stopping to
# ask (the admin's settings sit in drop-in files anyway).
export UCF_FORCE_CONFFOLD=1
apt_get() { apt-get -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold "$@"; }

step 'time zone and packages'
timedatectl set-timezone Asia/Dhaka
apt_get update -q
apt_get -yq upgrade
apt_get install -yq ca-certificates curl gnupg ufw unattended-upgrades

step 'security updates by themselves, a restart at 04:00 when one needs it'
cat > /etc/apt/apt.conf.d/20auto-upgrades << 'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
cat > /etc/apt/apt.conf.d/52lytro-unattended-upgrades << 'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:00";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF

step "swap ($SWAP_SIZE)"
if ! swapon --show=NAME --noheadings | grep -qx /swapfile; then
  fallocate -l "$SWAP_SIZE" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
fi
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
# Swap is the cushion for a moment's peak (a video conversion), not working memory.
echo 'vm.swappiness=10' > /etc/sysctl.d/90-lytro.conf
sysctl --quiet --system

step 'Docker'
if ! command -v docker > /dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  codename="$(. /etc/os-release && echo "$VERSION_CODENAME")"
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $codename stable" \
    > /etc/apt/sources.list.d/docker.list
  apt_get update -q
  apt_get install -yq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
# Containers keep running while Docker itself restarts (an update), and no log grows without end.
cat > /etc/docker/daemon.json << 'EOF'
{
  "live-restore": true,
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" }
}
EOF
systemctl enable --now docker
systemctl restart docker

step "users: $ADMIN_USER (you) and deploy (GitHub)"
id "$ADMIN_USER" > /dev/null 2>&1 || adduser --disabled-password --gecos '' "$ADMIN_USER"
usermod -aG sudo,docker "$ADMIN_USER"
# The admin has no password to type (password login is off), so sudo asks for none.
echo "$ADMIN_USER ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/90-lytro-admin
chmod 440 /etc/sudoers.d/90-lytro-admin
install -d -m 700 -o "$ADMIN_USER" -g "$ADMIN_USER" "/home/$ADMIN_USER/.ssh"
printf '%s\n' "$ADMIN_KEY" > "/home/$ADMIN_USER/.ssh/authorized_keys"
chown "$ADMIN_USER:$ADMIN_USER" "/home/$ADMIN_USER/.ssh/authorized_keys"
chmod 600 "/home/$ADMIN_USER/.ssh/authorized_keys"

id deploy > /dev/null 2>&1 || adduser --disabled-password --gecos '' deploy
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
printf 'command="%s",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty %s\n' \
  "$LYTRO_HOME/bin/lytro-ssh" "$DEPLOY_KEY" > /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

step '/opt/lytro'
install -d -m 755 -o root -g root "$LYTRO_HOME" "$LYTRO_HOME/bin"
install -d -m 750 -o root -g deploy "$LYTRO_HOME/env"
install -d -m 755 -o deploy -g deploy "$LYTRO_HOME/releases" "$LYTRO_HOME/state"
install -d -m 750 -o deploy -g deploy "$LYTRO_HOME/backups"
install -m 755 -o root -g root "$HERE/scripts/lytro-ssh" "$LYTRO_HOME/bin/lytro-ssh"
if [ ! -f "$LYTRO_HOME/settings.env" ]; then
  # This server's own: which registry, and its memory sizes (deploy/compose.yml's defaults suit staging's 3 GB).
  printf 'REGISTRY=%s\n' "$REGISTRY" > "$LYTRO_HOME/settings.env"
fi
chown root:deploy "$LYTRO_HOME/settings.env"
chmod 640 "$LYTRO_HOME/settings.env"

step 'firewall: SSH, HTTP and HTTPS only'
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

step 'SSH: no root login, no passwords'
cat > /etc/ssh/sshd_config.d/10-lytro.conf << 'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
EOF
# Ubuntu 24.04 starts SSH on demand (ssh.socket), and only the running daemon makes the folder the check needs.
install -d -m 755 /run/sshd
sshd -t
systemctl restart ssh

step 'done'
echo "Before closing this session, check in a second terminal that you can log in: ssh $ADMIN_USER@<server address>"
echo 'Next: make-env.sh (deploy/README.md, step 4).'
