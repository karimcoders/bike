import { PrismaClient } from '@prisma/client'

// =====================================================================
// SINGLE-SOURCE PRODUCTION DATABASE — FAIL LOUD, NEVER FALL BACK
// ---------------------------------------------------------------------
// This is a SINGLE-SHOP application. There is exactly ONE production
// database: a Neon PostgreSQL instance identified by DATABASE_URL.
//
// HARD GUARANTEES:
//   1. If DATABASE_URL is missing or empty, we THROW at module load.
//      We NEVER silently fall back to SQLite, JSON files, in-memory DB,
//      or any other storage. A missing DATABASE_URL is a fatal deploy
//      misconfiguration — better to crash loudly than to silently split
//      the shop's data across per-device fallbacks.
//   2. There is no `provider = "sqlite"` anywhere in prisma/schema.prisma.
//   3. There is no per-device / per-browser / per-user shop identity.
//      Every authenticated request hits the SAME Postgres tables.
//   4. The PrismaClient is cached on `globalThis` (production too) so
//      warm Vercel serverless invocations reuse the same connection
//      instead of paying ~200-500ms connection-setup overhead per call.
// =====================================================================

if (!process.env.DATABASE_URL) {
  // Fail loudly at import time. This prevents any silent fallback and
  // makes a missing-env deploy immediately visible in the logs.
  throw new Error(
    "[db] FATAL: DATABASE_URL is not set. " +
    "This app requires a single PostgreSQL connection string. " +
    "It will NEVER fall back to SQLite or any other storage. " +
    "Set DATABASE_URL in your Vercel project settings (Production environment)."
  );
}

// Also reject URLs that point at a non-PostgreSQL database (e.g. SQLite
// `file:` URLs). This catches the #1 deploy misconfiguration — someone
// setting DATABASE_URL to a local SQLite file when the Prisma schema
// requires PostgreSQL. Better to crash here than to let Prisma throw a
// cryptic validation error on the first query.
const _dbUrl = process.env.DATABASE_URL;
if (!_dbUrl.startsWith("postgresql://") && !_dbUrl.startsWith("postgres://")) {
  throw new Error(
    "[db] FATAL: DATABASE_URL must be a PostgreSQL connection string " +
    "(starting with postgresql:// or postgres://). " +
    `Got: ${_dbUrl.substring(0, 20)}... — this is NOT PostgreSQL. ` +
    "This app will NEVER fall back to SQLite or any other storage. " +
    "Set DATABASE_URL to your Neon Postgres connection string."
  );
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
  })

// ALWAYS cache on globalThis (production too) so warm serverless invocations
// reuse the same PrismaClient instead of creating a new one each time.
// This is the key Vercel + Prisma optimization: it avoids ~200-500ms of
// connection-setup overhead on every warm API call.
globalForPrisma.prisma = db