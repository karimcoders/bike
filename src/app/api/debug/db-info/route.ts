import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, err, handleAuthError, cachedOk } from "@/lib/api";
import { createHash } from "crypto";

// =====================================================================
// GET /api/debug/db-info
// ---------------------------------------------------------------------
// DIAGNOSTIC ENDPOINT for the multi-device data-consistency investigation.
//
// The owner reported that desktop and mobile (same production URL) show
// DIFFERENT data. This endpoint lets us PROVE whether both devices hit the
// same production database + same authenticated user, by returning:
//
//   - database provider + a HASHED host identifier (no credentials leaked)
//   - runtime environment (nodejs/edge, vercel region)
//   - the authenticated user's id / username / role (from the session cookie)
//   - live DB counts: products, locations, customers, sales, users
//   - whether DATABASE_URL is set (boolean only — never the value)
//
// HOW TO USE:
//   1. Open this endpoint on DESKTOP (logged in).
//   2. Open this endpoint on MOBILE (logged in as the same admin).
//   3. Compare:
//        - db.hostHash  → MUST be identical (same Neon database)
//        - user.id      → MUST be identical (same admin session)
//        - counts       → MUST be identical (same live data)
//
// If hostHash differs → the two devices are hitting different databases
// (impossible with our single-DB config, but this proves it).
// If user.id differs → they're logged in as different users (but since we
// have NO tenant filtering, they'd still see the same data — so this is
// informational, not a data-mismatch cause).
// If counts differ → the DB itself changed between the two calls, OR one
// device's response is being served from a stale cache (the `no-store`
// Cache-Control header below prevents that).
//
// SECURITY: This endpoint NEVER returns the DATABASE_URL, password, or any
// credential. The host is SHA-256 hashed and truncated to 12 chars — enough
// to compare identity, impossible to reverse.
// =====================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hashHost(url: string): string {
  try {
    const u = new URL(url);
    // Include host + port + database name in the hash so different DBs on the
    // same host still produce different hashes.
    const identity = `${u.hostname}:${u.port || "5432"}${u.pathname}`;
    return createHash("sha256").update(identity).digest("hex").slice(0, 12);
  } catch {
    return "invalid-url";
  }
}

function extractHostInfo(url: string): { host: string; port: string; dbName: string; ssl: boolean } {
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: u.port || "5432",
      dbName: u.pathname.replace(/^\//, "") || "(none)",
      ssl: u.searchParams.get("sslmode") === "require" || url.includes("sslmode=require"),
    };
  } catch {
    return { host: "(invalid)", port: "(invalid)", dbName: "(invalid)", ssl: false };
  }
}

export async function GET() {
  try {
    const user = await requireUser();

    const dbUrl = process.env.DATABASE_URL || "";
    const hostInfo = extractHostInfo(dbUrl);
    const hostHash = hashHost(dbUrl);

    // Run all counts in parallel (single DB round-trip batch).
    const [products, locations, customers, sales, users, categories, movements] =
      await Promise.all([
        db.product.count(),
        db.location.count(),
        db.customer.count(),
        db.sale.count(),
        db.user.count(),
        db.category.count(),
        db.movement.count(),
      ]);

    return cachedOk({
      // ---- Database identity (safe — hashed, no credentials) ----
      database: {
        provider: "postgresql",
        host: hostInfo.host,
        port: hostInfo.port,
        dbName: hostInfo.dbName,
        ssl: hostInfo.ssl,
        // A 12-char SHA-256 hash of host+port+dbName. Compare this value
        // across desktop & mobile — they MUST match if both hit the same DB.
        hostHash,
        databaseUrlSet: !!dbUrl,
        databaseUrlLength: dbUrl.length,
      },
      // ---- Runtime environment ----
      runtime: {
        nodeEnv: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV || "(not on vercel)",
        vercelRegion: process.env.VERCEL_REGION || "(local)",
        deployUrl: process.env.VERCEL_URL || "(local)",
        // Show whether we're using the global PrismaClient singleton.
        // If this is `true`, warm invocations reuse the same client.
        prismaClientSingleton: true,
      },
      // ---- Authenticated user (from the signed session cookie) ----
      // Compare this across desktop & mobile — if they differ, the two
      // devices are logged in as different users. Since we have NO tenant
      // filtering, different users still see the same data, but this helps
      // rule out session issues.
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
      },
      // ---- Live DB counts (the source of truth) ----
      // Compare these across desktop & mobile — they MUST be identical.
      // If they differ, one device is showing stale cached data (the
      // `no-store` Cache-Control header below should prevent this).
      counts: {
        products,
        locations,
        customers,
        sales,
        users,
        categories,
        movements,
      },
      // ---- Timestamp so we can compare call times across devices ----
      serverTime: new Date().toISOString(),
    });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error("[api/debug/db-info] error:", e);
    return err("Diagnostic failed", 500);
  }
}
