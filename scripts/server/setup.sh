#!/usr/bin/env bash
# One-time setup for the AURA OS web server (Ubuntu 24.04, run as root).
# Node 22 from nodejs.org (checksum-verified), Caddy from Ubuntu's own
# packages (automatic HTTPS), a locked-down `aura` user, and the firewall
# opened for 80/443 only. The app itself ships with scripts/server/deploy.sh.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update -q
apt-get install -y -q ca-certificates curl xz-utils caddy

if ! command -v node >/dev/null || ! node -v | grep -q '^v22\.'; then
  cd /tmp
  base=https://nodejs.org/dist/latest-v22.x
  curl -fsSLO "$base/SHASUMS256.txt"
  tarball=$(grep -o 'node-v22\.[0-9.]*-linux-x64\.tar\.xz' SHASUMS256.txt | head -1)
  curl -fsSLO "$base/$tarball"
  grep " $tarball\$" SHASUMS256.txt | sha256sum -c -
  tar -xJf "$tarball" -C /usr/local --strip-components=1
  rm -f "$tarball" SHASUMS256.txt
fi
node -v
npm -v

id aura >/dev/null 2>&1 || useradd --system --create-home --home-dir /opt/aura --shell /usr/sbin/nologin aura
mkdir -p /opt/aura/app
chown -R aura:aura /opt/aura

ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw status | head -8
