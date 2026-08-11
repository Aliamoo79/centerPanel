#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="centerpanel"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $EUID -ne 0 ]]; then
  echo "Run this installer as root: sudo bash install.sh"
  exit 1
fi
if [[ ! -f "$ROOT_DIR/backend/package.json" || ! -f "$ROOT_DIR/frontend/package.json" ]]; then
  echo "install.sh must be run from the cloned CenterPanel repository."
  exit 1
fi
if [[ "$ROOT_DIR" == /root || "$ROOT_DIR" == /root/* ]]; then
  echo "Do not install from /root; Nginx cannot safely serve files there."
  echo "Clone under /opt/centerpanel or /home/<user>/centerpanel and run the installer again."
  exit 1
fi
[[ "$ROOT_DIR" != *' '* ]] || { echo "Project path cannot contain spaces."; exit 1; }
if [[ -f "$ROOT_DIR/backend/.env" ]]; then
  read -r -p "An existing installation was detected. Reconfigure it? [y/N]: " RECONFIGURE
  [[ "${RECONFIGURE,,}" == "y" || "${RECONFIGURE,,}" == "yes" ]] || exit 0
fi

ask() {
  local prompt="$1" default="${2:-}" answer
  if [[ -n "$default" ]]; then read -r -p "$prompt [$default]: " answer; else read -r -p "$prompt: " answer; fi
  printf '%s' "${answer:-$default}"
}

ask_password() {
  local first second
  while true; do
    read -r -s -p "Initial admin password: " first; echo >&2
    read -r -s -p "Confirm admin password: " second; echo >&2
    [[ ${#first} -ge 10 ]] || { echo "Password must contain at least 10 characters." >&2; continue; }
    [[ "$first" != *'"'* && "$first" != *'\'* ]] || {
      echo "Password cannot contain a double quote or backslash." >&2; continue;
    }
    [[ "$first" == "$second" ]] && { printf '%s' "$first"; return; }
    echo "Passwords do not match." >&2
  done
}

echo "CenterPanel first-time installer"
echo "Project directory: $ROOT_DIR"
echo

HOST_NAME="$(ask "Public domain or server IP (without http:// or https://)")"
[[ -n "$HOST_NAME" ]] || { echo "A domain or IP is required."; exit 1; }
[[ "$HOST_NAME" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "Domain or IP contains unsupported characters."; exit 1; }
read -r -p "Enable HTTPS with Let's Encrypt? [y/N]: " ENABLE_HTTPS
ENABLE_HTTPS="${ENABLE_HTTPS,,}"
LETSENCRYPT_EMAIL=""
if [[ "$ENABLE_HTTPS" == "y" || "$ENABLE_HTTPS" == "yes" ]]; then
  LETSENCRYPT_EMAIL="$(ask "Let's Encrypt email")"
  [[ "$HOST_NAME" != *:* && "$HOST_NAME" != */* ]] || { echo "HTTPS requires a valid DNS hostname."; exit 1; }
fi
ADMIN_USERNAME="$(ask "Initial admin username" "admin")"
[[ "$ADMIN_USERNAME" =~ ^[A-Za-z0-9_.-]+$ ]] || { echo "Admin username contains unsupported characters."; exit 1; }
ADMIN_PASSWORD="$(ask_password)"
BACKEND_PORT="$(ask "Private backend port" "4000")"
[[ "$BACKEND_PORT" =~ ^[0-9]+$ ]] && (( BACKEND_PORT >= 1024 && BACKEND_PORT <= 65535 )) || {
  echo "Backend port must be between 1024 and 65535."; exit 1;
}
GIT_BRANCH="$(ask "Git branch used for redeploys" "main")"
[[ "$GIT_BRANCH" =~ ^[A-Za-z0-9._/-]+$ ]] || { echo "Git branch contains unsupported characters."; exit 1; }
SYNC_INTERVAL="$(ask "Usage refresh interval in seconds" "60")"
[[ "$SYNC_INTERVAL" =~ ^[0-9]+$ ]] && (( SYNC_INTERVAL >= 15 )) || {
  echo "Usage refresh interval must be at least 15 seconds."; exit 1;
}
DEFAULT_SERVICE_USER="${SUDO_USER:-root}"
SERVICE_USER="$(ask "Linux user that will run the backend" "$DEFAULT_SERVICE_USER")"
id "$SERVICE_USER" >/dev/null 2>&1 || { echo "Linux user '$SERVICE_USER' does not exist."; exit 1; }

SCHEME="http"
[[ "$ENABLE_HTTPS" == "y" || "$ENABLE_HTTPS" == "yes" ]] && SCHEME="https"
PUBLIC_BASE_URL="$SCHEME://$HOST_NAME"

echo
echo "Installing system packages..."
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl git nginx openssl
JWT_SECRET="$(openssl rand -hex 48)"

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
if (( NODE_MAJOR < 20 )); then
  echo "Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
fi

if [[ -f "$ROOT_DIR/backend/.env" ]]; then
  cp "$ROOT_DIR/backend/.env" "$ROOT_DIR/backend/.env.before-install.$(date +%Y%m%d-%H%M%S)"
fi
cat > "$ROOT_DIR/backend/.env" <<EOF
DATABASE_URL="file:./dev.db"
JWT_SECRET="$JWT_SECRET"
ADMIN_USERNAME="$ADMIN_USERNAME"
ADMIN_PASSWORD="$ADMIN_PASSWORD"
PORT=$BACKEND_PORT
PUBLIC_BASE_URL="$PUBLIC_BASE_URL"
USAGE_SYNC_INTERVAL_MS=$((SYNC_INTERVAL * 1000))
EOF
chmod 600 "$ROOT_DIR/backend/.env"
chown "$SERVICE_USER":"$(id -gn "$SERVICE_USER")" "$ROOT_DIR/backend/.env"

echo "Installing dependencies and building the application..."
npm ci --prefix "$ROOT_DIR/backend"
npm ci --prefix "$ROOT_DIR/frontend"
(
  cd "$ROOT_DIR/backend"
  npx prisma generate
  npx prisma migrate deploy
  npm run seed
  npm run build
)
npm run build --prefix "$ROOT_DIR/frontend"
chown -R "$SERVICE_USER":"$(id -gn "$SERVICE_USER")" "$ROOT_DIR/backend/prisma" "$ROOT_DIR/backend/dist"

cat > "/etc/systemd/system/$APP_NAME.service" <<EOF
[Unit]
Description=CenterPanel backend
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$(id -gn "$SERVICE_USER")
WorkingDirectory=$ROOT_DIR/backend
EnvironmentFile=$ROOT_DIR/backend/.env
ExecStart=$(command -v node) $ROOT_DIR/backend/dist/index.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

cat > "/etc/nginx/sites-available/$APP_NAME" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $HOST_NAME;

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
ln -sfn "/etc/nginx/sites-available/$APP_NAME" "/etc/nginx/sites-enabled/$APP_NAME"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl daemon-reload
systemctl enable --now "$APP_NAME"
systemctl enable --now nginx
systemctl reload nginx

for attempt in {1..10}; do
  curl -fsS "http://127.0.0.1:$BACKEND_PORT/api/health" >/dev/null && break
  if (( attempt == 10 )); then
    echo "Backend health check failed. Inspect it with: journalctl -u $APP_NAME -n 100"
    exit 1
  fi
  sleep 2
done

if [[ "$ENABLE_HTTPS" == "y" || "$ENABLE_HTTPS" == "yes" ]]; then
  echo "Requesting the TLS certificate..."
  DEBIAN_FRONTEND=noninteractive apt-get install -y certbot python3-certbot-nginx
  certbot --nginx --non-interactive --agree-tos --redirect -m "$LETSENCRYPT_EMAIL" -d "$HOST_NAME"
fi

cat > "$ROOT_DIR/.deploy-config" <<EOF
GIT_BRANCH=$GIT_BRANCH
SYSTEMD_SERVICE=$APP_NAME
EOF
chmod 600 "$ROOT_DIR/.deploy-config"

echo
echo "Installation complete: $PUBLIC_BASE_URL"
echo "Admin username: $ADMIN_USERNAME"
echo "Future updates: cd $ROOT_DIR && sudo bash deploy.sh"
