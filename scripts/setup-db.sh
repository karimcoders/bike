#!/usr/bin/env bash
# =====================================================================
# setup-db.sh — Prisma database setup (PostgreSQL)
# =====================================================================
# Generates the Prisma client and pushes the schema to the database
# specified by DATABASE_URL.
#
# Called automatically by:  npm/bun run prebuild (before next build)
# Can also be run manually:  bash scripts/setup-db.sh
#
# NOTE: The app now uses PostgreSQL exclusively (SQLite was removed for
# production data persistence). For local dev, run
#   bash scripts/ensure-postgres.sh
# first to start a portable PostgreSQL server (no sudo needed).
# =====================================================================

set -euo pipefail

echo "📦 Setting up database (PostgreSQL)..."
echo "   DATABASE_URL: ${DATABASE_URL:-<not set>}"

echo "🔧 Generating Prisma client..."
npx prisma generate

echo "🗄️  Pushing schema to database..."
npx prisma db push --accept-data-loss

echo "✅ Database setup complete!"
