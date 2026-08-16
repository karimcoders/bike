import { PrismaClient } from '@prisma/client'

// ---- PrismaClient singleton (Vercel serverless optimization) ----
//
// On Vercel serverless, each function invocation runs in a short-lived
// process. If we create a NEW PrismaClient on every invocation, we pay:
//   1. ~200-500ms connection-setup overhead per call
//   2. risk of exhausting Neon's connection pool under load
//
// The fix (recommended by Prisma's official Vercel guide) is to cache the
// client on `globalThis` so WARM invocations reuse the same client + connection.
// (The old code only cached in non-production, which meant every production
// API call created a new client — a major hidden cause of the "app feels
// slow" complaint, especially for the dashboard which runs 15 parallel queries.)
//
// We also cap the connection pool to 4 (Neon's free tier allows ~5-20
// concurrent connections; serverless can spin up many functions at once).
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