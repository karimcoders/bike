# =====================================================================
# AI Bike Shop OS — Dockerfile (Render / Railway / Fly.io / any container host)
# =====================================================================
# Uses Bun for install + build, Node for the standalone Next.js server.
#
# On startup (CMD), automatically:
#   1. Creates /data directory (persistent volume mount point)
#   2. Pushes Prisma schema → creates SQLite tables
#   3. Seeds initial data (admin/staff users, categories, products, sales)
#   4. Starts the Next.js standalone server
#
# The /data volume persists across deploys (when a disk is attached).
# SQLite DB lives at /data/custom.db, uploads at /data/uploads/
# =====================================================================

FROM oven/bun:1-slim

WORKDIR /app

# ---- Install dependencies ----
# No lockfile committed, so we let bun resolve and create one.
COPY package.json ./
RUN bun install

# ---- Copy source code ----
COPY . .

# ---- Generate Prisma client ----
RUN bun run db:generate

# ---- Build Next.js (produces .next/standalone/) ----
RUN bun run build

# ---- Runtime config ----
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

EXPOSE 3000

# ---- Startup command ----
# 1. mkdir /data (volume mount point — no-op if already exists)
# 2. prisma db push (creates/updates DB schema — idempotent)
# 3. seed.ts (injects initial data — idempotent, uses upsert)
# 4. node server.js (starts the Next.js standalone server)
CMD ["sh", "-c", "mkdir -p /data && npx prisma db push --accept-data-loss --skip-generate && bun run prisma/seed.ts && cd .next/standalone && node server.js"]
