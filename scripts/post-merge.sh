#!/usr/bin/env bash
set -euo pipefail

# Post-merge setup is executed with stdin closed by Replit.
export CI=1

echo "[post-merge] Installing dependencies"
npm install --no-audit --no-fund --prefer-offline

echo "[post-merge] Synchronizing the Drizzle schema"
npm run db:push -- --force

echo "[post-merge] Rebuilding the frontend"
npx vite build

echo "[post-merge] Setup completed"