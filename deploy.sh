#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [[ -f "$ROOT_DIR/.deploy-config" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.deploy-config"
fi
GIT_BRANCH="${GIT_BRANCH:-main}"
SYSTEMD_SERVICE="${SYSTEMD_SERVICE:-centerpanel}"

if [[ ! -f "$ROOT_DIR/backend/.env" ]]; then
  echo "backend/.env is missing. Run sudo bash install.sh for the first installation."
  exit 1
fi

BACKUP_DIR="$ROOT_DIR/backups"
mkdir -p "$BACKUP_DIR"
DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ROOT_DIR/backend/.env" | tail -n1 | cut -d= -f2- | tr -d "\"'")"
if [[ "$DATABASE_URL" == file:* ]]; then
  DB_RELATIVE="${DATABASE_URL#file:}"
  DB_FILE="$ROOT_DIR/backend/prisma/${DB_RELATIVE#./}"
  if [[ -f "$DB_FILE" ]]; then
    cp "$DB_FILE" "$BACKUP_DIR/database-before-deploy-$(date +%Y%m%d-%H%M%S).db"
    find "$BACKUP_DIR" -type f -name 'database-before-deploy-*.db' -mtime +30 -delete
  fi
fi

echo "[1/6] Pulling latest code..."
git -c safe.directory="$ROOT_DIR" pull --ff-only origin "$GIT_BRANCH"

echo "[2/6] Installing backend dependencies..."
npm ci --prefix backend

echo "[3/6] Preparing database and backend..."
(
  cd backend
  npx prisma generate
  npx prisma migrate deploy
  npm run build
)

echo "[4/6] Installing frontend dependencies..."
npm ci --prefix frontend

echo "[5/6] Building frontend..."
npm run build --prefix frontend

echo "[6/6] Restarting backend..."
if command -v systemctl >/dev/null 2>&1 && systemctl cat "$SYSTEMD_SERVICE" >/dev/null 2>&1; then
  systemctl restart "$SYSTEMD_SERVICE"
  systemctl reload nginx
elif command -v pm2 >/dev/null 2>&1 && [[ -n "${PM2_APP_NAME:-}" ]]; then
  pm2 restart "$PM2_APP_NAME" --update-env
elif command -v pm2 >/dev/null 2>&1 && pm2 jlist | grep -q '"pm_id"'; then
  pm2 restart all --update-env
else
  echo "No CenterPanel systemd service or PM2 process was found. Run sudo bash install.sh first."
  exit 1
fi

echo "Deployment completed successfully."
