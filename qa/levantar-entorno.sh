#!/usr/bin/env bash
# Prepara el entorno de la suite de QA y deja el servidor de pruebas corriendo en el puerto 5000:
#   1. base desechable nueva (edupay_ci, marcada edupay:test) en el contenedor edupay-pg18 (puerto 54318),
#   2. migraciones, datos de demostración y cuentas ficticias (crear-cuentas.mjs),
#   3. servidor de EduPay en modo desarrollo.
# Escribe las claves efímeras de esa corrida en qa/.env.qa.sh (ignorado por git) para que las pruebas descifren el 2FA.
# NUNCA apunta a producción: se niega a continuar si la base no es la desechable.
# Uso: bash qa/levantar-entorno.sh     (queda en primer plano hasta que se detenga el servidor)
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && (pwd -W 2>/dev/null || pwd))"
cd "$REPO" || exit 1
C="edupay-pg18"; PORT=54318
LOGS="${TMPDIR:-${TEMP:-/tmp}}"
case "$REPO" in /*) NEON="--import=file://$REPO/.github/ci/neon-config.mjs" ;; *) NEON="--import=file:///$REPO/.github/ci/neon-config.mjs" ;; esac

export CI=true APP_ENV=test ALLOW_DEMO_SEED=true AUTH_RATE_LIMIT_MAX=10000 AUTH_RATE_LIMIT_WINDOW_MS=900000 RUN_STRIPE_E2E=0 TZ=UTC
export DATABASE_URL="postgresql://ci_test@127.0.0.1:$PORT/edupay_ci"
rnd() { node -e "process.stdout.write(require('crypto').randomBytes($1).toString('$2'))"; }
export SESSION_SECRET="$(rnd 48 hex)" JWT_SECRET="$(rnd 48 hex)" TOTP_ENCRYPTION_KEY="$(rnd 32 base64)"
export VITE_STRIPE_PUBLISHABLE_KEY="pk_test_ci_$(rnd 24 hex)" STRIPE_SECRET_KEY="sk_test_ci_$(rnd 24 hex)"

# Claves efímeras de esta corrida, para las pruebas (archivo ignorado por git).
cat > "$REPO/qa/.env.qa.sh" <<EOF
export TZ=UTC APP_ENV=test DATABASE_URL="$DATABASE_URL"
export JWT_SECRET="$JWT_SECRET" SESSION_SECRET="$SESSION_SECRET" TOTP_ENCRYPTION_KEY="$TOTP_ENCRYPTION_KEY"
export STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY"
EOF

for i in $(seq 1 30); do docker exec "$C" pg_isready -U ci_test -d postgres >/dev/null 2>&1 && break; sleep 1; done
docker exec "$C" dropdb -U ci_test --force --if-exists edupay_ci || { echo "FALLO dropdb"; exit 1; }
docker exec "$C" createdb -U ci_test edupay_ci || { echo "FALLO createdb"; exit 1; }
docker exec "$C" psql -U ci_test -d edupay_ci -v ON_ERROR_STOP=1 -c "COMMENT ON DATABASE edupay_ci IS 'edupay:test';" || exit 1
npm run db:migrate || { echo "FALLO migraciones"; exit 1; }

NODE_OPTIONS="" node .github/ci/postgres-bridge.mjs > "$LOGS/qa-pgbridge.log" 2>&1 &
BRIDGE_PID=$!
for i in $(seq 1 30); do curl --fail --silent http://127.0.0.1:54330/health >/dev/null && break; sleep 1; done
NODE_OPTIONS="$NEON" node --import tsx --input-type=module -e 'import { seedDemoData } from "./server/seed-demo.ts"; import { pool } from "./server/db.ts"; try { await seedDemoData(); } finally { await pool.end(); }' || { echo "FALLO seed"; exit 1; }
NODE_OPTIONS="$NEON" node qa/crear-cuentas.mjs || { echo "FALLO cuentas"; exit 1; }

NODE_ENV=development NODE_OPTIONS="$NEON" npx tsx server/index.ts > "$LOGS/qa-app.log" 2>&1 &
APP_PID=$!
for i in $(seq 1 90); do curl --fail --silent http://127.0.0.1:5000/ >/dev/null && break; sleep 1; done
echo "QA-LISTO app=$APP_PID bridge=$BRIDGE_PID (registros en $LOGS/qa-app.log)"
wait $APP_PID
