#!/bin/sh
set -e
if [ -n "$DATABASE_URL" ]; then
  echo "[entry] applying migrations…"
  node packages/database/dist/migrate.js
  echo "[entry] seeding registry (faults/regions/sources; synthetic history only outside production)…"
  node packages/database/dist/seed.js
fi
exec node apps/api/dist/main.js
