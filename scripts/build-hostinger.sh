#!/usr/bin/env bash
# =====================================================================
# build-hostinger.sh — Build a ZIP package for Hostinger "Deploy Web App"
# =====================================================================
# Produces: bike-shop-hostinger.zip
#
# The ZIP contains everything Hostinger needs to run the app:
#   - .next/standalone/  (Next.js standalone server + deps)
#   - .next/static/      (JS/CSS chunks)
#   - public/            (images, favicon, etc.)
#   - prisma/            (schema + seed script)
#   - package.json       (for db:seed script reference)
#
# Usage:
#   bash scripts/build-hostinger.sh
#
# Then upload the ZIP via:
#   hPanel → Deploy Web App → Upload ZIP
# =====================================================================

set -euo pipefail

cd "$(dirname "$0")/.."
PROJECT_DIR="$(pwd)"

echo "🚀 Building AI Bike Shop OS for Hostinger..."
echo "   Project: $PROJECT_DIR"
echo ""

# ---- Step 1: Install dependencies ----
echo "📦 Step 1/5: Installing dependencies..."
if command -v bun &>/dev/null; then
  bun install
else
  npm install
fi

# ---- Step 2: Generate Prisma client ----
echo "🔧 Step 2/5: Generating Prisma client..."
npx prisma generate

# ---- Step 3: Build Next.js ----
echo "🏗️  Step 3/5: Building Next.js (standalone mode)..."
if command -v bun &>/dev/null; then
  bun run build
else
  npm run build
fi

# ---- Step 4: Prepare deployment directory ----
DEPLOY_DIR="$PROJECT_DIR/.hostinger-build"
echo "📁 Step 4/5: Preparing deployment package..."
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"

# Copy standalone server (includes node_modules + server.js)
cp -r "$PROJECT_DIR/.next/standalone/." "$DEPLOY_DIR/"

# Copy static files (Next.js needs these alongside standalone)
mkdir -p "$DEPLOY_DIR/.next/static"
cp -r "$PROJECT_DIR/.next/static/." "$DEPLOY_DIR/.next/static/"

# Copy public assets
cp -r "$PROJECT_DIR/public" "$DEPLOY_DIR/public"

# Copy Prisma files (for DB init + seed on first run)
mkdir -p "$DEPLOY_DIR/prisma"
cp "$PROJECT_DIR/prisma/schema.prisma" "$DEPLOY_DIR/prisma/"
cp "$PROJECT_DIR/prisma/seed.ts" "$DEPLOY_DIR/prisma/"

# Copy package.json (for db:seed script)
cp "$PROJECT_DIR/package.json" "$DEPLOY_DIR/package.json"

# Create a startup script that initializes DB + seeds + starts server
cat > "$DEPLOY_DIR/start.sh" << 'START_EOF'
#!/usr/bin/env bash
# Hostinger startup script — runs DB init + seed + server
set -e

# Determine storage directory (Hostinger provides HOME or we use /data)
STORAGE="${STORAGE_DIR:-$HOME/data}"
mkdir -p "$STORAGE"

# Set DATABASE_URL if not already set
export DATABASE_URL="${DATABASE_URL:-file:$STORAGE/custom.db}"
export STORAGE_DIR="$STORAGE"
export NODE_ENV="production"

echo "🔧 Initializing database..."
npx prisma db push --accept-data-loss --skip-generate

echo "🌱 Seeding initial data..."
node -e "require('child_process').execSync('npx tsx prisma/seed.ts || npx bun prisma/seed.ts', {stdio:'inherit'})" 2>/dev/null || npx tsx prisma/seed.ts 2>/dev/null || echo "Seed skipped (tsx/bun not available)"

echo "🚀 Starting server..."
exec node server.js
START_EOF
chmod +x "$DEPLOY_DIR/start.sh"

# Create a .npmrc to ensure Hostinger can install if needed
cat > "$DEPLOY_DIR/.npmrc" << 'NPMRC_EOF'
legacy-peer-deps=true
NPMRC_EOF

# ---- Step 5: Create ZIP ----
ZIP_FILE="$PROJECT_DIR/bike-shop-hostinger.zip"
echo "📦 Step 5/5: Creating ZIP package..."

cd "$DEPLOY_DIR"
zip -r -q "$ZIP_FILE" . \
  -x "node_modules/.cache/*" \
  -x "node_modules/.prisma/*"

cd "$PROJECT_DIR"

# ---- Cleanup ----
rm -rf "$DEPLOY_DIR"

# ---- Summary ----
ZIP_SIZE=$(du -h "$ZIP_FILE" | cut -f1)
echo ""
echo "✅ Build complete!"
echo ""
echo "   📦 ZIP file: $ZIP_FILE"
echo "   📏 Size: $ZIP_SIZE"
echo ""
echo "📋 Next steps:"
echo "   1. Go to hPanel → Deploy Web App → Upload ZIP"
echo "   2. Upload bike-shop-hostinger.zip"
echo "   3. Set environment variables (see HOSTINGER-DEPLOY.md)"
echo "   4. Set start command: bash start.sh"
echo "   5. Deploy!"
echo ""
echo "⚠️  Requires Hostinger Business plan or higher."
echo ""
