#!/usr/bin/env bash
# =====================================================================
# ensure-postgres.sh — Start a portable PostgreSQL 17 server (no sudo)
# =====================================================================
# Ensures a local PostgreSQL server is running on port 5433 for dev.
#
# This script is idempotent and resilient:
#   1. If PG is already running on 5433 → done
#   2. If binaries exist at $PG_ROOT but server is down → start it
#   3. If data dir exists but binaries are gone → re-download + start
#   4. If nothing exists → download + extract + initdb + start
#
# All files live in /tmp (cleared on workspace reset), so after a
# sandbox reset, just re-run this script to get PostgreSQL back.
#
# Usage:
#   bash scripts/ensure-postgres.sh
#
# After running, set DATABASE_URL in .env to:
#   postgresql://postgres@localhost:5433/bikeshop
# =====================================================================

set -euo pipefail

PG_PORT="${PG_PORT:-5433}"
PG_ROOT="${PG_ROOT:-/tmp/pgroot}"
PG_DATA="${PG_DATA:-/tmp/pgdata}"
PG_BIN="$PG_ROOT/usr/lib/postgresql/17/bin"
PG_LOG="/tmp/pg.log"
PG_DB="bikeshop"
PG_VERSION="17.10-0+deb13u1"

# ---- 1. Check if already running ----
if "$PG_BIN/pg_isready" -h localhost -p "$PG_PORT" >/dev/null 2>&1; then
  echo "✅ PostgreSQL already running on port $PG_PORT"
  exit 0
fi

# ---- Helper: download + extract binaries ----
setup_binaries() {
  if [ -x "$PG_BIN/postgres" ]; then
    echo "   Binaries already present at $PG_ROOT"
    return 0
  fi
  echo "   📦 Downloading PostgreSQL 17 binaries (no sudo needed)..."
  local tmpdir="/tmp/pgdebs"
  mkdir -p "$tmpdir"
  cd "$tmpdir"
  # apt download fetches .deb files WITHOUT installing (no root needed)
  apt-get download postgresql-17 postgresql-client-17 postgresql-common 2>/dev/null || true
  mkdir -p "$PG_ROOT"
  for deb in postgresql-17_*.deb postgresql-client-17_*.deb; do
    [ -f "$deb" ] && dpkg-deb -x "$deb" "$PG_ROOT"
  done
  if [ ! -x "$PG_BIN/postgres" ]; then
    echo "✗ Failed to extract PostgreSQL binaries"
    exit 1
  fi
  echo "   ✓ Binaries ready"
}

# ---- Helper: initdb (create data directory) ----
init_data() {
  if [ -d "$PG_DATA" ] && [ -f "$PG_DATA/PG_VERSION" ]; then
    echo "   Data directory already exists at $PG_DATA"
    return 0
  fi
  echo "   🗂️  Initializing database cluster..."
  rm -rf "$PG_DATA"
  LC_ALL=C "$PG_BIN/initdb" -D "$PG_DATA" -U postgres --auth=trust --encoding=UTF8
  echo "   ✓ Cluster initialized"
}

# ---- Helper: start server ----
start_server() {
  echo "   🚀 Starting PostgreSQL on port $PG_PORT..."
  "$PG_BIN/pg_ctl" -D "$PG_DATA" -l "$PG_LOG" \
    -o "-p $PG_PORT -c listen_addresses=localhost -c unix_socket_directories=/tmp" \
    -w start
  echo "   ✓ Server started"
}

# ---- Helper: create database ----
create_db() {
  if "$PG_BIN/psql" -h localhost -p "$PG_PORT" -U postgres -lqt 2>/dev/null | cut -d'|' -f1 | grep -qw "$PG_DB"; then
    echo "   Database '$PG_DB' already exists"
  else
    "$PG_BIN/createdb" -h localhost -p "$PG_PORT" -U postgres "$PG_DB"
    echo "   ✓ Created database '$PG_DB'"
  fi
}

# ---- Run the steps ----
echo "🔧 Ensuring PostgreSQL is running..."
setup_binaries
init_data
start_server
create_db

echo ""
echo "✅ PostgreSQL ready!"
echo "   Host: localhost"
echo "   Port: $PG_PORT"
echo "   Database: $PG_DB"
echo "   User: postgres (no password — trust auth)"
echo "   DATABASE_URL: postgresql://postgres@localhost:$PG_PORT/$PG_DB"
echo ""
echo "Next: run 'env -u DATABASE_URL bun run db:push' to create tables,"
echo "      then 'env -u DATABASE_URL bun run scripts/migrate-sqlite-to-postgres.ts'"
echo "      to migrate existing data from SQLite."
