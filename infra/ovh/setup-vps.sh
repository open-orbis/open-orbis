#!/usr/bin/env bash
# Orbis — OVH VPS bootstrap & hardening.
# Run as root on a fresh Ubuntu 24.04 VPS:
#   bash setup-vps.sh "<your-ssh-public-key>"
#
# Idempotent — safe to re-run. Creates a non-root sudo user `orbis`, installs
# Docker CE + compose plugin, enables UFW (22/80/443) and fail2ban, and
# disables root SSH login + password auth.
set -euo pipefail

APP_USER="orbis"
SSH_PUBKEY="${1:-}"

if [[ -z "$SSH_PUBKEY" ]]; then
  echo "ERROR: pass your SSH public key as the first argument." >&2
  echo "Usage: bash setup-vps.sh \"ssh-ed25519 AAAA...\"" >&2
  exit 1
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: run as root." >&2
  exit 1
fi

echo "--- 1/6 apt update + base packages ---"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg ufw fail2ban

echo "--- 2/6 create non-root sudo user '$APP_USER' ---"
if ! id "$APP_USER" &>/dev/null; then
  adduser --disabled-password --gecos "" "$APP_USER"
fi
usermod -aG sudo "$APP_USER"
# passwordless sudo so scripted SSH commands don't hang on a prompt
echo "$APP_USER ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/90-orbis
chmod 440 /etc/sudoers.d/90-orbis

echo "--- 3/6 install SSH public key for '$APP_USER' ---"
install -d -m 700 -o "$APP_USER" -g "$APP_USER" "/home/$APP_USER/.ssh"
AUTH_KEYS="/home/$APP_USER/.ssh/authorized_keys"
touch "$AUTH_KEYS"
grep -qxF "$SSH_PUBKEY" "$AUTH_KEYS" || echo "$SSH_PUBKEY" >> "$AUTH_KEYS"
chown "$APP_USER:$APP_USER" "$AUTH_KEYS"
chmod 600 "$AUTH_KEYS"

echo "--- 4/6 install Docker CE + compose plugin ---"
if ! command -v docker &>/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
usermod -aG docker "$APP_USER"
systemctl enable --now docker

echo "--- 5/6 firewall (UFW) + fail2ban ---"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
systemctl enable --now fail2ban

echo "--- 6/6 harden sshd (no root login, no password auth) ---"
SSHD_DROPIN="/etc/ssh/sshd_config.d/99-orbis-hardening.conf"
cat > "$SSHD_DROPIN" <<'EOF'
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
EOF
# validate before restarting so we never lock ourselves out on a syntax error
sshd -t
systemctl restart ssh || systemctl restart sshd

echo ""
echo "Setup complete. Docker version: $(docker --version)"
echo "Log in from now on as: ssh $APP_USER@<vps-ip>"
