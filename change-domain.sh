#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="centerpanel"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$ROOT_DIR/backend/.env"
NGINX_SITE="/etc/nginx/sites-available/$APP_NAME"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo ./change-domain.sh"
  exit 1
fi
if [[ ! -f "$ENV_FILE" || ! -f "/etc/systemd/system/$APP_NAME.service" ]]; then
  echo "CenterPanel is not installed here. Run sudo ./install.sh first."
  exit 1
fi

read -r -p "New domain (without https://): " NEW_DOMAIN
NEW_DOMAIN="${NEW_DOMAIN,,}"
[[ "$NEW_DOMAIN" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ && "$NEW_DOMAIN" == *.* ]] || {
  echo "Enter a valid DNS hostname, for example panel.example.com."
  exit 1
}
read -r -p "Let's Encrypt email: " CERT_EMAIL
[[ "$CERT_EMAIL" == *@*.* ]] || { echo "Enter a valid email address."; exit 1; }

if ! getent ahosts "$NEW_DOMAIN" >/dev/null 2>&1; then
  echo "DNS for $NEW_DOMAIN does not resolve yet."
  echo "Create its A/AAAA record, wait for DNS propagation, then run this script again."
  exit 1
fi

BACKEND_PORT="$(grep -E '^PORT=' "$ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d "\"'")"
[[ "$BACKEND_PORT" =~ ^[0-9]+$ ]] || { echo "Could not read a valid PORT from backend/.env."; exit 1; }

STAMP="$(date +%Y%m%d-%H%M%S)"
cp "$ENV_FILE" "$ENV_FILE.before-domain-change.$STAMP"
[[ ! -f "$NGINX_SITE" ]] || cp "$NGINX_SITE" "$NGINX_SITE.before-domain-change.$STAMP"
ENV_BACKUP="$ENV_FILE.before-domain-change.$STAMP"
NGINX_BACKUP="$NGINX_SITE.before-domain-change.$STAMP"

rollback() {
  trap - ERR
  echo "Domain change failed; restoring the previous environment and Nginx configuration."
  cp "$ENV_BACKUP" "$ENV_FILE"
  [[ ! -f "$NGINX_BACKUP" ]] || cp "$NGINX_BACKUP" "$NGINX_SITE"
  nginx -t && systemctl reload nginx || true
  systemctl restart "$APP_NAME" || true
}
trap rollback ERR

TEMP_ENV="$(mktemp)"
awk -v value="https://$NEW_DOMAIN" '
  BEGIN { replaced = 0 }
  /^PUBLIC_BASE_URL=/ { print "PUBLIC_BASE_URL=\"" value "\""; replaced = 1; next }
  { print }
  END { if (!replaced) print "PUBLIC_BASE_URL=\"" value "\"" }
' "$ENV_FILE" > "$TEMP_ENV"
cat "$TEMP_ENV" > "$ENV_FILE"
rm -f "$TEMP_ENV"
chmod 600 "$ENV_FILE"

# Start from a clean HTTP site. Certbot will add the TLS server block and
# redirect after it has successfully obtained the new certificate.
cat > "$NGINX_SITE" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $NEW_DOMAIN;

    root $ROOT_DIR/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        client_max_body_size 25m;
    }

    location /sub/ {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

ln -sfn "$NGINX_SITE" "/etc/nginx/sites-enabled/$APP_NAME"
nginx -t
systemctl reload nginx

echo "Installing Certbot if necessary (waiting up to 5 minutes for APT)..."
apt-get -o DPkg::Lock::Timeout=300 update
DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=300 install -y certbot python3-certbot-nginx
certbot --nginx --non-interactive --agree-tos --redirect -m "$CERT_EMAIL" -d "$NEW_DOMAIN"

systemctl restart "$APP_NAME"
systemctl reload nginx
trap - ERR

echo "Domain changed successfully: https://$NEW_DOMAIN"
echo "Existing subscription tokens are unchanged; their displayed base URL now uses the new domain."
