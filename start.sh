#!/usr/bin/env bash
# Local helper: boot MongoDB (if available), the Python AI service, and the Node backend.
# Does not change application architecture — just starts existing services.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "[start] CertifyChain local services"
echo "  backend  → http://localhost:5000"
echo "  ai       → http://127.0.0.1:5001"
echo "  frontend → run separately: cd frontend && npm run dev"
echo

if command -v mongod >/dev/null 2>&1; then
  if ! pgrep -x mongod >/dev/null 2>&1; then
    echo "[start] launching mongod..."
    mongod --dbpath "${MONGO_DBPATH:-/data/db}" --fork --logpath /tmp/mongod.log >/dev/null 2>&1 || \
      echo "[start] mongod already running or needs a dbpath; continuing"
  else
    echo "[start] mongod already running"
  fi
else
  echo "[start] mongod not on PATH — assuming MongoDB is already running on 27017"
fi

cleanup() {
  echo
  echo "[start] stopping child services..."
  kill 0 >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

echo "[start] AI service (Flask :5001)"
(
  cd "$ROOT/ai-service"
  if [ -d "venv" ]; then
    # shellcheck disable=SC1091
    source venv/bin/activate || source venv/Scripts/activate
  fi
  python app.py
) &

echo "[start] Node backend (:5000)"
(
  cd "$ROOT/backend"
  npm start
) &

wait
