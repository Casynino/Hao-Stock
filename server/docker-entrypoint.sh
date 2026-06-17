#!/bin/sh
set -e

echo "[entrypoint] Applying database schema..."
if [ -d prisma/migrations ] && [ "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  echo "[entrypoint] Running prisma migrate deploy"
  npx prisma migrate deploy
else
  echo "[entrypoint] No migrations found — running prisma db push"
  npx prisma db push --skip-generate --accept-data-loss
fi

if [ "$SEED_ON_START" = "true" ]; then
  echo "[entrypoint] Seeding database"
  node prisma/seed.js || echo "[entrypoint] Seed skipped/failed (continuing)"
fi

echo "[entrypoint] Starting API server"
exec node src/server.js
