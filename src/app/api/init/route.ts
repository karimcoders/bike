import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runSeed } from "@/lib/seed";

// =====================================================================
// POST /api/init
// ---------------------------------------------------------------------
// Initializes the database with seed data. Called once after first
// deploy on platforms that don't have shell access (e.g., Vercel).
//
// This is IDEMPOTENT — safe to call multiple times. The seed uses
// upsert/findFirst, so existing data is preserved.
//
// On Railway/Render/Docker, the startCommand runs the seed automatically.
// On Vercel (serverless), there's no startup script — so the user calls
// this endpoint once after their first deploy.
//
// Usage:
//   curl -X POST https://your-app.vercel.app/api/init
//   (or just visit the URL in browser — GET also works)
// =====================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Support both GET (browser visit) and POST (curl/API call)
export async function GET() {
  return handleInit();
}

export async function POST() {
  return handleInit();
}

async function handleInit() {
  try {
    // Check if already seeded (admin user exists)
    const userCount = await db.user.count();

    if (userCount > 0) {
      return NextResponse.json(
        {
          ok: true,
          alreadySeeded: true,
          message: "Database already initialized. Use admin/admin123 to login.",
          userCount,
        },
        { status: 200 }
      );
    }

    // Run the seed
    await runSeed();

    return NextResponse.json(
      {
        ok: true,
        alreadySeeded: false,
        message:
          "Database initialized successfully! Login with admin/admin123.",
      },
      { status: 200 }
    );
  } catch (e) {
    console.error("[api/init] Seed failed:", e);
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Unknown error",
        message:
          "Database initialization failed. Check that DATABASE_URL is set correctly.",
      },
      { status: 500 }
    );
  }
}
