#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "[1/6] Pulling latest code..."
git pull --ff-only origin main

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
if ! command -v pm2 >/dev/null 2>&1; then
  echo "PM2 is not installed. Install it once with: sudo npm install -g pm2"
  exit 1
fi

if [[ -n "${PM2_APP_NAME:-}" ]]; then
  pm2 restart "$PM2_APP_NAME" --update-env
elif pm2 jlist | grep -q '"pm_id"'; then
  pm2 restart all --update-env
else
  pm2 start "$ROOT_DIR/backend/dist/index.js" --name centerpanel-backend --cwd "$ROOT_DIR/backend"
  pm2 save
fi

echo "Deployment completed successfully."
