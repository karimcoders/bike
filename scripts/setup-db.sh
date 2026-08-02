#!/usr/bin/env bash
# =====================================================================
# setup-db.sh — Prisma database setup (PostgreSQL)
# =====================================================================
# Generates the Prisma client. If DATABASE_URL is set to a valid
# postgres URL, also pushes the schema to the database.
#
# Called automatically by:  npm/bun run prebuild (before next build)
# Can also be run manually:  bash scripts/setup-db.sh
#
# On Vercel: only `prisma generate` runs (DATABASE_URL may be a
# runtime-only env var that's not available during build). The schema
# should be pushed separately via `prisma db push` or migrations.
# =====================================================================

set -euo pipefail

echo "📦 Setting up database (PostgreSQL)..."
echo "   DATABASE_URL: ${DATABASE_URL:-<not set>}"

echo "🔧 Generating Prisma client..."
npx prisma generate

# Only push schema if DATABASE_URL is a valid postgres URL
if [[ "${DATABASE_URL:-}" =~ ^postgresql?:// ]]; then
  echo "🗄️  Pushing schema to database..."
  npx prisma db push --accept-data-loss
  echo "✅ Database setup complete!"
else
  echo "⚠️  DATABASE_URL not set or not a postgres URL — skipping db push."
  echo "   Run 'bun run db:push' manually after setting DATABASE_URL."
  echo "✅ Prisma client generated."
fi
