#!/usr/bin/env bash
# Ship the committed code to the AURA OS web server, build it there and
# (re)start it. Run from the repo on the kiosk laptop:
#   bash scripts/server/deploy.sh
# The server gets the laptop's .env.local with PUBLIC_BASE_URL set to the
# domain (card QR codes open there). Caddy serves HTTPS for the domain, www
# (redirected) and the sslip.io fallback name. First-time box setup:
#   ssh root@HOST 'bash -s' < scripts/server/setup.sh
set -euo pipefail

HOST=${AURA_HOST:-root@155.138.165.43}
KEY=${AURA_KEY:-$HOME/.ssh/aura_vultr}
DOMAIN=${AURA_DOMAIN:-aurafulos.tech}
IP=${HOST#*@}
FALLBACK="${IP//./-}.sslip.io"

cd "$(dirname "$0")/../.."
remote() { ssh -i "$KEY" -o BatchMode=yes "$HOST" "$@"; }

echo "==> shipping $(git rev-parse --short HEAD) to $HOST"
git archive --format=tar HEAD | remote 'rm -rf /opt/aura/next && mkdir -p /opt/aura/next && tar -x -C /opt/aura/next'
scp -q -i "$KEY" -o BatchMode=yes .env.local "$HOST:/opt/aura/next/.env.local"

remote "DOMAIN='$DOMAIN' FALLBACK='$FALLBACK' bash -s" <<'REMOTE'
set -euo pipefail
cd /opt/aura/next
# Server-side env: public links on the domain; no GPU segmenter, no printer here.
sed -i -E '/^(PUBLIC_BASE_URL|ML_SERVICE_URL|PRINTING_ENABLED)=/d' .env.local
printf 'PUBLIC_BASE_URL=https://%s\nML_SERVICE_URL=\nPRINTING_ENABLED=false\n' "$DOMAIN" >> .env.local
chmod 600 .env.local
chown -R aura:aura /opt/aura/next

echo "==> installing + building"
# npm ci, or npm install when the server's npm reads optional peers differently from the laptop's.
sudo -u aura -H bash -c 'cd /opt/aura/next && (npm ci --no-audit --no-fund --loglevel=error || npm install --no-audit --no-fund --loglevel=error) && NEXT_TELEMETRY_DISABLED=1 npm run build 2>&1 | tail -25; exit ${PIPESTATUS[0]}'

echo "==> switching over"
systemctl stop aura 2>/dev/null || true
rm -rf /opt/aura/prev
[ -d /opt/aura/app ] && mv /opt/aura/app /opt/aura/prev
mv /opt/aura/next /opt/aura/app

cat > /etc/systemd/system/aura.service <<UNIT
[Unit]
Description=AURA OS web (Next.js)
After=network-online.target
Wants=network-online.target

[Service]
User=aura
WorkingDirectory=/opt/aura/app
Environment=NODE_ENV=production
Environment=NEXT_TELEMETRY_DISABLED=1
ExecStart=/usr/local/bin/npm run start -- -p 3000 -H 127.0.0.1
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN, $FALLBACK {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}

www.$DOMAIN {
	redir https://$DOMAIN{uri} permanent
}
CADDY

systemctl daemon-reload
systemctl enable --now aura >/dev/null
systemctl reload caddy || systemctl restart caddy
for i in $(seq 1 30); do curl -fsS -o /dev/null http://127.0.0.1:3000/feed && break; sleep 1; done
systemctl --no-pager --lines=0 status aura | head -3
curl -s -o /dev/null -w "local /feed -> %{http_code}\n" http://127.0.0.1:3000/feed
REMOTE
echo "==> live: https://$DOMAIN  (fallback https://$FALLBACK)"
