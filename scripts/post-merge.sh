#!/usr/bin/env bash
set -euo pipefail

# Post-merge setup is executed with stdin closed by Replit.
export CI=1

echo "[post-merge] Installing dependencies"
npm install --no-audit --no-fund --prefer-offline

echo "[post-merge] Applying versioned Drizzle migrations"
npm run db:migrate

echo "[post-merge] Rebuilding the frontend"
npx vite build

echo "[post-merge] Setup completed"