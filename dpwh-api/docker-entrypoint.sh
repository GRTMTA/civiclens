#!/bin/sh
set -eu

if [ ! -s "$DPWH_DB_PATH" ]; then
  python scripts/build_db.py
fi

exec uvicorn app:app --host 0.0.0.0 --port 8000
