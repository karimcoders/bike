import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, handleAuthError } from "@/lib/api";

// GET /api/keep-warm
//
// PURPOSE: Pings the database with a trivial `SELECT 1` to prevent Neon
// (free tier) from auto-suspending the compute endpoint after 5 minutes of
// inactivity. Neon's auto-suspend is the #1 cause of the "app feels slow"
// complaint — the first query after suspension takes 2-5 seconds to wake
// the DB, which makes every API call on the first page load feel sluggish.
//
// This endpoint is called automatically by the client (AppShell) every 3
// minutes while the app is open. It uses `requireUser()` (pure cookie
// crypto — no DB call) so the auth check itself doesn't add latency.
//
// The actual DB ping (`SELECT 1`) is the cheapest possible query — it
// doesn't scan any table, doesn't lock anything, and completes in <1ms on
// a warm DB. Its only purpose is to reset Neon's idle timer.
//
// Returns `{ ok: true, ts: <epoch ms> }` so the client can log the last
// keep-warm time if needed.
export async function GET() {
  try {
    await requireUser();
    // Trivial query — wakes Neon + resets the idle timer.
    await db.$queryRaw`SELECT 1`;
    return ok({ ok: true, ts: Date.now() });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    // If the DB ping fails, we still return 200 so the client doesn't
    // retry aggressively. The next real API call will surface the error.
    return ok({ ok: false, ts: Date.now() });
  }
}
